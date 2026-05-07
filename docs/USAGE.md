# Using book-agent

Documentation index: **[overview.md](overview.md)**.

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

## Preparing a book from PDF (Marker server)

Book-agent expects a **folder with Markdown** (and optional **`index.json`**). To go from **PDF → Markdown** we use **[marker_server](https://github.com/amirharati/marker_server)** — a small **HTTP service** built on [Marker](https://github.com/datalab-to/marker) with a **web UI** to upload a PDF and download structured results (no giant base64 payloads in JSON; files are written to disk).

**What you get per conversion:** under the server’s **`outputs/<job_id>/`** layout (see that repo), typically **`document.md`**, **`document_meta.json`**, and an **`images/`** folder with paths in the Markdown pointing at **`images/...`**.

**Workflow:**

1. Install and run **marker_server** as documented in its [README](https://github.com/amirharati/marker_server/blob/main/README.md) (conda env, `python server_save_to_files.py --port …`, optional `GOOGLE_API_KEY` for LLM-assisted conversion).
2. Open **`/app`**, upload the PDF, run conversion, then **download** the job folder or ZIP (or use **`POST /marker/upload`** / **`POST /marker`** from its API).
3. Place the result **inside your book project** where you keep sources — e.g. **`inputs/<slug>/`** — so the folder contains the **`.md`** file and **`images/`** next to it (same relative layout marker_server produced).
4. In Cursor, register that folder with book-agent (**`add_document`**) using a path **relative to `.book_agent.json`** or absolute. On first use, **`index.json`** can be created automatically when the path is resolved, or run **`index`** explicitly.

**Alternative:** this repo’s CLI **`book-agent convert`** (PyMuPDF backend) converts PDFs without Marker; use whichever pipeline fits your quality and tooling needs.

---

## Everyday use

1. Open the **book project** as the Cursor workspace.
2. Chat; the agent should use book-agent MCP per the rule (**`get_config`**, then **`add_document`**, **`create_workspace`**, …).
3. The first config-changing call can create **`.book_agent.json`** there when using **`BOOK_AGENT_CONFIG`** → **`${workspaceFolder}/.book_agent.json`**.
4. Paths in **`documents`** are relative to the directory that contains **`.book_agent.json`**, unless you pass an absolute path.

Generated files (notebooks, notes, **`requirements*.txt`** for that session, etc.) belong under the workspace **outputs** tree via **`get_config`** → **`_resolved_output_dir`**; the agent should not put those at repo root.

---

## Example conversations

These are **what you might type**; the agent should call MCP tools (**`get_config`** first when setting up or writing) rather than only guessing paths. Replace **`inputs/mybook`** and ids with your real folder and names.

### Register a book and workspace (first time)

**You:** I put converted Markdown in **`inputs/bishop_ml`**. Register it as **`bishop`** and set up a workspace so we can work on it.

**Agent (expected behavior):** Calls **`get_config`**. If nothing is set, calls **`add_document`** (`doc_id`: `bishop`, `path`: `inputs/bishop_ml`), **`create_workspace`** (e.g. `bishop_study`), **`add_document_to_workspace`**, **`set_current_workspace`**, **`set_workspace_current_document`**. Then confirms resolved paths.

---

### Ask about the book

**You:** What does the book say about regularization in Chapter 3?

**Agent:** Let me find that section in the book. *[Looks up Chapter 3 via **`search`** / **`toc`**, then **`read`** on the right heading—omit **`path`** if the current document is already set.]*  
According to the text, the book defines regularization as [...] *(answer continues from the retrieved markdown).*

**You:** Search the book for “variational inference” and summarize the main idea.

**Agent:** *[Same pattern: **`search`** → **`read`** on the best match.]*  
In one sentence: the book’s main point is that [...]

---

### Create a notebook or notes under outputs

**You:** Create a Jupyter notebook that walks through the derivation in section 2.4 with small code examples. Put everything for this tutorial under the workspace output, including any **`requirements-notebook.txt`**.

**Agent:** I’ll pull section 2.4, then write the notebook and deps under your workspace output only—not at repo root. *[Behind the scenes: **`get_config`** → **`_resolved_output_dir`**; **`read`** for §2.4; create **`.ipynb`**, **`requirements-notebook.txt`**, any small **`.py`** helpers under that tree.]*  
Done—you should see something like **`outputs/<workspace>/tutorial_section_2_4.ipynb`** [...]

**You:** Save a Markdown summary of Chapter 1 under my study workspace output.

**Agent:** *[ **`get_config`**, then writes e.g. **`summary_ch01.md`** only under **`_resolved_output_dir`** … ]*

---

### Optional: web or another document

**You:** Fetch **`https://example.com/paper`** and save it next to my workspace notes.

**Agent:** I’ll fetch that and save it under the workspace output folder. *[ **`web_fetch`** with save-to-output when the tool supports it … ]*

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
| **PDF → Markdown** | [marker_server](https://github.com/amirharati/marker_server) (Marker); then **`add_document`** on the folder with **`document.md`** + **`images/`** |

Further reading: [design/CONFIG_AND_WORKSPACE.md](design/CONFIG_AND_WORKSPACE.md), [design/MCP_SERVER.md](design/MCP_SERVER.md).
