# Using book-agent

Config and outputs live next to **`.book_agent.json`**. With global MCP, that file is **`${workspaceFolder}/.book_agent.json`** for whichever folder you open in Cursor: install once, then use any book project.

---

## One-time setup

1. **Install** book-agent with MCP on one Python environment:

   ```bash
   pip install "book-agent[mcp]"
   ```

   From this repo:

   ```bash
   cd /path/to/book_agent && uv sync --extra mcp --extra env
   ```

2. **Register MCP globally** (merges into `~/.cursor/mcp.json`, keeps other servers):

   ```bash
   book-agent cursor install-mcp
   ```

   Use `--python /path/to/python` if Cursor should use a specific interpreter. Use `book-agent cursor print-mcp-json` to inspect the fragment without writing.

3. **Restart Cursor** fully.

4. **Global rule and optional skill** — run from your **`book_agent` clone root** so **`$PWD`** is that directory:

   ```bash
   cd /path/to/book_agent
   mkdir -p ~/.cursor/rules
   ln -sf "$PWD/.cursor/rules/book-agent.mdc" ~/.cursor/rules/book-agent.mdc
   ```

   Optional: same layout for the **`book-agent-artifacts`** skill (extra checklist for artifact paths):

   ```bash
   mkdir -p ~/.cursor/skills
   ln -sf "$PWD/.cursor/skills/book-agent-artifacts" ~/.cursor/skills/book-agent-artifacts
   ```

   Copy instead of symlink if you prefer. To limit rule or skill to one project only, keep files under that project’s **`.cursor/rules/`** or **`.cursor/skills/`** and skip the steps above.

   Opening the **`book_agent`** repo while the global rule symlink exists may load the policy twice; drop one copy if that is unwanted.

After setup, **book-agent** MCP should appear in **any** opened folder; **`outputs/`** and config are created under that workspace when tools run.

---

## Everyday use

1. Open the **book project** as the Cursor workspace.
2. Chat; the agent should use book-agent MCP per the rule (**`get_config`**, then **`add_document`**, **`create_workspace`**, …).
3. The first config-changing call can create **`.book_agent.json`** there when using **`BOOK_AGENT_CONFIG`** → **`${workspaceFolder}/.book_agent.json`**.
4. Paths in **`documents`** are relative to the directory that contains **`.book_agent.json`**, unless you pass an absolute path.

Generated files (notes, notebooks, etc.) belong under the workspace **outputs** tree via **`get_config`** → **`_resolved_output_dir`**; no separate manual layout step.

---

## Reference

### Outputs policy (agents)

Book-derived writes (summaries, notebooks, exports, images, logs, **`requirements*.txt`** / env files **for that session**, …) go **only** under **`_resolved_output_dir`** from **`get_config`**, not repo root or **`inputs/`**. No repo-root exception for dependency lists. Call **`get_config`** before the first write and again if the workspace may have changed. Subdirs sit **inside** that directory unless the user specifies otherwise.

Prefer **`toc` / `search` / `read`** with **`path`** omitted when config defines the current document.

### Config discovery

| Situation | Behavior |
|-----------|----------|
| **`BOOK_AGENT_CONFIG` set** | Load that file when it exists; if missing, start empty and write there on first save; do not fall back to another project’s config. |
| **Unset** | Walk upward from **`cwd`** for **`.book_agent.json`**; otherwise create **`cwd/.book_agent.json`** on first save. |

### Summary

| Goal | Action |
|------|--------|
| MCP in every folder | `book-agent cursor install-mcp`, restart Cursor |
| Policy | Symlink **`book-agent.mdc`** into **`~/.cursor/rules/`** |
| Optional skill | Symlink **`book-agent-artifacts`** into **`~/.cursor/skills/`** |
| Develop **book_agent** only | Project **`.cursor/mcp.json`** is enough; see [design/MCP_SERVER.md](design/MCP_SERVER.md) |

Further reading: [design/CONFIG_AND_WORKSPACE.md](design/CONFIG_AND_WORKSPACE.md), [design/MCP_SERVER.md](design/MCP_SERVER.md).
