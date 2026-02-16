"""PyMuPDF-based PDF → Markdown conversion: layout-aware text, figures, equations, tables, margin notes."""

import json
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime

import fitz  # PyMuPDF

from book_agent.backends.base import ConversionBackend
from book_agent.models import ConversionConfig, ConversionResult


def _slug_from_path(pdf_path: Path) -> str:
    """Derive a safe slug from the PDF filename (no extension)."""
    name = pdf_path.stem
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"[-\s]+", "-", name).strip("-").lower()
    return name or "book"


def _escape_md(text: str) -> str:
    """Escape markdown special chars in inline text where needed."""
    return text


# ---------------------------------------------------------------------------
# Layout and region detection constants
# ---------------------------------------------------------------------------

# Tolerance (points) for considering two spans on the same line
LINE_Y_TOLERANCE = 2.5
# Multiple of median line height: gap larger than this starts a new paragraph
PARAGRAPH_GAP_MULTIPLIER = 1.4
# Font size threshold above which a short line is treated as heading (points)
HEADING_FONT_SIZE_MIN = 12.5
# Min font size delta above page median to treat as heading
HEADING_SIZE_ABOVE_MEDIAN = 1.5

# Margin: fraction of page width; content with x0 < this is left margin, x0 > (1-this) is right margin
MARGIN_FRACTION = 0.14
# Minimum ratio of math-like chars (0-9, =+-*/().^_[], etc.) for a line to be treated as equation
EQUATION_MATH_RATIO_MIN = 0.32
# Minimum ratio of "garbage" (replacement char, box-drawing, stray symbols) to treat as diagram
DIAGRAM_GARBAGE_RATIO_MIN = 0.22
# Table: min lines with aligned columns to emit as table
TABLE_MIN_ROWS = 2
# Table: max horizontal gap (pt) to merge column boundaries when clustering
TABLE_COLUMN_CLUSTER_GAP = 15


@dataclass
class _Span:
    """Single text span with position and style."""
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    size: float
    flags: int


def _get_image_rects(page: fitz.Page) -> list[tuple[float, float, float, float]]:
    """Return list of (x0, y0, x1, y1) for each image on the page (to filter out text inside figures)."""
    rects: list[tuple[float, float, float, float]] = []
    try:
        for img_item in page.get_images(full=True):
            xref = img_item[0]
            for r in page.get_image_rects(xref, transform=True):
                rects.append((r.x0, r.y0, r.x1, r.y1))
    except Exception:
        pass
    return rects


def _span_inside_any_rect(span: _Span, rects: list[tuple[float, float, float, float]]) -> bool:
    """True if span's center lies inside any of the given rects."""
    cx = (span.x0 + span.x1) / 2
    cy = (span.y0 + span.y1) / 2
    for (x0, y0, x1, y1) in rects:
        if x0 <= cx <= x1 and y0 <= cy <= y1:
            return True
    return False


def _collect_spans_from_page(
    page: fitz.Page,
    page_width: float,
    image_rects: list[tuple[float, float, float, float]],
    margin_fraction: float = MARGIN_FRACTION,
) -> tuple[list[_Span], list[_Span]]:
    """
    Collect text spans from a page. Returns (main_spans, margin_spans).
    Spans inside image rects are dropped. Spans in left/right margin go to margin_spans.
    """
    main_spans: list[_Span] = []
    margin_spans: list[_Span] = []
    margin_left = page_width * margin_fraction
    margin_right = page_width * (1 - margin_fraction)

    blocks = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)["blocks"]
    for block in blocks:
        if "lines" not in block:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                text = span.get("text", "").strip()
                if not text:
                    continue
                bbox = span.get("bbox", (0, 0, 0, 0))
                s = _Span(
                    text=text,
                    x0=bbox[0], y0=bbox[1], x1=bbox[2], y1=bbox[3],
                    size=span.get("size", 10),
                    flags=span.get("flags", 0),
                )
                if _span_inside_any_rect(s, image_rects):
                    continue
                if s.x0 < margin_left or s.x0 > margin_right:
                    margin_spans.append(s)
                else:
                    main_spans.append(s)
    return main_spans, margin_spans


