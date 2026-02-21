"""
Build an index (chapters/sections → TOC page, PDF page, md line range) from markdown + meta JSON.

Pipeline:
  1. Parse TOC table from markdown → ordered list of (title, toc_page)
  2. Build layout model from meta JSON polygons (x/y clustering) → classify every
     meta entry as: running_header, section, subsection, margin_annotation, etc.
  3. Compute pdf_to_toc_offset from first numbered chapter (toc_page=1 → pdf_page)
  4. For each TOC entry: pdf_page = toc_page + offset, then find page marker {pdf_page}
     in md and locate the heading within that page range → md_start_line
  5. Build nested tree from depth (section number: 1→d1, 1.1→d2, 1.2.1→d3)
  6. Also collect margin annotations (exercises, cross-refs) from meta as secondary items

Key principle: sections are LINEAR and NON-OVERLAPPING.  end = next section at
same-or-shallower depth.
"""

import bisect
import json
import logging
import re
import time
from collections import Counter
from pathlib import Path

log = logging.getLogger(__name__)

# Bump this when index schema or build logic changes; stale indices will be rebuilt on load.
INDEX_VERSION = 1


class TOCEnrichmentRequiredError(Exception):
    """Raised when the document has a TOC table but LLM enrichment failed. Do not overwrite index with fallback."""


# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------
PAGE_MARKER_RE = re.compile(r"^\s*\{(\d+)\}\s*-+\s*$")
HEADING_RE = re.compile(r"^#{1,6}\s+(.+)$")
TABLE_ROW_RE = re.compile(r"^\s*\|(.+)\|\s*$")
SECTION_NUM_RE = re.compile(r"^(\d+(?:\.\d+)*)[.\s]")
HTML_TAG_RE = re.compile(r"<[^>]+>")
# Extract pdf page from heading line: <span id="page-38-0"> or id="page-1173-0"
PAGE_SPAN_RE = re.compile(r'id="page-(\d+)')

ROMAN = {"i": 1, "v": 5, "x": 10, "l": 50, "c": 100, "d": 500, "m": 1000}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _roman_to_int(s: str) -> int | None:
    s = s.strip().lower()
    if not s or not all(c in ROMAN for c in s):
        return None
    val = 0
    for i, c in enumerate(s):
        v = ROMAN[c]
        if i + 1 < len(s) and ROMAN[s[i + 1]] > v:
            val -= v
        else:
            val += v
    return val

def _normalize(t: str) -> str:
    """Remove markdown formatting (bold, italic) and HTML tags for fuzzy matching."""
    t = HTML_TAG_RE.sub("", t)
    t = t.replace("**", "").replace("*", "").replace("__", "").replace("_", "")
    t = t.replace("&", " and ")
    # En/em dashes are separators → space so "Trading – From" matches "Trading From"
    t = t.replace("\u2013", " ").replace("\u2014", " ")
    # Standalone hyphen as separator: "A - B" → "A B"
    t = re.sub(r'\s+-\s+', ' ', t)
    # OCR line-break artifact: "Long- Short" → "Long-Short" (space only after)
    t = re.sub(r'(?<=\S)-\s+', '-', t)
    return " ".join(t.split())

def _section_num(title: str) -> str | None:
    """Extract '1.2' from '1.2 Foo'."""
    m = SECTION_NUM_RE.match(title.strip())
    return m.group(1) if m else None

def _strip_section_num(s: str) -> str:
    """Strip leading section number: '1.2.3. Foo bar' → 'foo bar', '2 Bar' → 'bar'."""
    return re.sub(r"^\d+(\.\d+)*[.\s]*", "", s).strip()

def _depth(title: str) -> int:
    """
    Determine depth from section number.
    '1' or 'Chapter 1' -> 1
    '1.2' -> 2
    '1.2.3' -> 3
    No number -> 1 (default) or handle contextually
    """
    num = _section_num(title)
    if num:
        return len(num.split("."))
    # Heuristics for "Chapter X", "Appendix A"
    lower = title.lower()
    if lower.startswith("chapter ") or lower.startswith("appendix "):
        return 1
    return 1

def _slug(title: str, idx: int) -> str:
    """Generate a stable ID."""
    # If it has a number, use it: 1.2.3 -> sec_1_2_3
    num = _section_num(title)
    if num:
        return "sec_" + num.replace(".", "_")
    
    # Fallback: simple slug
    slug = re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")
    if not slug:
        slug = f"sec_{idx:03d}"
    if len(slug) > 30:
        slug = slug[:30]
    return slug

# ---------------------------------------------------------------------------
# Phase 1: Parse TOC
# ---------------------------------------------------------------------------

def _contents_section_bounds(lines: list[str]) -> tuple[int, int] | None:
    """
    Find the 1-based line range of the Contents section: from the first
    heading that is "Contents" or "Table of Contents" (any level: #, ##, etc.)
    to the line before the next heading that starts the body.

    Headings that are still part of the TOC are skipped:
    - "Contents" continuation headers (e.g. ``#### Contents`` on the next page)
    - Headings whose text ends with a number (trailing page number in a
      TOC entry, e.g. ``### 6 HOW TO USE THE INDICATORS 97``)
    Returns (start, end) inclusive, or None if no Contents heading found.
    """
    start = None
    for i, line in enumerate(lines, start=1):
        m = HEADING_RE.match(line.strip())
        if not m:
            continue
        raw = m.group(1).strip().lower()
        if "contents" not in raw:
            continue
        if ("table of contents" in raw or raw.rstrip().endswith("contents") or
            raw.replace("*", "").replace(" ", "").endswith("contents")):
            start = i + 1  # first line after the heading
            break
    if start is None:
        return None
    end = len(lines)
    for i in range(start, len(lines)):
        m = HEADING_RE.match(lines[i - 1])
        if not m:
            continue
        heading_text = m.group(1).strip()
        if re.search(r'\bcontents\b', heading_text, re.IGNORECASE):
            continue
        if re.search(r'\d+\s*$', heading_text):
            continue
        end = i - 1
        break
    return (start, end)


# Context lines to include before/after the TOC table when sending to LLM (e.g. ## Contents heading)
TOC_RAW_CONTEXT_BEFORE = 2
TOC_RAW_CONTEXT_AFTER = 0


_RUNNING_HEADER_RE = re.compile(
    r"^\s*(contents|table of contents)\s*[ivxlcdm\d]*\s*$", re.IGNORECASE
)


def _get_raw_toc_markdown(
    lines: list[str],
    context_before: int = TOC_RAW_CONTEXT_BEFORE,
    context_after: int = TOC_RAW_CONTEXT_AFTER,
) -> str | None:
    """
    Return the raw markdown of the Contents section for the LLM.
    Strips page-break markers ({N}---) and running headers ("CONTENTS vii")
    so the LLM only sees actual TOC rows.
    """
    bounds = _contents_section_bounds(lines)
    if not bounds:
        return None
    start_1, end_1 = bounds
    start_0 = max(0, start_1 - 1 - context_before)
    end_0 = min(len(lines), end_1 + context_after)
    cleaned: list[str] = []
    for line in lines[start_0:end_0]:
        if PAGE_MARKER_RE.match(line):
            continue
        if _RUNNING_HEADER_RE.match(line.strip()):
            continue
        # Collapse runs of spaces (table padding) — saves ~65% of tokens
        line = re.sub(r" {2,}", " ", line)
        cleaned.append(line)
    return "".join(cleaned).strip() or None


_CHAPTER_NUM_RE = re.compile(r'^(\d+)[.:)]?\s')
_ROMAN_PART_RE = re.compile(
    r'^(I{1,3}|IV|VI{0,3}|IX|X{1,3}|XI{0,3}|XII{0,3}|'
    r'XI{0,3}V|XV|XVI{0,3}|XIX|XX)\b[.:)]*\s+[A-Z]',
)
_PART_WORD_RE = re.compile(
    r'^Part\s+(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|'
    r'Eleven|Twelve|\d+)\b',
    re.IGNORECASE,
)
_DOTTED_3_RE = re.compile(r'^(\d+\.\d+\.\d+)')   # 1.2.3 → depth 3
_DOTTED_2_RE = re.compile(r'^(\d+\.\d+)(?!\.\d)')  # 1.2 (not 1.2.3) → depth 2
_FRONT_BACK_RE = re.compile(
    r'^(preface|foreword|appendix|bibliography|glossary|conclusion|'
    r'acknowledgments?|about the authors?|references|afterword)',
    re.IGNORECASE,
)


def _has_part_headings(rows: list[tuple[str, int]]) -> bool:
    """Check whether any row looks like a Part heading (Roman or spelled-out)."""
    return any(
        _ROMAN_PART_RE.match(t.strip()) or _PART_WORD_RE.match(t.strip())
        for t, _ in rows
    )

