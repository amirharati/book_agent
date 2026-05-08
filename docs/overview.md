# Documentation map

Landing page for **`docs/`** — what to open first, what lives where.

---

## Use the product

| Doc | Purpose |
|-----|---------|
| **[USAGE.md](USAGE.md)** | Install MCP globally, workspaces, **`book-agent cursor install-mcp`**, symlinked rules/skills, PDF→Markdown (e.g. marker_server). |
| **[BOOK_AGENT_TOOLS.md](BOOK_AGENT_TOOLS.md)** | Tool names (`get_config`, `toc`, `read`, `web_fetch`, …), parameters, CLI equivalents. |

---

## Plan ahead

| Doc | Purpose |
|-----|---------|
| **[backlog.md](backlog.md)** | Short themes + **“Start next session”** checklist (web backend/UI); includes **Research Studio UI polish** (done) + follow-ups. |
| **[PRD_WEB_APP_CURSOR_SDK.md](PRD_WEB_APP_CURSOR_SDK.md)** | Browser-first app sketch: Cursor SDK, MCP, credentials, execution options, reading/sync/annotations direction. |

---

## Design references (internals)

Detailed behavior and trade-offs live under **`design/`**:

- **[design/MCP_SERVER.md](design/MCP_SERVER.md)** — MCP server shape and env (`BOOK_AGENT_CONFIG`, `cwd`).
- **[design/CONFIG_AND_WORKSPACE.md](design/CONFIG_AND_WORKSPACE.md)** — `.book_agent.json`, workspaces, resolved output dirs.
- **[design/INDEXING_AND_TOC.md](design/INDEXING_AND_TOC.md)** — Index and TOC semantics.
- **[design/LLM_BACKEND.md](design/LLM_BACKEND.md)** — LLM/agent backend notes (if applicable).
- **Tools:** [TOOL_WEB_SEARCH.md](design/TOOL_WEB_SEARCH.md), [TOOL_WEB_FETCH.md](design/TOOL_WEB_FETCH.md), [TOOL_IMAGE_FIGURE.md](design/TOOL_IMAGE_FIGURE.md), [EXTERNAL_MODELS_AND_AGENTS_AS_TOOLS.md](design/EXTERNAL_MODELS_AND_AGENTS_AS_TOOLS.md).

**[LAYOUT_AND_CHAPTERS.md](LAYOUT_AND_CHAPTERS.md)** describes layout-aware extraction (chapter files, headings, equations) when using the bundled PyMuPDF-style path—not the only way to ingest; external pipelines (marker, marker_server) are fine per USAGE.

---

## Archive

**[archive/](archive/)** — superseded trackers, historical phase docs, old deep reviews.

---

## Root repo

| File | Purpose |
|------|---------|
| **[../README.md](../README.md)** | Install, MCP quickstart, feature summary. |
| **[../PROJECT.md](../PROJECT.md)** | Vision and phased goals at a glance. |
