# Web Backend (Spike)

Minimal TypeScript backend + web chat shell that wraps agent providers behind an `AgentBackend` interface.

## Install

From `apps/web`:

```bash
npm install
```

## Run

Default echo backend:

```bash
npm run dev
```

The server listens on `http://localhost:8787`.

Open this URL in your browser to use the **Research Studio** UI.

Current UI:

- **Left:** sidebar — workspace root, workspace switcher, documents list, workspace file tree (filters), status
- **Center:** tabbed reader — Markdown / PDF, multiple open tabs (workspace docs + loose files; **Add to Workspace** on external tabs)
- **Right:** chat — model picker (SDK-backed when using Cursor backend), streaming assistant, composer
- **Layout:** 3-pane shell with resizable sidebar divider

## Test

```bash
npm test
```

## Switch backend

- `AGENT_BACKEND=echo` (default)
- `AGENT_BACKEND=cursor-sdk` (requires `@cursor/sdk` and `CURSOR_API_KEY`)

Cursor mode also reads:

- `WORKSPACE_ROOT` (defaults to process cwd)
- `BOOK_AGENT_CONFIG` (defaults to `<WORKSPACE_ROOT>/.book_agent.json`)
- `CURSOR_MODEL_ID` (optional; defaults to `auto`, example explicit value: `composer-2`)

## Quick manual check

1. Start server with `npm run dev`
2. Open `http://localhost:8787`
3. Send a message and confirm streaming assistant output appears in the chat panel