def _group_spans_into_lines(spans: list[_Span]) -> list[list[_Span]]:
    """Group spans that share the same baseline (y) into lines, sorted by x."""
    if not spans:
        return []
    sorted_spans = sorted(spans, key=lambda s: (round(s.y0 / LINE_Y_TOLERANCE) * LINE_Y_TOLERANCE, s.x0))
    lines: list[list[_Span]] = []
    current_y: float | None = None
    for s in sorted_spans:
        if current_y is None or abs(s.y0 - current_y) > LINE_Y_TOLERANCE:
            current_y = s.y0
            lines.append([s])
        else:
            lines[-1].append(s)
    return lines


# ---------------------------------------------------------------------------
# Equation, diagram, and table detection
# ---------------------------------------------------------------------------

_MATH_CHARS = set("0123456789=+-*/().^_[]{}|\\<>,\"'`~:;")
_REPLACEMENT_CHAR = "\uFFFD"
_GARBAGE_CHARS = set("@\uFFFD\u25a0\u25aa\u25a1\u2500\u2502\u2514\u2518\u2510\u250c\u2524\u2534\u252c\u253c\u256d\u256e\u256f\u2570\u2571\u2572\u2573\u2574\u2575\u2576\u2577\u2578\u2579\u257a\u257b\u257c\u257d\u257e\u257f\u2580\u2584\u2588\u2591\u2592\u2593\u2594\u2595\u2596\u2597\u2598\u2599\u259a\u259b\u259c\u259d\u259e\u259f")


def _is_likely_diagram_unicode(c: str) -> bool:
    """True for chars that often appear in diagram/vector art (control, combining, symbols, private use)."""
    if not c:
        return False
    code = ord(c)
    if code == 0xFFFD:
        return True
    if code < 32 and c not in "\t\n\r":  # C0 control (e.g. DC1, DC2 from vector art)
        return True
    if 0x0300 <= code <= 0x036F:  # combining
        return True
    if 0x2000 <= code <= 0x206F:  # general punctuation, etc.
        return True
    if 0xE000 <= code <= 0xF8FF:  # private use
        return True
    return False


def _line_math_ratio(line_text: str) -> float:
    """Fraction of characters that look like math (digits, operators, replacement char, etc.)."""
    if not line_text or len(line_text) < 3:
        return 0.0
    n = sum(
        1
        for c in line_text
        if c in _MATH_CHARS or c.isspace() or c == _REPLACEMENT_CHAR
    )
    return n / len(line_text)


def _line_garbage_ratio(line_text: str) -> float:
    """Fraction of characters that are replacement char or diagram glyphs."""
    if not line_text:
        return 0.0
    n = sum(1 for c in line_text if c in _GARBAGE_CHARS or c == _REPLACEMENT_CHAR)
    return n / len(line_text)


