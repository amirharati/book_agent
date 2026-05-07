# Backlog

Short themes to revisit—not a detailed issue tracker. For doc navigation see **[overview.md](overview.md)**.

---

## Start next session (web backend + UI)

Suggested order—see **[PRD_WEB_APP_CURSOR_SDK.md](PRD_WEB_APP_CURSOR_SDK.md)** (architecture §4, API §6, reading/sync §12):

- [x] **Backend (TypeScript recommended for `@cursor/sdk`):** define **`AgentBackend`** (create session, send message, stream events); ship **`EchoBackend`** or **mock** first, then **`CursorSdkBackend`**; register **book-agent MCP** (`cwd`, **`BOOK_AGENT_CONFIG`**) like **[USAGE.md](USAGE.md)** / **[design/MCP_SERVER.md](design/MCP_SERVER.md)**.
- [x] **HTTP surface:** REST + **SSE or WebSocket** for assistant chunks; UI talks only to this API (**never** Cursor SDK in the browser).
- [x] **Web UI:** chat shell + placeholders for reader (MD/PDF later); consume the same API from day one.
- [x] **Scope:** scaffolding lives under normal repo dirs (e.g. `apps/` or `web/`)—**package tooling**, not **`AGENT_WRITE_ROOT`** (that rule applies to book-session artifacts).

Session note: Cursor-backed create-session + stream tested successfully with `CURSOR_API_KEY` and a valid `CURSOR_MODEL_ID` (e.g. `default`).

**v0 UI progress (apps/web)** — usable first slice, not final product workflow:

- Two-pane workspace (resize), chat via REST + SSE, config strip for setup.
- Pick **Markdown path** via server-backed folder/modal UI; optional **output** folder (`<md-dir>/outputs` default), create subfolder (`POST /api/fs/mkdir`).
- Reader: Markdown rendered in-browser (**marked**, **KaTeX** via marked-katex, **DOMPurify**); relative `![](…)` rewired through **`GET /api/fs/file`** so figures next to the `.md` load.
- **[Temporary workflow]** Loading an arbitrary `.md` from disk and rendering it standalone is **intentionally short-term**. Expect a **later redesign**: registered book / workspace in **book-agent** config, **`index.json`**, section-synced reader, TOC, figure resolution via MCP, and tighter alignment with **`AGENT_WRITE_ROOT`** / outputs model—not “open any file.”
- **Deferred:** Chat/agent is **not** yet reliably grounded in “the open book” (system prompt + **book-agent MCP** `get_config` / **`read`** / TOC—model may answer generically). **Fix in a dedicated pass.**

---

## Reliability & policy

- **Rule adherence:** LLM agents can still write outside **`_resolved_output_dir`** despite **`book-agent.mdc`**. Later: validation hooks, CI on repo layout, or in-app path checks (web PRD phase).
- **Global installs:** After clone or new machine: **`~/.cursor/mcp.json`**, **`~/.cursor/rules/`**, optional **`~/.cursor/skills/`** symlink to this repo’s rule/skill copies—see **[USAGE.md](USAGE.md)**.

---

## Product

- **Web app + Cursor SDK:** Spec in **[PRD_WEB_APP_CURSOR_SDK.md](PRD_WEB_APP_CURSOR_SDK.md)**. **Partially implemented** in **`apps/web`**: server wraps **`@cursor/sdk`**, UI uses HTTP + SSE, reader shows rendered MD + figures; artifact paths and agent book-awareness still need wiring to **`_resolved_output_dir`** / **book-agent** tools (**see “Temporary workflow”** above).
- **Replace v0 MD workflow:** Move from “pick filesystem path” to **book project**: register document → workspace output → TOC/sections/`read`; keep modal UX only where still appropriate (exports, attachments).
- **Chat ↔ book context (next):** Ground the agent in the **open** markdown (path, optional section) and **book-agent** tools (`get_config`, `read`, TOC) so Q&A uses the book—not generic knowledge only; may require UI to pass **output** into agent env and/or a small “context” API.
- **Agent abstraction:** **`AgentBackend`** (or equivalent) so the UI stays host-agnostic; Cursor is the first impl; aligns with PRD §12.6 / multi-host MCP story.
- **PDF → book:** **[marker_server](https://github.com/amirharati/marker_server)** in **[USAGE.md](USAGE.md)**; optional script: job output → **`add_document`** path conventions.
- **Reading UX (web):** Canonical **section / index model** for MD render, PDF viewer, chat context; optional **later HTML** projection—PRD §12.
- **PDF ↔ Markdown alignment:** **At ingest/index time**: section IDs, optional page spans, **text-overlap** for selectable-text PDFs—PRD §12.2.
- **Annotations (later):** Sidecar highlights/comments keyed to **index nodes** (+ optional PDF quads)—PRD §12.4.
- **Artifact execution:** **Defer to Cursor / local CLI** is fine for early releases (paths + commands in UI)—PRD §6.4, §12.5.
- **Runtime strategy (local vs cloud):** Decide default runtime for web app sessions (**local `cwd`** vs **cloud `repos`**) and document trade-offs: filesystem visibility, uncommitted changes, auth/keys, cost, and handoff expectations with Cursor desktop.
- **Session persistence / resume:** Add persisted session store (`sessionId` ↔ `agentId`) and support **`Agent.resume`** so web app sessions survive restarts and can continue work on the same repo context; define how this should interoperate with desktop workflows.
- **Other agent hosts (Claude Code, IDE MCP, CLI):** Investigate **stdio MCP** + **`cwd`** + **`BOOK_AGENT_CONFIG`** + doc a **minimal compatibility matrix**—PRD §12.6.

---

## Code & repo hygiene

- **`tests/` and `uv.lock`:** Currently **untracked** in this repo checkout—when ready: **`git add tests/ uv.lock`**, **`pytest`**, decide on committing **`uv.lock`** for reproducible installs; add **CI** workflow (pytest) if still missing under **`.github/`**.
- **Config edge cases:** **`BOOK_AGENT_CONFIG`** pointing at a **missing file** skips upward search for another **`.book_agent.json`** (by design); revisit docs/UX only if users get confused—see **`tests/test_config_env_resolution.py`** when committed.

---

## Docs & rules

- **Canonical docs:** **`USAGE.md`** end-user/setup; **`overview.md`** map of **`docs/`**; **`AGENTS.md`** removed—avoid duplicating long policy in stray files.
- **`book-expert.mdc`** under **`~/.cursor/rules/`** (if used): Keep aligned with **`book-agent.mdc`** artifact/output policy.
