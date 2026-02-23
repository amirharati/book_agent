# Design: MCP server for book-agent

**Scope:** Expose book-agent tools (toc, search, read, figure, config, web search, web fetch) via the Model Context Protocol so Cursor and other MCP clients can call them without running our Python/CLI directly. How to implement, how to configure in Cursor, and how to test (in Cursor and outside).

---

## 1. Goal

- **What:** An MCP server that exposes the same capabilities as `book_agent.agent_tools`: get config, toc, search, read, figure resolve/show, web search, web fetch.
- **Why:** Cursor (or another IDE / CLI client) can add the server once and use the tools over the protocol; useful when the client doesn’t run Python or when we want a single, consistent way to talk to book-agent from multiple apps.
- **Non-goal:** We do not change tool behavior; we only expose existing `run_*` functions as MCP tools.

---

## 2. Tools to expose

Map each book-agent API to one MCP tool (name and arguments):

| MCP tool name        | Description                          | Arguments                                                                 | Notes |
|----------------------|--------------------------------------|---------------------------------------------------------------------------|-------|
| `get_config`         | Return current config (resolved paths)| —                                                                         | |
| `toc`                | Table of contents                    | `path` (optional), `depth` (optional, default 2)                           | path = null → current document |
| `search`             | Search sections (book)               | `path` (optional), `query` (required)                                     | |
| `read`               | Read section content                 | `path` (optional), `query` (section title, required)                      | |
| `web_search`        | Web search (Serper)                  | `query` (required), `num` (optional, default 10)                           | |
| `web_fetch`          | Fetch URL (Jina)                     | `url` (required), `backend` (optional)                                    | |
| `figure_resolve`     | Resolve figure ref to path           | `path` (optional, book folder), `figure_ref` (required)                   | |
| `figure_show`        | Figure path + prompt + optional base64| `path` (optional), `figure_ref` (required), `no_image` (optional)           | for agent image injection |
| `index`              | Build index.json                     | `path` (optional)                                                         | |

All optional `path` arguments: when omitted, use current document from config (same as CLI/Python API). The server must load config from the same place as the rest of the app (e.g. `.book_agent.json` and `BOOK_AGENT_CONFIG` env).

### 2.1 Shared system for rules and MCP (avoid duplication)

Rules (`.cursor/rules/book-agent.mdc`) and the MCP server both describe and use the **same tools**. To keep them in sync without maintaining two separate lists:

- **Behavior:** Already shared. Both the rule (agent runs Python) and the MCP server call the same code in `book_agent.agent_tools` — so implementation is a single source of truth.
- **Tool list (name + description):** Keep a **single canonical registry** in code (e.g. `book_agent/tool_registry.py`) that lists each tool’s MCP name, short description, and argument names. The MCP server reads this registry to register tools with consistent names and descriptions. The rule can say “tools are: get_config, toc, search, read, run_web_search, run_web_fetch, resolve_figure, … (see BOOK_AGENT_TOOLS)” and we update the rule’s list only when we add a tool; the canonical definitions live in the registry so MCP and docs don’t drift.
- **Policy (“when to use”):** Lives only in the rule — e.g. “get config first”, “fetch default Jina”, “fall back if over limit”. The MCP server does not encode policy; it just exposes tools. So we don’t duplicate policy.

**Concrete approach:** The **only file** you add to is **`book_agent/tool_registry.py`**: add one dict to **`TOOLS`** (with `name`, `description`, `args`, `python_name`) for each new tool, or one name to **`RULE_CONFIG_IMPORTS`** for a new config/setup symbol in the rule. Then run **`book-agent sync-rule`**. The MCP server (when built) will import `TOOLS` and register each entry. The usage doc [BOOK_AGENT_TOOLS.md](../BOOK_AGENT_TOOLS.md) points to this registry as the canonical list. The rule’s full import list and prose tool list are generated from the registry only.

**Sync util:** Run **`book-agent sync-rule`** (or `python scripts/sync_rule_from_registry.py`) after changing the registry. It rewrites the rule’s “Tools (Python)” import list and the inline “Prefer book-agent tools (…)” list from `TOOLS`, so the rule and MCP share one source of truth.

**Prompts / “when to use”:** Right now policy lives only in the rule (manually). When we implement the MCP server, we will take care of sharing prompts so rule and MCP use the same “when to use” text (e.g. from the registry or a single doc that both consume).

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

**Restart:** Fully quit and reopen Cursor after changing MCP config so the server is picked up.

---

## 5. Testing in Cursor

1. **Implement** `book_agent/mcp_server.py` (and add `mcp` dependency) as in §3.
2. **Configure** `.cursor/mcp.json` (or global) with the `book-agent` server and **restart Cursor**.
3. **Verify in chat:** In a Cursor chat, confirm that MCP tools from “book-agent” appear (e.g. “book-agent: toc”, “book-agent: read”). Ask the agent to “show me the table of contents of the current book” or “search the book for regression” and check that it uses the MCP tools and returns sensible results.
4. **Check config:** Ask “what is the current book-agent config?” and confirm it matches `get_config()` (current workspace, document, output dir).
5. **Optional:** Turn off or rename the rule that injects Python `book_agent.agent_tools` so the agent is forced to use MCP for book-agent; then re-run the same prompts to ensure behavior is the same.

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
| 1 | Add optional dependency `mcp`; implement `book_agent/mcp_server.py` with FastMCP, stdio (and optionally streamable HTTP). |
| 2 | Expose tools: get_config, toc, search, read, web_search, web_fetch, figure_resolve, figure_show, index. |
| 3 | Configure Cursor: `.cursor/mcp.json` (or global) with command `python -m book_agent.mcp_server`, restart Cursor. |
| 4 | Test in Cursor: use chat to call MCP tools and compare with rule-based Python/CLI behavior. |
| 5 | Test outside: MCP Inspector (or another client) list and call tools; run at least get_config, toc, read, and optionally web_search/web_fetch. |

Once this is done, we can point to this doc from `docs/tasks.md` and from the README as the “MCP server” section.
