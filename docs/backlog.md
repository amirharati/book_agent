# Backlog

Short themes to revisit—not a detailed issue tracker. For doc navigation see **[overview.md](overview.md)**.

---

## Start next session (web backend + UI)

Suggested order—see **[PRD_WEB_APP_CURSOR_SDK.md](PRD_WEB_APP_CURSOR_SDK.md)** (architecture §4, API §6, reading/sync §12):

1. **Backend (TypeScript recommended for `@cursor/sdk`):** define **`AgentBackend`** (create session, send message, stream events); ship **`EchoBackend`** or **mock** first, then **`CursorSdkBackend`**; register **book-agent MCP** (`cwd`, **`BOOK_AGENT_CONFIG`**) like **[USAGE.md](USAGE.md)** / **[design/MCP_SERVER.md](design/MCP_SERVER.md)**.
2. **HTTP surface:** REST + **SSE or WebSocket** for assistant chunks; UI talks only to this API (**never** Cursor SDK in the browser).
3. **Web UI:** chat shell + placeholders for reader (MD/PDF later); consume the same API from day one.
4. **Scope:** scaffolding lives under normal repo dirs (e.g. `apps/` or `web/`)—**package tooling**, not **`AGENT_WRITE_ROOT`** (that rule applies to book-session artifacts).

---

## Reliability & policy

- **Rule adherence:** LLM agents can still write outside **`_resolved_output_dir`** despite **`book-agent.mdc`**. Later: validation hooks, CI on repo layout, or in-app path checks (web PRD phase).
- **Global installs:** After clone or new machine: **`~/.cursor/mcp.json`**, **`~/.cursor/rules/`**, optional **`~/.cursor/skills/`** symlink to this repo’s rule/skill copies—see **[USAGE.md](USAGE.md)**.

---

## Product

- **Web app + Cursor SDK:** Spec in **[PRD_WEB_APP_CURSOR_SDK.md](PRD_WEB_APP_CURSOR_SDK.md)**; **not implemented**—reading pane + sidebar chat + artifacts **under `_resolved_output_dir`**, **`@cursor/sdk`** on server, **book-agent MCP** in agent env.
- **Agent abstraction:** **`AgentBackend`** (or equivalent) so the UI stays host-agnostic; Cursor is the first impl; aligns with PRD §12.6 / multi-host MCP story.
- **PDF → book:** **[marker_server](https://github.com/amirharati/marker_server)** in **[USAGE.md](USAGE.md)**; optional script: job output → **`add_document`** path conventions.
- **Reading UX (web):** Canonical **section / index model** for MD render, PDF viewer, chat context; optional **later HTML** projection—PRD §12.
- **PDF ↔ Markdown alignment:** **At ingest/index time**: section IDs, optional page spans, **text-overlap** for selectable-text PDFs—PRD §12.2.
- **Annotations (later):** Sidecar highlights/comments keyed to **index nodes** (+ optional PDF quads)—PRD §12.4.
- **Artifact execution:** **Defer to Cursor / local CLI** is fine for early releases (paths + commands in UI)—PRD §6.4, §12.5.
- **Other agent hosts (Claude Code, IDE MCP, CLI):** Investigate **stdio MCP** + **`cwd`** + **`BOOK_AGENT_CONFIG`** + doc a **minimal compatibility matrix**—PRD §12.6.

---

## Code & repo hygiene

- **`tests/` and `uv.lock`:** Currently **untracked** in this repo checkout—when ready: **`git add tests/ uv.lock`**, **`pytest`**, decide on committing **`uv.lock`** for reproducible installs; add **CI** workflow (pytest) if still missing under **`.github/`**.
- **Config edge cases:** **`BOOK_AGENT_CONFIG`** pointing at a **missing file** skips upward search for another **`.book_agent.json`** (by design); revisit docs/UX only if users get confused—see **`tests/test_config_env_resolution.py`** when committed.

---

## Docs & rules

- **Canonical docs:** **`USAGE.md`** end-user/setup; **`overview.md`** map of **`docs/`**; **`AGENTS.md`** removed—avoid duplicating long policy in stray files.
- **`book-expert.mdc`** under **`~/.cursor/rules/`** (if used): Keep aligned with **`book-agent.mdc`** artifact/output policy.
