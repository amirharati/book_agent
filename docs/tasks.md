# Book / Study Agent: Tools & Tasks

Clean list of tools (and why), config, and ordered steps **before** we add an MCP server. Update this doc as we go.

---

## Where we are now (review)

**Implemented and in use:**

- **Core tools:** `index`, `toc`, `search`, `read`, **figure** (resolve + show for agent image injection), **web search** (Serper), **web fetch** (Jina). All in `book_agent.agent_tools` and CLI (`book-agent`). Both web search and web fetch are implemented and tested (Serper API key + Jina optional key for higher limits).
- **Config & workspace:** Main config `.book_agent.json` (documents, output_root, current_workspace); per-workspace `.book_workspace.json` under `outputs/<workspace_id>/`. Path resolution defaults to current workspace's current document; index **auto-created** when missing.
- **Agent integration:** `.cursor/rules/book-agent.mdc` — get config first, ask when workspace/document missing, use run_toc/run_search/run_read/resolve_figure; write only to `_resolved_output_dir`. Markdown/math rules for generated content ($...$ / $$...$$).
- **Indexing:** `markdown_index` builds `index.json` from .md + optional meta; supports TOC table scoping, full-doc heading fallback, nesting from heading level. Tested on Bishop, Mackay, Sutton, papers (e.g. f95377a6, f4417c66).

**Current usage (from repo):**

- **Config:** 9 documents (bishop, mackay, sutton, effective_people, ml_algo_trading, how_to_buy, evidence_based_ta, trade_like_wizard, financial_ml); current workspace **trading** with 5 docs, current document **ml_algo_trading**. Outputs under `outputs/trading/` (e.g. `sepa_algorithmic.md`, `workspace_guide.md`).
- **Phase C:** Multi-doc workspace and real chapter-level work are in use. Formal checklist in §2 below; tick when each scenario is re-verified.

**Not yet done:** Math (Phase D); optional repo restructure; MCP (after v1 stable).

---

## 1. Tools

### 1.1 Current (v0 / v1)

| Tool | Purpose |
|------|--------|
| **index** | Build `index.json` from markdown + meta (TOC, page markers, headings). Needed so we can resolve “chapter X” / “section Y” to line ranges. |
| **toc** | List table of contents (chapters/sections + PDF pages). Lets agent see book structure and choose what to read. |
| **search** | Find sections by title/keywords. Lets agent locate “where is exponential family” before reading. |
| **read** | Return markdown text for a given section (by line range from index). Core "get content" for answering and composing. |
| **figure** | Resolve ref (e.g. `![](_page_22_Figure_2.jpeg)`) to path; optional path + prompt + base64 for agent. See [TOOL_IMAGE_FIGURE.md](design/TOOL_IMAGE_FIGURE.md). |
| **web search** | Web search via Serper.dev (Google). `run_web_search(query, num)`. Requires `SERPER_API_KEY`. See [TOOL_WEB_SEARCH.md](design/TOOL_WEB_SEARCH.md). |
| **web fetch** | Fetch URL → text/markdown via Jina Reader (default). `run_web_fetch(url)`. Optional `JINA_API_KEY` for higher rate limits. PDFs supported. See [TOOL_WEB_FETCH.md](design/TOOL_WEB_FETCH.md). |

### 1.2 Config / workspace (done)

- **Main config** (`.book_agent.json`): **documents** registry (id → path), **output_root** (e.g. `outputs`), **current_workspace**. Document and workspace ids are user-chosen and unique.
- **Workspace config** (`output_root/<workspace_id>/.book_workspace.json`): **documents** (list of doc ids in this workspace), **current_document**, optional **output_subdirs**. One workspace can reference many documents; the same document can be in multiple workspaces.
- **Resolution:** toc/search/read/figure default to **current workspace**’s **current document** (or single doc if only one). Web search and web fetch do not use book path. Outputs go to workspace root (or `output_subdirs` key). Index is **auto-created** when missing so tools don’t fail.
- **CLI:** `config show`, `set-current-workspace`, `add-document`, `create-workspace`, `add-to-workspace`, `remove-from-workspace`, `set-workspace-current`, `set-output-subdir`; backward-compat: `set-current`, `add-book`, `set-output`.

### 1.3 Planned (first version before MCP)

| Tool | Reason |
|------|--------|
| **Math** | Check or compute from equations in the book (e.g. run a formula, verify a step). Can be thin wrapper over existing notebook/code execution. |
| **Image generation** (optional) | Produce diagrams or study aids from descriptions. Lower priority than the above. |

