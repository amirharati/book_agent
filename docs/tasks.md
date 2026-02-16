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

### 1.2 Config / workspace (to add)

| Tool / concept | Purpose |
|----------------|--------|
| **Set input root** | Where book projects (or papers) live. Agent must not read/write outside this. Start with one root (e.g. `book_projects/`). |
| **Set output root** | Where generated artifacts go (notebooks, summaries, exports). Keeps outputs separate and predictable. |
| **Set current book/paper** | Which single book (or paper) is “active.” All toc/search/read operate on this unless overridden. Supports “more than one” later; for now one is enough. |

These can be env vars, a small config file, or CLI flags—no need to specify implementation here.

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

**Phase A — Add basic tools (one at a time, single book)**  
1. Add **image/figure** tool → design doc, then implement.  
2. Add **math** tool → design doc, then implement.  
3. Add **web search** → design doc, then implement.  
4. Add **web fetch** → design doc, then implement.  
(Optional later: image generation.)

**Phase B — Structure & config (still single book)**  
5. Add **config / workspace**: input root, output root, current book/paper.  
6. **Restructure repo**: clear layout (input, output, code, rules/prompts). Align config with it.  
7. **Agent workflow / orchestration**: Use toc, search, read, and figure together when answering questions or demonstrating a point (e.g. in a notebook). See §2.1 below.

**Phase C — Multi-doc testing**  
8. Test on **several books/papers**; fix indexing and tool behaviour.  
9. Stabilize and document conventions.

**Then**  
10. **MCP** when the tool set is stable (v1).

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

| Tool | Doc | Status |
|------|-----|--------|
| Image / figure | [docs/design/TOOL_IMAGE_FIGURE.md](design/TOOL_IMAGE_FIGURE.md) | done (v1) |
| Math | (next) | — |
| Web search | (next) | — |
| Web fetch | (next) | — |

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
