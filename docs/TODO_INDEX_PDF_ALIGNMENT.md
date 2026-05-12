# TODO: Index ↔ PDF alignment hardening

Backlog for **PDF ↔ markdown** alignment beyond what the current `index.json` pipeline already does. **Section-level** mapping (headings, `md_start_line` / `md_end_line`, `pdf_page` from markers + repairs) is in good shape for most books; remaining items are **gaps**, **conversion quality**, **QA at scale**, and **finer-grained mapping** (deferred).

---

## Context (short)

- **Primary signal:** `{N}----` page markers in markdown (when Marker emits them).
- **Indexer (done, in code):** heading resolution with multi-candidate scoring, offset confidence, page validation, inversion repair, parent start expansion, TOC corruption detection with headings fallback, numbered-heading filter for fallback TOC.
- **Gap:** Books **without** markers still need **meta** (and/or sparse heuristics) to populate `pdf_page` reliably.

---

## TODO checklist

### A. Meta-backed PDF pages (no markers)

- [ ] When `page_markers` is empty (or per-node `_page_at_line` is unset), **fill `pdf_page`** from `*_meta.json` `table_of_contents` (or equivalent) after title match: `page_id` on the matched meta row.
- [ ] When markers exist but a node still has no page, **fallback to meta** for that title before leaving `null`.
- [ ] Record **`pdf_page_source`** (or equivalent) on nodes or in `diagnostics`: `markers` | `heading_span` | `meta` | `image_path` | `overlap` (schema TBD).
- [ ] Optional **`syncConfidence`**: `high` | `medium` | `low` (align with `PDF_MARKDOWN_DUAL_VIEW.md`).

### B. Markdown-only heuristics (sparse)

- [ ] Parse `![](..._page_N_...)` (and similar) to build a **sparse line → PDF page** map; interpolate or nearest-neighbor for sections between figures.
- [ ] Prefer existing **`id="page-N"`** on headings when present (partially used today for hints).

### C. PDF text overlap (later / PRD §12.2)

- [ ] When PDF path is available and text is selectable, **overlap** section heading or first paragraph with per-page PDF text to refine or validate `page_id` (especially for bad TOC offsets).

### D. Conversion pipeline

- [ ] Ensure Marker / marker_server exports **include `{N}----` markers** in the main `.md` when possible (root cause for “missing markers” books).
- [ ] Document expected layout: `.md` + `*_meta.json` + optional markers.
- [ ] **Investigate Marker on `8f090777` (Effective Python):** real chapter titles exist as **selectable text** in the PDF, yet Marker often emits them as **images** (or skips them) so markdown lacks proper `#` chapter headings — preface blurbs remain as text and confuse indexing. Reproduce and compare Marker options / versions.
- [ ] **Mitigations (pick after investigation):** prefer text layer for heading-like spans; **post-process** inject headings from meta or light PDF text scrape; **manual QA checklist** for “chapter title is image” regressions.

### E. QA pass

- [ ] Keep **batch reindex + validation** in the loop: `python scripts/reindex_inputs_validate.py` (backs up `index.json`, reindexes `inputs/book_projects/*`, writes `tmp/index_rebuild_validation_report.md`). Re-run after indexer changes; spot-check rows with mismatches.
- [ ] Spot-check PDF at `pdf_page` vs markdown for **reference books** + folders in the table below.

### F. Product / API

- [ ] Expose mapping + confidence for dual-view / chat context (`PDF_MARKDOWN_DUAL_VIEW.md` phases).

### G. Fine-grained alignment (later — not required for current dual-view MVP)

- [ ] **Paragraph- or block-level map:** map logical blocks (paragraphs, list items, callouts) to **PDF page** and/or **markdown line range** (e.g. for precise citations, selection sync, and RAG chunk boundaries). Likely inputs: marker positions in meta, PDF text span overlap, or sentence-level anchors — **can wait** until section-level UX is stable.
- [ ] **Optional word- or token-level anchors** (e.g. for legal / academic citations): only if product needs sub-paragraph precision; expect higher cost (PDF text grid, OCR offsets, or manual calibration).

---

## Book folders for a later pass

Paths under **`inputs/book_projects/<folder>/`**. Update rows when status changes.

| Folder ID   | Issue | Notes |
|------------|--------|--------|
| **2a838b6a** | No `{N}----` markers in MD; index `pdf_page` often **null** | Mackay ITILA; `_meta.json` has good `title` + `page_id` — prime candidate for §A meta fallback. |
| **a81ead46** | No markers; `pdf_page` **null** | Bishop PRML alt export; §A + §B. |
| **8f090777** | Indexer **mitigated**; **Marker root cause open** | Effective Python; §D. |
| **ecef4396** | TOC table **corrupt** in MD; indexer uses **headings fallback** + numbered filter | Bishop PRML primary export; regression when changing fallback heuristics. |
| *(add)*   | | |

---

## Related docs

- `docs/PDF_MARKDOWN_DUAL_VIEW.md` — product phases, reading context, confidence.
- `docs/design/INDEXING_AND_TOC.md` — how `book-agent index` builds `index.json`.
- `docs/PRD_WEB_APP_CURSOR_SDK.md` §12.2 — ingest-time alignment, text overlap.
- `scripts/reindex_inputs_validate.py` — batch reindex + `tmp/index_rebuild_validation_report.md`.

---

## Changelog

| Date       | Note |
|------------|------|
| 2026-05-11 | Initial TODO + folder table (`2a838b6a`, `a81ead46`, regression `f6d1aaba`). |
| 2026-05-11 | Offset confidence, page validation, inversion repair, Effective Python / Minervini fixes; §D Marker investigation. |
| 2026-05-12 | Backlog refresh: treat **section-level** indexer as largely done; trim long “recent improvements” list into this file’s scope; add **§G** (paragraph / optional word-level mapping, deferred); document `reindex_inputs_validate.py`; update folder notes (`ecef4396` headings fallback). |
