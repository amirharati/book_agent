# Book Agent

Use **Cursor** (or any MCP chat client) to **talk with your books**: add Markdown documents to a workspace, then ask for help on chapters, problems, demos, or full implementations—and compare or combine multiple sources as you add more material.

---

## Workflow

1. **Create a workspace** — One workspace per project or course (e.g. “ml-course”, “thesis-refs”).
2. **Add documents to it** — Each document is a **Markdown** book or paper (folder with `.md` and optional `index.json`). You can use your own PDF→Markdown pipeline (e.g. [Marker](https://github.com/datalab-to/marker)) or the built-in converter; **indexing** (table of contents, section lookup) is done by the tools—you just add the doc and the agent can index when needed.
3. **Chat with your book** — In Cursor (or another MCP client), you talk in natural language. The agent uses the tools to open the right sections, search, read, and optionally pull in web content, then answers, writes code, or drafts from the book.

No need to remember commands: you say things like “add this book”, “create a workspace”, “help me with Chapter 3”, “implement the algorithm from section 2.4”, and the agent uses the book-agent tools to do it.

---

## What you can do

- **Get help on a chapter or section** — “Explain section 5.2”, “What does the book say about regularization?”
- **Work through problems** — “I’m stuck on exercise 3.1”, “Walk me through the derivation in 2.3.”
- **Create demo code** — “Write a small script that demonstrates the idea in 4.1.”
- **Implement algorithms for real use** — “Turn the algorithm in section 6.3 into production-style code and add tests.”
- **Compare and combine sources** — Add several books or papers to the same workspace; ask to “compare how Bishop and Goodfellow treat this” or “combine the notation from both papers.”
- **More as we add tools** — Web fetch, search, and figure resolution are already there; new tools will extend what you can ask (e.g. quizzes, summaries, cross-references).

Details and full tool list: **[docs/BOOK_AGENT_TOOLS.md](docs/BOOK_AGENT_TOOLS.md)**. High-level plan: [PROJECT.md](PROJECT.md).


---

## Install

From the project root.

**With uv (recommended — one venv, no global install):**
```bash
uv sync --extra mcp --extra env
```
This creates `.venv/` in the repo and installs the MCP server and .env support. Use `.venv/bin/python` or `uv run` to run the CLI or MCP server.

**With pip (editable, all optional deps):**
```bash
pip install -e ".[env,mcp]"
```

**Minimal (core only):**
```bash
pip install -r requirements.txt
pip install -e .
```

**With dev deps (tests, lint):**
```bash
uv sync --extra dev --extra mcp --extra env
# or: pip install -e ".[dev,env,mcp]"
```

Dependencies are in `pyproject.toml` (core + optional `env`, `mcp`, `dev`).

---

## MCP server (Cursor and other clients)

To **chat with your book** from Cursor (or another MCP client), add the book-agent MCP server. It exposes all tools (create workspace, add document, toc, search, read, web_fetch, web_search, figure, index) so the agent can work with your workspace and documents without you running Python yourself.

### Install once, open any folder (recommended)

1. Install book-agent **with MCP** on one interpreter:

   ```bash
   pip install "book-agent[mcp]"
   ```

   Or clone this repo and run `uv sync --extra mcp --extra env`.

2. Merge Cursor’s **global** MCP config (safe to re-run; keeps other servers):

   ```bash
   book-agent cursor install-mcp
   ```

3. **Restart Cursor** fully.

4. Link the Cursor rule globally so every workspace sees the same policy (`get_config` first, MCP tool names). Prefer a **symlink** to the repo file (stays in sync after `book-agent sync-rule`):

   ```bash
   cd /path/to/book_agent   # your clone
   mkdir -p ~/.cursor/rules
   ln -sf "$PWD/.cursor/rules/book-agent.mdc" ~/.cursor/rules/book-agent.mdc
   ```

   See **[docs/USAGE.md](docs/USAGE.md)** for details, output policy, optional global skill, and alternatives (copy or project-only rule).

Optional: `book-agent cursor print-mcp-json` prints the JSON fragment; `book-agent cursor install-mcp --python /path/to/python` pins the interpreter. The **`book-agent-mcp`** command is also installed (same as `python -m book_agent.mcp_server`).

### Project-only or custom paths

If you prefer **`.cursor/mcp.json` only inside this repo**, or a hand-edited global file, use **`cwd`: `${workspaceFolder}`** and **`BOOK_AGENT_CONFIG`: `${workspaceFolder}/.book_agent.json`** so each opened folder gets its own config and `outputs/`. Example `command`: path to a venv Python that has `book-agent[mcp]` installed.

```json
{
  "mcpServers": {
    "book-agent": {
      "command": "/absolute/path/to/python-with-book-agent",
      "args": ["-m", "book_agent.mcp_server"],
      "cwd": "${workspaceFolder}",
      "env": { "BOOK_AGENT_CONFIG": "${workspaceFolder}/.book_agent.json" }
    }
  }
}
```

Full options and testing: [docs/design/MCP_SERVER.md](docs/design/MCP_SERVER.md).

**Companion rule:** `.cursor/rules/book-agent.mdc` — symlink into **`~/.cursor/rules/`** (recommended) or copy; per-project only is fine too.

**Tools exposed:** get_config, create_workspace, add_document, set_current_workspace, add_document_to_workspace, set_workspace_current_document, set_workspace_output_subdir, remove_document_from_workspace, add_book, set_current_book, set_output, toc, search, read, web_search, web_fetch, figure_resolve, figure_show, index. There is also a **book_agent_context** prompt that explains setup and “add a book” / “create workspace” to the model.

**Web fetch save:** When you pass `saveToSubdir` or `downloadPath` (e.g. `"fetched"`), the tool saves the fetched page under the current workspace output in a per-document folder with an auto-generated filename. See [docs/design/TOOL_WEB_FETCH.md](docs/design/TOOL_WEB_FETCH.md).

Full MCP setup, testing, and troubleshooting: **[docs/design/MCP_SERVER.md](docs/design/MCP_SERVER.md)**.

---

## CLI (run independently)

**Convert** a PDF to Markdown:

```bash
book-agent path/to/book.pdf -o book_projects/mybook
# or with explicit subcommand (if your install uses it):
book-agent convert path/to/book.pdf -o book_projects/mybook
```

Options:

- `-o, --output-dir` — Output root (e.g. `book_projects/<book_slug>`). Created if missing.
- `--slug` — Book slug (default: from PDF filename).
- `--no-split-chapters` — Do not write per-chapter files (ch01.md, …); only full.md (default: chapters are written when detected).
- `--no-page-markers` — Do not insert `<!-- page N -->` in Markdown.
- `--no-figures` — Do not extract images.
- `-b, --backend` — Backend: `pymupdf` (default).

Example:

```bash
book-agent example_books/mackaybook.pdf -o book_projects/mackaybook
book-agent example_books/somebook.pdf -o book_projects/mybook --slug mybook
```

Output layout under `book_projects/mybook/`:

```
book_projects/mybook/
├── md/
│   ├── full.md       # Full book Markdown (layout-aware paragraphs, <!-- page N -->)
│   └── ch01.md, ch02.md, ...   # One file per chapter (when detected)
├── figures/          # Extracted images (p1_fig1.png, ...)
├── index.json        # Chapter/page mapping (full + per-chapter ranges)
└── meta.json         # Title, source PDF, conversion date
```

- **Layout:** Text is grouped into lines and paragraphs (no more “one word per line”); headings are detected and emitted as `## ...`.
- **Chapters:** By default, chapter starts (e.g. “Chapter 1”, “28 Model Comparison…”) are detected and per-chapter files are written. Use `--no-split-chapters` to get only `full.md`. See [docs/LAYOUT_AND_CHAPTERS.md](docs/LAYOUT_AND_CHAPTERS.md) for details.

**Index and read from a book project** (folder with `index.json` + `.md`):

```bash
book-agent index book_projects/mybook                    # build/rebuild index.json
book-agent toc book_projects/mybook                      # table of contents
book-agent search "regression" book_projects/mybook      # find sections by title
book-agent read "1.1 Example" book_projects/mybook       # print section markdown
```

See **[docs/BOOK_AGENT_TOOLS.md](docs/BOOK_AGENT_TOOLS.md)** for options and for AI/agent usage.

---

## Library (call programmatically)

Use the same conversion from Python and chain with other tools:

```python
from book_agent import convert_pdf_to_markdown

result = convert_pdf_to_markdown(
    "path/to/book.pdf",
    "books/mybook",
    book_slug="mybook",
    extract_figures=True,
    page_markers_in_md=True,
)

if result.success:
    print(result.message)
    print("Full MD:", result.full_md_path)
    print("Figures:", result.figure_count)
else:
    print("Errors:", result.errors)
```

With custom options:

```python
from book_agent import convert_pdf_to_markdown

result = convert_pdf_to_markdown(
    "book.pdf",
    "books/out",
    split_by_chapter=False,
    page_markers_in_md=True,
    extract_figures=True,
    backend="pymupdf",
)
```

---

## Backends

| Backend   | Description                          |
|----------|--------------------------------------|
| `pymupdf` | Default. Layout-aware text (lines + paragraphs), heading detection, figures, page markers, chapter detection and per-chapter files (ch01.md, …), index and meta. |

See [docs/LAYOUT_AND_CHAPTERS.md](docs/LAYOUT_AND_CHAPTERS.md) for layout extraction and chapter splitting.

---

## Development

- Run CLI as module: `python -m book_agent.cli book.pdf -o book_projects/out`
- Run tests: `pytest` (after `pip install -e ".[dev]"`)

---

## See also

- **[docs/overview.md](docs/overview.md)** — Map of `docs/` (USAGE, tools, design, backlog, archive).
- **[docs/BOOK_AGENT_TOOLS.md](docs/BOOK_AGENT_TOOLS.md)** — Full usage for CLI and AI (Python API and MCP); config, toc, search, read, web_fetch, figures.
- **[docs/design/MCP_SERVER.md](docs/design/MCP_SERVER.md)** — MCP install, config (same repo vs other project), and troubleshooting.
