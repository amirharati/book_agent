# Phase 1: PDF → Markdown Conversion

**Goal:** Work from Markdown that preserves equations, figures, and a clear mapping to pages and chapters. Markdown can be produced externally or via the built-in PyMuPDF backend.

---

## 1. Objectives

| Objective | Description |
|-----------|-------------|
| **Readable text** | Clean extraction of body text, headings, lists, and code blocks. |
| **Equations** | Math rendered as LaTeX (e.g. `$...$` / `$$...$$`) so they render in Markdown and stay editable. |
| **Figures** | Images extracted to files; linked in Markdown with stable paths and optional captions. |
| **Page mapping** | Ability to know which PDF page(s) a section or block came from (for citations and “open in PDF”). |
| **Chapter structure** | Chapters/sections detectable so we can split or index by chapter later. |
| **Simplicity** | Prefer one main path (e.g. one tool or one script) that works for typical technical/math books. |

---

## 2. Requirements (Must / Should / Nice)

### Must-have

- Input: path to a PDF file.
- Output: Markdown (single file or one file per chapter) in a defined output directory.
- Equations preserved as LaTeX (no “?” or image-only math where avoidable).
- Figures extracted to an output folder and referenced in Markdown (e.g. `![fig](figures/fig_3_1.png)`).
- Explicit page mapping: either inline markers in Markdown (e.g. `<!-- page 42 -->`) or a separate manifest (e.g. JSON) that maps (chapter/section or block) → PDF page number(s).
- Documented: how to run the converter and what the output layout is.

### Should-have

- Chapter/section detection so we can optionally split into one `.md` per chapter.
- Tables converted to Markdown tables (or clear fallback, e.g. “see table on p. X”).
- Basic robustness: handle multi-column pages and common footnote styles without breaking structure.

### Nice-to-have

- Optional config (e.g. book title, output paths, whether to split by chapter).
- Preservation of bold/italic and list structure.
- Minimal manual post-processing for a “typical” technical book.

---

## 3. Output Layout (Target)

Proposed layout under `books/<book_slug>/`:

```
books/<book_slug>/
├── md/
│   ├── full.md              # Optional: whole book in one file
│   └── ch01.md, ch02.md ... # Optional: one file per chapter
├── figures/
│   ├── p42_fig1.png
│   └── ...
├── index.json               # Chapter/section ↔ page mapping (Phase 2 can refine)
└── meta.json                # Optional: title, source PDF path, conversion date
```

- **Page mapping:** Either inside `md/*.md` as comments (e.g. `<!-- p. 42 -->`) or in `index.json` (e.g. `"ch01": { "title": "...", "pages": [1, 2, 3, 4] }`).

---

## 4. Approach

**Implemented (PyMuPDF):** Layout-aware extraction (lines + paragraphs), heading detection, figure extraction, page markers, and chapter-by-chapter output. See [LAYOUT_AND_CHAPTERS.md](LAYOUT_AND_CHAPTERS.md). Conversion can also be done externally; the project works with markdown under the same output layout.

---

## 5. Implementation Steps (Ordered)

1. **Setup** — Use the built-in `book-agent` CLI (PyMuPDF) or produce Markdown externally into the same layout (`md/full.md`, `figures/`, etc.).
2. **First run** — Convert one sample PDF (or use existing Markdown); inspect output and figures.
3. **Page mapping** — Add page anchors (in-Markdown comments or a separate JSON) using the chosen tool’s capabilities or a small post-processing script.
4. **Figures** — Ensure all figures are extracted and paths in Markdown are correct and stable.
5. **Equations** — Verify LaTeX; if the tool outputs images or garbled math, add a step (e.g. different tool or heuristic) for math-heavy pages.
6. **Chapter split (optional)** — If output is one big file, add a step to split by chapter using heading detection or the index.
7. **Document** — Update this doc and a README with: install deps, run command, output layout, and how page/chapter mapping works.

---

## 6. Definition of Done (Phase 1)

- [ ] One real book PDF (or a representative subset) converted end-to-end.
- [ ] Equations appear as LaTeX in Markdown.
- [ ] Figures are in `figures/` and linked from Markdown.
- [ ] Every section (or chunk) can be mapped to at least one PDF page number.
- [ ] How to run the converter and interpret the output is documented.
- [ ] Repo layout under `books/<book_slug>/` matches (or is explicitly documented as the target).

---

## 7. Out of Scope for Phase 1

- Fancy RAG, embeddings, or search (later phase).
- Full automation for every possible PDF layout.
- Editing the original PDFs.
- Cursor-specific workflow and prompts (Phase 3).

---

## 8. Next Steps

1. Use PyMuPDF backend or external conversion; ensure output matches the target layout.
2. Run on one book (or 2–3 chapters) and iterate until Must-haves are met.
3. Refine with Should-haves (chapter split, tables, robustness).