def _mechanical_assign_depths(rows: list[tuple[str, int]]) -> list[dict]:
    """Assign depths without LLM, using title patterns.  Fast and deterministic."""
    enriched = []
    for title, page in rows:
        s = title.strip()
        if _DOTTED_3_RE.match(s):
            depth = 3
        elif _DOTTED_2_RE.match(s):
            depth = 2
        elif _CHAPTER_NUM_RE.match(s):
            depth = 1
        elif _ROMAN_PART_RE.match(s) or _PART_WORD_RE.match(s):
            depth = 1
        elif _FRONT_BACK_RE.match(s):
            depth = 1
        else:
            depth = 2
        enriched.append({"title": title, "depth": depth, "page": page})
    return enriched


def _enforce_depth_constraints(entries: list[dict]) -> list[dict]:
    """Fix obviously wrong LLM depth assignments using structural patterns."""
    for e in entries:
        s = e["title"].strip()
        d = e["depth"]
        if _ROMAN_PART_RE.match(s) or _PART_WORD_RE.match(s):
            if d != 1:
                log.debug("Forcing Part heading to depth 1: %s", s)
                e["depth"] = 1
        elif _DOTTED_3_RE.match(s) and d < 3:
            log.debug("Forcing N.N.N entry to depth 3: %s", s)
            e["depth"] = 3
        elif _DOTTED_2_RE.match(s) and d < 2:
            log.debug("Forcing N.N entry to depth 2: %s", s)
            e["depth"] = 2
    return entries


# LLM: assign depth to pre-parsed TOC entries. Only returns an array of integers.
TOC_DEPTH_SYSTEM = """You are a book indexer. You are given a numbered list of Table of Contents entries (title and page). Assign a depth (1, 2, or 3) to each entry based on hierarchy.

Rules:
- **Roman numerals (I, II, III...)** in the title = PART → depth 1.
- **Arabic chapter numbers (1, 2, 3...)** = CHAPTER. Under a Part → depth 2. Before any Part (e.g. "1 Introduction" before "I Tabular Solution Methods") → depth 1.
- **Dotted numbers (1.1, 2.1, 9.5.1)** = section/subsection → depth 2 or 3 (1.1 → 2, 9.5.1 → 3).
- **Front/back matter** (Preface, Bibliography, Index, Summary of Notation) → depth 1.

Output a JSON array of integers, one per entry, in the same order. Example: [1, 1, 1, 2, 3, 3, 2, 3, 1, 2]
Output ONLY the JSON array, nothing else."""

_LLM_CHUNK_SIZE = 200
_LLM_CHUNK_CONTEXT = 5  # overlap entries from previous chunk for hierarchy context
_LLM_SKIP_THRESHOLD = 500  # skip LLM entirely only for very large flat TOCs


def _parse_llm_depth_response(response: str | None) -> list[int] | None:
    """Extract a JSON int array from an LLM response.  Returns None on failure."""
    if not response or not response.strip():
        return None
    text = response.strip()
    if "```" in text:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        log.warning("LLM TOC response not valid JSON: %s", e)
        return None
    if not isinstance(data, list) or len(data) == 0:
        return None
    if all(isinstance(d, (int, float)) for d in data):
        return [max(1, min(6, int(d))) for d in data]
    return None


def _llm_depths_for_batch(
    rows: list[tuple[str, int]],
    context: list[tuple[str, int, int]] | None = None,
) -> list[int] | None:
    """Call LLM once for a batch of rows and return list of depth ints.

    *context* is a list of ``(title, page, depth)`` from the end of the
    previous chunk so the LLM knows the current hierarchy state.
    """
    from book_agent.llm import complete, get_client

    n = len(rows)
    parts: list[str] = []
    if context:
        parts.append("Context (already assigned, for reference):")
        for title, page, depth in context:
            parts.append(f"  {title} (p.{page}) → depth {depth}")
        parts.append("")
    numbered = "\n".join(
        f"{i+1}. {title} (p.{page})" for i, (title, page) in enumerate(rows)
    )
    parts.append(
        f"Assign depth (1/2/3) to each of these {n} TOC entries. "
        f"Output exactly {n} integers in a JSON array.\n"
    )
    parts.append(numbered)
    prompt = "\n".join(parts)
    max_tok = max(512, n * 4)

    t0 = time.monotonic()
    try:
        response = complete(
            prompt,
            system=TOC_DEPTH_SYSTEM,
            temperature=0.0,
            max_tokens=max_tok,
            client=get_client(tool="toc"),
        )
    except Exception as e:
        elapsed = time.monotonic() - t0
        log.warning("LLM depth batch failed after %.1fs: %s", elapsed, e)
        return None
    elapsed = time.monotonic() - t0
    log.info("  LLM chunk responded in %.1fs", elapsed)

    depths = _parse_llm_depth_response(response)
    if depths is not None and len(depths) != n:
        log.warning(
            "  LLM returned %d depths for %d entries; padding/truncating",
            len(depths), n,
        )
        if len(depths) < n:
            tail = rows[len(depths):]
            mech = _mechanical_assign_depths(tail)
            depths.extend(e["depth"] for e in mech)
        else:
            depths = depths[:n]
    return depths


def _enrich_toc_from_raw_markdown_llm(
    raw_toc_markdown: str,
    parsed_rows: list[tuple[str, int]] | None = None,
) -> list[dict] | None:
    """
    Assign hierarchy depths to pre-parsed TOC entries via LLM.  For large
    TOCs (> _LLM_CHUNK_SIZE), automatically splits into chunks with overlap
    context so the LLM stays oriented in the hierarchy.  Falls back to
    mechanical depth assignment if the LLM is unavailable or all chunks fail.
    """
    try:
        from book_agent.llm import complete, get_client  # noqa: F401
    except ImportError:
        log.info("LLM not available for raw TOC enrichment")
        if parsed_rows and len(parsed_rows) >= 3:
            return _mechanical_assign_depths(parsed_rows)
        return None

    # --- Fast path: parsed_rows available, ask LLM for depths only ---
    if parsed_rows and len(parsed_rows) >= 3:
        n = len(parsed_rows)

        # For very large TOCs without Part headings, mechanical is reliable
        # and faster — skip chunked LLM calls entirely.  Moderate-size TOCs
        # (up to _LLM_SKIP_THRESHOLD) still go through LLM via chunking.
        if n > _LLM_SKIP_THRESHOLD:
            has_parts = _has_part_headings(parsed_rows)
            if not has_parts:
                log.info(
                    "Large TOC (%d entries, no Part headings) — using mechanical depths.",
                    n,
                )
                return _mechanical_assign_depths(parsed_rows)

        if n <= _LLM_CHUNK_SIZE:
            # Single call
            depths = _llm_depths_for_batch(parsed_rows)
            if depths is not None:
                result = [
                    {"title": t, "depth": d, "page": p}
                    for (t, p), d in zip(parsed_rows, depths)
                ]
                return _enforce_depth_constraints(result)
            log.info("Single LLM call failed; falling back to mechanical depths.")
            return _mechanical_assign_depths(parsed_rows)

        # Chunked: split into batches with overlap context
        all_depths: list[int] = []
        context: list[tuple[str, int, int]] | None = None
        num_chunks = (n + _LLM_CHUNK_SIZE - 1) // _LLM_CHUNK_SIZE
        failed_chunks = 0
        for ci in range(num_chunks):
            start = ci * _LLM_CHUNK_SIZE
            end = min(start + _LLM_CHUNK_SIZE, n)
            chunk = parsed_rows[start:end]
            log.info(
                "  LLM chunk %d/%d (entries %d–%d)...",
                ci + 1, num_chunks, start + 1, end,
            )
            depths = _llm_depths_for_batch(chunk, context=context)
            if depths is None:
                failed_chunks += 1
                log.warning("  Chunk %d failed; using mechanical fallback for this chunk.", ci + 1)
                chunk_enriched = _mechanical_assign_depths(chunk)
                depths = [e["depth"] for e in chunk_enriched]
            all_depths.extend(depths)
            ctx_start = max(0, len(chunk) - _LLM_CHUNK_CONTEXT)
            context = [
                (chunk[j][0], chunk[j][1], depths[j])
                for j in range(ctx_start, len(chunk))
            ]

        llm_result = _enforce_depth_constraints([
            {"title": t, "depth": d, "page": p}
            for (t, p), d in zip(parsed_rows, all_depths)
        ])
        # Validate chunked LLM results against mechanical.  Mechanical is
        # immune to chunk-boundary confusion, so prefer it when it produces
        # a richer hierarchy (more depth-3) or a tighter top-level count.
        has_parts = _has_part_headings(parsed_rows)
        if not has_parts:
            mech_result = _mechanical_assign_depths(parsed_rows)
            llm_top = sum(1 for e in llm_result if e["depth"] == 1)
            mech_top = sum(1 for e in mech_result if e["depth"] == 1)
            llm_d3 = sum(1 for e in llm_result if e["depth"] == 3)
            mech_d3 = sum(1 for e in mech_result if e["depth"] == 3)
            prefer_mech = False
            if mech_d3 > llm_d3:
                prefer_mech = True
                reason = f"richer hierarchy (d3: {mech_d3} vs {llm_d3})"
            elif mech_top > llm_top:
                prefer_mech = True
                reason = f"more top-level ({mech_top} vs {llm_top})"
            elif mech_top < llm_top and mech_d3 >= llm_d3:
                prefer_mech = True
                reason = f"tighter top-level ({mech_top} vs {llm_top})"
            if prefer_mech:
                log.info(
                    "Mechanical depths preferred over chunked LLM: %s — using mechanical.",
                    reason,
                )
                return mech_result
        return llm_result

    # --- Slow fallback: send raw markdown, ask for full JSON ---
    if not raw_toc_markdown or len(raw_toc_markdown) > 50000:
        return None
    prompt = (
        "Parse this Table of Contents and output a JSON array of "
        "{title, depth, page} in order.\n\nRaw TOC (markdown):\n"
        + raw_toc_markdown
    )
    t0 = time.monotonic()
    try:
        response = complete(
            prompt,
            system=TOC_DEPTH_SYSTEM,
            temperature=0.0,
            max_tokens=8192,
            client=get_client(tool="toc"),
        )
    except Exception as e:
        elapsed = time.monotonic() - t0
        log.warning("LLM raw TOC enrichment failed after %.1fs: %s", elapsed, e)
        log.info("(Check network and LLM config if using remote API)")
        return None
    elapsed = time.monotonic() - t0
    log.info("LLM responded in %.1fs. Parsing response...", elapsed)
    if not response or not response.strip():
        return None
    text = response.strip()
    if "```" in text:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        log.warning("LLM TOC response not valid JSON: %s", e)
        return None

    if not isinstance(data, list) or len(data) == 0:
        return None

    # Fallback: data is [{title, depth, page}, ...]
    enriched = []
    for item in data:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        if not title:
            continue
        try:
            depth = max(1, min(6, int(item.get("depth", 2))))
        except (TypeError, ValueError):
            depth = 2
        try:
            page = int(item.get("page", 0))
        except (TypeError, ValueError):
            page = 0
        enriched.append({"title": title, "depth": depth, "page": page})
    return enriched if enriched else None


