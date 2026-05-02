# Design: MCP server for book-agent

**Scope:** Expose book-agent tools (toc, search, read, figure, config, web search, web fetch) via the Model Context Protocol so Cursor and other MCP clients can call them without running our Python/CLI directly. How to implement, how to configure in Cursor, and how to test (in Cursor and outside).

---

## 1. Goal

- **What:** An MCP server that exposes the same capabilities as `book_agent.agent_tools`: get config, toc, search, read, figure resolve/show, web search, web fetch.
- **Why:** Cursor (or another IDE / CLI client) can add the server once and use the tools over the protocol; useful when the client doesn’t run Python or when we want a single, consistent way to talk to book-agent from multiple apps.
- **Non-goal:** We do not change tool behavior; we only expose existing `run_*` functions as MCP tools.

---

## 2. Tools to expose

Map each book-agent API to one MCP tool (name and arguments). The server exposes **19 tools** plus one prompt (`book_agent_context`).

**Config and workspace (call get_config first when setting up):**

| MCP tool name                        | Description                                                                 | Arguments |
|--------------------------------------|-----------------------------------------------------------------------------|-----------|
| `get_config`                         | Return current config (documents, workspace, resolved paths). Call first.  | —         |
| `create_workspace`                   | Create a new workspace.                                                     | `workspace_id` |
| `add_document`                       | Add a book/document to the registry.                                        | `doc_id`, `path` |
| `set_current_workspace`              | Set the current workspace.                                                  | `workspace_id` |
| `add_document_to_workspace`          | Add a document to a workspace.                                             | `workspace_id`, `doc_id` |
| `set_workspace_current_document`     | Set which document is current in a workspace.                              | `workspace_id`, `doc_id` (optional) |
| `set_workspace_output_subdir`        | Set output subdir (e.g. notebooks).                                         | `workspace_id`, `key`, `subdir` |
| `remove_document_from_workspace`      | Remove a document from a workspace.                                        | `workspace_id`, `doc_id` |
| `add_book`                           | Backward-compat: add document + set as current in same-named workspace.     | `book_id`, `path` |
| `set_current_book`                   | Backward-compat: set current workspace and document.                       | `book_id` |
| `set_output`                         | Backward-compat: set output subdir for current workspace.                   | `key`, `path` |

**Book content and web:**

| MCP tool name        | Description                          | Arguments                                                                 | Notes |
|----------------------|--------------------------------------|---------------------------------------------------------------------------|-------|
| `toc`                | Table of contents                    | `path` (optional), `depth` (optional, default 2)                           | path = null → current document |
| `search`             | Search sections (book)               | `path` (optional), `query` (required)                                     | |
| `read`               | Read section content                 | `path` (optional), `query` (section title, required)                      | |
| `index`              | Build index.json                     | `path` (optional)                                                         | |
| `web_search`         | Web search (Serper)                  | `query` (required), `num` (optional, default 10)                           | |
| `web_fetch`          | Fetch URL; optional save to workspace| `url` (required), `backend` (optional), `saveToSubdir`/`downloadPath` (optional, e.g. `"fetched"`) | When save param set, writes to `output_dir/<subdir>/<doc-slug>/<filename>.md`; tool derives folder and filename from URL/title. |
| `figure_resolve`     | Resolve figure ref to path           | `path` (optional), `figure_ref` (required)                               | |
| `figure_show`        | Figure path + prompt + optional base64| `path` (optional), `figure_ref` (required), `no_image` (optional)           | for agent image injection |

All optional `path` arguments: when omitted, use current document from config (same as CLI/Python API). The server loads config from `.book_agent.json` (or `BOOK_AGENT_CONFIG` env). When `cwd` is `${workspaceFolder}`, config and outputs are per-project.

### 2.1 Shared system for rules and MCP (avoid duplication)

The **Cursor rule** (`.cursor/rules/book-agent.mdc`) and the **MCP server** both describe the **same MCP tools**. Implementation stays one place (`book_agent.agent_tools`); the server is a thin wrapper.

- **Tool list (name + description):** Canonical registry in **`book_agent/tool_registry.py`** (`TOOLS`: `name`, `description`, `args`, `python_name`). The MCP server imports `TOOLS` to register tools. [BOOK_AGENT_TOOLS.md](../BOOK_AGENT_TOOLS.md) points here as the canonical list.
- **Policy (“when to use”):** Lives in **`.cursor/rules/book-agent.mdc`** (e.g. get config first, web fetch defaults). The MCP server does not encode policy; it exposes tools only.

**Concrete approach:** Add or edit one dict in **`TOOLS`** in `tool_registry.py`, wire the handler in `mcp_server.py` / `agent_tools.py` as today. Run **`book-agent sync-rule`** to refresh the rule’s inline MCP tool list and the **Tools (MCP)** table from `TOOLS`.

**Sync util:** Run **`book-agent sync-rule`** (or `python scripts/sync_rule_from_registry.py`) after registry changes. It rewrites the “Prefer book-agent MCP tools (…)” line and the markdown table in the rule from `TOOLS`.

