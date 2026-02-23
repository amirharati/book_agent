# External models and agents as tools

**Scope:** Using other models, APIs, or specialized agents as the *implementation* of a book-agent tool (e.g. math, web search, image generation). We don’t have to build everything in-house.

---

## 1. Options for “who does the work”

When we add a tool (math, web search, image gen, etc.), we can implement it in several ways:

| Approach | What it means | Example |
|----------|----------------|--------|
| **Same LLM, different model** | Use our existing `book_agent.llm` with a model that’s strong at that task. Per-tool model is already supported via `LLM_MODELS` in `book_agent_tools.py`. | Math tool: `complete(..., model="openai/o1-mini")` or a dedicated math model on OpenRouter. |
| **External API** | The tool is a thin wrapper: prepare input → call external API → return result. | Web search: SerpAPI, DuckDuckGo. Math: Wolfram Alpha, SymPy (local). Image: DALL·E, Stability. |
| **Specialized agent as a tool** | The tool calls another “agent” (subprocess, API, or MCP server) that does the full task and returns text/artifacts. Our tool just invokes it and passes through the result. | Math agent (e.g. a service that takes “solve this equation” and returns steps). Code agent (e.g. run code in a sandbox and return output). |

All of these are **tools** from the book-agent’s point of view: the Cursor agent (or CLI user) calls `run_math`, `run_web_search`, etc.; what runs under the hood can be our LLM, an API, or another agent.

---

## 2. What we already support

- **Per-tool LLM model:** In `book_agent_tools.py`, set `LLM_MODELS = {"default": "...", "toc": "...", "math": "..."}`. When a tool calls `get_client(tool="math")`, it gets the model configured for `"math"`. So we can already use a **different (e.g. math-specialist) model** for a math tool without any new infrastructure.
- **New backends:** `book_agent.llm` has a registry; we can add another backend (e.g. a provider that only does math or code) and use it from a tool.

So for a **math tool**, we can today:
- Implement it as: “extract equation/query from user → call `complete(prompt, tool="math", model=…)` with a math-strong model,” and configure `LLM_MODELS["math"]` to that model.
- Or implement it as: “call Wolfram Alpha (or SymPy) API” and return the result.
- Or implement it as: “call an external math-agent API” (if we have one) and return the agent’s answer.

Same idea for **web search** (our LLM with search context vs. SerpAPI vs. a “researcher” agent), **image generation** (our LLM + image API vs. a dedicated image agent), etc.

---

## 3. Specialized agents for math (and others)

There are **specialized agents and APIs** for math, code, and search:

- **Math:** Dedicated math models (e.g. on OpenRouter), **Wolfram Alpha** API, **SymPy** (local Python), or custom “math agent” services. For study use, “explain/verify this step” or “plot this” often needs either a good general model with a math prompt or a symbolic/numeric API.
- **Code execution:** Sandboxed runners (e.g. E2B, Modal, or local subprocess) so a “code” tool can run snippets and return output. Some “code agents” expose an API we could call as a tool.
- **Search:** SerpAPI, DuckDuckGo, Tavily, etc. “Researcher” agents often wrap search + fetch; we can use the same APIs ourselves in a simple `run_web_search` / `run_web_fetch` tool.

Recommendation when designing a tool (e.g. math):

1. **Define the interface** (inputs/outputs) in a design doc.
2. **Choose the backend:** “Our LLM with model X”, “external API”, or “external agent API”. Prefer the simplest thing that works (e.g. our LLM + `LLM_MODELS["math"]` for explanation; Wolfram/SymPy only if we need symbolic/numeric).
3. **Implement the tool** as a thin wrapper: resolve path/config → build request → call backend → return result. Same pattern as figure/toc/read.

---

## 4. Caller’s tools vs our tools (when to add search, fetch, etc.)

When the **calling environment** (e.g. Cursor) already provides web search, fetch, or similar, the agent can use those. Adding our own `run_web_search` / `run_web_fetch` in that context would duplicate capability and **cost** (our API keys + Cursor’s usage). So:

- **Prefer the caller’s tools when available.** In Cursor, use Cursor’s search and fetch; don’t add book-agent web search/fetch just to use them inside Cursor. Saves money and keeps one source of truth.
- **Add our own for environments that don’t have them.** CLI users, MCP-only agents, or other IDEs may have no built-in search/fetch. There we implement `run_web_search` / `run_web_fetch` so the workflow is complete.

Same idea for other “environment might already have it” tools: if the caller has it, use theirs; if not, we provide it. The rule (e.g. in book-agent.mdc) can say: “Use Cursor’s search/fetch when in Cursor; when using CLI or an environment without search/fetch, use book-agent run_web_search / run_web_fetch if available.”

---

## 5. Summary

- **Yes, we can use other models or agents as tools.** The book-agent’s tool is just “run_xyz(input) → output”. The implementation can be our LLM (with a per-tool model), an external API, or another agent’s API.
- **Prefer caller’s tools when available.** In Cursor, use Cursor’s search/fetch; add our own web search/fetch (and similar) mainly for CLI and environments that don’t have them — saves cost and avoids duplication.
- **Math:** We can use a math-capable model via `LLM_MODELS["math"]`, or a math API/agent, or both (e.g. LLM for explanation, API for symbolic solve). Design doc should decide.
- **Other tools:** Same idea for web search, web fetch, image generation, etc.: pick the best backend when we do implement; only implement when the caller doesn’t already provide an equivalent.
