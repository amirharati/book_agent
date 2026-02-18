# Design: Config and workspace

**Scope:** A single config (table-like) plus tools and rules so the agent can **ask** “what is the current book and relevant info?” and **always stick to** that when using toc/search/read/figure and when writing outputs. Config can be updated in conversation (via tools) or manually.

---

## 1. Goal

- **One config file** holds: books (id → path), current book, and output paths (notebooks, etc.). Paths can be partial; tools resolve to actual locations.
- **Agent can retrieve** current book and relevant info via a tool (e.g. “what’s the current book?”).
- **All other tools** (toc, search, read, figure) **default to the current book** when no path is given; when writing (notebooks, summaries), the agent uses **configured output paths** only. So the agent always sticks to config.
- **Config is mutable:** Update in conversation (“we’re working on book xyz in folder_a”, “switch to book mackay”, “notebooks go to ../study-repo/notebooks”) via tools, or edit the file by hand. Output paths can point to another repo (e.g. a “study repo”).

---

## 2. Config schema

Single file (e.g. `.book_agent.json` in repo root, or under a workspace dir). Format:

| Key | Type | Description |
|-----|------|-------------|
| `books` | `object` | Map: book id (string) → path (string). Path can be partial (e.g. `ecef4396`, `book_projects/ecef4396`); tools resolve to the actual book folder. |
| `current_book` | `string \| null` | Book id from `books` that is “current”. If set, toc/search/read/figure use this when no path is passed. If `null`, commands require an explicit path. |
| `outputs` | `object` | Map: output type (e.g. `notebooks`, `summaries`) → directory path. Agent writes only under these. Paths can be outside repo (e.g. `../study-repo/notebooks`). |

**Example:**

```json
{
  "books": {
    "bishop": "book_projects/ecef4396",
    "mackay": "book_projects/mackay"
  },
  "current_book": "bishop",
  "outputs": {
    "notebooks": "notebooks",
    "summaries": "output/summaries"
  }
}
```

Optional later: `outputs.notebooks` could be `../my-study-repo/notebooks` so notebooks live in a different repo.

- **Defaults:** If file missing or key missing: `books: {}`, `current_book: null`, `outputs: { "notebooks": "notebooks" }` (or `output/notebooks`). Document the default.
- **Resolution:** Paths in `books` and `outputs` are relative to config file location (or cwd when config is loaded). Tools resolve `books` entries to a folder that contains `index.json` or the main `.md` (reuse `path_utils.resolve_book_path` semantics).

---

## 3. Config file location

- **Primary:** Look for `.book_agent.json` in current working directory, then in repo root (e.g. parent of `book_agent` package), then optional env `BOOK_AGENT_CONFIG` for explicit path. First found wins.
- **No config:** Tools that need a path (toc, search, read, figure) require an explicit path argument; no default. Get-config tool returns defaults and reports “no config file”.
- **Single file only** for v1; no merging of multiple config files.

---

## 4. Tools (config and resolution)

### 4.1 Get config (read-only)

- **API:** `get_config() -> dict`. Returns full config (with resolved paths for current book if set). If current book is set, include resolved book path so the agent knows exactly where it’s working. Include paths for `outputs`.
- **CLI:** `book-agent config show` — print current config (and resolved current book path).
- **Purpose:** Agent calls this to answer “what is the current book and relevant info?” and to know where to write.

### 4.2 Set current book

- **API:** `set_current_book(book_id: str) -> dict`. `book_id` must be in `books`; update config and save. Return updated config or error.
- **CLI:** `book-agent config set-current <book_id>`.
- **Purpose:** “We’re working on book xyz” / “switch to bishop”.

### 4.3 Add (or update) book

- **API:** `add_book(book_id: str, path: str) -> dict`. Add or overwrite entry in `books`; optionally resolve path and store resolved path. Save config. Return updated config or error.
- **CLI:** `book-agent config add-book <book_id> <path>`.
- **Purpose:** “Add book xyz from folder_a” (path can be partial; tool finds exact location).

### 4.4 Set output path

- **API:** `set_output(key: str, path: str) -> dict`. Set `outputs[key] = path`. Save config. E.g. `set_output("notebooks", "../study-repo/notebooks")`.
- **CLI:** `book-agent config set-output <key> <path>`.
- **Purpose:** “Notebooks go to …” or “outputs go to another repo”.

### 4.5 Resolve book path (for use by other tools)

- **API:** `get_book_path(book_id: str | None) -> Path | None`. If `book_id` is given, return resolved path for that book from config. If `book_id` is None, return resolved path for `current_book`. Return None if not found or no current book. This is used by toc/search/read/figure when they need a default path.
- **Not a separate “tool” for the agent** in the sense of a new CLI subcommand; it’s the internal way toc/search/read/figure get the default path. Optionally also exposed as `resolve_book(book_id?)` in agent_tools so the agent can get the path for a given book id.

---

## 5. How existing tools use config

- **toc, search, read, figure:** Each has an optional `path` (or equivalent) argument.  
  - If **path is provided**, use it (current behaviour).  
  - If **path is omitted** and config exists with `current_book` set, use `get_book_path(None)` and run with that path.  
  - If path is omitted and no current book (or no config), return a clear error: “No book path: set current book in config or pass path.”
- **Writing (notebooks, summaries):** Not implemented as tools yet. When they are, they will write only under `outputs.notebooks`, `outputs.summaries`, etc. Agent rules will say: “when creating notebooks or summaries, use the path from config (`get_config()['outputs'][...]`).”
- **Conversion (`convert -o`):** No change for v1; user still passes `-o` explicitly. Optional later: default `-o` from config (e.g. add book to config and set path to new folder).