---

## 3. Implementation approach

- **SDK:** Use the official [MCP Python SDK](https://modelcontextprotocol.github.io/python-sdk/) (e.g. `pip install mcp` or `uv add mcp`). Use **FastMCP** for minimal boilerplate.
- **Transport:** Support **stdio** (for Cursor “command” type: Cursor spawns our process and talks over stdin/stdout). Optionally support **streamable HTTP** for Inspector or remote clients.
- **Entrypoint:** A single module, e.g. `book_agent/mcp_server.py`, that:
  - Creates a FastMCP instance.
  - Registers one MCP tool per table above, each calling the corresponding `run_*` or config function.
  - Handles `path`: accept string or null; if null, pass `None` into the existing API; if string, pass `Path(path)`.
  - Catches `ValueError` from our tools and returns a clear error message in the MCP response.
- **Config / env:** The server runs in the user’s environment so `.book_agent.json` and `.env` (SERPER_API_KEY, JINA_API_KEY, etc.) are found by the existing config logic. Cursor can pass `env` in the MCP server config if needed.
- **No extra dependencies for core:** Add `mcp` as an optional dependency (e.g. `pip install book-agent[mcp]` or `uv add mcp`) so the rest of the package stays unchanged.

**Example (conceptual):**

```python
# book_agent/mcp_server.py
from pathlib import Path
from mcp.server.fastmcp import FastMCP
from book_agent.agent_tools import (
    get_config, run_toc, run_search, run_read,
    run_web_search, run_web_fetch, resolve_figure, get_figure_for_agent, run_index,
)

mcp = FastMCP("book-agent", json_response=True)

@mcp.tool()
def get_config() -> str:
    """Return current book-agent config (documents, current workspace, resolved paths)."""
    import json
    return json.dumps(get_config(), indent=2)

@mcp.tool()
def toc(path: str | None = None, depth: int = 2) -> str:
    """List table of contents. path: book folder or null for current document. depth: max depth (default 2)."""
    p = Path(path) if path else None
    lines = run_toc(p, depth)
    return "\n".join(lines)

# ... same for search, read, web_search, web_fetch, figure_resolve, figure_show, index

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

Run for Cursor: `python -m book_agent.mcp_server` (with `transport="stdio"`).

---

## 4. Cursor configuration

Cursor starts the MCP server as a **command** and communicates over **stdio**. Two ways to configure:

**A) Project-level (this repo only)**  
Create or edit `.cursor/mcp.json` in the project root:

```json
{
  "mcpServers": {
    "book-agent": {
      "command": "python",
      "args": ["-m", "book_agent.mcp_server"],
      "cwd": "/absolute/path/to/book_agent",
      "env": {}
    }
  }
}
```

- Use `uv run -m book_agent.mcp_server` if you prefer uv and ensure the `mcp` extra is installed (`uv add mcp` / `pip install book-agent[mcp]`).
- `cwd` should be the repo root (or where `.book_agent.json` and `.env` live). You can omit `cwd` if Cursor’s working directory is already the project root.
- Add env vars if needed, e.g. `"env": { "SERPER_API_KEY": "${SERPER_API_KEY}" }` — Cursor may support env from the environment; otherwise paste values (avoid committing secrets).

**B) Global (all projects)**  
Put the same `mcpServers` entry in `~/.cursor/mcp.json` and use a full path for `command`/`args`/`cwd` so the server runs the same way from any workspace.

**C) New folder with only MCP**  
If you use book-agent only via MCP (no Python package in the project), set `cwd` to `${workspaceFolder}` so config is created in that folder. Ensure the `command` interpreter has `book-agent[mcp]` installed.

**D) One Python for all workspaces (recommended)**  
To avoid a separate venv per project, use a **single** Python that has book-agent installed (e.g. this repo’s venv) and keep `cwd` as `${workspaceFolder}`:

```json
{
  "mcpServers": {
    "book-agent": {
      "command": "/absolute/path/to/book_agent/.venv/bin/python",
      "args": ["-m", "book_agent.mcp_server"],
      "cwd": "${workspaceFolder}",
      "env": { "BOOK_AGENT_CONFIG": "${workspaceFolder}/.book_agent.json" }
    }
  }
}
```

Replace `/absolute/path/to/book_agent` with the real path to this repo. Run `uv sync --extra mcp --extra env` once in the book_agent repo to create that `.venv`. Every workspace then uses the same Python; only `cwd` (and thus `.book_agent.json` and outputs) changes per project.

**E) CLI installer (install once, use in any folder you open)**  
Install book-agent with MCP support on **one** Python environment, then merge Cursor’s **global** config:

```bash
pip install "book-agent[mcp]"    # or: uv sync --extra mcp from this repo
book-agent cursor install-mcp  # writes ~/.cursor/mcp.json (merges; keeps other servers)
```

This registers `book-agent` with `cwd` `${workspaceFolder}`, `BOOK_AGENT_CONFIG` `${workspaceFolder}/.book_agent.json`, and `command` set to the interpreter that ran the CLI (override with `--python /path/to/python`). **Restart Cursor** afterward so MCP reloads.

- Inspect without writing: `book-agent cursor print-mcp-json`
- Dry-run merge: `book-agent cursor install-mcp --dry-run`

The package also installs a **`book-agent-mcp`** console script (same as `python -m book_agent.mcp_server`) if you prefer an executable on `PATH` instead of `-m`.

**Companion rule (recommended)**  
So the agent knows *when* to use book-agent tools and what “add a book” / “create workspace” mean, install the rule **globally** with a **symlink** (recommended — one canonical file; `book-agent sync-rule` updates the repo copy):

```bash
mkdir -p ~/.cursor/rules
cd /path/to/book_agent && ln -sf "$PWD/.cursor/rules/book-agent.mdc" ~/.cursor/rules/book-agent.mdc
```

Or copy that file into **`~/.cursor/rules/`**, or keep it only in a project’s **`.cursor/rules/`**. It describes MCP tool names and policy (get config first, proactive prompts when config is empty).

Then the agent has both the tools (from the MCP server) and the policy (from the rule). If book-agent tools don’t appear in a chat, the rule suggests the user check MCP connection or use the **book_agent_context** prompt.

**Restart:** Fully quit and reopen Cursor after changing MCP config so the server is picked up.

---

## 5. Testing in Cursor

1. **Implement** `book_agent/mcp_server.py` (and add `mcp` dependency) as in §3.
2. **Configure** `.cursor/mcp.json` (or global) with the `book-agent` server and **restart Cursor**.
3. **Verify in chat:** In a Cursor chat, confirm that MCP tools from “book-agent” appear (e.g. “book-agent: toc”, “book-agent: read”). Ask the agent to “show me the table of contents of the current book” or “search the book for regression” and check that it uses the MCP tools and returns sensible results.
4. **Check config:** Ask “what is the current book-agent config?” and confirm it matches `get_config()` (current workspace, document, output dir).
5. **Optional:** In a project that also has other rules, ensure nothing tells the model to call Python `run_*` names for book-agent; this repo’s rule expects MCP tool names when the MCP server is enabled.

---

## 6. Testing outside Cursor

**A) MCP Inspector (recommended)**  
- Run the server with **streamable HTTP** locally (e.g. `mcp.run(transport="streamable-http")` and a port, or use the SDK’s HTTP example).
- Install and run the Inspector: `npx -y @modelcontextprotocol/inspector`.
- Connect to `http://localhost:<port>/mcp` (or the URL your server advertises). In the Inspector you can list tools and call them with sample arguments (e.g. `toc` with `depth=1`, `read` with `query="Introduction"`). Use `path: null` for current-document behavior when your config has a current workspace/document.

**B) Another MCP client (e.g. Claude Desktop, or a small Python client)**  
- Configure the client to start the book-agent server with the same command/args as in §4 (stdio), or to connect to the HTTP endpoint if you exposed streamable HTTP.
- Call the same tools and check responses (config, toc, read, web_search, web_fetch, etc.).

