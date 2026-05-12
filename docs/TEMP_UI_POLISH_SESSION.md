# UI Polish Session — **COMPLETE** (2026-05-08)

**Status:** Done. Acceptance checklist met; session goals shipped.

**Follow-ups** (not blocking): see **[backlog.md](backlog.md)** — *Web UI follow-ups (post–Research Studio polish)*.

This file is an **archive** of the plan, design direction, and handoff. You may delete it once the backlog entry feels sufficient.

---

# Original plan (archived below)

## TEMP — UI Polish Session Plan

Purpose: one focused session to clean up web UI/UX without mixing in persistence or deeper backend changes.

---

## Session Outcome

Ship a noticeably cleaner, more usable UI for the workspace-first flow:

- clearer information architecture
- smoother workspace/document navigation
- better visual hierarchy for reader + chat
- less rough/temporary feeling in layout and controls

---

## Current Baseline (already working)

- Workspace-first flow is functional (`root -> workspace -> documents -> chat/render`).
- Reader renders markdown/math/images.
- Chat works with streaming.
- Session context (`cwd` + `BOOK_AGENT_CONFIG`) is wired.

This session is about polish and UX structure, not core correctness.

---

## Scope for This Session (UI only)

### 1) Layout and Navigation

- Introduce/clean a left sidebar for workspace navigation.
- Move most workspace management into the left sidebar (instead of a center dashboard wall).
- Keep reader/chat areas clear and consistent.
- Improve panel sizing behavior and spacing rhythm.
- Reduce visual clutter from setup controls in main content area.

### 2) Workspace Management UX

- Make workspace actions easy to scan: create/select/open/add document/set current.
- Sidebar-first actions should include:
  - workspace switcher
  - new workspace
  - open workspace
  - add document
  - current workspace/status
- Improve labels and helper text so intent is obvious.
- Keep status/errors visible but non-intrusive.
- Ensure action order matches real workflow.
- Keep center setup only for first-run/empty-state guidance and richer validation flows.

### 3) Reader Experience

- Clean typography and spacing for long reading.
- Better sectioning/headers/list/table readability.
- Improve empty/loading/error states for reader panel.
- Keep markdown rendering quality while polishing visuals.
- Add tabbed reader model so multiple documents can be open simultaneously.
- Support both:
  - workspace documents
  - external/loose files under root that are not yet added to workspace
- Add clear "Add to Workspace" affordance for external tabs.
- Keep reader as dominant pane (target ~55-65% width in desktop layouts).

### 4) Chat Experience

- Improve composer/message area visual clarity.
- Better spacing and contrast for user vs assistant messages.
- Preserve always-available input behavior.
- Keep streaming feel responsive and readable.
- Keep chat contextual to currently active reader tab/section.

### 5) Interaction Polish

- Consistent button styles, states, disabled/loading feedback.
- Modal polish (browse/add-doc flow): clearer title/action/cancel flow.
- Basic keyboard/accessibility hygiene (focus states/tab order sanity).

---

## Design Direction (locked for this session)

Target feel: **Cursor-like desktop shell** tuned for reading/studying.

- Style: modern SaaS with restrained minimalism (calm, professional, not flashy).
- Density: medium (productive, but not cramped).
- Color: neutral base + one accent; semantic success/warn/error only.
- Priority: reading clarity first, then chat clarity, then setup ergonomics.
- Rule: no decorative UI that competes with content hierarchy.

### Visual System Rules

- 8 px spacing rhythm for layout and component internals.
- Long-form reader typography should be comfortable by default:
  - body text visually around 16 px equivalent
  - generous line-height for paragraphs/lists
  - clear heading ladder for section scanning
- One primary action per local region (sidebar area, modal footer, chat composer zone).
- Keep borders/shadows subtle; avoid stacking heavy border + heavy shadow together.
- Empty/loading/error visuals should be calm and instructional, never alarming by default.

### Layout Contract (desktop-first)

- 3-pane layout:
  - left sidebar = navigation + workspace/document controls
  - center = reader (dominant)
  - right = chat/contextual assistant
- Reader target width share on desktop: ~55-65%.
- Right chat pane should be collapsible but must not hide reader by default.
- Setup dashboard should not dominate center once a workspace is active.

### Information Architecture (sidebar-first workspace UX)

Sidebar sections should appear in this order:

1. Current Context
   - workspace name
   - current document
   - short status/context chips
2. Workspace Actions
   - switch workspace
   - new workspace
   - open workspace
   - add document
3. Documents
   - workspace documents list
   - quick open behavior into reader tabs
4. Optional (if time): notes/highlights/recent

### Reader Tabs Contract

- Reader supports multiple open tabs simultaneously.
- Tab sources:
  - workspace documents
  - external/loose files under workspace root (not yet added to workspace)
- External tabs must expose clear "Add to Workspace" action.
- Tabs should support expected desktop behaviors:
  - activate
  - close
  - keyboard cycling (if implemented this session)
- Active tab controls reader content and chat context.

### Chat Contract

