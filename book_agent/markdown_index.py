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

import json
import logging
import re
from collections import Counter
from pathlib import Path

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Regex patterns
# ---------------------------------------------------------------------------
PAGE_MARKER_RE = re.compile(r"^\s*\{(\d+)\}\s*-+\s*$")
HEADING_RE = re.compile(r"^#{1,6}\s+(.+)$")
TABLE_ROW_RE = re.compile(r"^\s*\|(.+)\|\s*$")
SECTION_NUM_RE = re.compile(r"^(\d+(?:\.\d+)*)[.\s]")
HTML_TAG_RE = re.compile(r"<[^>]+>")

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
    # Remove HTML tags
    t = HTML_TAG_RE.sub("", t)
    # Remove bold/italic markers
    t = t.replace("**", "").replace("*", "").replace("__", "").replace("_", "")
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

def parse_contents_table(lines: list[str]) -> list[tuple[str, int]]:
    """
    Scan for the Markdown table representing the TOC.
    Return list of (title, toc_page).
    """
    rows = []
    
    # Simple state machine to capture table rows
    # We look for lines starting with |
    
    for line in lines:
        if not line.strip().startswith("|"):
            continue
        
        # Check if it's a separator line |---|
        if re.match(r"^\s*\|[-:| ]+\|\s*$", line):
            continue
            
        m = TABLE_ROW_RE.match(line)
        if not m:
            continue
            
        content = m.group(1)
        cells = [c.strip() for c in content.split("|")]
        if not cells:
            continue
            
        # Search backwards for a valid page number
        page = None
        page_index = -1
        
        for i in range(len(cells) - 1, -1, -1):
            p_str = HTML_TAG_RE.sub("", cells[i]).strip()
            if not p_str:
                continue
                
            # Try integer
            try:
                page = int(p_str)
                page_index = i
                break
            except ValueError:
                pass
                
            # Try Roman
            r_val = _roman_to_int(p_str)
            if r_val is not None:
                page = r_val
                page_index = i
                break
        
        if page is None:
            continue

        # Title is the join of cells before the page number
        title_parts = []
        for k in range(page_index):
            c_clean = HTML_TAG_RE.sub("", cells[k]).strip()
            if not c_clean:
                continue
            title_parts.append(c_clean)
            
        if not title_parts:
            continue
            
        title = " ".join(title_parts)
        title = _normalize(title)
        
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

def _page_at_line(lines: list[str], line_1based: int) -> int:
    """Scan backward to find page marker."""
    for i in range(min(line_1based - 1, len(lines) - 1), -1, -1):
        m = PAGE_MARKER_RE.match(lines[i])
        if m:
            return int(m.group(1))
    return 0

def _find_heading_in_range(
    lines: list[str], title: str, range_start: int, range_end: int
) -> int | None:
    """
    Find heading matching title in range.
    """
    norm = _normalize(title).lower()
    norm_core = _strip_section_num(norm)
    
    # Cap range
    range_start = max(1, range_start)
    range_end = min(len(lines), range_end)
    
    for i in range(range_start - 1, range_end):
        line = lines[i]
        m = HEADING_RE.match(line)
        if m:
            h_text = m.group(1).strip()
            h_norm = _normalize(h_text).lower()
            h_core = _strip_section_num(h_norm)
            
            # Exact core match
            if norm_core and h_core and norm_core == h_core:
                return i + 1
            # Exact full match
            if norm == h_norm:
                return i + 1
                
    return None

def _locate_heading(
    lines: list[str], title: str, pdf_page: int | None,
    page_markers: dict[int, int],
) -> int | None:
    """
    Find the markdown heading for a TOC title near the expected pdf_page.
    """
    if pdf_page is None:
        return None
        
    # 1. Search near page (pdf_page - 1 to pdf_page + 1)
    # Find start line
    search_start = 1
    for pg in range(pdf_page - 1, pdf_page + 1):
        if pg in page_markers:
            search_start = page_markers[pg]
            break
            
    # Find end line (start of page + 2 or + 3)
    search_end = len(lines)
    for pg in range(pdf_page + 2, pdf_page + 4):
        if pg in page_markers:
            search_end = page_markers[pg]
            break
            
    return _find_heading_in_range(lines, title, search_start, search_end)

