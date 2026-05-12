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

**v0 UI progress (apps/web)** — Research Studio shell shipped 2026-05-08:

- **3-pane layout** (sidebar + reader + chat), tabbed reader, workspace file tree, dynamic model list (`/api/models`), external files + **Add to Workspace**, workspace/root switch refreshes documents + file explorer + tabs.
- **Workspace-first flow**: set root -> create/select workspace -> add docs -> set current doc -> render.
- Canonical config/state wiring in web flow:
  - root config: **`<root>/.book_agent.json`**
  - per-workspace state: **`<root>/<workspace_id>/.book_workspace.json`**
  - web metadata: **`<root>/<workspace_id>/project.json`** (UI-only helper).
- Workspace layout in web flow now follows **`ROOT/<workspace_id>/...`** (not `ROOT/outputs/<workspace_id>/...`).
- Reader: Markdown rendered in-browser (**marked**, **KaTeX** via marked-katex, **DOMPurify**); relative `![](…)` rewired through **`GET /api/fs/file`** so figures next to the `.md` load.
- Backend loads `.env` automatically on startup and defaults Cursor model to **`default`** (not `auto`).
- Session context now refreshes on workspace/doc selection and passes dynamic `cwd` + `BOOK_AGENT_CONFIG` path into SDK session creation.
- Web sessions now load repo policy context from **`.cursor/rules/book-agent.mdc`** and **`.cursor/skills/**/SKILL.md`** and inject it as system guidance when creating SDK sessions.
- **Deferred:** Chat/agent book-grounding quality still needs dedicated work (tool-first prompting, section-aware context, stricter checks for generic responses).

---

## Completed — Research Studio UI polish (2026-05-08)

**Goal:** One-session UI/UX cleanup for `apps/web` without persistence redesign.

**Shipped:** Cursor-like **Research Studio** shell; sidebar workspace UX; context chips; tabbed reader (workspace docs + loose files); polished chat + model picker (SDK-backed list); **Workspace Files** tree with filters; **Add to Workspace** on external tabs; switching workspace or root updates document list, file tree, and tabs (no stale counts).

**Archive:** Plan + handoff retained in **[TEMP_UI_POLISH_SESSION.md](TEMP_UI_POLISH_SESSION.md)** (marked complete).

### Web UI follow-ups (post–Research Studio polish)

Refine as needed—not blocking core flow:

- Keyboard shortcuts (e.g. close tab, cycle tabs).
- Collapsible sidebar sections (**partially done** in `apps/web`: Setup collapsible + scrollable nav + jobs-only-when-active; see **[TEMO_APP_WORKFLOW_IMPLEMENTATION_TASK.md](TEMO_APP_WORKFLOW_IMPLEMENTATION_TASK.md)** §0).
- Unobtrusive **chat ↔ active document** context indicator.
- Custom file-tree filter patterns (beyond hide images / hidden files).
- Remove document from workspace, richer library UX—defer until workflow demands it.

### Web reader — performance & stability (**active — 2026-05-12**)

**User feedback:** Slightly better after recent passes (tab cache, optimistic doc switch, parallel workspace loads, scroll restore, background tab preload, image error placeholders, loading spinner) but **still slower than desired** and **somewhat glitchy**.

**Known / suspected causes:**

- **Missing assets:** If conversion used **ZIP + promote**, `images/` should exist when Marker included them; 404s often mean **fallback markdown-only path**, bad ZIP, or bad refs. Client still uses broken-`<img>` placeholder. Full story: **[TEMO_APP_WORKFLOW_IMPLEMENTATION_TASK.md](TEMO_APP_WORKFLOW_IMPLEMENTATION_TASK.md)** §0 (bundle ingest).
- **Main-thread work:** Large MD → **`marked` + DOMPurify + big `innerHTML`** on activation path; no virtualization or worker offload yet.
- **State timing:** Tab switch vs async `loadTabContent`, session debounce, and PDF vs MD paths can still race (source of “glitchy” if not fully eliminated).

**Backlog items (next passes):**

- Profile **first paint** vs **tab switch** (Network + Performance); confirm largest blocks (content fetch vs parse vs images).
- **Offload or chunk** markdown parse/sanitize (Web Worker or idle-time split) without regressing “full doc in memory for active tab” requirement.
- **Optional:** virtualized / incremental DOM for very large docs *after* correctness and snappy small/medium docs.
- Revisit **preload** strategy (sequential vs parallel cap, cancel on close tab) to avoid background jank.
- **Acceptance target:** sub‑100ms perceived tab switch when content is already loaded; predictable loading when not.

---

## Next up — web app (easy first)

**Ordering:** Finish **agent/workspace coherence** before polishing persistence or richer UX. Details below are **TBD until specced**; no implementation commitment in this edit.

**Current implementation priority:** Start **Phase 1 (MVP dual view)** from **[PDF_MARKDOWN_DUAL_VIEW.md](PDF_MARKDOWN_DUAL_VIEW.md)**.

### 1. Agent + workspace coherence (**partially done; continue hardening**)

**Goal:** The AI reliably has **operational workspace context**: **`cwd`** (repo or book folder—TBD), **current document / book root**, **output root** wired to **`_resolved_output_dir`** when using **book-agent**, and MCP tools (`get_config`, `read`, `toc`, …) usable without the user guessing paths.

Hardening session completed on 2026-05-08; implementation shipped in `apps/web` (runtime context surface, tool-first prompt guardrails, minimal session churn reduction, warn-level path-policy logging).

**Design questions (answer before coding):**