def _content_start_after_contents(lines: list[str]) -> int:
    """
    Return 1-based line number of the first heading that starts the main content,
    i.e. the first heading after the Contents section (same or shallower level as Contents).
    If no Contents heading is found, return 1.
    """
    contents_heading_line = None
    contents_level = 999
    for i, line in enumerate(lines, start=1):
        m = HEADING_RE.match(line)
        if not m:
            continue
        level = 0
        while level < len(line) and line[level] == "#":
            level += 1
        if level > 6:
            continue
        raw = m.group(1).strip().lower()
        if "contents" in raw and ("table of contents" in raw or raw.startswith("contents") or
            raw.replace("*", "").replace(" ", "").endswith("contents")):
            contents_heading_line = i
            contents_level = level
            break
    if contents_heading_line is None:
        return 1
    # First find where the Contents section ends (next heading after Contents)
    section_end = contents_heading_line
    for i in range(contents_heading_line, len(lines)):
        if i == contents_heading_line - 1:
            continue
        line = lines[i]
        if HEADING_RE.match(line):
            section_end = i + 1  # 1-based line of this heading
            break
    # First heading at same or shallower level after the section is the content start
    for i in range(section_end, len(lines) + 1):
        if i > len(lines):
            break
        line = lines[i - 1]  # i is 1-based
        m = HEADING_RE.match(line)
        if not m:
            continue
        level = 0
        while level < len(line) and line[level] == "#":
            level += 1
        if level <= contents_level:
            return i
    return section_end


def _toc_chapter_titles_from_table(lines: list[str]) -> list[str]:
    """
    Parse the Contents table and return normalized titles that are chapter-level
    (title starts with "N. " for integer N). Used to assign depth 1 to chapter headings.
    Returns list of normalized titles (lowercase, no leading "N. ") for matching.
    """
    chapter_titles = []
    bounds = _contents_section_bounds(lines)
    if not bounds:
        return chapter_titles
    start_1, end_1 = bounds
    line_slice = lines[start_1 - 1 : end_1]
    for line in line_slice:
        if not line.strip().startswith("|") or re.match(r"^\s*\|[-:| ]+\|\s*$", line):
            continue
        m = TABLE_ROW_RE.match(line)
        if not m:
            continue
        content = m.group(1)
        cells = [c.strip() for c in content.split("|")]
        if not cells:
            continue
        title = " ".join(HTML_TAG_RE.sub("", c).strip() for c in cells if c.strip())
        title = _normalize(title)
        if not title or len(title) < 3:
            continue
        # Chapter: starts with "N. " (single number and dot)
        if re.match(r"^\d+\.\s+", title):
            # Strip "1. " for matching body headings (which often omit the number)
            core = re.sub(r"^\d+\.\s*", "", title).strip()
            if core:
                chapter_titles.append(core.lower())
    return chapter_titles


_TRAILING_PAGE_RE = re.compile(r'^(.+?)\s+(\d+)\s*$')


def parse_contents_table(lines: list[str]) -> list[tuple[str, int]]:
    """
    Parse TOC entries from the Contents section.  Handles two formats that
    low-quality OCR can produce in the same document:
      1. Markdown table rows  (``| N | Title | Page |``)
      2. Plain-text or heading-formatted lines with a trailing page number
         (``Good News, Bad News 98`` or ``### 6 HOW TO USE THE INDICATORS 97``)
    Only looks inside the Contents section bounds to avoid body text.
    Returns list of (title, toc_page) in document order.
    """
    rows: list[tuple[str, int]] = []
    bounds = _contents_section_bounds(lines)
    if bounds:
        start_1, end_1 = bounds
        line_slice = lines[start_1 - 1 : end_1]
    else:
        line_slice = lines

    for line in line_slice:
        stripped = line.strip()
        if not stripped:
            continue
        if PAGE_MARKER_RE.match(line):
            continue

        # --- Format 1: Markdown table row ---
        if stripped.startswith("|"):
            if re.match(r"^\s*\|[-:| ]+\|\s*$", line):
                continue
            m = TABLE_ROW_RE.match(line)
            if not m:
                continue
            content = m.group(1)
            cells = [c.strip() for c in content.split("|")]
            if not cells:
                continue
            page = None
            page_index = -1
            for i in range(len(cells) - 1, -1, -1):
                p_str = HTML_TAG_RE.sub("", cells[i]).strip()
                if not p_str:
                    continue
                try:
                    page = int(p_str)
                    page_index = i
                    break
                except ValueError:
                    pass
                r_val = _roman_to_int(p_str)
                if r_val is not None:
                    page = r_val
                    page_index = i
                    break
            if page is not None:
                title_parts = []
                for k in range(page_index):
                    c_clean = HTML_TAG_RE.sub("", cells[k]).strip()
                    if not c_clean:
                        continue
                    title_parts.append(c_clean)
            else:
                title_parts = [
                    HTML_TAG_RE.sub("", c).strip()
                    for c in cells if HTML_TAG_RE.sub("", c).strip()
                ]
                page = 0
            if not title_parts:
                continue
            title = " ".join(title_parts)
            title = _normalize(title)
            rows.append((title, page))
            continue

        # --- Format 2: plain text or heading with trailing page number ---
        heading_m = HEADING_RE.match(stripped)
        text = heading_m.group(1).strip() if heading_m else stripped
        if re.search(r'\bcontents\b', text, re.IGNORECASE):
            continue
        if _RUNNING_HEADER_RE.match(text):
            continue
        m = _TRAILING_PAGE_RE.match(text)
        if m:
            title = _normalize(m.group(1))
            page = int(m.group(2))
            if title and len(title) >= 2:
                rows.append((title, page))

    return rows

# ---------------------------------------------------------------------------
# Phase 2: Layout Model (Meta JSON)
# ---------------------------------------------------------------------------