We do **not** need full “researcher” agents for now; lightweight search + fetch is enough.

---


### 1.4 MVP for studying (what makes it useful)

For **studying a book** (find topics, read sections, use figures, write notes/summaries), the **minimum** is:

| Need | Tool | Status |
|------|------|--------|
| See structure & jump to sections | **toc** + **search** | Done |
| Read section content | **read** | Done |
| Use figures in explanations | **figure** (resolve + show) | Done |
| Know where to read/write | **config** (workspace, current document, output dir) | Done |
| Build index for a new book | **index** (incl. auto-create) | Done |

So the **current set is already MVP** for core study flow: navigate → read → cite figures → write to workspace.

**Next tools that increase usefulness (pick by priority):**

| Tool | Why useful for studying | Status |
|------|-------------------------|--------|
| **Web search** | Look up terms, recent papers, definitions without leaving the agent. | **Done** (Serper). |
| **Web fetch** | Pull in a specific URL (e.g. blog post, paper, PDF) to combine with book content. | **Done** (Jina; PDFs supported). |
| **Math** | Run or check equations from the book (e.g. \"verify this step\", \"plot this function\"). | Design doc + safe execution (e.g. sandbox or notebook kernel). |

Recommendation: **math** next when needed; web search and web fetch are implemented and tested.

**Using other models or agents as tools:** We can implement any tool by calling a **different model** (e.g. math-specialist via \`LLM_MODELS[\"math\"]\`), an **external API** (Wolfram, SerpAPI, etc.), or a **specialized agent** (API or subprocess). The tool is a thin wrapper: input → call backend → return result. See [docs/design/EXTERNAL_MODELS_AND_AGENTS_AS_TOOLS.md](design/EXTERNAL_MODELS_AND_AGENTS_AS_TOOLS.md).

**Caller’s tools vs ours:** When the environment (e.g. Cursor) already has search/fetch, use those — saves cost and avoids duplicate APIs. Add book-agent web search/fetch (and similar) **for CLI and other environments that don’t have them**, not for Cursor.

### 1.5 Later / optional tools (easy to add when we want)

The codebase is set up so **adding a new tool is straightforward**:

- **One module:** \`book_agent/tools/<name>.py\` with a \`run(path=None, ...)\` (use \`get_document_path_for_agent(None)\` and \`resolve_book_path\` when you need the book folder). Optionally a \`typer.Typer()\` subapp for CLI.
- **Wire once:** Export \`run_*\` and subapp from \`book_agent/agent_tools.py\`; in \`cli.py\` add a command or \`app.add_typer(xxx_app, name=\"xxx\")\`.
- **Rule:** For any non-trivial tool, add a design doc under \`docs/design/\` first (goal, scope, decisions, plan).

**Examples we can add later:** Image generation (diagrams, study aids from descriptions), **infographic** (section → one-page visual), **flashcards**, **quiz** from a chapter. No need to implement until we want them; the pattern is the same.

### 1.6 How to add a new tool (for implementers)

1. **Design doc** (for anything beyond a trivial script): Add \`docs/design/TOOL_<NAME>.md\` with goal, scope, decisions, plan. See e.g. \`TOOL_IMAGE_FIGURE.md\`, \`CONFIG_AND_WORKSPACE.md\`.
2. **Module:** Create \`book_agent/tools/<name>.py\`. Implement \`run(path: Optional[Path] = None, ...)\` using \`get_document_path_for_agent(None)\` when \`path is None\`, then \`resolve_book_path(path)\` if the tool needs the book folder. Return data or raise \`ValueError\`. Optionally add \`xxx_app = typer.Typer(...)\` for CLI subcommands.
3. **Agent API:** In \`book_agent/agent_tools.py\`, import and add to \`__all__\`.
4. **CLI:** In \`book_agent/cli.py\`, add \`@app.command(\"name\")\` (and \`_run_tool(run_<name>, ...)\`) or \`app.add_typer(xxx_app, name=\"xxx\")\`.
5. **Rules:** If needed, add one line in \`.cursor/rules/book-agent.mdc\` for when the agent should call the new tool.

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
9. ~~Add **web search**~~ → **done** (Serper).  
10. ~~Add **web fetch**~~ → **done** (Jina; optional JINA_API_KEY for higher limits).  
11. Add **math** tool → design doc, then implement.  
(Optional later: image generation.)

**Then**  
12. **MCP** when the tool set is stable (v1). See [docs/design/MCP_SERVER.md](design/MCP_SERVER.md) for implementation, Cursor config, and testing (in Cursor and outside, e.g. MCP Inspector).

---

## 2.1 Agent workflow / orchestration

Today an agent (e.g. Cursor) can call the tools directly: `run_toc`, `run_search`, `run_read`, `run_web_search`, `run_web_fetch`, `resolve_figure`, `get_figure_for_agent` from `book_agent.agent_tools`. To use them **consistently** in a workflow (e.g. “answer this question about the book” or “add this figure to the notebook to illustrate the point”), we need a thin **orchestration** layer.

- **`.cursor/rules`** can act as that layer: rules tell the agent when to use which tool (e.g. “when answering about the book, search then read; when the section references a figure, resolve it and attach the image”). That’s a minimal, rule-based orchestrator.
- For something **more explicit** later: a small workflow API or MCP that composes the tools (e.g. “answer(book_path, question)” → search → read → resolve figures in content → return text + images), or documented protocols so any agent can repeat the same flow. No implementation required until we hit limits of rule-based orchestration.

**Rule vs MCP in Cursor:** In Cursor you can use **either** (1) the rule-based flow — agent runs Python (`book_agent.agent_tools`) or CLI (`book-agent toc/search/read`) — or (2) an MCP server exposing the same tools; Cursor would then call them as MCP tools. **MCP does not add much inside Cursor itself** (the rule already works; same outcome). **MCP adds value by making the tools available to other clients:** other IDEs, CLI-based MCP clients, or custom apps can connect to our MCP server and use toc/search/read/figure without running our Python or CLI. So: rule = simple, works in Cursor; MCP = same tools, more flexible so you can use them from command-line tools, other editors, or any MCP client.

**Writing code or notebooks over MCP:** Our MCP only exposes *book* tools (toc, search, read, figure, config). The **client** (Cursor, another IDE, or app) is responsible for actually writing files and running code. In Cursor, the agent uses our MCP for book content and **Cursor’s own tools** (edit file, run terminal) to create the notebook or script — no extra “coding agent” needed. Only if you use a **minimal MCP client** that has no file/code capabilities would we need to add something: e.g. a `write_artifact(path, content)` tool (server writes to workspace) or a call to an external coding agent. For Cursor and most IDEs, the client is the coding agent.

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
| **External models / agents as tools** | [docs/design/EXTERNAL_MODELS_AND_AGENTS_AS_TOOLS.md](design/EXTERNAL_MODELS_AND_AGENTS_AS_TOOLS.md) | design note (use other models, APIs, or agents to implement a tool) |
| Math | (Phase D) | — |
| Web search | [docs/design/TOOL_WEB_SEARCH.md](design/TOOL_WEB_SEARCH.md) | done (Serper) |
| Web fetch | [docs/design/TOOL_WEB_FETCH.md](design/TOOL_WEB_FETCH.md) | done (Jina default; Bright Data pluggable) |
| **MCP server** | [docs/design/MCP_SERVER.md](design/MCP_SERVER.md) | design: implement, Cursor config, test in Cursor and outside (e.g. MCP Inspector) |

---

## 4. Repo restructure (target, Phase B)

Keep this high-level; exact dir names can be decided when we do the restructure.

- **Input:** Dedicated area for book/paper projects (index, md, meta, figures). Config points here.
- **Output:** Dedicated area for generated notebooks, summaries, exports. Config points here.
- **Code:** Package and scripts (indexer, CLI, agent helpers). No input/output data under code.
- **Rules / prompts:** Cursor rules, prompt templates, agent instructions in one place.

---

## 5. Doc references

- **Usage (CLI + API):** [docs/BOOK_AGENT_TOOLS.md](BOOK_AGENT_TOOLS.md) — how to use current tools.  
- **Capabilities & roadmap:** [docs/AGENT_CAPABILITIES.md](AGENT_CAPABILITIES.md) — search-read-answer loop, future phases (multi-hop, coding, PDF linking).  
- **Index / pipeline detail:** [docs/PLAN_NEXT_STEPS.md](PLAN_NEXT_STEPS.md) — historical; index pipeline and design.  
- **Single source of truth** for tool list, MVP, phases, and how to add tools: this doc (tasks.md).  
- **MCP server:** [docs/design/MCP_SERVER.md](design/MCP_SERVER.md) — how to implement, configure in Cursor, and test (in Cursor and outside).