- Composer remains always visible and easy to target.
- User and assistant messages should have clear visual distinction without high-noise styling.
- Streaming output must remain readable (line-height, spacing, contrast).
- Chat context follows active tab/section and should show this context unobtrusively.

### Accessibility + Quality Guardrails

- Keyboard navigation sanity:
  - visible focus states on all interactive controls
  - logical tab order in sidebar -> reader controls -> chat
- Contrast should meet practical WCAG AA expectations for body text and controls.
- Modals require clear title, close affordance, cancel path, and primary action hierarchy.
- Disabled/loading states must explain why an action is unavailable when applicable.

### Non-Goals During This Polish Pass

- No backend behavior changes unless required for UI wiring.
- No persistence model redesign.
- No large data/model architecture changes hidden inside UI tasks.

---

## Implementation Plan (phased)

Phase 1 — Shell + Sidebar

- Build/clean the 3-pane shell and spacing rhythm.
- Move workspace management from center-heavy dashboard into sidebar.
- Keep first-run guidance in center only when no active workspace/doc.

Phase 2 — Reader + Tabs

- Implement/clean tabbed reader for workspace + external files.
- Add external tab affordance to promote file into workspace.
- Polish reader typography and markdown element rhythm.

Phase 3 — Chat + Interaction Polish

- Refine composer/message layout, contrast, and streaming readability.
- Ensure chat tracks active tab/section context.
- Normalize buttons, loading, disabled, and modal interactions.

Phase 4 — QA + Acceptance Sweep

- Verify acceptance checklist end-to-end.
- Do focused regression checks on workspace/document/chat flows.
- Capture handoff notes and remaining rough edges.

---

## Verification Checklist (per phase)

- Visual: spacing/alignment consistent and no obvious jank.
- UX: primary workflows are discoverable without explanation.
- A11y: keyboard/focus behavior works for touched surfaces.
- Regression: existing workspace/document/chat behavior still works.

## Explicitly Out of Scope (do later)

- Session persistence / `Agent.resume`.
- Cross-session memory model.
- Deep grounded-retrieval logic upgrades.
- Large backend/API refactors not required for UI polish.
- PDF pipeline redesign.

---

## Acceptance Checklist (Done = true)

- Workspace navigation is obvious at first glance.
- User can complete the core flow without confusion:
  1) set root
  2) create/open workspace
  3) add/select document
  4) read + chat
- Reader and chat both feel visually coherent and non-janky.
- No regressions in existing workspace/document/chat behavior.
- UI no longer feels “prototype rough” for daily use.

---

## Nice-to-Have (Only if time remains)

- Collapsible sidebar sections.
- Lightweight activity/status strip.
- Better “current context” chip (workspace/doc/session short id).
- Keyboard shortcuts for tab/navigation flow (e.g., open file, switch tab, close tab).

---

## End-of-Session Handoff

### UI Changes Made (2026-05-08)

1. **3-pane layout**: Rebuilt from 2-pane + bottom dashboard to Cursor-like shell (sidebar + reader + chat).
2. **Sidebar-first workspace management**: All workspace/document controls now in left sidebar.
3. **Context chips**: Workspace/document indicators at top of sidebar.
4. **Tabbed reader**: Tab bar with workspace document tabs and close functionality.
5. **Reader typography**: Serif font (Source Serif 4) for comfortable reading, proper heading hierarchy.
6. **Design system**: CSS variables for colors, 8px spacing grid, typography, transitions.
7. **Clean modals**: Polished Create Workspace and file browser modals.
8. **Chat styling**: Distinct user/assistant message bubbles with good contrast.
9. **Empty states**: Instructional empty states throughout.
10. **Focus states**: Visible focus rings on all interactive elements.
11. **Model picker**: Polished model selector with star icon, formatted names, dynamic model list from SDK.
12. **Workspace Files section**: Full file tree in sidebar with collapsible folders.
13. **File filters**: Hide images and hidden files by default, with toggle controls.
14. **External file tabs**: Files from workspace directory can be opened in tabs (dashed border indicator).
15. **Add to Workspace flow**: External file tabs show "+" button to promote file to workspace document.
16. **Workspace switching**: Dropdown change opens workspace; document list, file tree, tabs, and status refresh correctly when switching root/workspace.

### Backend Changes

- Added `/api/workspaces/:workspaceId/documents/:documentId/content` endpoint.
- Added `/api/workspaces/:workspaceId/files` endpoint for workspace file tree with filtering.
- Added `/api/models` endpoint for dynamic model list from Cursor SDK.

### Remaining Backlog Items

- Keyboard shortcuts for tab navigation (Cmd+W close tab, Cmd+Tab cycle tabs).
- Collapsible sidebar sections.
- Chat context indicator showing which document it's grounded to.
- Custom filter patterns (user-defined, beyond images/hidden).

### Session Complete

All primary acceptance criteria met:

- [x] Workspace navigation is obvious at first glance.
- [x] User can complete the core flow without confusion (root -> workspace -> documents -> read + chat).
- [x] Reader and chat both feel visually coherent and non-janky.
- [x] No regressions in existing workspace/document/chat behavior.
- [x] UI no longer feels "prototype rough" for daily use.
