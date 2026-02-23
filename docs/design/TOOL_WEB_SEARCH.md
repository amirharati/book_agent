# Design: Web search tool

**Status:** Implemented and tested. Uses Serper.dev; requires `SERPER_API_KEY` (optional `.env`). CLI: `book-agent web-search "query"`; API: `run_web_search(query, num=10)`.

**Scope:** A book-agent tool that runs a **web search** (e.g. Google via Serper) and returns snippets/URLs. Used when the agent or user needs to look something up outside the book (definitions, recent papers, etc.). In Cursor we prefer the caller's search when available; this tool is for CLI and environments that don't have built-in search.

---

## 1. Goal

- **What:** One tool `run_web_search(query, num=10)` that calls an external search API and returns a list of results (title, link, snippet).
- **Why:** Lets the agent (or CLI user) look up terms, papers, or facts without leaving the book-agent workflow. Complements the *book* search (sections by title) which is already in `tools/search.py`.

---

## 2. Scope

- **Input:** Query string; optional `num` (max results, default 10).
- **Output:** List of dicts: `{"title", "link", "snippet"}` (and optionally position). Plain text summary for CLI; same structure for Python/agent.
- **No book path:** This tool does not use the current document; it's global web search. Config (e.g. API key) can still come from env or tools config.

---

## 3. Decisions

| Decision | Choice | Notes |
|----------|--------|--------|
| **Backend** | Serper.dev (Google Search API) | Fast, 2.5k free queries; API key from env `SERPER_API_KEY`. |
| **CLI** | `book-agent web-search "query" [--num N]` | No path argument. |
| **API** | `run_web_search(query, num=10) -> list[dict]` | Raises `ValueError` if API key missing or request fails. |
| **Key** | Env `SERPER_API_KEY` | Same pattern as OpenRouter; optional `.env` with python-dotenv. |

---

## 4. Plan

1. Add `book_agent/tools/web_search.py`: `run_web_search(query, num=10)` using Serper API (POST `https://google.serper.dev/search`, header `X-API-KEY`, body `{"q": query, "num": num}`). Parse `organic` array → list of `{title, link, snippet}`.
2. Wire in `agent_tools.py` and `cli.py` (new command `web-search`).
3. Document `SERPER_API_KEY` in README or LLM_BACKEND.md (env vars section).
4. Rule: one line in book-agent.mdc — "When you need to look something up outside the book and the environment has no search, use `run_web_search` (requires SERPER_API_KEY)."

---

## 5. Future: swappable backend

We can later support multiple backends (e.g. DuckDuckGo, Tavily) via config or env; for v1 a single backend (Serper) is enough.
