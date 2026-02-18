# Design: Image / Figure tool

**One tool per design doc.** This describes the **image/figure** tool so the agent can use figures and diagrams from the book.

---

## 1. Goal

- Let the agent **use figures** referenced in the book (e.g. `![](_page_22_Figure_2.jpeg)`).
- **First:** Resolve ref → path, and return **path + prompt** (and optionally image as base64) so the **calling agent (Cursor)** can load and “read” the image. The tool **returns** the figure; it does **not** understand or describe it—the agent does.
- **Fallback:** If the agent cannot receive/see the image from the tool output, we could add a “describe” step (e.g. vision API) later; tool structure stays the same.

---

## 2. Test-first approach (done)

1. **Build minimal tool:** resolve figure ref → path; return path + prompt (and optionally base64) so the caller can pass the image to the agent. ✓
2. **Test in Cursor:** Call the tool, then have Cursor read the image from the path (or from tool output). Cursor can describe/interpret the figure. ✓
3. **Conclusion:** No separate vision API needed for v1; returning path (and optional base64) is enough for Cursor to use the figure when answering or demonstrating a point. See **Agent workflow** below.

---

## 3. Scope (first version)

- **Input:** Book project path (same as toc/search/read); figure spec = filename or `![](...)` ref.
- **Output:**  
  - **Resolve:** absolute path or clear error.  
  - **For agent:** path + short prompt (+ optional base64 + media type) so the agent can load and interpret the figure. The tool does not describe the image; the agent (e.g. Cursor) does.
- **Single book:** all paths under one book folder. Figures live in the book folder (current ecef4396 layout).
- **Out of scope for v1:** editing/generating images; list-all-figures; built-in “describe” (vision API). Optional later.

---

## 4. Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| **Return, don’t understand** | Tool returns path + prompt (+ optional base64). The **agent** loads and interprets the image. No vision/describe inside the tool for v1. | Keeps tool simple; Cursor (or caller) does the understanding. |
| **CLI + API** | Same as toc/search/read: `book-agent figure resolve`, `book-agent figure show`; plus `resolve_figure`, `get_figure_for_agent` via `agent_tools`. | Consistency. |
| **Figure location** | Images inside the book project folder. Tool resolves ref under that folder only. | Safe, single book. |
| **Ref format** | Bare filename or `![](...)`; strip to get filename. | Flexible. |
| **Failure** | Result dict with `ok`, `error`, `path`; no uncaught exception to agent. | Agent can branch. |

---

## 5. Implemented surface

- **Resolve:** `resolve_figure(book_folder, figure_ref)` → `{ ok, path, error }`. CLI: `book-agent figure resolve <figure_ref> [path]` (path optional = current book from config).
- **For agent:** `get_figure_for_agent(book_folder, figure_ref, include_image=True)` → `{ ok, path, prompt, image_base64?, image_media_type?, error? }`. CLI: `book-agent figure show <figure_ref> [path]` (option: `--no-image`).
- **Entry point:** All exposed via `book_agent.agent_tools` (resolve_figure, get_figure_for_agent, figure_app).

---

## 6. Agent workflow

The figure tool is one of four (toc, search, read, figure). Using them **together** in a workflow (e.g. answer a question using text + figures, or add a figure to a notebook to illustrate a point) is **orchestration**: e.g. `.cursor/rules` telling the agent when to call which tool, or a future workflow API/MCP. See `docs/tasks.md` §2.1.

---

## 7. Open points / later

- **List figures:** Optional later (e.g. from index or by scanning the book folder).
- **Describe step:** If some caller cannot read the image, add an optional vision/describe path; same tool surface.

---

**Implementation:** `book_agent/tools/figure.py`. **Status:** Implemented and tested; Cursor can use path (or base64) to load and interpret figures. V1 complete.