def _classify_line_as_equation_or_diagram(line_text: str) -> str:
    """Returns 'equation', 'diagram', or 'body'. Diagram preferred when garbage/symbols present."""
    t = line_text.strip()
    if len(t) < 2:
        return "body"
    garbage = _line_garbage_ratio(t)
    if garbage >= DIAGRAM_GARBAGE_RATIO_MIN:
        return "diagram"
    # Replacement char often indicates diagram/font glyphs
    if _REPLACEMENT_CHAR in t and len(t) >= 5:
        repl_ratio = t.count(_REPLACEMENT_CHAR) / len(t)
        if repl_ratio >= 0.15:
            return "diagram"
    # Lines that look like diagram glyphs (many @ ` R etc.)
    diagram_like = sum(1 for c in t if c in "@`\u00ac\u00adR\u2022\u2026\u2032\u2033")
    if len(t) >= 10 and diagram_like >= 2:
        return "diagram"
    # Very few normal letters and many symbols -> likely diagram/vector art
    ascii_letters = sum(1 for c in t if "a" <= c <= "z" or "A" <= c <= "Z")
    if len(t) >= 15 and ascii_letters / len(t) < 0.25:
        return "diagram"
    # Repeated same character (e.g. diagram glyphs) -> diagram
    non_space = [c for c in t if not c.isspace()]
    if len(non_space) >= 10:
        most_common = Counter(non_space).most_common(1)
        if most_common and most_common[0][1] / len(non_space) > 0.35:
            return "diagram"
    # Many diagram-like Unicode (combining, private use, control chars) -> diagram
    diagram_unicode_count = sum(1 for c in t if _is_likely_diagram_unicode(c))
    if diagram_unicode_count >= 3:  # any line with 3+ such chars is likely diagram
        return "diagram"
    if len(t) >= 12 and diagram_unicode_count / len(t) > 0.2:
        return "diagram"
    # Equation: contains equation number (40.1) and = or looks like equation line
    if "=" in t and re.search(r"\(\d+\.\d+\)", t):
        return "equation"
    # Line that looks like start of equation: "y = f(..." or "f ( a ) =" etc.
    if re.search(r"[yf]\s*=\s*[f\(a-zA-Z]|f\s*\(\s*[a-zA-Z]\s*\)\s*=", t) and len(t) < 100:
        return "equation"
    if _line_math_ratio(t) >= EQUATION_MATH_RATIO_MIN and len(t) >= 4:
        return "equation"
    return "body"


def _normalize_equation_text(text: str) -> str:
    """Collapse extra spaces in equation line(s); keep single newlines for multi-line."""
    return re.sub(r"[ \t]+", " ", text).strip()


def _build_table_from_aligned_lines(
    lines_of_spans: list[list[_Span]],
    col_gap: float = TABLE_COLUMN_CLUSTER_GAP,
) -> str | None:
    """
    If lines have aligned columns and look like a real table (not prose), return Markdown table; else None.
    """
    if len(lines_of_spans) < TABLE_MIN_ROWS:
        return None
    all_x0: list[float] = []
    for span_list in lines_of_spans:
        for s in span_list:
            all_x0.append(s.x0)
    all_x0.sort()
    cols: list[float] = []
    for x in all_x0:
        if not cols or x - cols[-1] > col_gap:
            cols.append(x)
    if len(cols) < 2 or len(cols) > 12:
        return None
    rows: list[list[str]] = []
    for span_list in lines_of_spans:
        cells: list[list[str]] = [[] for _ in cols]
        for s in span_list:
            idx = 0
            for i, cx in enumerate(cols):
                if s.x0 >= cx - col_gap / 2:
                    idx = i
            if idx < len(cells):
                cells[idx].append(s.text)
        row_texts = [" ".join(c).strip() for c in cells]
        if any(row_texts):
            rows.append(row_texts)
    if len(rows) < TABLE_MIN_ROWS:
        return None
    max_cols = max(len(r) for r in rows)
    for r in rows:
        while len(r) < max_cols:
            r.append("")
    # Reject if this looks like prose: many columns with long cells (sentence-like)
    avg_cell_len = sum(len(c) for r in rows for c in r) / max(1, sum(len(r) for r in rows))
    if avg_cell_len > 28:
        return None
    # Reject if first row has too many non-empty cells that are long (likely sentence)
    if rows and sum(1 for c in rows[0] if len(c) > 20) >= 2:
        return None
    header = "| " + " | ".join(rows[0]) + " |"
    sep = "| " + " | ".join(["---"] * max_cols) + " |"
    body = "\n".join("| " + " | ".join(r) + " |" for r in rows[1:])
    return header + "\n" + sep + "\n" + body