def build_layout_model(meta_entries: list[dict]) -> dict:
    """Analyze meta entries to determine x-coordinates for sections, headers, etc."""
    if not meta_entries:
        return {}

    # 1. Identify running headers by Y coordinate (top of page)
    # Cluster Y coordinates
    y_values = sorted([e.get("polygon", [[0,0]])[0][1] for e in meta_entries])
    running_header_y_max = 55.0 # Default
    
    # Simple heuristic: Look for a gap in top Y values
    # If many items are at Y < 60, and then a gap to Y > 70
    top_items = [y for y in y_values if y < 100]
    if top_items:
        # Find gap
        for i in range(len(top_items) - 1):
            if top_items[i+1] - top_items[i] > 15:
                running_header_y_max = (top_items[i] + top_items[i+1]) / 2
                break
                
    # 2. Cluster X coordinates for role assignment
    # Filter out headers
    body_entries = [e for e in meta_entries if e.get("polygon", [[0,999]])[0][1] > running_header_y_max]
    
    x_positions = sorted([e.get("polygon", [[0,0]])[0][0] for e in body_entries])
    
    # Cluster x_positions
    bins = []
    if x_positions:
        current_bin = [x_positions[0]]
        for x in x_positions[1:]:
            if x - current_bin[-1] > 10:
                bins.append(current_bin)
                current_bin = [x]
            else:
                current_bin.append(x)
        bins.append(current_bin)
        
    # Assign roles to bins based on x-position (indentation)
    # Left-most -> Margin/Exercises? Or Section?
    # Usually: Margin < Section < Subsection
    
    x_roles = []
    role_names = ["margin", "section", "subsection", "sub3", "sub4"]
    
    for i, b in enumerate(bins):
        avg = sum(b) / len(b)
        min_x = min(b)
        max_x = max(b)
        role = role_names[min(i, len(role_names)-1)]
        x_roles.append((min_x - 5, max_x + 5, role))
        
    return {
        "running_header_y_max": running_header_y_max,
        "x_roles": x_roles
    }

def classify_meta_entry(entry: dict, layout: dict) -> str:
    """Classify a single meta entry."""
    poly = entry.get("polygon")
    if not poly or len(poly) < 2:
        return "unknown"
    y_top = poly[0][1]
    x_left = poly[0][0]

    if y_top <= layout.get("running_header_y_max", 55):
        return "running_header"

    for lo, hi, role in layout.get("x_roles", []):
        if lo <= x_left <= hi:
            return role

    return "unknown"

def _collect_annotations(meta_entries: list[dict], layout: dict) -> list[dict]:
    """Collect entries classified as 'margin'."""
    anns = []
    for e in meta_entries:
        if classify_meta_entry(e, layout) == "margin":
            anns.append({
                "title": _normalize(e.get("title", "")),
                "pdf_page": e.get("page_id")
            })
    return anns

# ---------------------------------------------------------------------------
# Phase 3 & 4: Page Markers & Heading Location
# ---------------------------------------------------------------------------

def _build_page_marker_index(lines: list[str]) -> dict[int, int]:
    """Map pdf_page → 1-based line number."""
    idx = {}
    for i, line in enumerate(lines, start=1):
        m = PAGE_MARKER_RE.match(line)
        if m:
            pg = int(m.group(1))
            if pg not in idx:
                idx[pg] = i
    return idx


def _build_page_cache(lines: list[str]) -> list[int]:
    """One pass: line index 1..len(lines) -> pdf page at that line (0 if before first marker)."""
    cache: list[int] = [0] * (len(lines) + 1)
    current = 0
    for i, line in enumerate(lines, start=1):
        m = PAGE_MARKER_RE.match(line)
        if m:
            current = int(m.group(1))
        cache[i] = current
    return cache


def _page_at_line(
    lines: list[str], line_1based: int, page_cache: list[int] | None = None
) -> int:
    """Page at this line. Use page_cache when available (O(1)); else scan backward (O(lines))."""
    if page_cache is not None:
        if 1 <= line_1based <= len(page_cache) - 1:
            return page_cache[line_1based]
        return 0
    for i in range(min(line_1based - 1, len(lines) - 1), -1, -1):
        m = PAGE_MARKER_RE.match(lines[i])
        if m:
            return int(m.group(1))
    return 0


_COLON_SPACE_RE = re.compile(r"\s+")


def _colon_norm(s: str) -> str:
    """Collapse whitespace and colons for Part-title matching."""
    return _COLON_SPACE_RE.sub(" ", s.replace(":", " ")).strip()


# Pre-normalized heading record: avoids redoing regex per comparison.
# (line_1based, raw_text, norm, core, core_no_part_cn, section_num)
_HeadEntry = tuple[int, str, str, str, str, str | None]


def _build_heading_index(lines: list[str]) -> list[_HeadEntry]:
    """One pass: pre-normalize every heading so match is pure string comparison."""
    out: list[_HeadEntry] = []
    for i, line in enumerate(lines, start=1):
        m = HEADING_RE.match(line)
        if not m:
            continue
        raw = m.group(1).strip()
        h_norm = _normalize(raw).lower()
        h_core = _strip_section_num(h_norm)
        h_core_no_part = h_core[5:].strip() if h_core.startswith("part ") else h_core
        h_core_no_part_cn = _colon_norm(h_core_no_part)
        sec_num = _section_num(raw)
        out.append((i, raw, h_norm, h_core, h_core_no_part_cn, sec_num))
    return out


def _find_heading_in_range(
    lines: list[str],
    title: str,
    range_start: int,
    range_end: int,
    head_index: list[_HeadEntry] | None = None,
    head_start_index: int = 0,
) -> tuple[int | None, int]:
    """
    Find heading matching title in range. Returns (match_line, next_head_start_index).
    When head_index is provided, only scan from head_start_index (progressive).
    """
    norm = _normalize(title).lower()
    norm_core = _strip_section_num(norm)
    norm_core_no_letter = re.sub(r"^[a-z]\s+", "", norm_core) if len(norm_core) > 2 else norm_core
    range_start = max(1, range_start)
    range_end = min(len(lines), range_end)
    title_section_num = _section_num(title)
    n_core_cn = _colon_norm(norm_core) if norm_core else ""

    if head_index:
        # Use bisect to jump straight to first heading >= range_start
        lo = head_start_index
        hi_bound = len(head_index)
        # Advance lo to first entry with line_1based >= range_start
        while lo < hi_bound and head_index[lo][0] < range_start:
            lo += 1
        for i in range(lo, hi_bound):
            line_1based, _raw, h_norm, h_core, h_core_no_part_cn, h_secnum = head_index[i]
            if line_1based > range_end:
                # Don't advance past this — caller may need these headings for a wider range
                return (None, lo)
            if title_section_num and h_secnum and title_section_num != h_secnum:
                continue
            if norm_core and h_core and norm_core == h_core:
                return (line_1based, i + 1)
            if n_core_cn and h_core_no_part_cn and n_core_cn == h_core_no_part_cn:
                return (line_1based, i + 1)
            if norm_core_no_letter and h_core and norm_core_no_letter == h_core:
                return (line_1based, i + 1)
            if norm == h_norm:
                return (line_1based, i + 1)
            if h_norm.startswith("part ") and norm == h_norm[5:].strip():
                return (line_1based, i + 1)
        return (None, lo)

    # Fallback without index (shouldn't be needed in normal flow)
    for i in range(range_start - 1, range_end):
        line = lines[i]
        m = HEADING_RE.match(line)
        if not m:
            continue
        h_text = m.group(1).strip()
        h_norm = _normalize(h_text).lower()
        h_core = _strip_section_num(h_norm)
        h_secnum = _section_num(h_text)
        if title_section_num and h_secnum and title_section_num != h_secnum:
            continue
        h_core_no_part = h_core[5:].strip() if h_core.startswith("part ") else h_core
        h_core_no_part_cn = _colon_norm(h_core_no_part)
        if norm_core and h_core and norm_core == h_core:
            return (i + 1, 0)
        if n_core_cn and h_core_no_part_cn and n_core_cn == h_core_no_part_cn:
            return (i + 1, 0)
        if norm_core_no_letter and h_core and norm_core_no_letter == h_core:
            return (i + 1, 0)
        if norm == h_norm:
            return (i + 1, 0)
        if h_norm.startswith("part ") and norm == h_norm[5:].strip():
            return (i + 1, 0)
    return (None, 0)


def _heading_level_at_line(lines: list[str], line_1based: int) -> int | None:
    """Return heading level (1-6) from number of leading # at this line, or None if not a heading."""
    if line_1based < 1 or line_1based > len(lines):
        return None
    line = lines[line_1based - 1]
    m = HEADING_RE.match(line)
    if not m:
        return None
    # Count leading # (group 0 is full match; we need just the # part)
    i = 0
    while i < len(line) and line[i] == "#":
        i += 1
    return i if 1 <= i <= 6 else None


