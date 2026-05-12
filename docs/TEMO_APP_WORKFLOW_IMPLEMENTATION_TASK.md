# TEMO: App Workflow Implementation Task (End-to-End)

This document is a **standalone implementation brief** for a fresh session.  
Goal: implement the app workflow for workspace/document management, PDF conversion via Marker server, artifact bundling, indexing, and an initial dual PDF/Markdown viewer.

---

## 0) Progress snapshot — **handoff for next session** (updated 2026-05-12)

**Where the code lives:** `apps/web/src/app.ts` (HTTP API, Marker **`runMarkerConversionJob`**, workspace paths), `apps/web/public/app.js` + `index.html` / `styles.css` (browser UI). ZIP unpack uses dependency **`fflate`**. Bump **`app.js?v=`** in `index.html` when shipping front-end changes so browsers reload.

### Rough completion vs this doc

- **~70%** of the end-to-end **workflow MVP** (workspace → import → convert → view with artifacts) is in place.
- **~60%** if you count **§12 Definition of Done** literally, because **index + section UI + split** are still open (see table below).

### Shipped

- **Workspaces & documents:** create/select workspace, add PDF (copy into workspace-local tree), `project.json` + `.book_agent.json` / `.book_workspace.json` wiring used by the web flow.
- **Marker async conversion:** `POST /marker/upload/start` (multipart + options), poll `GET /api/jobs/<marker_job_id>/status` until terminal success/failure, job state persisted under workspace `jobs/`.
- **Full bundle ingest (primary path):** `GET /api/jobs/<marker_job_id>/zip` → unzip into `inputs/<doc_id>/converted/<marker_job_id>/` → **recursive merge** of that tree into `documents/<doc_id>/current/` (PDF already there is preserved; markdown, **`images/`**, metadata files from the ZIP are copied alongside). **`project.json` → `documents[].mdPath`** is set to the **resolved primary `.md`** (prefer `document.md`, else shallowest non-`README*` markdown under the extracted tree).
- **Fallback** if ZIP is missing, empty, or not a valid archive: `GET /api/jobs/<marker_job_id>` + legacy **single-file** markdown fetch (`/downloads/...`) into `converted/<job_id>/<doc_id>.md`, then **`current/document.md`** only (no images from this path).
- **Web UX:** tabbed reader, workspace file tree, conversion jobs UI (including advanced Marker options modal), optimistic doc switch, tab caching / scroll / preload experiments, broken-image handling in the reader.
- **ZIP safety:** unzip paths reject `..` and stay under the target directory (zip-slip guard).
- **After conversion, UI stays fresh:** `refreshWorkspaceList()` reloads **full** workspace payload (`GET /api/workspaces/:id`); open tabs **sync** `mdPath` / `pdfPath` from `currentWorkspace.documents` so markdown appears without a full page refresh.
- **Add Document picker:** remembers **last import directory** per workspace in **`localStorage`** (`bookAgent:lastImportPath:<workspaceId>`); next open starts there (fallback: workspace path then root).
- **Sidebar (work-focused):** scrollable middle region; **Setup** (root + workspace picker) is **collapsible**; **Jobs** strip shows only when something is **running or pending**; slimmer controls.
- **File tree:** **horizontal + vertical** scroll; **smaller / capped** indent (less double-indent vs CSS).

### Partial / not wired in `apps/web` yet

- **Automatic `index.json` build** after conversion (§8.D): not implemented as an HTTP step in this package from a quick pass—still assume **`book-agent index`** (CLI) or a future API hook unless added elsewhere.
- **Reader performance / “snappy” bar** (§17): ongoing; see [backlog.md](backlog.md).
- **Split view** (PDF + Markdown side-by-side as a third mode): not verified / likely not implemented; PDF/Markdown **toggle** exists.

### Recently fixed root cause (images / 404s)

Previously only markdown was fetched; **`images/`** under `current/` never appeared. **ZIP + promote** addresses that when the Marker server returns a good ZIP.

### Next session — suggested order (pick up here)

1. **Index pipeline in web app:** after successful promote, run `book-agent index` on `documents/<doc_id>/current/` (subprocess or shared library), write `index.json`, surface errors in UI.
2. **Section list** in reader driven by `index.json` (depends on step 1).
3. **Split layout** (optional third mode) per §2 / §12 row 5.
4. **Tests:** mock Marker ZIP + assert promoted tree; optional integration test for index step.
5. **Reader performance** follow-ups from [backlog.md](backlog.md) § “Web reader — performance & stability”.

