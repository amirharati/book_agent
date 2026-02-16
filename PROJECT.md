# Book Agent — Project Overview

## Vision

Build tools and agents that help you **read**, **learn**, and **apply** content from books—especially technical and math-heavy texts. Use the same content to:

- **Solve** exercises and problems from the book  
- **Create** new problems or variations  
- **Do coding projects**: simulations, algorithm implementations, and experiments based on the material  

The system should work with your existing PDFs and integrate with Cursor (and later other agents) so you can work chapter-by-chapter with clear reference back to the original book.

---

## Core Workflow (Target)

1. **Ingest** — Convert book PDFs to structured Markdown (equations, figures, page/chapter mapping preserved).
2. **Navigate** — Use a simple index (chapters, sections, page ranges) to jump to the right content.
3. **Learn** — Read and discuss with an agent (e.g. Cursor): summaries, clarifications, connections.
4. **Practice** — Solve or generate exercises; implement algorithms; run simulations from the book.
5. **Cite** — Always be able to map agent answers and code back to specific pages and chapters.

---

## Phases

| Phase | Focus | Outcome |
|-------|--------|---------|
| **Phase 1** | PDF → Markdown conversion | Simple, powerful pipeline: equations, figures, page/chapter mapping. See [Phase 1 doc](docs/PHASE1_MARKDOWN_CONVERSION.md). |
| **Phase 2** | Structure & index | Chapter/section manifest, navigation, optional line-range or page anchors in Markdown. |
| **Phase 3** | Cursor workflow | Chapter-by-chapter workflow, prompts, and conventions for read → practice → code. |
| **Phase 4** | Extensions | RAG, search, or dedicated agent scripts (optional). |

---

## Repository Layout (Planned)

```
book_agent/
├── PROJECT.md                 # This file
├── README.md
├── docs/
│   ├── PHASE1_MARKDOWN_CONVERSION.md
│   └── ...
├── tools/                     # Conversion and indexing scripts
│   └── ...
├── books/                     # Per-book outputs
│   └── <book_slug>/
│       ├── md/                # Markdown (by chapter or full)
│       ├── figures/           # Extracted images
│       └── index.json         # Chapter/section ↔ page mapping
└── projects/                  # Code/simulations from book content
    └── ...
```

---

## Success Criteria

- **Phase 1:** One PDF book converted to Markdown with equations readable (LaTeX), figures extracted and linked, and a clear mapping from Markdown sections to PDF pages/chapters.
- **Later:** Reliably use Cursor to study one chapter, solve an exercise, and implement one algorithm with citations back to the book.

---

## Current Focus

**Phase 1** — Building a simple yet powerful Markdown conversion pipeline. Details and requirements are in `docs/PHASE1_MARKDOWN_CONVERSION.md`.