def _heading_title_from_line(line: str) -> tuple[str, int | None]:
    """
    Extract display title and optional pdf_page from a heading line.
    Strips <span id="page-N-...">, **bold**, and normalizes. Returns (title, page_num).
    """
    m = HEADING_RE.match(line)
    if not m:
        return ("", None)
    raw = m.group(1).strip()
    # Page from first id="page-N"
    page = None
    pm = PAGE_SPAN_RE.search(raw)
    if pm:
        page = int(pm.group(1))
    # Remove span tags (and any other HTML) for title
    title = HTML_TAG_RE.sub("", raw)
    title = _normalize(title)
    return (title.strip(), page)


def _page_from_heading_line(line: str) -> int | None:
    """Extract pdf page number from id=\"page-N\" in heading line, or None."""
    m = PAGE_SPAN_RE.search(line)
    return int(m.group(1)) if m else None


def _title_matches_chapter(title_normalized: str, chapter_titles: list[str]) -> bool:
    """
    True only when the heading is the full TOC chapter title (match on actual header).
    Substring/containment is not used: a short heading like 'Asset allocation' must not
    match a long chapter title that merely contains it.
    """
    if not title_normalized or not chapter_titles:
        return False

    def _key(s: str) -> str:
        return re.sub(r"[–\-—\s]+", " ", _normalize(s).lower()).strip()

    t = _key(title_normalized)
    if not t:
        return False
    for ct in chapter_titles:
        c = _key(ct)
        if not c:
            continue
        if t == c:
            return True
        # Allow TOC title to be a wrapped/slightly longer variant (e.g. "Foo with Unsupervised\nLearning")
        if len(t) >= 0.85 * len(c) and (t == c[: len(t)] or c == t[: len(c)]):
            return True
    return False


def build_index_from_headings(lines: list[str]) -> list[dict]:
    """
    Build a section index purely from markdown headings (#–######).
    Use when TOC/meta pipeline yields broken ranges (e.g. missing pages / wrong line ranges).
    """
    content_start = _content_start_after_contents(lines)
    chapter_titles = _toc_chapter_titles_from_table(lines)
    # Pre-normalize chapter titles once
    chapter_keys = set()
    _key_re = re.compile(r"[–\-—\s]+")
    for ct in chapter_titles:
        k = _key_re.sub(" ", _normalize(ct).lower()).strip()
        if k:
            chapter_keys.add(k)
    pc = _build_page_cache(lines)

    nodes = []
    for i, line in enumerate(lines, start=1):
        if i < content_start:
            continue
        if not HEADING_RE.match(line):
            continue
        level = 0
        while level < len(line) and line[level] == "#":
            level += 1
        if level > 6:
            continue
        title, pdf_page = _heading_title_from_line(line)
        if not title or len(title) < 2:
            continue
        if title.startswith("[") and "](#" in title:
            continue
        title_key = _key_re.sub(" ", _normalize(title).lower()).strip()
        is_chapter = title_key in chapter_keys
        if not is_chapter:
            for ck in chapter_keys:
                if len(title_key) >= 0.85 * len(ck) and (title_key == ck[:len(title_key)] or ck == title_key[:len(ck)]):
                    is_chapter = True
                    break
        if is_chapter:
            depth = 1
        else:
            min_level = 3
            depth = max(2, level - min_level + 2)
            depth = min(depth, 6)
        node = {
            "id": _slug(title, len(nodes)),
            "title": title,
            "depth": depth,
            "pdf_page": pdf_page if pdf_page is not None else _page_at_line(lines, i, pc),
            "md_start_line": i,
            "_fallback_end": len(lines),
            "children": [],
        }
        nodes.append(node)

    _assign_depths_and_parents(nodes)
    for i, node in enumerate(nodes):
        end_page = _page_at_line(lines, node["md_end_line"], pc)
        if end_page == 0 and i + 1 < len(nodes):
            next_start = nodes[i + 1].get("pdf_page")
            if next_start and next_start > 0:
                end_page = next_start - 1
        if end_page == 0 and node.get("pdf_page"):
            end_page = node["pdf_page"]
        node["pdf_page_end"] = end_page
    return nodes


def _locate_heading(
    lines: list[str],
    title: str,
    pdf_page: int | None,
    page_markers: dict[int, int],
    search_after_line: int = 0,
    head_index: list[tuple[int, str]] | None = None,
    head_start_index: int = 0,
) -> tuple[int | None, int]:
    """
    Find the markdown heading for a TOC title. Returns (match_line or None, next_head_start_index).
    Search is progressive: only considers headings at or after search_after_line and from
    head_start_index in the heading list.
    """
    range_start = max(1, search_after_line + 1)
    range_end = len(lines)

    if pdf_page is not None and page_markers:
        raw_starts = [
            page_markers[pg]
            for pg in range(pdf_page - 3, pdf_page + 2)
            if pg in page_markers
        ]
        search_start = max(min(raw_starts), range_start) if raw_starts else range_start
        ends = [
            page_markers[pg]
            for pg in range(pdf_page + 2, pdf_page + 5)
            if pg in page_markers
        ]
        search_end = max(ends) if ends else range_end
        found, next_i = _find_heading_in_range(
            lines, title, search_start, search_end,
            head_index=head_index, head_start_index=head_start_index,
        )
        if found is not None:
            return (found, next_i)
        # Narrow range missed: try full-doc from original position (not next_i)
        if _section_num(title):
            return _find_heading_in_range(
                lines, title, range_start, range_end,
                head_index=head_index, head_start_index=head_start_index,
            )
        return (None, head_start_index)

    return _find_heading_in_range(
        lines, title, range_start, range_end,
        head_index=head_index, head_start_index=head_start_index,
    )

# ---------------------------------------------------------------------------
# Offset and Meta Page
# ---------------------------------------------------------------------------

def _build_meta_page_lookup(
    meta_entries: list[dict], layout: dict
) -> dict[str, int]:
    """Pre-build dict from normalized title (and core title) → page_id. One-time O(M) pass."""
    by_norm: dict[str, int] = {}
    by_core: dict[str, int] = {}
    for e in meta_entries:
        role = classify_meta_entry(e, layout)
        if role in ("running_header", "margin", "unknown"):
            continue
        page_id = e.get("page_id")
        if page_id is None:
            continue
        mt = _normalize(e.get("title") or "").lower()
        if mt and mt not in by_norm:
            by_norm[mt] = page_id
        mt_core = _strip_section_num(mt)
        if mt_core and mt_core not in by_core:
            by_core[mt_core] = page_id
    # Merge: exact full title takes priority, then core
    merged: dict[str, int] = {}
    merged.update(by_core)
    merged.update(by_norm)
    return merged


def _meta_pdf_page_for_fast(title: str, meta_lookup: dict[str, int]) -> int | None:
    """O(1) lookup in pre-built meta dict."""
    if not meta_lookup:
        return None
    norm = _normalize(title).lower()
    page = meta_lookup.get(norm)
    if page is not None:
        return page
    norm_core = _strip_section_num(norm)
    return meta_lookup.get(norm_core)


def _meta_pdf_page_for(
    title: str, meta_entries: list[dict], layout: dict
) -> int | None:
    """
    Find the pdf_page for a title by scanning meta entries that are classified
    as section/subsection.
    """
    norm = _normalize(title).lower()
    norm_core = _strip_section_num(norm)

    best_fuzzy_page = None
    best_fuzzy_score = 0.0

    for e in meta_entries:
        role = classify_meta_entry(e, layout)
        if role in ("running_header", "margin", "unknown"):
            continue
        mt = _normalize(e.get("title") or "").lower()
        mt_core = _strip_section_num(mt)

        if mt == norm:
            return e.get("page_id")
        if norm_core and mt_core and (norm_core == mt_core):
            return e.get("page_id")
        if norm_core and mt_core and len(norm_core) > 5 and len(mt_core) > 5:
            if norm_core in mt_core:
                score = len(norm_core) / len(mt_core)
                if score > best_fuzzy_score:
                    best_fuzzy_score = score
                    best_fuzzy_page = e.get("page_id")
            elif mt_core in norm_core:
                score = len(mt_core) / len(norm_core)
                if score > best_fuzzy_score:
                    best_fuzzy_score = score
                    best_fuzzy_page = e.get("page_id")

    if best_fuzzy_page is not None and best_fuzzy_score > 0.8:
        return best_fuzzy_page

    return None

def _compute_offset(
    toc_rows: list[tuple[str, int]],
    meta_lookup: dict[str, int],
    page_markers: dict[int, int],
    lines: list[str],
) -> int | None:
    """Find pdf_to_toc_offset using pre-built meta lookup."""
    candidates = []
    for title, toc_page in toc_rows:
        if toc_page <= 0:
            continue
        pdf_page = _meta_pdf_page_for_fast(title, meta_lookup)
        if pdf_page:
            candidates.append(pdf_page - toc_page)

    if not candidates:
        return None

    counts = Counter(candidates)
    return counts.most_common(1)[0][0]