---

## 1) Objective

Build a production-ready app workflow that supports:

1. Create/select workspace.
2. Add documents to workspace.
3. Copy source files into workspace-local storage (no shared mutable global source).
4. Run PDF-to-Markdown conversion through `marker_server`.
5. Bundle conversion artifacts (`.md`, `_meta.json`, images, index).
6. Build/refresh `index.json` from markdown.
7. Show initial dual view (PDF/Markdown) with user switch.
8. Keep conversion progress visible without blocking normal workspace usage.

This should be usable without prior knowledge of indexing internals.

---

## 2) Scope

### In scope

- Workspace CRUD (at least create, list, select current).
- Add document into workspace with local copy.
- Marker server integration through HTTP API.
- Conversion job lifecycle (submit, status, fetch results, persist metadata).
- Index build trigger after conversion.
- Basic dual view UI mode toggle (PDF / Markdown / Split).
- Error handling and user-visible status.
- Strict workspace-local isolation for document source, converted artifacts, and index.
- Non-blocking background conversion UX with visible progress widget/list.

### Out of scope (for this task)

- Paragraph-level or word-level alignment.
- Advanced sync scrolling/highlighting.
- Authentication on marker server (design hooks only).
- Full retry orchestration across distributed workers.

---

## 3) Required external dependency

Use this conversion backend:

