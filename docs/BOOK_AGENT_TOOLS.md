# Book Agent Tools: Usage Guide

This document describes how to use the book-agent **toc**, **search**, and **read** tools—for both **humans** (CLI) and **AI agents** (CLI or Python API).

---

## Prerequisites

- A **book project folder** that contains:
  - `index.json` (built with `book-agent index <path>`)
  - At least one `.md` file (the full book or chapter markdown)
- Path can be the **folder**, the **index.json** file, or the **.md** file; the tool resolves to the folder and finds `index.json` and the main `.md` automatically.
- If the folder has a `.md` file but **no index yet**, run **`book-agent index <path>`** (or use `run_index(path)` from `agent_tools`) to build `index.json` first; then toc/search/read will work.

### Config (optional)

A **main config** file (`.book_agent.json`; location via cwd, repo root, or env `BOOK_AGENT_CONFIG`) defines:

- **documents** — registry of document id → path (book/paper folders). Ids are unique and user-chosen.
- **output_root** — directory where **workspaces** live (default `outputs`). Each workspace is a folder `output_root/<workspace_id>/` with an optional `.book_workspace.json` listing which documents belong to that workspace and the **current document** for toc/search/read.
- **current_workspace** — which workspace is active.

If you set a current workspace and that workspace has a current document (or a single document), you can omit the path argument for toc/search/read/figure and they will use that document. Outputs go to the workspace folder (or a subdir set via `output_subdirs` in the workspace config).  
**CLI:** `book-agent config show`, `set-current-workspace`, `add-document`, `create-workspace`, `add-to-workspace`, `set-workspace-current`, `set-output-subdir`; backward-compat: `set-current`, `add-book`, `set-output`. The agent (Cursor rule) will ask when current workspace or current document is missing.

---

## 1. Human usage (CLI)

Run commands with:

```bash
python -m book_agent.cli <command> [args] [path]
# or, if installed: book-agent <command> [args] [path]
```

Use a path that points to the book project (folder, `index.json`, or `.md`), e.g. `book_projects/ecef4396` or `book_projects/ecef4396/index.json`.

---

### 1.1 Table of contents: `toc`

**Purpose:** List the book’s table of contents with section titles and PDF page numbers.

**Command:**

```bash
book-agent toc <path> [--depth N]
```

**Options:**

| Option | Short | Default | Description |
|--------|--------|---------|-------------|
| `--depth` | `-d` | `2` | Maximum depth to show (1 = top-level only, 2 = chapters + main sections, 3+ = deeper subsections). |

**Example:**

```bash
book-agent toc book_projects/ecef4396
book-agent toc book_projects/ecef4396 --depth 1
```

**Example output:**

```
- Preface (p. 6)
- Mathematical notation (p. 9)
- 1 Introduction (p. 18)
  - 1.1 Example: Polynomial Curve Fitting (p. 22)
  - 1.2 Probability Theory (p. 30)
  ...
- 9 Mixture Models and EM (p. 440)
  - 9.1 K -means Clustering (p. 441)
  - 9.3 An Alternative View of EM (p. 455)
  ...
```

---

### 1.2 Search sections: `search`

**Purpose:** Find all sections whose **title** contains a given string (case-insensitive). Use this to discover section names and locations before reading.

**Command:**

```bash
book-agent search "<query>" <path>
```

**Example:**

```bash
book-agent search "regression" book_projects/ecef4396
```

**Example output:**

```
[3] 1.5.5 Loss functions for regression (p. 64)
    Line: 1456-1521
[3] 4.3.2 Logistic regression (p. 222)
    Line: 5587-5629
[2] 4.5 Bayesian Logistic Regression (p. 234)
    Line: 5940-5944
...
[3] 9.3.4 EM for Bayesian linear regression (p. 464)
    Line: 11441-11487
```

- `[N]` = depth (1 = chapter, 2 = section, 3 = subsection).
- `(p. N)` = PDF page (0-based in the file).
- `Line: start-end` = markdown line range (1-based) for that section.

If nothing matches, the command prints: `No matches found.`

---

### 1.3 Read section content: `read`

**Purpose:** Output the **full markdown text** of one section. The section is chosen by **fuzzy match** on title: the first search match is used. If there are multiple matches, the first is shown and a note is printed to stderr.

**Command:**

```bash
book-agent read "<section title or substring>" <path>
```

**Examples:**

```bash
book-agent read "1.1 Example" book_projects/ecef4396
book-agent read "9.3.4 EM for Bayesian linear regression" book_projects/ecef4396
book-agent read "Polynomial Curve Fitting" book_projects/ecef4396
```

**Example output (excerpt):**

```
# 1.1. Example: Polynomial Curve Fitting

We begin by introducing a simple regression problem...
...
```

If no section matches, the command prints an error and exits with code 1.

---

### 1.4 Figures: `figure resolve` and `figure show`

**Purpose:** Resolve a figure reference (e.g. from markdown `![](_page_22_Figure_2.jpeg)`) to a path, and optionally get path + prompt + base64 image for **agent image-injection test** (so the agent can try to “see” the figure directly).

**Commands:**

```bash
book-agent figure resolve <figure_ref> [path]
book-agent figure show <figure_ref> [path] [--no-image]
```

- **figure_ref:** Filename (e.g. `_page_0_Figure_0.jpeg`) or markdown-style `![](_page_0_Figure_0.jpeg)`.
- **show** prints `PATH:`, `PROMPT:`, and optionally `IMAGE_BASE64` / `IMAGE_MEDIA_TYPE` for testing whether the calling agent (e.g. Cursor) can receive and understand the image. Use `--no-image` to get only path + prompt.

**Examples:**