- How the UI-selected **Markdown folder** ties to **`add_document`** / **`create_workspace`** / **`set_workspace_current_document`** vs **prompt-only** context.
- Whether the server **bootstrap or updates** `.book_agent.json`, or assumes an existing registry.
- **`WORKSPACE_ROOT`** for **Cursor SDK** vs **book-agent workspace id** naming—one story, not two divergent notions of “workspace.”

**Done so far:** Workspace/doc selection now updates canonical configs and session `cwd`/config path; web session creation also injects repo rule/skill context from `.cursor`.

**Remaining to close phase:** Open book → ask a concrete question answerable via **`read`**/TOC → agent consistently uses tools and respects **artifact output** rules without user path hints.

### 2. Light persistence (**after Phase 1 works**)

**Goal:** Lowest-friction continuity: **last-open document path**, **last output folder**, optional **UI prefs** (pane width). Decide **browser `localStorage` vs tiny server-side store** later.

Keep **SDK session persistence** (**`sessionId` ↔ agent**, **`Agent.resume`**) separate unless we explicitly merge—“same chat after refresh” vs “same file open.”

Status update (2026-05-08): v1 core shipped in `apps/web`:

- layered persistence (`global.json`, `.book_agent_web.json`, `project.session.json`)
- frontend hydration + debounced sync
- chat transcript storage moved to per-conversation JSONL:
  - `<workspace>/conversations/<conversation_id>.jsonl`
  - `project.session.json` keeps only conversation summaries + active IDs

Execution notes and checklist: **`docs/TEMP_PERSISTENCE_SESSION.md`**.
Manual acceptance and stress checks are intentionally deferred; tracked under **Reliability & policy**.

### 3. UX / product shape (**later — explore with you**)

- **Opening model:** Keep “open `.md` file/folder” vs move to explicit **projects** / **registered workspaces**.
- **Library:** Named / pinned workspaces (shortcut to folder + outputs + MCP config snapshot—TBD).
- **Tabs (optional):** Multiple documents under one workspace, shared outputs vs per-document overrides.
- Fold in **TOC / section-linked reader**, **PDF**, and retiring the temporary path-picker UX when **book-agent** path is canonical.

Keep **easy path first**: Phase **1**, then **2**, then decide how much of **3** is necessary for v1.

First-class workstream doc for this track: **[PDF_MARKDOWN_DUAL_VIEW.md](PDF_MARKDOWN_DUAL_VIEW.md)**.

### 4. Packaging + ingest durability

- **Background local server packaging:** Ship web app as a local background service + browser client (no wrapper required initially): start/stop/status UX, health endpoint, and safe localhost access defaults.
- **Import-by-copy default:** New document ingest should default to copying sources into workspace-managed paths (instead of link-only), so `index.json` and related assets stay stable if original source files move.
- **Advanced mode (later):** Keep optional linked-source mode for power users, but make copy mode the safe default.
- **Migration helper:** Add “consolidate linked sources into workspace” action for older workspaces.

---

## Reliability & policy

- **Rule adherence:** LLM agents can still write outside **`_resolved_output_dir`** despite **`book-agent.mdc`**. Current web app now logs warn-level drift on `mkdir` outside resolved output root; next step is hard enforcement/interceptors for artifact writes.
- **Context visibility (real issue observed):** Process cwd vs SDK session cwd can be misunderstood in chat/debugging. Add explicit “runtime context” display in UI/API logs (`session cwd`, `book config path`, selected workspace/doc) to avoid false assumptions.
- **Legacy prototype artifacts:** `outputs/web-workspaces/**` and `workspace.json` are from older web prototype flow. Keep compatibility if needed, but migrate/clean to avoid confusion with canonical workspace files.
- **Global installs:** After clone or new machine: **`~/.cursor/mcp.json`**, **`~/.cursor/rules/`**, optional **`~/.cursor/skills/`** symlink to this repo’s rule/skill copies—see **[USAGE.md](USAGE.md)**.
- **Persistence hardening checks (next pass):**
  - Corrupt-file fallback test: manually break `project.session.json` and one `conversations/*.jsonl`; verify startup + workspace open still works.
  - Long-chat load test: run a large transcript and confirm append-only JSONL growth while `project.session.json` stays small.
  - Add API tests for `GET /conversations/:id` and append-message summary updates (messageCount/lastMessage fields).

---

## Product

- **Web app + Cursor SDK:** Spec in **[PRD_WEB_APP_CURSOR_SDK.md](PRD_WEB_APP_CURSOR_SDK.md)**. **Partially implemented** in **`apps/web`**: server wraps **`@cursor/sdk`**, UI uses HTTP + SSE, reader shows rendered MD + figures; artifact paths and agent book-awareness still need wiring to **`_resolved_output_dir`** / **book-agent** tools (**see “Temporary workflow”** above).
- **Replace v0 MD workflow:** Move from “pick filesystem path” to **book project**: register document → workspace output → TOC/sections/`read`; keep modal UX only where still appropriate (exports, attachments).
- **Chat ↔ book context:** See **Next up — web app § 1** (agent grounded via **`read`** / TOC / `get_config` + one clear **workspace** story—not prompt-only path hints).
- **Agent abstraction:** **`AgentBackend`** (or equivalent) so the UI stays host-agnostic; Cursor is the first impl; aligns with PRD §12.6 / multi-host MCP story.
- **PDF → book:** **[marker_server](https://github.com/amirharati/marker_server)** in **[USAGE.md](USAGE.md)**; optional script: job output → **`add_document`** path conventions.
- **Dual-view reading (PDF↔Markdown):** see **[PDF_MARKDOWN_DUAL_VIEW.md](PDF_MARKDOWN_DUAL_VIEW.md)** for phased plan, mapping model, AI context integration, and marker-server ingestion path.
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
