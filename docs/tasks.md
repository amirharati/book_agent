# Book / Study Agent: Tools & Tasks

Clean list of tools (and why), config, and ordered steps **before** we add an MCP server. Update this doc as we go.

---

## 1. Tools

### 1.1 Current (v0)

| Tool | Purpose |
|------|--------|
| **index** | Build `index.json` from markdown + meta (TOC, page markers, headings). Needed so we can resolve “chapter X” / “section Y” to line ranges. |
| **toc** | List table of contents (chapters/sections + PDF pages). Lets agent see book structure and choose what to read. |
| **search** | Find sections by title/keywords. Lets agent locate “where is exponential family” before reading. |
| **read** | Return markdown text for a given section (by line range from index). Core “get content” for answering and composing. |

### 1.2 Config / workspace (done)

- **Main config** (`.book_agent.json`): **documents** registry (id → path), **output_root** (e.g. `outputs`), **current_workspace**. Document and workspace ids are user-chosen and unique.
- **Workspace config** (`output_root/<workspace_id>/.book_workspace.json`): **documents** (list of doc ids in this workspace), **current_document**, optional **output_subdirs**. One workspace can reference many documents; the same document can be in multiple workspaces.
- **Resolution:** toc/search/read/figure default to **current workspace**’s **current document** (or single doc if only one). Outputs go to workspace root (or `output_subdirs` key). Index is **auto-created** when missing so tools don’t fail.
- **CLI:** `config show`, `set-current-workspace`, `add-document`, `create-workspace`, `add-to-workspace`, `remove-from-workspace`, `set-workspace-current`, `set-output-subdir`; backward-compat: `set-current`, `add-book`, `set-output`.

### 1.3 Planned (first version before MCP)

| Tool | Reason |
|------|--------|
| **Image / figure** | Understand diagrams and figures referenced in the text (e.g. `![](_page_22_Figure_2.jpeg)`). Simple “describe image” or “read figure” is enough at first. |
| **Math** | Check or compute from equations in the book (e.g. run a formula, verify a step). Can be thin wrapper over existing notebook/code execution. |
| **Web search** | Look up something outside the book when the agent decides it’s needed (e.g. “latest paper on X”). Lightweight: search + return snippets/URLs. |
| **Web fetch** | Get text (or summary) of a URL. Complements search so the agent can use a specific page. |
| **Image generation** (optional) | Produce diagrams or study aids from descriptions. Lower priority than the above. |

We do **not** need full “researcher” agents for now; lightweight search + fetch is enough.

---

## 2. Steps before MCP (order)

We do **one tool/task at a time**. For each new tool: write a **design doc** (see §5) with decisions and plan, then implement after review.

**Order: fix structure first, then add more tools.** Config and workspace layout are in place; new tools use current workspace/document and output dir.

**Phase A — Basic tools (single book)**  
1. ~~Add **image/figure** tool~~ → done (v1).  
2. **Math**, **web search**, **web fetch** → deferred until after Phase B (design doc then implement when structure is ready).

**Phase B — Structure & config** ~~(still single book)~~  
3. ~~Add **config / workspace**~~ → **done**. Workspace-based model: main config (documents, output_root, current_workspace), per-workspace config under output root; tools to get/set config, create workspaces, add documents to workspaces. See [docs/design/CONFIG_AND_WORKSPACE.md](design/CONFIG_AND_WORKSPACE.md).  
4. ~~**Index auto-create**~~ → **done**. When index.json is missing, path resolution builds it so toc/search/read don’t fail.  
5. **Restructure repo** (optional): clear layout (input, output, code, rules). Output root already under config; can point to another repo later.  
6. **Agent workflow**: Get config first; toc/search/read/figure default to current document; write only to workspace output dir. Rules updated. See §2.1 below.

**Phase C — Multi-doc testing**  
7. Test on **several books/papers**; fix indexing and tool behaviour.  
8. Stabilize and document conventions.

