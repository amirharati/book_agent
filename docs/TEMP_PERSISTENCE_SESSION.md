# TEMP — Persistence Session Plan (V1)

## Status

Implemented (v1 core) on 2026-05-08; final manual acceptance checks deferred and tracked in `docs/backlog.md`.

### Implementation Notes

- Global/root/workspace persistence endpoints are implemented.
- Frontend hydration + debounced state sync are implemented.
- Chat storage was upgraded from embedded messages in `project.session.json` to per-conversation files for scalability:
  - conversation summaries remain in `project.session.json`
  - conversation messages are append-only JSONL files under `<workspace>/conversations/<conversation_id>.jsonl`
- Loading is graceful for missing/partial/corrupt state (defaults/fallback behavior).

## Objective

Implement a safe, minimal persistence layer for the web app that:

- restores user/workspace continuity across refresh/restart
- keeps architecture clean for future `Agent.resume` and memory features
- avoids overbuilding in v1

This session targets **UI state + chat transcript persistence** only.

---

## Design Principles (best-practice defaults)

1. **Layered state with deterministic overrides**
   - Precedence: **workspace > root > global > built-in defaults**
2. **Portable work data**
   - Work-related state lives with root/workspace files, not browser-only storage.
3. **Safe file I/O**
   - Atomic writes (`.tmp` + rename), schema versioning, tolerant reads.
4. **Incremental architecture**
   - Keep seams for future SDK resume and cross-workspace memory.
5. **Simple conflict policy in v1**
   - Last-write-wins; document this explicitly.

---

## Persistence Layers

### 1) Global (user-level, outside project roots)

Location:

- `~/.book-agent/global.json`

Purpose:

- user-wide defaults (theme, density, default model, app toggles)
- recent roots and last selected root
- settings that should exist before any root is chosen

### 2) Root-level (inside selected root)

Location:

- `<root>/.book_agent.json` (canonical registry; keep as source of truth for docs/workspaces)
- `<root>/.book_agent_web.json` (web app root-level UI/session index)

Purpose:

- root-local recents/order/pins
- last active workspace in this root
- root-specific UI/workflow defaults

### 3) Workspace-level (inside each workspace)

Location:

- `<root>/<workspace_id>/project.json` (keep existing metadata)
- `<root>/<workspace_id>/project.session.json` (workspace runtime state + conversation summaries)
- `<root>/<workspace_id>/conversations/<conversation_id>.jsonl` (conversation messages; one line per message)

Purpose:

- active/open doc tabs, active tab, file-tree filters
- pane layout and workspace-local UI state
- chat transcripts/conversations bound to workspace context

---

## Override Semantics

For configurable settings:

- missing key = inherit from lower-precedence layer
- explicit value = override
- `null` (where allowed) = explicit clear/reset to inherited/default behavior

Document per-key behavior in schema notes.

---

## Suggested Schemas (initial)

### `~/.book-agent/global.json`

- `schemaVersion`
- `ui` (theme, density)
- `chat` (defaultModel)
- `recentRoots` (array)
- `lastRoot` (string or null)
- `updatedAt`

### `<root>/.book_agent_web.json`

- `schemaVersion`
- `lastWorkspaceId`
- `workspaceOrder` / `pinnedWorkspaces`
- `rootUiOverrides`
- `updatedAt`

### `<workspace>/project.session.json`

- `schemaVersion`
- `activeDocumentId`
- `openTabs` (workspace docs + external files metadata)
- `activeTabId`
- `layout` (pane sizes/collapsed states)
- `reader` (view mode, scroll anchors if available)
- `chat`:
  - `conversations` (id, title, archived, messageCount, lastMessageAt, lastMessagePreview, createdAt, updatedAt)
  - `activeConversationId`
  - `context` snapshot (workspace/doc/model/session short id)
- `updatedAt`

### `<workspace>/conversations/<conversation_id>.jsonl`

- One JSON object per line
- Message shape:
  - `id`
  - `role` (`user` | `assistant` | `system`)
  - `content`
  - `createdAt`

---

## API Surface (v1)

Add minimal persistence endpoints:

1. `GET /api/state/bootstrap`
   - returns merged state for app startup:
     - global defaults
     - root index
     - current workspace session state (if any)

2. `PATCH /api/state/global`
   - update global settings safely

3. `PATCH /api/state/root`
   - update root-level web index/settings

4. `PATCH /api/workspaces/:workspaceId/session-state`
   - patch workspace session state (tabs/layout/active doc/etc.)

5. `GET /api/workspaces/:workspaceId/conversations`
   - list conversations metadata

6. `GET /api/workspaces/:workspaceId/conversations/:conversationId`
   - fetch one conversation metadata + full messages

7. `POST /api/workspaces/:workspaceId/conversations`
   - create conversation

8. `PATCH /api/workspaces/:workspaceId/conversations/:conversationId`
   - rename/archive/set active

9. `POST /api/workspaces/:workspaceId/conversations/:conversationId/messages`
   - append user/assistant/system messages

Keep endpoints narrow and append/patch based (no giant rewrites from UI each time).

---

## Frontend Integration (v1)

1. On startup:
   - call bootstrap endpoint
   - hydrate root/workspace UI state
2. On workspace open:
   - hydrate workspace session state + active conversation
3. During use:
   - debounce-save layout/filters/tab changes
   - append chat messages after send/stream completion
4. Session behavior:
   - keep current SDK session creation behavior
   - restore transcript visually from persisted conversation
   - add explicit `New chat` action (starts fresh conversation record)

---

## Reliability/Safety Checklist

- Atomic file writes for every state file.
- Schema version field in all new files.
- Corrupt/missing files fallback to defaults without crashing app.
- Path normalization + root/workspace boundary checks.
- Keep warn-level logging for unusual states; avoid noisy logs.

---

## Out of Scope (explicit)

- `Agent.resume` / persisted SDK agent IDs
- cross-workspace semantic memory
- database/vector DB
- major UX redesign unrelated to persistence

---

## Acceptance Criteria

1. App restart restores:
   - last root
   - last workspace
   - last active document/tab layout
2. Chat transcript reappears for active workspace conversation.
3. Opening different roots/workspaces preserves isolated state correctly.
4. Missing/corrupt state files do not break startup.
5. Existing workspace/doc/chat flow remains functional.

### Final Verification Checklist (deferred to backlog)

- [ ] Restart app with existing workspace and verify: root, workspace, tab/layout, and active conversation restore.
- [ ] Switch between at least two roots/workspaces and verify state isolation.
- [ ] Corrupt one state file (`project.session.json` and one `conversations/*.jsonl`) and verify app still starts with graceful fallback.
- [ ] Confirm long-chat behavior: appends to one conversation JSONL file without large rewrites of `project.session.json`.

---

## Implementation Order (recommended)

1. Backend persistence store module (read/merge/write/atomic).
2. Global + root state endpoints.
3. Workspace session-state endpoint.
4. Conversation endpoints and transcript append flow.
5. Frontend hydration + debounced state sync.
6. Regression + fallback tests.

---

## Risks to Watch

- Writing too much too often (debounce/throttle required).
- State drift between in-memory UI and files.
- Overcoupling chat transcript schema to UI rendering.

Keep v1 simple and evolvable.