def _resolve_pdf_page(toc_page: int, offset: int | None) -> int | None:
    if offset is None:
        return None
    return toc_page + offset

# ---------------------------------------------------------------------------
# Phase 5: Nesting
# ---------------------------------------------------------------------------

def _assign_depths_and_parents(nodes: list[dict]):
    """Assign depth and nest nodes. Use existing depth (e.g. from MD heading level) when set."""
    for node in nodes:
        if "depth" not in node:
            node["depth"] = _depth(node["title"])
        
    # Assign end lines based on next node in TOC order
    for i in range(len(nodes) - 1):
        nodes[i]["md_end_line"] = nodes[i+1]["md_start_line"]
    
    # Last node ends at fallback
    if nodes:
        nodes[-1]["md_end_line"] = nodes[-1]["_fallback_end"]


def _fix_md_end_lines_by_document_order(nodes: list[dict]) -> None:
    """
    Reassign md_end_line so each section ends at the next heading in document order.
    Uses bisect for O(N log N) instead of O(N²).
    """
    if not nodes:
        return
    starts_asc = sorted(set(n["md_start_line"] for n in nodes))
    for node in nodes:
        start = node["md_start_line"]
        idx = bisect.bisect_right(starts_asc, start)
        if idx < len(starts_asc):
            node["md_end_line"] = starts_asc[idx]
        else:
            node["md_end_line"] = node.get("_fallback_end", start)

def _build_tree(nodes: list[dict]) -> list[dict]:
    """Convert list of nodes into nested tree based on depth."""
    root_nodes = []
    stack = []  # (node, depth)

    for node in nodes:
        depth = node["depth"]
        node["children"] = []

        while stack and stack[-1]["depth"] >= depth:
            stack.pop()

        if stack:
            stack[-1]["children"].append(node)
        else:
            root_nodes.append(node)

        stack.append(node)

    _propagate_parent_ends(root_nodes)
    return root_nodes


def _recompute_pdf_page_ends_in_tree(
    nodes: list[dict],
    lines: list[str],
    page_markers: dict[int, int],
    page_cache: list[int] | None = None,
) -> None:
    """Recompute pdf_page_end for every node from its md_end_line (after tree fixes)."""
    for node in nodes:
        if node.get("children"):
            _recompute_pdf_page_ends_in_tree(
                node["children"], lines, page_markers, page_cache=page_cache
            )
        end_page = _page_at_line(lines, node.get("md_end_line", 0), page_cache)
        if end_page <= 0 and node.get("pdf_page"):
            end_page = node["pdf_page"]
        node["pdf_page_end"] = max(end_page or 0, node.get("pdf_page") or 0)


def _propagate_parent_ends(nodes: list[dict]) -> None:
    """Set each parent's md_end_line and pdf_page_end to the last descendant's end (by document order). End page never less than start."""
    for node in nodes:
        if node.get("children"):
            _propagate_parent_ends(node["children"])
            last = max(node["children"], key=lambda c: c.get("md_end_line", 0))
            node["md_end_line"] = last["md_end_line"]
            child_end = last.get("pdf_page_end") or 0
            start_page = node.get("pdf_page") or 0
            node["pdf_page_end"] = max(child_end, start_page) if child_end or start_page else None


def _flatten_sections_for_check(sections: list[dict]) -> list[dict]:
    """Flatten section tree to list of {md_start_line, md_end_line} for sanity check."""
    out = []
    for node in sections:
        if "md_start_line" in node and "md_end_line" in node:
            out.append({"md_start_line": node["md_start_line"], "md_end_line": node["md_end_line"]})
        if node.get("children"):
            out.extend(_flatten_sections_for_check(node["children"]))
    return out


def _all_starts_from_tree(nodes: list[dict]) -> list[int]:
    """Collect all md_start_line from tree (for document-order fix)."""
    out = []
    for node in nodes:
        if "md_start_line" in node:
            out.append(node["md_start_line"])
        if node.get("children"):
            out.extend(_all_starts_from_tree(node["children"]))
    return out


def _fix_inverted_in_tree(root_nodes: list[dict], fallback_end: int) -> None:
    """Ensure no node has md_end_line < md_start_line; fix by next start in document order, then re-propagate."""
    starts_asc = sorted(set(_all_starts_from_tree(root_nodes)))

    def fix_node(node: dict) -> None:
        if "md_start_line" not in node or "md_end_line" not in node:
            return
        start = node["md_start_line"]
        end = node["md_end_line"]
        if end < start or end <= 0:
            idx = bisect.bisect_right(starts_asc, start)
            node["md_end_line"] = starts_asc[idx] if idx < len(starts_asc) else fallback_end
        for c in node.get("children", []):
            fix_node(c)

    for node in root_nodes:
        fix_node(node)
    _propagate_parent_ends(root_nodes)
    for node in root_nodes:
        fix_node(node)


# ---------------------------------------------------------------------------
# LLM TOC fallback (when rules produce broken or too many roots)
# ---------------------------------------------------------------------------

def _collect_headers_for_llm(lines: list[str]) -> str:
    """
    Build a compact text blob of all markdown headings for LLM TOC inference.
    Format: "line_number: #level raw_heading_text" (one per line).
    """
    out = []
    for i, line in enumerate(lines, start=1):
        if not HEADING_RE.match(line):
            continue
        level = 0
        while level < len(line) and line[level] == "#":
            level += 1
        if level > 6:
            continue
        raw = line[level:].strip()
        if not raw or len(raw) < 2:
            continue
        out.append(f"{i}: {'#' * level} {raw}")
    return "\n".join(out)


TOC_INFER_SYSTEM = """You are a book indexer. Given a list of every markdown heading in a book (with line number and level), infer the real table of contents.

Rules:
- EXCLUDE: book title (e.g. "HOW TO BUY"), "Contents", "Acknowledgments", and any inserted content (newspaper clippings like "An Appraisal:", "Abreast of the Market", "| Sues traded", "DOW JONES CLOSING AVERAGES", "MARKET DIARY").
- INCLUDE: only headings that are actual chapters or sections of the main body. The main body starts at the first real chapter (e.g. "It's Only A Game" or similar).
- DEPTH: 1 = main chapter (top-level # heading in the body); 2 = section (#### under a chapter); 3 = subsection. All main chapter titles must be depth 1. Do not nest later chapters under the book title.
- Output valid JSON only: an array of objects, each with "title" (string), "depth" (integer 1, 2, or 3), and optionally "page" (integer) if the heading text ends with a page number. Use the exact title as it appears in the heading. List entries in ascending line number order."""

TOC_INFER_USER_PREFIX = """Infer the table of contents from these headings (line_number: #level heading_text):

"""

# Enrich parsed TOC with hierarchy (depth) from LLM; send raw table when available so LLM can use structure
TOC_ENRICH_SYSTEM = """You are a book indexer. You are given a table of contents (sometimes as a raw markdown table, sometimes as a flat list). Your task is to assign a DEPTH (level) to each row/entry so that the structure reflects the book's hierarchy.

Rules:
- DEPTH 1 = Part or main division (e.g. "Part I", "I Data Compression", "II Noisy-Channel Coding", "VII Appendices", or standalone front/back matter like "Preface", "Bibliography", "Index"). In tables, often the first column has Roman numerals (I, II) or bold numbers for parts/chapters.
- DEPTH 2 = Chapter or major section (numbered chapters like "1 Introduction...", "4 The Source Coding Theorem", or appendix letters like "A Notation"). In tables, a dedicated first column with "1", "2", "A" often indicates chapters.
- DEPTH 3 = Subsection under a chapter (e.g. "1.1 Reinforcement Learning", "2.1 A k-armed Bandit Problem"). In tables, rows with no first-column entry or with dotted numbers (1.1, 2.1) are usually subsections.
- Use the raw table structure when provided: empty first column + indented or dotted title usually means subsection; first column with a single number or letter usually means chapter; Roman numeral or "Part" means part.
- Preserve the exact order. Output one depth per row/entry in the same order as the numbered list below.
Output valid JSON only: an array of objects, each with "title" (string, exact copy from the numbered list), "toc_page" (number, copy from input), "depth" (integer 1, 2, or 3). Same length and order as the numbered list."""