```bash
book-agent figure resolve _page_0_Figure_0.jpeg book_projects/ecef4396
book-agent figure show '![](_page_22_Figure_2.jpeg)' book_projects/ecef4396
# Or omit path to use current book from config
```

If the figure file is missing, the command prints an error and exits with code 1.

---

## 2. AI usage

An agent can use these tools in two ways:

1. **Shell/CLI** – run `book-agent toc/search/read` and parse stdout/stderr.
2. **Python API** – import `book_agent.agent_tools` and call functions directly (same data, no subprocess).

Below: tool semantics, then CLI vs API.

---

### 2.1 Tool semantics (for AI)

| Tool | When to use | Inputs | Outputs |
|------|-------------|--------|--------|
| **toc** | Need the book’s structure (chapters/sections and PDF pages). | Path to book project; optional max depth. | List of lines: `- Title (p. N)` with indentation by depth. |
| **search** | Need to find which sections mention a topic (by title). | Path + query string. | List of matches: title, depth, PDF page, md line range. Use this before **read** to pick a section. |
| **read** | Need the full text of a specific section. | Path + section title (or substring). | Raw markdown of that section (heading + body). If multiple matches, first match is used. |

**Suggested agent flow:**

1. **toc** (optional) – get high-level structure.
2. **search** with a topic – get candidate sections and their line ranges.
3. **read** with the chosen section title (or a substring that uniquely identifies it) – get content to answer or reason over.

---

### 2.2 Using the CLI from an agent

Run the CLI as a subprocess and read stdout/stderr.

**Path rules:**

- `path` can be: book folder, `index.json`, or `.md` inside the folder.
- Always pass an absolute or relative path to that folder/file; the tool will find `index.json` and the main `.md` in that folder.

**Examples (pseudo-shell):**

```bash
# Table of contents, depth 2
book-agent toc /path/to/book_projects/ecef4396 --depth 2

# Search by topic
book-agent search "regression" /path/to/book_projects/ecef4396

# Read a specific section (use exact or unique substring from search results)
book-agent read "9.3.4 EM for Bayesian linear regression" /path/to/book_projects/ecef4396
```

**Parsing:**

- **toc:** One section per line; leading spaces = depth; `(p. N)` = PDF page.
- **search:** Blocks of 2 lines per match: `[depth] Title (p. N)` and `    Line: start-end`.
- **read:** Entire stdout is the section markdown (no extra wrapper).

**Errors:**

- Missing `index.json` or no `.md` in folder → message to stderr, non-zero exit.
- **read** with no matching section → message to stderr, exit code 1.

---

### 2.3 Using the Python API (agent_tools)

For in-process agents, use the same logic via Python.

**Resolving the book path:**  
The CLI helper `_resolve_book_path(path)` is internal. From Python you must pass:

- **index_path:** path to `index.json`.
- **md_path:** path to the main `.md` file (e.g. the largest `.md` in the folder).

**Functions:**

```python
from pathlib import Path
from book_agent.agent_tools import load_index, search_sections, get_section_content, list_toc

# 1. Load index (you must know index.json path)
index_path = Path("book_projects/ecef4396/index.json")
index = load_index(index_path)

# 2. Table of contents (list of strings)
toc_lines = list_toc(index, max_depth=2)
for line in toc_lines:
    print(line)

# 3. Search sections by title substring (returns list of dicts)
matches = search_sections(index, "regression")
# Each match: {"title", "level", "pdf_page", "md_start_line", "md_end_line", "path"}

# 4. Read section content (need the section dict + path to .md file)
md_path = Path("book_projects/ecef4396/<book>.md")
section = matches[0]
content = get_section_content(section, md_path)
print(content)
```

**Return shapes:**

- **list_toc(index, max_depth=2)** → `List[str]`, e.g. `["- Preface (p. 6)", "  - 1.1 ...", ...]`.
- **search_sections(index, query)** → `List[Dict]`; each dict has `title`, `level`, `pdf_page`, `md_start_line`, `md_end_line`, `path`.
- **get_section_content(section, md_path)** → `str` (full section markdown).

**Note:** The Python API does not resolve “book folder → index + md”; the caller must provide both paths (e.g. by scanning the folder for `index.json` and the largest `.md`).

---

## 3. Quick reference

| Goal | Human (CLI) | AI (CLI) | AI (Python) |
|------|-------------|----------|-------------|
| Build index.json | `book-agent index [path]` | Same | `run_index(Path(path))` or `run_index(None)` for current book |
| See structure + pages | `book-agent toc [path] [-d N]` | Same | `run_toc(path=None, depth=N)` or `list_toc(load_index(index_path), max_depth=N)` |
| Find sections by topic | `book-agent search "query" <path>` | Same | `search_sections(load_index(index_path), "query")` |
| Get section text | `book-agent read "title" <path>` | Same | `get_section_content(section, md_path)` after search |
| Resolve figure | `book-agent figure resolve <ref> [path]` | Same | `resolve_figure(book_folder, ref)` |
| Figure for agent (inject test) | `book-agent figure show <ref> [path]` | Same | `get_figure_for_agent(book_folder, ref)` |

---

## 4. Index and path conventions

- **index.json** is built by `book-agent index <path>`. It contains `chapters` (nested by `children`), `page_count`, `annotations`, and optional `diagnostics`.
- **PDF page numbers** in the index and in tool output are 0-based (first page = 0 in the PDF file).
- **Markdown line numbers** are 1-based; ranges are `[md_start_line, md_end_line)` (start inclusive, end exclusive).
- The **path** argument for the CLI can be the book folder, `index.json`, or a `.md` file in that folder; the tool infers the folder and finds `index.json` and the main `.md` automatically.