---

## 6. Agent rules (Cursor rules)

Update `.cursor/rules/book-agent.mdc` (or equivalent) so that:

1. **Before using book tools:** The agent should get current context via `get_config()`. It can then answer “what is the current book?” from that.
2. **When using toc/search/read/figure:** If the user doesn’t specify a book/path, use the **current book** from config (i.e. call the tools without path, or with the path returned by get_config). If the user specifies a book or path, use that (override).
3. **When writing:** When creating or saving notebooks, summaries, or other artifacts, use only the **configured output paths** from config (e.g. `outputs.notebooks`). Do not write outside these.

This keeps the agent always sticking to the same book and output locations unless the user explicitly overrides.

---

## 7. CLI surface

- `book-agent config show` — print config and resolved current book path.
- `book-agent config set-current <book_id>` — set current book.
- `book-agent config add-book <book_id> <path>` — add or update a book.
- `book-agent config set-output <key> <path>` — set an output directory.

All config commands read/write the same config file (see §3). Optional: `book-agent config path` to print the path of the config file in use.

---

## 8. Implementation plan (high level)

1. **Config module** — Load/save `.book_agent.json`; resolve paths (reuse or call `path_utils.resolve_book_path` for book entries); return dict with defaults when file missing. Location logic: cwd, then repo root, then env.
2. **Config tools** — Implement `get_config`, `set_current_book`, `add_book`, `set_output`, `get_book_path` in a single module (e.g. `book_agent.config` or `book_agent.tools.config`). Keep tools atomic; config module has no Typer.
3. **CLI** — Add `config` Typer subapp with commands: show, set-current, add-book, set-output. Wire to config module.
4. **agent_tools** — Export `get_config`, `set_current_book`, `add_book`, `set_output`, `get_book_path` (and optionally `resolve_book` as alias). So the agent can get/set config and other tools can get default path.
5. **Existing tools (toc, search, read, figure)** — Add optional path argument; when path is None/omitted, call `get_book_path(None)` and use that; if None, return clear error. CLI commands: when path is omitted, same logic.
6. **Rules** — Update `.cursor/rules/book-agent.mdc` with §6 (get config first, stick to current book and output paths).
7. **Docs** — Update README and BOOK_AGENT_TOOLS.md: config file format, config commands, “current book” and “outputs” behaviour.

---

## 9. Open points / later

- **Multiple config files** (e.g. per workspace): not in v1.
- **Default `-o` for convert** from config: optional later.
- **Validation:** Optional schema check when loading config (e.g. books must be non-empty string; outputs paths must be strings).

---

## 10. Implemented: workspace-based model

The codebase now uses a **workspace-based** model (superseding the original single-file books/current_book/outputs schema).

### Main config (`.book_agent.json`)

| Key | Type | Description |
|-----|------|-------------|
| `documents` | `object` | Registry: document id (string) → path (string). Paths relative to config base. **Unique ids**; one document can be referenced by many workspaces. |
| `output_root` | `string` | Directory under config base where workspace folders live (default `outputs`). |
| `current_workspace` | `string \| null` | Active workspace id (folder name under `output_root`). |

### Workspace config (`<output_root>/<workspace_id>/.book_workspace.json`)

| Key | Type | Description |
|-----|------|-------------|
| `documents` | `array` | List of document ids in this workspace (references into main `documents`). No duplicates. |
| `current_document` | `string \| null` | Default document for toc/search/read when path is omitted. |
| `output_subdirs` | `object` | Optional: e.g. `{"notebooks": "notebooks", "summaries": "summaries"}` so writes go to subdirs under workspace root. |

### Resolution and APIs

- **Current document path:** `get_document_path_for_agent(doc_id=None)` uses current workspace → workspace config → `current_document` (or single doc if only one in workspace).
- **Output dir:** `get_output_dir(workspace_id, subdir_key)` → workspace root or `workspace_root / output_subdirs[key]`.
- **Uniqueness:** Document ids unique in registry; workspace ids unique (one folder per id); doc id appears at most once per workspace list.
- **Migration:** On load, if file has `books` / `current_book` / `outputs`, they are migrated to the new schema and the file is saved once.

### CLI (implemented)

- `config show` — main config + resolved workspace dir, workspace documents, current document path, output dir.
- `config set-current-workspace <id>`, `config add-document <id> <path>`, `config create-workspace <id>`, `config add-to-workspace <ws> <doc>`, `config remove-from-workspace <ws> <doc>`, `config set-workspace-current <ws> [doc]`, `config set-output-subdir <ws> <key> <subdir>`, `config path`.
- **Backward-compat:** `set-current`, `add-book`, `set-output` (alias to workspace behaviour).

### Index auto-create and versioning

- **Auto-create:** `resolve_book_path` in `path_utils` builds `index.json` when missing (using `resolve_folder_and_md` + `build_index` + `write_index`), so toc/search/read/figure and config resolution don’t fail when the index hasn’t been built yet.
- **Index version:** Each index JSON includes `index_version` (see `markdown_index.INDEX_VERSION`). When you change index schema or build logic, bump `INDEX_VERSION` in code. `load_index()` in `core` compares the file’s version to the current one; if the file’s version is missing or lower, it rebuilds the index and overwrites the file. That way old indices are refreshed after code updates.

---

**Status:** Implemented (workspace-based model). Original design (§1–9) described the earlier single-file schema; §10 reflects what is in code.  
**References:** `docs/tasks.md` §1.2, §2 (Phase B), §2.1 (orchestration).