def _lines_to_paragraphs(
    lines: list[tuple[str, float, float]],
) -> list[tuple[str, bool]]:
    """
    Group lines into paragraphs. Each item is (text, is_heading).
    lines: list of (line_text, max_font_size_in_line, y0).
    """
    if not lines:
        return []
    y_positions = [y for (_, _, y) in lines]
    gaps = [y_positions[i] - y_positions[i - 1] for i in range(1, len(y_positions))]
    median_gap = sorted(gaps)[len(gaps) // 2] if gaps else 20
    threshold = median_gap * PARAGRAPH_GAP_MULTIPLIER

    sizes = [sz for (_, sz, _) in lines]
    median_size = sorted(sizes)[len(sizes) // 2] if sizes else 11

    result: list[tuple[str, bool]] = []
    current_para: list[str] = []
    prev_y: float | None = None

    for line_text, max_size, y0 in lines:
        is_heading = (
            max_size >= HEADING_FONT_SIZE_MIN
            and (max_size - median_size) >= HEADING_SIZE_ABOVE_MEDIAN
            and len(line_text) < 120
        ) or bool(re.match(r"^(Chapter\s+\d+|Chapter\s+[IVXLCDM]+|\d+\.\s+[A-Z])", line_text.strip(), re.I))
        if is_heading and current_para:
            para = " ".join(current_para).strip()
            if para:
                result.append((para, False))
            current_para = []
            result.append((line_text.strip(), True))
            prev_y = y0
            continue
        if prev_y is not None and (y0 - prev_y) > threshold and current_para:
            para = " ".join(current_para).strip()
            if para:
                result.append((para, False))
            current_para = []
        current_para.append(line_text)
        prev_y = y0
    para = " ".join(current_para).strip()
    if para:
        result.append((para, False))
    return result


# Y position used for marginal notes so they sort after main content
_MARGIN_NOTE_Y = 1e9


def _page_to_markdown_blocks(page: fitz.Page, page_markers: bool) -> list[tuple[float, str]]:
    """
    Convert one page to markdown blocks with y-positions for interleaving figures.
    Returns list of (y_position, markdown_string). Marginal notes use a large y so they stay at end.
    """
    positioned: list[tuple[float, str]] = []
    rect = page.rect
    page_width = rect.width
    image_rects = _get_image_rects(page)
    main_spans, margin_spans = _collect_spans_from_page(page, page_width, image_rects)
    if not main_spans and not margin_spans:
        return positioned

    lines_of_spans = _group_spans_into_lines(main_spans)
    line_records: list[tuple[str, float, float, list[_Span]]] = []
    for span_list in lines_of_spans:
        bits: list[str] = []
        max_size = max(s.size for s in span_list)
        y0 = span_list[0].y0
        for s in span_list:
            t = s.text
            if s.flags & 16:
                t = f"**{t}**"
            if s.flags & 2:
                t = f"*{t}*"
            bits.append(t)
        line_text = " ".join(bits)
        line_records.append((line_text, max_size, y0, span_list))

    sizes = [r[1] for r in line_records]
    median_size = sorted(sizes)[len(sizes) // 2] if sizes else 11
    i = 0
    while i < len(line_records):
        line_text, max_size, y0, span_list = line_records[i]
        kind = _classify_line_as_equation_or_diagram(line_text)
        is_heading = (
            max_size >= HEADING_FONT_SIZE_MIN
            and (max_size - median_size) >= HEADING_SIZE_ABOVE_MEDIAN
            and len(line_text) < 120
        ) or bool(re.match(r"^(Chapter\s+\d+|Chapter\s+[IVXLCDM]+|\d+\.\s+[A-Z])", line_text.strip(), re.I))

        if kind == "diagram":
            positioned.append((y0, "\n*[Diagram]*\n\n"))
            i += 1
            continue
        if kind == "equation":
            eq_lines = [line_text]
            j = i + 1
            while j < len(line_records) and _classify_line_as_equation_or_diagram(line_records[j][0]) == "equation":
                eq_lines.append(line_records[j][0])
                j += 1
            eq_text = _normalize_equation_text("\n".join(eq_lines))
            if eq_text:
                positioned.append((y0, f"\n$$\n{eq_text}\n$$\n\n"))
            i = j
            continue
        if not is_heading and len(line_records) - i >= TABLE_MIN_ROWS:
            table_candidates = [span_list]
            for j in range(i + 1, min(i + 20, len(line_records))):
                if _classify_line_as_equation_or_diagram(line_records[j][0]) != "body":
                    break
                table_candidates.append(line_records[j][3])
            table_md = _build_table_from_aligned_lines(table_candidates)
            if table_md:
                # Don't emit as table if content is mostly diagram/vector garbage
                if sum(1 for c in table_md if _is_likely_diagram_unicode(c)) < 10:
                    positioned.append((y0, "\n" + table_md + "\n\n"))
                    i += len(table_candidates)
                    continue
        body_batch: list[tuple[str, float, float]] = []
        j = i
        while j < len(line_records):
            lt, ms, y = line_records[j][0], line_records[j][1], line_records[j][2]
            k = _classify_line_as_equation_or_diagram(lt)
            if k != "body" and k != "equation":
                break
            if k == "equation":
                break
            is_h = (
                ms >= HEADING_FONT_SIZE_MIN and (ms - median_size) >= HEADING_SIZE_ABOVE_MEDIAN and len(lt) < 120
            ) or bool(re.match(r"^(Chapter\s+\d+|Chapter\s+[IVXLCDM]+|\d+\.\s+[A-Z])", lt.strip(), re.I))
            body_batch.append((lt, ms, y))
            j += 1
            if is_h and len(body_batch) > 1:
                j -= 1
                body_batch.pop()
                break
        if body_batch:
            first_y = body_batch[0][2]
            paras = _lines_to_paragraphs(body_batch)
            for text, is_heading in paras:
                if not text:
                    continue
                # Sanitize: body paragraphs with 5+ control/diagram chars (vector art garbage) -> placeholder
                diagram_char_count = sum(1 for c in text if _is_likely_diagram_unicode(c))
                if not is_heading and diagram_char_count >= 5:
                    positioned.append((first_y, "\n*[Diagram]*\n\n"))
                    continue
                if is_heading:
                    positioned.append((first_y, f"## {_escape_md(text)}\n\n"))
                else:
                    positioned.append((first_y, text + "\n\n"))
            i = j
        else:
            i += 1

    if margin_spans:
        margin_lines = _group_spans_into_lines(margin_spans)
        margin_line_texts = [" ".join(s.text for s in span_list) for span_list in margin_lines]
        if margin_line_texts:
            margin_content = "\n\n".join(margin_line_texts).strip()
            if margin_content:
                positioned.append((_MARGIN_NOTE_Y, "\n### Marginal notes\n\n"))
                positioned.append((_MARGIN_NOTE_Y + 1, margin_content + "\n\n"))

    return positioned


# ---------------------------------------------------------------------------
# Chapter detection from full content
# ---------------------------------------------------------------------------

# Match ## Chapter N, ## N. Title, or ## N Title (e.g. "28 Model Comparison")
CHAPTER_HEADING_PATTERN = re.compile(
    r"^##\s+(Chapter\s+\d+|Chapter\s+[IVXLCDM]+|\d+\.\s+[A-Za-z].*|\d+\s+[A-Za-z].*)$",
    re.MULTILINE | re.IGNORECASE,
)


def _detect_chapter_starts_from_content(full_content: str) -> list[tuple[int, str]]:
    """
    Find chapter headings in full markdown. Returns list of (1-based page number, heading text).
    We scan for ## Chapter N or ## N. Title that appear right after <!-- page N -->.
    """
    # Split by page markers to know which page each segment is on
    page_segments = re.split(r"\n*<!--\s*page\s+(\d+)\s*-->\n*", full_content)
    # page_segments[0] may be preamble, then [1]=page1_num, [2]=page1_content, [3]=page2_num, [4]=page2_content, ...
    results: list[tuple[int, str]] = []
    i = 1
    while i < len(page_segments) - 1:
        page_no_str = page_segments[i].strip()
        content = page_segments[i + 1] if i + 1 < len(page_segments) else ""
        try:
            page_no = int(page_no_str)
        except ValueError:
            i += 2
            continue
        # Look for ## Chapter ... or ## 1. Title in the first 500 chars of this page
        head = content[:800]
        for m in CHAPTER_HEADING_PATTERN.finditer(head):
            results.append((page_no, m.group(1).strip()))
            break  # one chapter per page at most
        i += 2
    return results


def _build_chapter_ranges(
    chapter_starts: list[tuple[int, str]],
    last_page: int,
) -> list[tuple[int, int, str]]:
    """Convert list of (page, title) into (start_page, end_page, title). Returns [] if no chapters detected."""
    if not chapter_starts:
        return []
    ranges: list[tuple[int, int, str]] = []
    for idx, (start, title) in enumerate(chapter_starts):
        end = chapter_starts[idx + 1][0] - 1 if idx + 1 < len(chapter_starts) else last_page
        ranges.append((start, end, title))
    return ranges


def _split_content_by_pages(full_content: str) -> list[tuple[int, str]]:
    """Split full markdown by <!-- page N -->. Returns list of (page_no, content)."""
    parts = re.split(r"\n*<!--\s*page\s+(\d+)\s*-->\n*", full_content)
    result: list[tuple[int, str]] = []
    i = 1
    while i < len(parts) - 1:
        try:
            page_no = int(parts[i].strip())
        except ValueError:
            i += 2
            continue
        result.append((page_no, (parts[i + 1] or "").strip()))
        i += 2
    return result


class PyMuPDFBackend(ConversionBackend):
    """Extract text (layout-aware lines/paragraphs), figures, page mapping, and optional chapter split."""

    @property
    def name(self) -> str:
        return "pymupdf"

    def convert(self, pdf_path: Path, config: ConversionConfig) -> ConversionResult:
        pdf_path = Path(pdf_path)
        if not pdf_path.is_file():
            return ConversionResult(
                success=False,
                output_dir=config.output_dir,
                errors=[f"PDF not found: {pdf_path}"],
                message="PDF file not found",
            )

        output_dir = Path(config.output_dir)
        book_slug = config.book_slug or _slug_from_path(pdf_path)
        md_dir = output_dir / "md"
        figures_dir = output_dir / "figures" if config.extract_figures else None

        md_dir.mkdir(parents=True, exist_ok=True)
        if figures_dir:
            figures_dir.mkdir(parents=True, exist_ok=True)

        errors: list[str] = []
        full_parts: list[str] = []
        figure_count = 0

        try:
            doc = fitz.open(pdf_path)
        except Exception as e:
            return ConversionResult(
                success=False,
                output_dir=output_dir,
                errors=[str(e)],
                message="Failed to open PDF",
            )

        try:
            for page_num in range(len(doc)):
                page_no = page_num + 1
                page = doc[page_num]

                if config.page_markers_in_md:
                    full_parts.append(f"\n\n<!-- page {page_no} -->\n\n")

                # Layout-aware text blocks with y-positions for interleaving figures
                positioned_blocks = _page_to_markdown_blocks(page, config.page_markers_in_md)

                # Extract images and get their y-positions (for correct placement in reading order)
                figure_blocks: list[tuple[float, str]] = []
                image_list = page.get_images(full=True)
                for img_index, img_item in enumerate(image_list):
                    xref = img_item[0]
                    y_center = 1e6  # default: after main content if no rect
                    try:
                        rects = list(page.get_image_rects(xref, transform=True))
                        if rects:
                            r = rects[0]
                            if hasattr(r, "y0"):
                                y_center = (r.y0 + r.y1) / 2
                            elif isinstance(r, (list, tuple)) and len(r) >= 4:
                                y_center = (r[1] + r[3]) / 2
                        base_image = doc.extract_image(xref)
                        img_bytes = base_image["image"]
                        ext = base_image["ext"]
                        if ext in ("jpg", "jpeg"):
                            ext = "png"
                        if config.extract_figures and figures_dir:
                            fname = f"p{page_no}_fig{img_index + 1}.{ext}"
                            out_path = figures_dir / fname
                            out_path.write_bytes(img_bytes)
                            figure_count += 1
                            rel_path = f"../figures/{fname}"
                            figure_blocks.append(
                                (y_center, f"\n![Figure p.{page_no}]({rel_path})\n\n")
                            )
                    except Exception as e:
                        errors.append(f"Page {page_no} image {img_index + 1}: {e}")

                # Interleave text and figures by y-position so images appear where they sit on the page
                combined: list[tuple[float, str]] = positioned_blocks + figure_blocks
                combined.sort(key=lambda x: x[0])
                for _, md in combined:
                    full_parts.append(md)

            page_count = len(doc)
            doc.close()
        except Exception as e:
            errors.append(str(e))
            try:
                doc.close()
            except Exception:
                pass
            return ConversionResult(
                success=False,
                output_dir=output_dir,
                page_count=page_num + 1,
                figure_count=figure_count,
                errors=errors,
                message="Conversion failed",
            )

        # Build full content and normalize
        full_content = "".join(full_parts).strip()
        full_content = re.sub(r"\n{3,}", "\n\n", full_content)
        # Replace lines or blocks that are mostly diagram garbage (control/replacement chars)
        lines = full_content.split("\n")
        out_lines: list[str] = []
        for line in lines:
            diagram_count = sum(1 for c in line if _is_likely_diagram_unicode(c))
            if len(line) >= 8 and diagram_count >= 3:
                if out_lines and out_lines[-1].strip() != "*[Diagram]*":
                    out_lines.append("*[Diagram]*")
                continue
            out_lines.append(line)
        full_content = "\n".join(out_lines)
        full_content = re.sub(r"\n{3,}", "\n\n", full_content)

        # Write full.md
        full_md_path = md_dir / "full.md"
        full_md_path.write_text(full_content, encoding="utf-8")

        # Chapter detection and per-chapter files
        page_to_content = dict(_split_content_by_pages(full_content))
        chapter_starts = _detect_chapter_starts_from_content(full_content)
        chapter_ranges = _build_chapter_ranges(chapter_starts, page_count)

        index_chapters: list[dict] = [
            {
                "id": "full",
                "title": book_slug,
                "pages": list(range(1, page_count + 1)),
                "start_page": 1,
                "end_page": page_count,
            }
        ]
        chapter_md_paths: list[Path] = []

        if config.split_by_chapter and chapter_ranges:
            for idx, (start_page, end_page, title) in enumerate(chapter_ranges):
                ch_id = f"ch{idx + 1:02d}"
                chunk_parts: list[str] = []
                for p in range(start_page, end_page + 1):
                    if p in page_to_content:
                        if config.page_markers_in_md:
                            chunk_parts.append(f"\n\n<!-- page {p} -->\n\n")
                        chunk_parts.append(page_to_content[p])
                        chunk_parts.append("\n\n")
                chunk_content = "".join(chunk_parts).strip()
                chunk_content = re.sub(r"\n{3,}", "\n\n", chunk_content)
                ch_path = md_dir / f"{ch_id}.md"
                ch_path.write_text(chunk_content, encoding="utf-8")
                chapter_md_paths.append(ch_path)
                index_chapters.append({
                    "id": ch_id,
                    "title": title,
                    "pages": list(range(start_page, end_page + 1)),
                    "start_page": start_page,
                    "end_page": end_page,
                })

        index_path = output_dir / "index.json"
        index_path.write_text(
            json.dumps({"chapters": index_chapters, "page_count": page_count}, indent=2),
            encoding="utf-8",
        )

        meta_path = output_dir / "meta.json"
        meta_path.write_text(
            json.dumps({
                "title": book_slug,
                "source_pdf": str(pdf_path.resolve()),
                "converted_at": datetime.utcnow().isoformat() + "Z",
                "backend": self.name,
                "page_count": page_count,
                "figure_count": figure_count,
            }, indent=2),
            encoding="utf-8",
        )

        msg = f"Converted {page_count} pages, {figure_count} figures → {output_dir}"
        if chapter_md_paths:
            msg += f" ({len(chapter_md_paths)} chapters)"

        return ConversionResult(
            success=True,
            output_dir=output_dir,
            full_md_path=full_md_path,
            chapter_md_paths=chapter_md_paths,
            figures_dir=figures_dir,
            index_path=index_path,
            meta_path=meta_path,
            page_count=page_count,
            figure_count=figure_count,
            errors=errors,
            message=msg,
        )
