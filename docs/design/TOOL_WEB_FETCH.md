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
- **Output:** Dict with at least `text` (str), optionally `title`, `url`, `error` (if failed), and `saved_path` (str or None). When a workspace output dir is set, the fetched document is saved to `{output_dir}/fetches/<slug>/content.md` and `saved_path` is set to that path.
- **No book path:** This tool does not use the current document. It does use the current workspace output dir (from config) for saving when available.

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
| **API** | `run_web_fetch(url, backend=None) -> dict` | Returns `{"text", "title?", "url", "error?", "saved_path?"}`. |
| **Output** | Main body text only (no HTML). Optional max length. When output dir set, also writes to `output_dir/fetches/<slug>/content.md`. | |

---

## 5. Plan (done)

1. ~~Add `book_agent/tools/web_fetch.py`~~ with backend registry. **jina** backend (default): GET `https://r.jina.ai/{url}`, return markdown. **simple** backend: GET + HTML text extraction.
2. Optional **bright_data** backend: register via `register_fetch_backend("bright_data", fn)` when you have code.
3. Wire in `agent_tools.py` and `cli.py` (`web-fetch` command).
4. Env: `WEB_FETCH_BACKEND` (default `jina`), optional `JINA_API_KEY` for higher rate limits.
5. Rule: one line for `run_web_fetch` when env has no fetch.

---

## 6. Save under output (implemented)

When the current workspace has an output dir (`get_config()["_resolved_output_dir"]` or `get_output_dir()`), a successful fetch is written to a file. **Parent directories are always created** with `path.parent.mkdir(parents=True, exist_ok=True)` before writing.

- **Path resolution:** Save path is always under the workspace output dir (`_resolved_output_dir` from config / `get_output_dir_path()`). No cwd or paths outside the workspace output.
- **Default (no save param):** `{output_dir}/fetches/<slug>/content.md`. Slug is derived from URL (netloc + path, sanitized, plus short hash).
- **Subdir-only save:** When `download_path` or `save_to_subdir` is set (e.g. `"fetched"`), it is treated as a **subdir name only**. The tool creates `{output_dir}/{subdir}/` and writes a file with an **auto-generated filename** derived from the URL or page title (e.g. `coursera-rlhf.md` from `https://www.coursera.org/articles/rlhf` or from the fetched `<title>`). The subdir is created if it does not exist. The agent/user does not supply the filename; the tool owns creating the subfolder and choosing the filename.
- **Content:** Markdown: title as `# Title` if present, then body text. Return dict includes `saved_path` with the resolved file path (or `saved_path: null` if no output dir or fetch failed).
- **No workspace:** If there is no current workspace or `_resolved_output_dir` is null, content is returned but no file is written; `saved_path` is None.
- **API:** `run_web_fetch(url, backend=None, download_path=None, save_to_subdir=None)`. CLI: `book-agent web-fetch <url> [--download-path subdir]`. MCP: `web_fetch(url, backend?, download_path?, downloadPath?, saveToSubdir?)`.

---

## 7. Later

- Optional summarization (LLM) of long pages.
- **trafilatura** as optional dependency for better extraction.
- **jina** backend for one-GET markdown without scraping.