def _enrich_toc_depths_with_llm(
    toc_rows: list[tuple[str, int]],
    raw_table_lines: list[str] | None = None,
) -> list[dict] | None:
    """
    Send parsed TOC (and optional raw table) to LLM; return list of {title, toc_page, depth}.
    When raw_table_lines is provided, the LLM can use table structure (columns, layout) to infer hierarchy.
    """
    try:
        from book_agent.llm import complete, get_client
    except ImportError:
        log.debug("LLM not available for TOC depth enrichment")
        return None
    if not toc_rows or len(toc_rows) > 200:
        return None
    # Prefer sending raw table when available so LLM can use structure; then numbered list for exact order
    numbered = [f"{i+1}. {title} (p. {page})" for i, (title, page) in enumerate(toc_rows)]
    if raw_table_lines and len(raw_table_lines) <= 250:
        raw_text = "\n".join(raw_table_lines)
        prompt = (
            "Below is the raw table of contents from the book (markdown table). Use its structure (first column = part/chapter marker, empty = subsection, dotted numbers = subsections) to infer hierarchy.\n\n"
            "Raw table:\n" + raw_text + "\n\n"
            "The numbered list below is the same rows in order (one per table data row). Assign depth (1=Part/division, 2=Chapter/section, 3=Subsection) to each. Output JSON array in this list order.\n\n"
            + "\n".join(numbered)
        )
        log.info("index: calling LLM to enrich TOC with depths (raw table + list, tool=toc)")
    else:
        prompt = "Assign depth (1=Part/division, 2=Chapter/section, 3=Subsection) to each entry. Preserve order.\n\n" + "\n".join(numbered)
        log.info("index: calling LLM to enrich TOC with depths (tool=toc)")
    try:
        response = complete(
            prompt,
            system=TOC_ENRICH_SYSTEM,
            temperature=0.0,
            max_tokens=8192,
            client=get_client(tool="toc"),
        )
    except Exception as e:
        log.warning("LLM TOC depth enrichment failed: %s", e)
        return None
    if not response or not response.strip():
        return None
    text = response.strip()
    if "```" in text:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        log.warning("LLM TOC enrich response not valid JSON: %s", e)
        return None
    if not isinstance(data, list) or len(data) != len(toc_rows):
        log.warning("LLM TOC enrich: expected %d entries, got %d", len(toc_rows), len(data) if isinstance(data, list) else 0)
        return None
    enriched = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            enriched.append({"title": toc_rows[i][0], "toc_page": toc_rows[i][1], "depth": 2})
            continue
        title = item.get("title", toc_rows[i][0])
        toc_page = item.get("toc_page", toc_rows[i][1])
        try:
            depth = max(1, min(6, int(item.get("depth", 2))))
        except (TypeError, ValueError):
            depth = 2
        enriched.append({"title": title, "toc_page": toc_page, "depth": depth})
    return enriched


def _infer_toc_with_llm(headers_text: str) -> list[dict] | None:
    """
    Call LLM to infer TOC entries from headers text. Returns list of
    {title, depth, page?} or None on failure or parse error.
    """
    try:
        from book_agent.llm import complete, get_client
    except ImportError:
        log.debug("LLM not available for TOC fallback")
        return None
    if not headers_text.strip():
        return None
    log.info("index: calling LLM for TOC inference (tool=toc)")
    prompt = TOC_INFER_USER_PREFIX + headers_text
    try:
        response = complete(
            prompt,
            system=TOC_INFER_SYSTEM,
            temperature=0.0,
            max_tokens=8192,
            client=get_client(tool="toc"),
        )
    except Exception as e:
        log.warning("LLM TOC inference failed: %s", e)
        return None
    if not response or not response.strip():
        return None
    # Parse JSON (allow markdown code block wrapper)
    text = response.strip()
    if "```" in text:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        log.warning("LLM TOC response not valid JSON: %s", e)
        return None
    if not isinstance(data, list):
        return None
    entries = []
    for item in data:
        if not isinstance(item, dict):
            continue
        title = item.get("title")
        if not title or not isinstance(title, str) or len(title.strip()) < 2:
            continue
        depth = item.get("depth")
        if depth is None:
            depth = 1
        try:
            depth = max(1, min(6, int(depth)))
        except (TypeError, ValueError):
            depth = 1
        page = item.get("page")
        if page is not None:
            try:
                page = int(page)
            except (TypeError, ValueError):
                page = None
        entries.append({"title": title.strip(), "depth": depth, "page": page})
    return entries if entries else None


def _build_nodes_from_llm_toc(
    llm_entries: list[dict],
    lines: list[str],
    page_markers: dict[int, int],
) -> list[dict]:
    """
    Convert LLM-inferred TOC (titles only) into index nodes. We use LLM only for
    structure; pdf_page, pdf_page_end, and depth are always derived from the book.
    """
    pc = _build_page_cache(lines)
    hi = _build_heading_index(lines)
    resolved = []
    for entry in llm_entries:
        title = entry["title"]
        md_start, _ = _find_heading_in_range(lines, title, 1, len(lines), head_index=hi)
        if md_start is None:
            log.debug("LLM TOC: no matching heading for %r", title[:50])
            continue
        pdf_page = _page_at_line(lines, md_start, pc)
        if pdf_page == 0 and entry.get("page") is not None:
            try:
                pdf_page = int(entry["page"])
            except (TypeError, ValueError):
                pass
        md_depth = _heading_level_at_line(lines, md_start)
        depth = md_depth if md_depth is not None else entry.get("depth", 1)
        depth = max(1, min(6, depth))
        resolved.append({
            "title": title,
            "depth": depth,
            "pdf_page": pdf_page or 0,
            "md_start_line": md_start,
        })
    if not resolved:
        return []
    resolved.sort(key=lambda x: x["md_start_line"])
    nodes = []
    for idx, r in enumerate(resolved):
        node = {
            "id": _slug(r["title"], idx),
            "title": r["title"],
            "depth": r["depth"],
            "pdf_page": r["pdf_page"],
            "md_start_line": r["md_start_line"],
            "_fallback_end": len(lines),
        }
        nodes.append(node)
    _assign_depths_and_parents(nodes)
    for i, node in enumerate(nodes):
        end_page = _page_at_line(lines, node["md_end_line"], pc)
        if end_page == 0 and i + 1 < len(nodes):
            next_start = nodes[i + 1].get("pdf_page")
            if next_start and next_start > 0:
                end_page = next_start - 1
        if end_page == 0 and node.get("pdf_page"):
            end_page = node["pdf_page"]
        node["pdf_page_end"] = end_page
    return nodes


# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------

