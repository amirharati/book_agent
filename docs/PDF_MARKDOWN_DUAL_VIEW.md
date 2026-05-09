# PDF ↔ Markdown Dual View

Permanent workstream doc for dual reading mode, alignment, and context-aware AI.

---

## Why this matters

This feature directly improves the core reading workflow:

- user can read in PDF and Markdown with quick switching
- app tracks where user is in either view
- AI gets active reading context (what user is looking at now)
- TOC/navigation can be shared across both modes

This is a major product capability (not a temporary session task).

---

## Current inputs available

For converted books (example: `inputs/book_projects/f6d1aaba`), we already have:

- source markdown (`*.md`)
- conversion metadata (`*_meta.json`) from Marker pipeline
- generated `index.json` with chapter-level mapping:
  - `md_start_line`, `md_end_line`
  - `pdf_page`, `pdf_page_end`
  - `pdf_to_toc_offset`

Practical note:

- Treat `index.json` as canonical mapping for MVP navigation/sync.
- Treat `*_meta.json` as enhancement data for later finer alignment.

---

## Product goals

1. **Dual view UX**
   - markdown-only, pdf-only, and split/switch modes.
2. **Shared navigation**
   - one logical TOC, works in markdown and maps to pdf ranges.
3. **Context-aware assistant**
   - AI sees active view context (doc, section/page, selection/anchor).
4. **Approximate first, precise later**
   - ship usable sync quickly; improve granularity over time.

---

## Scope boundaries

### In scope for early phases

- chapter/section-level PDF↔MD sync using `index.json`
- active reading context passed to chat/system prompt
- markdown TOC as canonical structure with PDF jump mapping
- optional split view once switching mode is stable

### Out of scope initially

- perfect paragraph-level deterministic mapping
- high-precision geometric alignment/selection linking from day one
- heavy annotation system redesign

---

## Data model (recommended)

Introduce a canonical reading context object:

```json
{
  "docId": "string",
  "viewMode": "markdown|pdf|split",
  "activeNodeId": "string|null",
  "md": { "startLine": 0, "endLine": 0 },
  "pdf": { "pageStart": 0, "pageEnd": 0, "activePage": 0 },
  "syncConfidence": "high|medium|low",
  "updatedAt": "ISO-8601"
}
```

Precedence for displayed position:

- explicit user action in current view
- mapped counterpart from `index.json`
- nearest fallback node

---

## Implementation phases

### Phase 1 — MVP Dual View (high value, low risk)

- Add PDF/Markdown switch (or split toggle) in reader.
- Render markdown TOC and bind each item to:
  - markdown location
  - mapped PDF page range from `index.json`
- Track active reading context in frontend state.
- Include reading context in chat request payload/system context.
- Show subtle context indicator in chat panel (doc + section/page).

**Done when:**

- clicking TOC node moves markdown and jumps/targets approximate PDF page range
- AI can reference active section/page context

### Phase 2 — Approximate bidirectional sync

- On markdown scroll/section activation -> update active PDF range/page.
- On PDF page change -> highlight nearest markdown section.
- Add confidence indicator (exact/approximate mapping).
- Handle books missing mapping data with graceful fallbacks.

**Done when:**

- moving in either view updates the other view context reliably at section level

### Phase 3 — Conversion pipeline integration

- Connect app to marker server conversion flow:
  - add PDF -> create conversion job
  - track job status
  - register produced markdown + metadata/index into workspace
- Keep conversion asynchronous; non-blocking UI.

**Done when:**

- adding PDF can produce usable MD+index and open in dual-view workflow

### Phase 4 — Precision + expansion

- use `*_meta.json` geometry where helpful for finer anchors
- improve PDF TOC projection quality
- expand same context model to HTML/webpage inputs

**Done when:**

- same reading context abstraction works across md/pdf/html/web sources

---

## Backlog tasks

### Core (next)

- Define reader view modes and state transitions.
- Add `index.json` loader/validator in web backend.
- Expose dual-view mapping API for active document.
- Extend chat request context with active reading state.
- Add TOC interaction model that targets both markdown and pdf.

### Reliability

- fallback behavior when `index.json` missing/incomplete
- diagnostics panel for mapping confidence/debug
- tests for mapping conversion and edge chapters

### Integration

- marker server job API adapter in web backend
- conversion job status UI
- workspace ingest/update flow after conversion completion

---

## Risks and mitigations

- **Mapping quality variance:** mark as approximate first; show confidence.
- **UI complexity:** start with switch mode before full split mode.
- **Coupling to conversion format:** normalize mapping in one internal schema.
- **AI overconfidence:** include confidence + source scope in context.

---

## Acceptance checklist (for first shippable milestone)

- [ ] User can switch between markdown and PDF in the same document workflow.
- [ ] TOC navigation works for markdown and maps to PDF page range.
- [ ] Active reading context is visible and sent to AI.
- [ ] App behaves gracefully when mapping data is missing/partial.
- [ ] No regressions in existing workspace/document/chat flow.