- [marker_server](https://github.com/amirharati/marker_server)

Required API usage (align with live `marker_server`):

- **Primary:** `POST /marker/upload/start` (multipart) → `{ job_id, status_url }`; poll **`GET /api/jobs/<job_id>/status`** until `completed` / `failed`; fetch **`GET /api/jobs/<job_id>/zip`**, unpack locally, then promote tree into `current/` (**book_agent `apps/web`** implements this path; longer ZIP download timeout than status polls).
- **Fallback:** **`GET /api/jobs/<job_id>`** + per-file **`/downloads/...`** when ZIP is unavailable (markdown only).
- **Legacy / optional:** `POST /marker/upload`, `POST /marker` (server-local PDF)—keep only if server still exposes them.

---

## 4) High-level architecture

Implement a pluggable conversion provider interface:

- `ConversionProvider.submit(request) -> job_handle`
- `ConversionProvider.status(job_handle) -> status`
- `ConversionProvider.fetch(job_handle) -> artifact_paths`

Concrete implementation now:

- Marker HTTP client logic lives in **`runMarkerConversionJob`** (`apps/web/src/app.ts`); a dedicated `MarkerServerProvider` module is optional cleanup.

Design for future providers by config only (no major app rewrites).

---

## 5) Data model (minimum)

### Workspace

- `workspace_id` (string, stable key)
- `name`
- `root_path` (workspace-local root in outputs tree)
- `created_at`, `updated_at`

### WorkspaceDocument

- `doc_id`
- `workspace_id`
- `display_name`
- `source_path_original` (for traceability only)
- `local_pdf_path` (copied file path in workspace)
- `local_markdown_path` (after conversion)
- `local_meta_path` (after conversion)
- `local_index_path` (after indexing)
- `conversion_status` (`pending|running|done|failed`)
- `conversion_job_id` (marker job id)
- `conversion_provider` (`marker_server`)
- `conversion_preset`
- `error_message` (nullable)
- timestamps

### ConversionRun (optional but recommended)

- `run_id`
- `doc_id`
- request payload snapshot
- raw response snapshot
- status transitions
- artifact manifest

---

## 6) Filesystem layout (workspace-local)

For each workspace:

- `<workspace_root>/inputs/<doc_id>/source/` (copied source PDF; immutable)
- `<workspace_root>/inputs/<doc_id>/converted/<job_id>/` (marker output bundle for that run)
- `<workspace_root>/documents/<doc_id>/current/` (active pointers/copies)
  - `document.pdf` (from ingest; preserved across conversions)
  - Primary markdown (often `document.md`; may match Marker output name—**`project.json` `mdPath` is authoritative**)
  - Optional: `document_meta.json` / `_meta.json` / other Marker outputs from the ZIP
  - `images/...` when included in the ZIP and promoted
  - `index.json` (when indexing is run—see §8.D)

Rules:

1. All document-related files must live under the workspace root (no writes to shared top-level locations).
2. Each workspace owns its own full document copy, even when the same original source file is added to multiple workspaces.
3. `index.json` must be generated inside workspace-local `current/` only.
4. Keep source immutable; update `current/` atomically on successful runs.

---

## 7) Configuration

Use env/config values:

- `MARKER_SERVER_URL` (default: `http://127.0.0.1:8001`)
- `MARKER_SERVER_TIMEOUT_SEC` (default sensible value)
- `MARKER_SERVER_RETRIES` (small retry for transient network errors)
- Optional future:
  - `MARKER_SERVER_BEARER_TOKEN`
  - `MARKER_SERVER_API_KEY`

Auth behavior now:

- If token/key not configured, call without auth headers.
- Keep header injection path implemented but optional.

---

## 8) Functional flow

### A. Workspace creation/select

1. User creates workspace.
2. App creates workspace root directories.
3. Workspace can be selected as current.

### B. Add document to workspace

1. User selects PDF file.
2. App creates `doc_id`.
3. App copies PDF into workspace-local `inputs/<doc_id>/source/`.
4. App creates document record with `conversion_status=pending`.

### C. Convert PDF via marker_server

1. Build conversion request from preset + overrides.
2. Submit via `POST /marker/upload/start` (async job); poll **`GET /api/jobs/<job_id>/status`** until terminal state.
3. Persist `job_id`, set status `running`.
4. Poll job status (use `status_url` from submit response when provided).
5. **Primary (implemented):** **`GET /api/jobs/<job_id>/zip`** → unzip into **`inputs/<doc_id>/converted/<marker_job_id>/`** → merge extracted tree into **`documents/<doc_id>/current/`** (full bundle: markdown, images, metadata files as produced by Marker).
6. **Validate (recommended next hardening):** At least one `.md` exists after unzip; optional: warn if `extract_images=true` but no `images/` directory and markdown still references image paths.
7. **Fallback (implemented):** If ZIP is unusable, **`GET /api/jobs/<job_id>`** + download a single markdown artifact into `converted/<marker_job_id>/`, then write **`current/document.md`** only (no images).
8. Update **`project.json`** `mdPath` for the document (non-test runs).
9. Keep UI interactive during conversion; surface progress in a non-modal workspace job panel.

### D. Build index

1. Trigger `book-agent index` for `current/` document folder (or equivalent) — **not yet wired as an automatic post-conversion step in `apps/web`**; run CLI / add server hook when closing §12 row 4.
2. Write `index.json` in `current/`.
3. Update document record paths + status `done`.

### E. Dual view (initial)

Provide three modes:

- `PDF`
- `Markdown`
- `Split`

Use `index.json` navigation tree for section list and jumping.
No advanced sync required in this task.

---

## 9) Marker conversion presets (minimum)

Implement at least:

1. `default_native_pdf`
   - `output_format=markdown`
   - `paginate_output=true`
   - `extract_images=true`
   - `use_llm=false`

2. `scan_ocr`
   - `force_ocr=true`
   - `paginate_output=true`
   - `extract_images=true`

3. `tables_math_llm` (optional when API key configured)
   - `use_llm=true`
   - `paginate_output=true`

Store preset used per run.

---

## 10) API contract in app layer

Expose internal app endpoints/services for:

- `createWorkspace(name)`
- `setCurrentWorkspace(workspace_id)`
- `addDocument(workspace_id, source_pdf_path)`
- `startConversion(doc_id, preset, overrides)`
- `getDocumentStatus(doc_id)`
- `listWorkspaceJobs(workspace_id)` -> non-blocking conversion/index job state for panel/widget
- `buildIndex(doc_id)`
- `getDocumentArtifacts(doc_id)` -> paths/urls for PDF, MD, index, meta

---

## 11) Error handling requirements

Handle and surface:

- Marker server unreachable.
- Job submission failed (4xx/5xx).
- Job completes but markdown missing.
- ZIP download fails/corrupt.
- Index build fails.
- External conversion timeouts/intermittent failures while allowing user to continue other work.

For each: keep detailed error in document record and show concise UI message.
Failed jobs must remain inspectable from workspace job list/history.

---

## 12) Acceptance criteria (Definition of Done)

Use as a checklist; **status** reflects `apps/web` as of the progress snapshot above.

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Create workspace, select workspace, persist state. | **Shipped** |
| 2 | Add at least one PDF and verify workspace-local copy exists. | **Shipped** |
| 3 | Run conversion through marker server and persist outputs locally (including **ZIP → full tree** when available). | **Shipped** |
| 4 | Build `index.json` from converted markdown in workspace-local `current/`. | **Pending** (automate via web server or document manual `book-agent index` step) |
| 5 | Open initial dual view and switch modes (`PDF` / `Markdown` / `Split`). | **Partial** (PDF/Markdown switching in UI; confirm “split” parity with spec) |
| 6 | Section list loads from `index.json`. | **Pending** until §12 row 4 is automated or index is always pre-generated |
| 7 | Conversion/index failures are visible in UI and persisted in records. | **Partial** (conversion job errors; index failures N/A until index step exists) |
| 8 | Re-running conversion creates a new run and updates `current/` (new `converted/<job_id>/`, promoted tree). | **Shipped** (new Marker job id per run; `fs.cp` merge into `current/`) |
| 9 | User can continue normal navigation while conversion runs; progress/status visible in non-blocking job UI. | **Shipped** (async job + polling) |
| 10 | Same source file added to two workspaces → two independent workspace-local trees. | **Shipped** (by design of workspace paths) |

---

## 13) Suggested implementation order

1. Data model + persistence.
2. Workspace/document services.
3. File copy + local layout.
4. Marker provider integration.
5. Conversion orchestration.
6. Index build trigger.
7. Dual view UI switch + section list.
8. End-to-end tests and manual QA.

---

## 14) Test plan

### Unit tests

- Workspace/document creation.
- Path generation and local copy.
- Marker provider request mapping.
- Artifact validation logic.
- Workspace isolation checks (same source across two workspaces creates independent copies).
- Index path checks (`index.json` must be under workspace-local `current/`).

### Integration tests

- Mock marker server success/failure.
- Full flow: add PDF -> convert -> index -> status done.
- Non-blocking job status flow (submit -> running -> done/failed while UI remains usable).

### Manual QA

Use at least:

- One native text PDF.
- One scan/OCR-heavy PDF.
- One known problematic TOC PDF.

Verify artifacts and viewer behavior.

---

## 15) Notes for future phase

After this task ships:

- Add paragraph/block mapping (line/page anchors per chunk).
- Add optional token/word-level mapping if product requires precise citations.
- Add server auth and multi-backend provider selection in UI.

---

## 16) Deliverables

Minimum expected deliverables from the implementation session:

1. Working app workflow for workspace → local doc copy → **Marker ZIP (or fallback) conversion** → **view**; **index** step still to automate or document (see §12).
2. Configurable marker server URL/options (web settings + advanced modal).
3. Basic dual view with user mode switch (PDF / Markdown in UI).
4. Tests covering happy path + key failure paths for **HTTP/workspace** flows; **mocked full Marker ZIP** test still a good addition.
5. This task doc + [backlog.md](backlog.md) kept aligned with reality — **start from §0 (handoff snapshot)** on the next session.

---

## 17) Reader performance, glitches, and artifact completeness (**follow-up — 2026-05-12**)

**Status:** Core workflow pieces exist in `apps/web`, but **tab/document switching still feels slower than the product bar** and can feel **glitchy** (async races, loading states, PDF vs markdown paths).

**Server-side artifact path (2026-05-12):** Marker job completion now prefers **`GET /api/jobs/<id>/zip`** + unpack + promote into `current/`, so **images and metadata from the bundle** are present when the server returns a valid ZIP. Remaining 404s usually mean **fallback markdown-only path**, a bad ZIP, or markdown referencing paths not in the archive.

**Already tried (client, `apps/web/public/app.js`):** in-memory tab cache (`content` / `renderedHtml`), optimistic current-document API, parallel workspace bootstrap requests, scroll position restore for markdown, background preload of other open tabs, lazy images, broken-image placeholder to cut 404 noise, loading spinner during fetch.

**Gaps to close (track also in [backlog.md](backlog.md) — “Web reader — performance & stability”):**

1. **Post-ZIP validation:** Optional UI/server check: if markdown references `./images/` but folder missing after promote, surface a clear warning (distinguish ZIP failure vs Marker omitting assets).
2. **Main-thread cost:** Large markdown → parse + sanitize + full `innerHTML` blocks the UI; next step is **profiling** (Performance panel) then **Web Worker** or chunked idle-time work **without** violating “active tab shows full document” semantics.
3. **Race / state clarity:** Harden ordering between `activateTab`, `loadTabContent`, session persistence debounce, and PDF fallback so switching never shows stale content or stuck “loading.”
4. **Preload policy:** Cap concurrency, cancel preloads for closed tabs, and confirm background preloads do not compete with active-tab work.

**Stretch acceptance (reader-only):** Perceived **under 100 ms** when switching to a tab whose markdown is already fetched and cached; otherwise a single clear loading state with no flicker.

