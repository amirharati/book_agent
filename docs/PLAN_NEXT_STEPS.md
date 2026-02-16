# Plan: next steps after deep review (ecef4396)

**Context:** We have imported markdown + meta JSON with PDF page markers and TOC. Goal: tools so a Cursor agent can “look at chapter X”, “explain this”, “help solve / derive / code from this”. No PDF viewer wiring yet.

---

## Phase 1: Index from existing data (no new conversion)

**Objective:** From the current ecef4396 md + meta, produce a single **index** the agent (or a small tool) can use to “open chapter X” or “section 2.3”.

### Step 1.1 — Parser for page markers and headings

- **Input:** The single full markdown file.
- **Output (internal):** List of “blocks”: each has `pdf_page` (from `{N}`), `start_line`, `end_line`, and optional `heading` (if the block starts with `#` or `##`).
- **Logic:** Scan line by line; on `^\{(\d+)\}----`, start a new block with that PDF page; when we see `^# ` or `^## `, attach that as the block’s heading. Optionally normalize heading text (e.g. strip `**`, match “1.1. Example” vs “1.1 Example”) for consistency with TOC.

**Deliverable:** A small script or module: `parse_md_pages_and_headings(md_path) -> list[Block]` (or similar). Reusable for any book that uses the same `{N}----` convention.

### Step 1.2 — Build chapter/section index

- **Input:** (1) Parsed blocks (or raw md + meta’s `table_of_contents`). (2) Optional: use meta’s TOC to get section titles and `page_id` so we can align “Chapter 3” to a PDF page and then to a line range.
- **Output:** **index.json** (or equivalent) with one entry per chapter/section, e.g.:
  - `id`: stable id (e.g. `ch01`, `sec_1_1`, or slug).
  - `title`: as in the book (e.g. “1 Introduction”, “1.1 Example: Polynomial Curve Fitting”) so internal refs like “Section 1.1” can be resolved.
  - `pdf_page_start` / `pdf_page_end`: from page markers.
  - `md_start_line` / `md_end_line`: range in the full md file (so the agent or a tool can read that slice).
  - Optional: `toc_page` (computed from PDF page − offset).

- **Logic:** Either (a) derive sections from headings only (merge consecutive blocks with same “chapter” heading), or (b) use meta’s `table_of_contents` to get titles and page_id, match to our blocks by page, then assign line ranges. Prefer (b) if TOC is reliable so index titles match the book exactly.

**Deliverable:** `index.json` under ecef4396 (or under a canonical `md/` subfolder if we restructure). Schema documented in this repo.

### Step 1.3 — TOC ↔ PDF offset (single reference)

- **Input:** Contents table in the md (or meta TOC) + one known anchor. E.g. “1 Introduction” → TOC page 1; find in md the block that contains that heading and read its `{N}` → e.g. 22.
- **Output:** Stored constant or one field in index/meta: e.g. `pdf_to_toc_offset: 21` (so TOC_page = PDF_page − 21). Optionally validate with a second anchor (e.g. “1.1 Example” on TOC page 4 → PDF 25).
- **Deliverable:** Offset in index or in a small `meta.json` we own; document in README or docs.

---

## Phase 2: Agent-facing “get chapter/section” (minimal)

**Objective:** The agent (or you) can say “chapter 5” or “section 3.2” and get the right markdown chunk.

### Step 2.1 — Resolve “chapter X” / “section Y” to a range

- **Input:** Query like “chapter 5”, “section 1.2.4”, “Chapter 3”.
- **Output:** Either (a) path + line range (e.g. `full.md` lines 4200–5100), or (b) the raw text of that chunk.
- **Implementation:** Load index; match query to an entry (by id, or by normalizing title); return `md_start_line`/`md_end_line` (and path to md file). Optionally a tiny CLI or Python API: `get_section(book_id, chapter_or_section) -> str` that reads the file and returns the slice.

**Deliverable:** Documented way to resolve a section (e.g. “read index.json, then read md from line A to B”). Optional: one small script `get_chapter.py` or `book_agent.get_section(...)`.

### Step 2.2 — Cursor-friendly usage

- **Doc:** In README or `docs/AGENT_USAGE.md`, state: “To work on chapter X, open `book_projects/<slug>/md/full.md` and use `index.json` to get the line range for that chapter; the agent can then read that range.” Optionally add a rule or skill so the agent knows to look at `index.json` first when the user says “look at chapter X”.

---

## Phase 3: Figures (ecef4396 — already in place)

- **ecef4396:** 362 JPEGs are in the root of the book folder (same directory as the .md).
- Refs like `![](_page_22_Figure_2.jpeg)` are correct; no path changes needed. For other books, if figures live elsewhere, copy them into the book folder root or adjust refs.

---

## Phase 4: Later (not required for initial agent use)

- **Summaries:** Per-chapter (or per-section) short summary in index or separate file; agent uses it as a mental model. Can be LLM-generated in a one-off pass over each chapter chunk.
- **PDF ↔ markdown wiring:** When you add a viewer, use meta’s `table_of_contents` (title, page_id, polygon) + our index (title → line range) to implement “click on PDF → show markdown” and “click in markdown → jump in PDF”.
- **Internal refs as links:** Optionally preprocess md to turn “Section 1.2.4” into `[Section 1.2.4](#sec-1-2-4)` or link to a line range; not strictly required if the agent can resolve via index.

---

## Suggested order of work

1. **Step 1.1–1.2** — **Done.** One CLI tool: `book-agent index <path>` (path = book folder or .md file). Scans markdown for page markers `{N}----` and `#`/`##` headings, writes `index.json` with chapters (id, title, pdf_page_start/end, md_start_line/end_line). Works on any markdown in this format.
3. **Step 1.3** — Compute and store TOC offset (one reference).
4. **Step 2.1 / 2.2** — Document (and optionally implement) “get chapter X” for the agent.
5. **Phase 3** — Figures: already in ecef4396 root; for other books, ensure images are in the book folder (or paths updated).
6. **Phase 4** — Summaries and PDF↔md when you need them.

After 1–2, we can do another quick pass on ecef4396 to validate index coverage and that “chapter 5” and “Section 1.2.4” resolve correctly.