#### Phase C test checklist (tick as you go)

- [ ] **Single doc, no config** — Run index/toc/search/read with explicit path on 1–2 book folders. Confirm index builds (and has `index_version`), toc/search/read work, figure resolve works if applicable.
- [ ] **Single doc per workspace** — For each doc: `add-document`, `create-workspace`, `add-to-workspace`, `set-workspace-current`. Run toc/search/read **without** path; confirm they use current document and output dir is workspace folder.
- [ ] **Workspace with 2+ documents** — One workspace, add two docs, `set-workspace-current <ws> <doc_a>`, run toc/read (doc_a); switch to `set-workspace-current <ws> <doc_b>`, run toc/read (doc_b). Confirm switching current document changes which book is used.
- [ ] **Same doc in two workspaces** — Same document id in two workspaces; switch `set-current-workspace`, run toc/read. Confirm same content, different output dir per workspace.
- [ ] **Bug fixes** — Log and fix any issues (toc depth/format, index build, read line ranges, figure paths, config/workspace resolution). Re-test after fixes.

**Phase D — Remaining tools (after structure is stable)**  
9. Add **math** tool → design doc, then implement.  
10. Add **web search** → design doc, then implement.  
11. Add **web fetch** → design doc, then implement.  
(Optional later: image generation.)

**Then**  
12. **MCP** when the tool set is stable (v1).

---

## 2.1 Agent workflow / orchestration

Today an agent (e.g. Cursor) can call the tools directly: `run_toc`, `run_search`, `run_read`, `resolve_figure`, `get_figure_for_agent` from `book_agent.agent_tools`. To use them **consistently** in a workflow (e.g. “answer this question about the book” or “add this figure to the notebook to illustrate the point”), we need a thin **orchestration** layer.

- **`.cursor/rules`** can act as that layer: rules tell the agent when to use which tool (e.g. “when answering about the book, search then read; when the section references a figure, resolve it and attach the image”). That’s a minimal, rule-based orchestrator.
- For something **more explicit** later: a small workflow API or MCP that composes the tools (e.g. “answer(book_path, question)” → search → read → resolve figures in content → return text + images), or documented protocols so any agent can repeat the same flow. No implementation required until we hit limits of rule-based orchestration.

---

## 3. Design docs (one per tool)

Before coding a new tool, we add a **single design doc** under `docs/design/` that captures:

- **Goal** — what the tool is for and why.
- **Scope** — in/out, one book for now.
- **Decisions** — e.g. CLI vs API, how paths work, failure behaviour.
- **Plan** — small steps to implement (no heavy implementation detail).

Design docs:

| Tool / area | Doc | Status |
|-------------|-----|--------|
| Image / figure | [docs/design/TOOL_IMAGE_FIGURE.md](design/TOOL_IMAGE_FIGURE.md) | done (v1) |
| **Config & workspace** | [docs/design/CONFIG_AND_WORKSPACE.md](design/CONFIG_AND_WORKSPACE.md) | done (workspace-based model implemented) |
| Math | (Phase D) | — |
| Web search | (Phase D) | — |
| Web fetch | (Phase D) | — |

---

## 4. Repo restructure (target, Phase B)

Keep this high-level; exact dir names can be decided when we do the restructure.

- **Input:** Dedicated area for book/paper projects (index, md, meta, figures). Config points here.
- **Output:** Dedicated area for generated notebooks, summaries, exports. Config points here.
- **Code:** Package and scripts (indexer, CLI, agent helpers). No input/output data under code.
- **Rules / prompts:** Cursor rules, prompt templates, agent instructions in one place.

---

## 5. Doc references

- **Usage (CLI + API):** `docs/BOOK_AGENT_TOOLS.md`  
- **Capabilities & roadmap:** `docs/AGENT_CAPABILITIES.md`  
- **Index / pipeline detail:** `docs/PLAN_NEXT_STEPS.md`