**C) CLI-driven test (no GUI)**  
- Use the MCP Python SDK’s client or a minimal script that spawns `python -m book_agent.mcp_server` with stdio and sends a “tools/list” and “tools/call” request (see MCP spec), then parses the response. Good for CI or headless checks.

**Minimal “outside” checklist:**  
- [ ] Inspector (or another client) lists all book-agent tools.  
- [ ] `get_config` returns JSON with current workspace/document.  
- [ ] `toc` with `path=null` returns TOC lines.  
- [ ] `read` with `query="<section>"` returns markdown.  
- [ ] `web_search` and `web_fetch` work when env keys are set (or test with a mock).  
- [ ] `figure_resolve` returns a path for a valid figure ref.

---

## 7. Summary

| Step | Action |
|------|--------|
| 1 | Install: `uv sync --extra mcp --extra env` (or `pip install -e ".[env,mcp]"`) in the book_agent repo. |
| 2 | MCP server exposes 19 tools (config/workspace + toc, search, read, web_search, web_fetch, figure_*, index) and one prompt (book_agent_context). |
| 3 | Configure client: `.cursor/mcp.json`. One Python for all workspaces: `command` = path to `book_agent/.venv/bin/python`, `cwd` = `${workspaceFolder}`, `env.BOOK_AGENT_CONFIG` = `${workspaceFolder}/.book_agent.json`. See §4 D. |
| 4 | Optional: symlink `~/.cursor/rules/book-agent.mdc` → repo `.cursor/rules/book-agent.mdc` (or copy). Restart Cursor after config changes. |
| 5 | web_fetch with saveToSubdir: saves to `output_dir/<subdir>/<doc-slug>/<filename>.md`. See [TOOL_WEB_FETCH.md](TOOL_WEB_FETCH.md). |

README and [BOOK_AGENT_TOOLS.md](../BOOK_AGENT_TOOLS.md) point here for full MCP setup and usage.