def build_index(md_path: Path, meta_path: Path | None = None) -> dict:
    log.info("Building index from %s", md_path.name)
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    meta_entries = []
    if meta_path and meta_path.is_file():
        try:
            with open(meta_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                meta_entries = data.get("table_of_contents", [])
        except Exception as e:
            log.warning(f"Failed to load meta: {e}")
            
    layout = build_layout_model(meta_entries)
    
    # 1. TOC source: prefer raw markdown → LLM (single source of truth). Else meta or parsed table.
    llm_toc_entries: list[dict] | None = None  # list of {title, depth, page} from LLM
    toc_rows: list[tuple[str, int]] = []  # (title, page) for offset / fallback
    toc_from_meta = False

    raw_toc_md = _get_raw_toc_markdown(lines)
    if raw_toc_md:
        # Parse table mechanically first (titles + pages); LLM only assigns depths
        pre_parsed = parse_contents_table(lines)
        if pre_parsed:
            log.info("Parsed %d TOC entries from table. Assigning hierarchy depths...", len(pre_parsed))
        else:
            log.info("Calling LLM to parse table of contents...")
        llm_toc_entries = _enrich_toc_from_raw_markdown_llm(raw_toc_md, parsed_rows=pre_parsed)
        if not llm_toc_entries and pre_parsed:
            log.info("LLM enrichment failed; falling back to mechanical depth assignment.")
            llm_toc_entries = _mechanical_assign_depths(pre_parsed)
        if llm_toc_entries:
            log.info("index: using TOC (%d entries)", len(llm_toc_entries))
            toc_rows = [(e["title"], e["page"]) for e in llm_toc_entries]
        else:
            raise TOCEnrichmentRequiredError(
                "Contents section found but LLM failed to parse it. Index not built (existing index unchanged)."
            )

    if not toc_rows and meta_entries:
        seen = set()
        meta_parsed: list[tuple[str, int]] = []
        for e in meta_entries:
            raw_title = (e.get("title") or "").strip().replace("\n", " ")
            if not raw_title or len(raw_title) < 2:
                continue
            title = _normalize(raw_title)
            if not title:
                continue
            page_id = e.get("page_id")
            if page_id is None:
                continue
            key = (title, page_id)
            if key in seen:
                continue
            seen.add(key)
            meta_parsed.append((title, page_id))
        if meta_parsed:
            log.info("No Contents section; using %d meta TOC entries. Assigning hierarchy depths...", len(meta_parsed))
            llm_toc_entries = _enrich_toc_from_raw_markdown_llm("", parsed_rows=meta_parsed)
            if not llm_toc_entries:
                log.info("LLM/mechanical depth assignment failed for meta entries; using flat.")
                llm_toc_entries = [{"title": t, "depth": 1, "page": p} for t, p in meta_parsed]
            toc_rows = [(e["title"], e["page"]) for e in llm_toc_entries]
            toc_from_meta = True

    if not toc_rows:
        pass

    # 2. Page markers + caches (all O(lines) one-time)
    page_markers = _build_page_marker_index(lines)
    meta_lookup = _build_meta_page_lookup(meta_entries, layout)

    # 3. Offset (when TOC from meta, page_id is already pdf_page so use 0)
    if toc_from_meta:
        offset = 0
    else:
        offset = _compute_offset(toc_rows, meta_lookup, page_markers, lines)
    
    # 4. Resolve nodes: mechanical steps only (locate headings, assign ranges)
    nodes = []
    diag = []
    diag.append(f"Markdown: {len(lines)} lines")
    diag.append(f"Offset: {offset}")
    if llm_toc_entries:
        diag.append("TOC from LLM (raw markdown parsed)")

    entries_with_depth: list[tuple[str, int, int | None]] = []  # (title, page, depth or None)
    if llm_toc_entries:
        for e in llm_toc_entries:
            entries_with_depth.append((e["title"], e["page"], e.get("depth")))
    else:
        for title, toc_page in toc_rows:
            entries_with_depth.append((title, toc_page, None))

    n_entries = len(entries_with_depth)
    log.info("Resolving %d section headings in document order...", n_entries)
    head_index = _build_heading_index(lines)
    page_cache = _build_page_cache(lines) if page_markers else None
    search_after_line = 0
    head_start_index = 0
    progress_interval = max(1, n_entries // 10)
    # When LLM already gave us page numbers, skip expensive meta lookup entirely
    has_llm_pages = llm_toc_entries is not None
    for toc_index, (title, toc_page, depth_from_llm) in enumerate(entries_with_depth):
        if toc_index > 0 and toc_index % progress_interval == 0:
            log.info("  resolved %d / %d...", toc_index, n_entries)
        pdf_page = None
        if not has_llm_pages:
            pdf_page = _meta_pdf_page_for_fast(title, meta_lookup)
        if pdf_page is None:
            pdf_page = _resolve_pdf_page(toc_page, offset)

        md_start, head_start_index = _locate_heading(
            lines, title, pdf_page, page_markers, search_after_line,
            head_index=head_index, head_start_index=head_start_index,
        )
        if md_start is None and pdf_page and pdf_page in page_markers:
            md_start = page_markers[pdf_page]
            diag.append(f"NO_HEADING: {title} (pdf {pdf_page}) -> {md_start}")

        if md_start:
            search_after_line = md_start
            actual_page = _page_at_line(lines, md_start, page_cache) if page_markers else 0
            if actual_page:
                pdf_page = actual_page
            if not page_markers:
                pdf_page = None

            depth = depth_from_llm
            if depth is None:
                depth = _heading_level_at_line(lines, md_start)
            if depth is not None:
                depth = max(1, min(6, depth))
            node = {
                "id": _slug(title, len(nodes)),
                "title": title,
                "pdf_page": pdf_page,
                "md_start_line": md_start,
                "_fallback_end": len(lines),
            }
            if depth is not None:
                node["depth"] = depth
            nodes.append(node)
        else:
            diag.append(f"UNRESOLVED: {title}")
            
    # 5. Nesting
    _assign_depths_and_parents(nodes)
    # Fix inverted ranges: set each node's end to next heading in document order (TOC order can differ)
    _fix_md_end_lines_by_document_order(nodes)
    
    # pdf_page_end: O(N) reverse pass to find next same-or-shallower node's start page
    if page_markers:
        n_nodes = len(nodes)
        # Reverse pass: for each node find the next node at same-or-shallower depth
        next_same_level_page: list[int] = [0] * n_nodes
        # Stack of (depth, pdf_page) — entries at depths we haven't closed yet
        depth_stack: list[tuple[int, int]] = []
        for i in range(n_nodes - 1, -1, -1):
            node_depth = nodes[i].get("depth", 99)
            # Pop entries deeper than us (they're nested under us, not peers)
            while depth_stack and depth_stack[-1][0] > node_depth:
                depth_stack.pop()
            # Top of stack is next same-or-shallower node (or empty = no cap)
            if depth_stack:
                next_same_level_page[i] = depth_stack[-1][1]
            depth_stack.append((node_depth, nodes[i].get("pdf_page") or 0))
        for i, node in enumerate(nodes):
            end_page = _page_at_line(lines, node["md_end_line"], page_cache)
            if end_page == 0 and i + 1 < n_nodes:
                next_start = nodes[i + 1].get("pdf_page")
                if next_start and next_start > 0:
                    end_page = next_start - 1
            if end_page == 0 and node.get("pdf_page"):
                end_page = node["pdf_page"]
            ns = next_same_level_page[i]
            if ns > 0 and (end_page <= 0 or end_page >= ns):
                end_page = ns - 1
            node["pdf_page_end"] = max(end_page or 0, node.get("pdf_page") or 0)
    else:
        for node in nodes:
            node["pdf_page_end"] = None

    chapters = _build_tree(nodes)
    _fix_inverted_in_tree(chapters, len(lines))

    # Recompute pdf_page_end from current md_end_line after tree fixes, then propagate (keeps higher-level pages robust)
    if page_markers:
        _recompute_pdf_page_ends_in_tree(chapters, lines, page_markers, page_cache=page_cache)
        _propagate_parent_ends(chapters)

    # 6. Fallback: only when we have no usable TOC (few_or_no_toc) do we try LLM as TOC replacement.
    # When we have a TOC but it's messy (inverted, many_roots), use header-based index; don't call LLM.
    flat = _flatten_sections_for_check(chapters)
    inverted = any(s["md_start_line"] > s["md_end_line"] for s in flat)
    many_roots = len(chapters) > 80
    few_or_no_toc = len(nodes) < 5
    if few_or_no_toc:
        # No reliable TOC: use LLM to get section titles (structure only), then fill from book
        diag.append("FALLBACK: no or very few TOC entries; trying LLM as TOC replacement")
        log.info(
            "index fallback: few_or_no_toc (nodes=%d); trying LLM for TOC structure",
            len(nodes),
        )
        headers_text = _collect_headers_for_llm(lines)
        llm_entries = _infer_toc_with_llm(headers_text) if headers_text else None
        if llm_entries and len(llm_entries) >= 5:
            log.info("index: using LLM as TOC (%d titles), filling pages/depth from book", len(llm_entries))
            diag.append(f"LLM TOC replacement: {len(llm_entries)} entries (pages/depth from book)")
            llm_nodes = _build_nodes_from_llm_toc(llm_entries, lines, page_markers)
            if llm_nodes:
                chapters = _build_tree(llm_nodes)
            else:
                log.info("index: LLM TOC produced no nodes; using header-based index")
                diag.append("LLM TOC produced no nodes; header-based index")
                header_nodes = build_index_from_headings(lines)
                chapters = _build_tree(header_nodes)
        else:
            log.info("index: using header-based index (no LLM or LLM returned <%d entries)", 5)
            diag.append("Header-based index (no LLM or LLM returned too few)")
            header_nodes = build_index_from_headings(lines)
            chapters = _build_tree(header_nodes)
    elif inverted or many_roots:
        # When we have LLM-enriched TOC depths, keep the TOC tree so the index only has TOC entries (no body-only headings like "Chapter 1")
        if llm_toc_entries:
            log.info(
                "index: keeping LLM-parsed TOC tree (only TOC entries; inverted=%s, many_roots=%s)",
                inverted, many_roots,
            )
            diag.append("LLM-parsed TOC kept; index has only TOC entries (no header-based fallback)")
        else:
            # No LLM enrichment: use header-based index
            log.info(
                "index fallback: TOC messy (inverted=%s, many_roots=%s); using header-based index (no LLM)",
                inverted, many_roots,
            )
            diag.append("FALLBACK: TOC/meta had bad ranges or too many roots; header-based index")
            header_nodes = build_index_from_headings(lines)
            chapters = _build_tree(header_nodes)
    else:
        log.info(
            "index: built from TOC/meta (no fallback): %d nodes, %d top-level",
            len(nodes), len(chapters),
        )

    annotations = _collect_annotations(meta_entries, layout)

    flat_count = len(_flatten_sections_for_check(chapters))
    log.info("Index built: %d sections, %d top-level chapters", flat_count, len(chapters))

    return {
        "index_version": INDEX_VERSION,
        "chapters": chapters,
        "page_count": len(page_markers),
        "pdf_to_toc_offset": offset,
        "annotations": annotations,
        "diagnostics": diag,
    }


def write_index(index: dict, out_path: Path) -> None:
    """Write index to JSON. Ensures index_version is set to current INDEX_VERSION."""
    index = dict(index)
    index["index_version"] = INDEX_VERSION
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)
