# Layout-Aware Extraction and Chapter-by-Chapter Output

This document describes what the PyMuPDF backend implements: **layout-aware text**, **equations**, **tables**, **diagrams**, **marginal notes**, and **per-chapter files**.

---

## 1. Layout-aware text extraction

PDFs store text as positioned spans (one word or phrase per span), not as paragraphs. The original extraction produced one word per line. The pipeline now:

### 1.1 Line grouping

- All text spans on a page are collected with their bounding box (`bbox`) and font `size`.
- Spans are **sorted by vertical position** (y), then horizontal (x).
- Spans whose **y-position differs by less than ~2.5 pt** are treated as the same **line**.
- Words on the same line are **joined with a space**, so you get one logical line of text (e.g. “Model Comparison and Occam’s Razor”) instead of one word per line.

### 1.2 Paragraph detection

- **Vertical gap** between consecutive lines is computed.
- The **median line-to-line gap** on the page is used as the typical “line height.”
- When the gap between two lines is **larger than ~1.4× that median**, a **new paragraph** is started (double newline in Markdown).
- So body text appears as normal paragraphs instead of a long run of single lines.

### 1.3 Heading detection

A line is emitted as a **Markdown heading** (`## ...`) if either:

- **Font-size heuristic:** the line’s font size is at least ~12.5 pt and at least ~1.5 pt above the page’s median font size, and the line is under 120 characters, or  
- **Pattern heuristic:** the line matches patterns such as:
  - `Chapter 1`, `Chapter 2`, …
  - `Chapter I`, `Chapter II`, …
  - `1. Introduction`, `2. Probability`, …
  - `28 Model Comparison and Occam's Razor` (number + space + title).

Bold/italic from the PDF (font flags) are preserved as `**...**` and `*...*` in the Markdown.

### 1.4 Constants (tunable in code)

| Constant | Default | Role |
|----------|---------|------|
| `LINE_Y_TOLERANCE` | 2.5 | Max vertical difference (pt) for two spans to be on the same line. |
| `PARAGRAPH_GAP_MULTIPLIER` | 1.4 | Paragraph break when line gap > median_gap × this. |
| `HEADING_FONT_SIZE_MIN` | 12.5 | Min font size (pt) for a line to be considered a heading by size. |
| `HEADING_SIZE_ABOVE_MEDIAN` | 1.5 | Line must be this many pt above page median to be a heading. |

These are in `book_agent/backends/pymupdf_backend.py`.

---

## 2. Images, equations, tables, diagrams, and marginal notes

### 2.1 Images

- **Extraction:** All images on each page are found with `page.get_images(full=True)` and written to `figures/pN_figK.png` (or similar). They are linked in the Markdown as `![Figure p.N](../figures/...)`.
- **Text inside figures:** Where the PDF exposes image bounding boxes (`page.get_image_rects(xref)`), text spans whose center falls inside an image rect are **dropped**. That reduces diagram “text” (arrows, labels inside figures) from being emitted as body text. If the PDF does not expose rects, that filtering is skipped.

### 2.2 Equations

- **Detection:** A line (or run of lines) is treated as an **equation** when the character mix looks math-like: a high ratio of digits, operators, and symbols (`0-9`, `=+-*/().^_[]`, etc.) above a threshold (`EQUATION_MATH_RATIO_MIN`, default 0.32), with length ≥ 4.
- **Output:** Each such run is wrapped in display math blocks:
  ```text
  $$
  C = lim log M . (17.10)
  $$
  ```
  Spaces are normalized (collapsed). The pipeline does **not** convert to LaTeX; it only isolates equation-like content so it can be post-processed (e.g. with a math OCR or LaTeX tool) or read as-is.

### 2.3 Diagrams and garbage text

