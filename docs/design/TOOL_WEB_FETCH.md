# Design: Web fetch tool

**Status:** Implemented and tested. Default backend **Jina** (r.jina.ai); optional `JINA_API_KEY` for higher rate limits. Supports PDF URLs. CLI: `book-agent web-fetch <url>`; API: `run_web_fetch(url)`.

**Scope:** A book-agent tool that **fetches a URL** and returns main text (and optionally metadata). Used when the agent or user needs the content of a specific page (blog, paper abstract, etc.). In Cursor we prefer the caller's fetch when available; this tool is for CLI and environments that don't have built-in fetch.

---

## 1. Goal

- **What:** One tool `run_web_fetch(url, ...)` that fetches a URL and returns extracted text (and optionally title/summary).
- **Why:** Complements web search: search returns links; fetch returns the page content so the agent can combine it with book content.

---

## 2. Scope

- **Input:** URL (string); optional params (e.g. max_length, backend name).
- **Output:** Dict with at least `text` (str), optionally `title`, `url`, `error` (if failed). Plain text or structured for agent.
- **No book path:** This tool does not use the current document.

---

## 3. Backends (swappable)

| Backend | Description | Config / limits |
|---------|-------------|-----------------|
| **jina** (default) | Jina Reader: `https://r.jina.ai/<url>` returns clean markdown. | No key needed (20 req/min). Optional `JINA_API_KEY` for 200/min. |
| **simple** | Built-in: GET URL, extract text from HTML (no API key). Good for many static pages. | None. May fail on JS-heavy or paywalled sites. |
| **bright_data** | User's existing Bright Data integration (paste working code). | User's API key / config. |
| **trafilatura** (future) | Local Python lib: excellent article extraction, no API. | None; add as optional dependency. |

**Default:** **jina** — good extraction, no key required, optional key for higher rate limits.

**Alternatives to Bright Data** (if you want to avoid them later):
- **Jina Reader** (r.jina.ai) — Free tier, returns markdown. Single GET to `https://r.jina.ai/{url}`.
- **Trafilatura** (Python) — No service, no limits; best for article-style pages.
- **Firecrawl, Crawler.dev, ScraperAPI** — Paid/freemium with higher limits.

---

## 4. Decisions

| Decision | Choice | Notes |
|----------|--------|--------|
| **Default backend** | `jina` | Jina Reader (r.jina.ai); no key required. Optional `JINA_API_KEY` for higher limits. |
| **Other backends** | `simple`, `bright_data` | Set `WEB_FETCH_BACKEND=simple` or register Bright Data and set `WEB_FETCH_BACKEND=bright_data`. |
| **CLI** | `book-agent web-fetch <url> [--backend name]` | |
| **API** | `run_web_fetch(url, backend=None) -> dict` | Returns `{"text", "title?", "url", "error?"}`. |
| **Output** | Main body text only (no HTML). Optional max length. | |

---

## 5. Plan (done)

1. ~~Add `book_agent/tools/web_fetch.py`~~ with backend registry. **jina** backend (default): GET `https://r.jina.ai/{url}`, return markdown. **simple** backend: GET + HTML text extraction.
2. Optional **bright_data** backend: register via `register_fetch_backend("bright_data", fn)` when you have code.
3. Wire in `agent_tools.py` and `cli.py` (`web-fetch` command).
4. Env: `WEB_FETCH_BACKEND` (default `jina`), optional `JINA_API_KEY` for higher rate limits.
5. Rule: one line for `run_web_fetch` when env has no fetch.

---

## 6. Later

- Optional summarization (LLM) of long pages.
- **trafilatura** as optional dependency for better extraction.
- **jina** backend for one-GET markdown without scraping.