# ---------------------------------------------------------------------------
# Offset and Meta Page
# ---------------------------------------------------------------------------

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

        # 1. Exact full title match
        if mt == norm:
            return e.get("page_id")
        
        # 2. Exact core title match
        if norm_core and mt_core and (norm_core == mt_core):
            return e.get("page_id")

        # 3. Fuzzy match candidates
        if norm_core and mt_core and len(norm_core) > 5 and len(mt_core) > 5:
            # Check for substring match with length ratio check
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

    # Only accept fuzzy match if score is high enough (e.g. > 0.8)
    if best_fuzzy_page is not None and best_fuzzy_score > 0.8:
        return best_fuzzy_page

    return None

def _compute_offset(
    toc_rows: list[tuple[str, int]],
    meta_entries: list[dict],
    layout: dict,
    page_markers: dict[int, int],
    lines: list[str],
) -> int | None:
    """Find pdf_to_toc_offset."""
    candidates = []
    for title, toc_page in toc_rows:
        if toc_page <= 0: continue
        
        pdf_page = _meta_pdf_page_for(title, meta_entries, layout)
        if pdf_page:
            candidates.append(pdf_page - toc_page)
            
    if not candidates:
        return None
        
    # Most common offset
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
    """Assign depth and nest nodes."""
    # First assign depths
    for node in nodes:
        node["depth"] = _depth(node["title"])
        
    # Assign end lines based on next node
    for i in range(len(nodes) - 1):
        nodes[i]["md_end_line"] = nodes[i+1]["md_start_line"]
    
    # Last node ends at fallback
    if nodes:
        nodes[-1]["md_end_line"] = nodes[-1]["_fallback_end"]

def _build_tree(nodes: list[dict]) -> list[dict]:
    """Convert list of nodes into nested tree based on depth."""
    root_nodes = []
    stack = [] # (node, depth)
    
    for node in nodes:
        depth = node["depth"]
        node["children"] = []
        
        # Pop items from stack that are deeper or equal
        # But wait, we want parents to have lower depth.
        # If current depth is 2, parent should be 1.
        # If stack top is 2, pop it (sibling).
        # If stack top is 3, pop it (finished child).
        
        while stack and stack[-1]["depth"] >= depth:
            stack.pop()
            
        if stack:
            stack[-1]["children"].append(node)
        else:
            root_nodes.append(node)
            
        stack.append(node)
        
    return root_nodes

# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------

def build_index(md_path: Path, meta_path: Path | None = None) -> dict:
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
    
    # 1. Parse TOC
    toc_rows = parse_contents_table(lines)
    
    # 2. Page markers
    page_markers = _build_page_marker_index(lines)
    
    # 3. Offset
    offset = _compute_offset(toc_rows, meta_entries, layout, page_markers, lines)
    
    # 4. Resolve nodes
    nodes = []
    diag = []
    diag.append(f"Markdown: {len(lines)} lines")
    diag.append(f"Offset: {offset}")
    
    for title, toc_page in toc_rows:
        pdf_page = _meta_pdf_page_for(title, meta_entries, layout)
        source = "meta"
        
        if pdf_page is None:
            pdf_page = _resolve_pdf_page(toc_page, offset)
            source = "offset"
            
        md_start = _locate_heading(lines, title, pdf_page, page_markers)
        
        # Wide search fallback
        if md_start is None and pdf_page:
            for d in range(-3, 6):
                md_start = _locate_heading(lines, title, pdf_page + d, page_markers)
                if md_start: break
                
        # Marker fallback
        if md_start is None and pdf_page and pdf_page in page_markers:
            md_start = page_markers[pdf_page]
            diag.append(f"NO_HEADING: {title} (pdf {pdf_page}) -> {md_start}")
            
        if md_start:
            # Update pdf_page from actual marker
            actual_page = _page_at_line(lines, md_start)
            if actual_page:
                pdf_page = actual_page
                
            nodes.append({
                "id": _slug(title, len(nodes)),
                "title": title,
                "pdf_page": pdf_page,
                "md_start_line": md_start,
                "_fallback_end": len(lines)
            })
        else:
            diag.append(f"UNRESOLVED: {title}")
            
    # 5. Nesting
    _assign_depths_and_parents(nodes)
    
    # Update pdf_page_end
    for node in nodes:
        node["pdf_page_end"] = _page_at_line(lines, node["md_end_line"])
        
    chapters = _build_tree(nodes)
    annotations = _collect_annotations(meta_entries, layout)
    
    return {
        "chapters": chapters,
        "page_count": len(page_markers),
        "pdf_to_toc_offset": offset,
        "annotations": annotations,
        "diagnostics": diag
    }

def write_index(index: dict, out_path: Path):
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