- **Detection:** Lines with a high ratio of “garbage” characters (Unicode replacement character, box-drawing, or symbols like `@`, `` ` `` that often come from diagram fonts) are classified as **diagram**. A line can also be classified as diagram if it has several such symbols and is long enough.
- **Output:** Those lines are **not** emitted as body text. Instead, a placeholder is emitted: `*[Diagram]*`. That keeps the main flow readable and marks where a figure/diagram appeared.

### 2.4 Tables

- **Detection:** Runs of consecutive body lines are checked for **aligned columns** by clustering horizontal positions (`x0`) of spans. If 2+ column boundaries are found and the run has at least 2 rows, and the content looks table-like (e.g. average cell length and column count within limits), the run is emitted as a Markdown table.
- **Output:** Standard Markdown tables:
  ```text
  | col1 | col2 |
  | --- | --- |
  | a   | b   |
  ```
  To avoid turning normal prose into tables, the heuristic rejects runs with very long “cells” or too many columns.

### 2.5 Marginal notes (e.g. footnotes in the margin)

- **Detection:** Page width is used to define a **main** zone and **margins**. Spans whose horizontal position falls in the left or right margin (e.g. `x0 < margin_left` or `x0 > margin_right`, with `MARGIN_FRACTION` ≈ 0.14) are collected separately as **margin spans**.
- **Output:** After the main flow for the page (body, equations, tables, diagram placeholders), a section is emitted:
  ```text
  ### Marginal notes

  … margin content …
  ```
  So marginal footnotes and side notes are grouped at the end of each page instead of being mixed into the main paragraph flow. (In-page footnote reference ordering is not implemented; handwriting is out of scope.)

### 2.6 Constants (tunable in code)

| Constant | Default | Role |
|----------|---------|------|
| `MARGIN_FRACTION` | 0.14 | Fraction of page width for left/right margin; content there goes to “Marginal notes”. |
| `EQUATION_MATH_RATIO_MIN` | 0.32 | Min ratio of math-like chars for a line to be treated as equation. |
| `DIAGRAM_GARBAGE_RATIO_MIN` | 0.22 | Min ratio of garbage/symbol chars for a line to be treated as diagram. |
| `TABLE_MIN_ROWS` | 2 | Min number of aligned rows to emit a table. |
| `TABLE_COLUMN_CLUSTER_GAP` | 15 | Max horizontal gap (pt) when clustering column boundaries. |

---

## 3. Chapter-by-chapter output

### 3.1 When chapters are produced

- If **`split_by_chapter`** is `True` (the default), the backend **detects chapter starts** in the full Markdown and writes one file per chapter **in addition to** `full.md`.
- Chapter detection runs **after** the full book Markdown is built.

### 3.2 How chapters are detected

- The full content is split by **page markers** (`<!-- page N -->`).
- For each page, the **first 800 characters** are scanned for a **chapter heading**.
- A chapter heading is a line that matches this regex (after `## ` is already applied in the content):

  - `## Chapter 1`, `## Chapter 2`, …
  - `## Chapter I`, `## Chapter II`, …
  - `## 1. Introduction`, `## 2. Probability`, …
  - `## 28 Model Comparison and Occam's Razor` (number + space + title).

- The **first such match on a page** is taken as the start of a new chapter.
- Chapter ranges are then:  
  Chapter 1 = from that page to (next chapter start − 1), and so on.

### 3.3 Output files and index

- **`md/full.md`** — Full book with layout-aware text and page markers (always written).
- **`md/ch01.md`, `md/ch02.md`, …** — One file per detected chapter (only when `split_by_chapter=True` and at least one chapter start is found).
- **`index.json`** — Contains:
  - `chapters`: list of `{ "id", "title", "pages", "start_page", "end_page" }`;
  - first entry is `id: "full"` (whole book);
  - then one entry per chapter (`id: "ch01"`, `"ch02"`, …) with the exact page range.

So you can open `ch05.md` for chapter 5 and use `index.json` to map “ch05” → pages 42–58 (or similar).

### 3.4 If no chapters are detected

- No per-chapter files are written; only `full.md` and the single “full” entry in `index.json`.
- Use **`--no-split-chapters`** in the CLI to disable chapter splitting even when headings are present (only `full.md` will be written).

---

## 4. CLI and API

- **Default:** chapter splitting is **on** (per-chapter files are written when chapter headings are found).
- **CLI:** use `--no-split-chapters` to get only `full.md`.
- **API:** `convert_pdf_to_markdown(..., split_by_chapter=True)` (default); set to `False` to disable.

---

## 4. Summary

| Feature | Implementation |
|--------|----------------|
| Readable paragraphs | Group spans by y (line), then group lines by vertical gap (paragraph). |
| Headings | Font-size + length heuristics and “Chapter N” / “N. Title” / “N Title” patterns. |
| Images | Extracted to `figures/`, linked in MD; text inside image rects (when available) is dropped. |
| Equations | Math-like lines wrapped in `$$...$$`; spacing normalized (no LaTeX conversion). |
| Diagrams | Garbage/symbol-heavy lines replaced with `*[Diagram]*`. |
| Tables | Aligned column runs emitted as Markdown tables; prose guarded by cell-length checks. |
| Marginal notes | Spans in left/right margin emitted as `### Marginal notes` at end of page. |
| Page mapping | `<!-- page N -->` in Markdown; `index.json` with `start_page` / `end_page` per chapter. |
| Chapter files | Detected from `## Chapter …` / `## N. …` / `## N …` at page start; one `chNN.md` per range. |

For more on the overall conversion pipeline, see [PHASE1_MARKDOWN_CONVERSION.md](PHASE1_MARKDOWN_CONVERSION.md).
