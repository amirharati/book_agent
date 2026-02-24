"""
Web fetch tool: fetch a URL and return main text (and optionally title).
Use when the agent or user needs the content of a specific page.
No book path. Backends: "jina" (default, r.jina.ai), "simple" (built-in), "bright_data" (optional).
When a workspace output dir is set, saves the fetched document under output_dir/fetches/<slug>/content.md.
"""

import hashlib
import os
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlparse

JINA_READER_BASE = "https://r.jina.ai/"
ENV_BACKEND = "WEB_FETCH_BACKEND"
ENV_JINA_API_KEY = "JINA_API_KEY"  # optional; higher rate limits with free key
DEFAULT_BACKEND = "jina"


class _SimpleHTMLTextExtractor(HTMLParser):
    """Extract visible text from HTML, skipping script/style."""

    def __init__(self) -> None:
        super().__init__()
        self._skip = False
        self._title = ""
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = True
        attrs_d = dict((k, v) for k, v in attrs if v)
        if tag == "meta" and attrs_d.get("property") == "og:title":
            self._title = (attrs_d.get("content") or "").strip()

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip = False
        if tag in ("p", "br", "div", "li", "tr"):
            self._parts.append(" ")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            s = data.strip()
            if s:
                self._parts.append(s)
        if not self._title and self._parts and len(self._parts) <= 2:
            # Often title is first text
            pass  # we'll set title from <title> if we see it
        # We don't track <title> in this simple parser; we could add it

    def get_text(self) -> str:
        raw = " ".join(self._parts)
        return re.sub(r"\s+", " ", raw).strip()

    def get_title(self) -> str:
        return self._title


def _simple_fetch(url: str, timeout: int = 15) -> Dict[str, Any]:
    """Fetch URL with urllib and extract text. No API key."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "book-agent/1.0 (web fetch)"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return {"url": url, "text": "", "title": "", "error": f"HTTP {e.code}: {e.reason}"}
    except urllib.error.URLError as e:
        return {"url": url, "text": "", "title": "", "error": str(e.reason)}
    except Exception as e:
        return {"url": url, "text": "", "title": "", "error": str(e)}

    parser = _SimpleHTMLTextExtractor()
    try:
        parser.feed(html)
    except Exception:
        pass
    text = parser.get_text()
    title = parser.get_title()
    if not title:
        m = re.search(r"<title[^>]*>([^<]+)</title>", html, re.I)
        if m:
            title = re.sub(r"\s+", " ", m.group(1)).strip()
    return {"url": url, "text": text[:100_000] if text else "", "title": title, "error": None}


def _jina_fetch(url: str, timeout: int = 25) -> Dict[str, Any]:
    """Fetch URL via Jina Reader (r.jina.ai). Returns markdown. No key required (20/min); optional JINA_API_KEY for 200/min."""
    # r.jina.ai/{url} — e.g. https://r.jina.ai/https://example.com
    jina_url = JINA_READER_BASE + url
    headers = {
        "User-Agent": "book-agent/1.0 (web fetch)",
        "X-Return-Format": "markdown",
    }
    api_key = os.environ.get(ENV_JINA_API_KEY)
    if api_key and api_key.strip():
        headers["Authorization"] = f"Bearer {api_key.strip()}"
    req = urllib.request.Request(jina_url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        return {"url": url, "text": "", "title": "", "error": f"Jina HTTP {e.code}: {body or e.reason}"}
    except urllib.error.URLError as e:
        return {"url": url, "text": "", "title": "", "error": str(e.reason)}
    except Exception as e:
        return {"url": url, "text": "", "title": "", "error": str(e)}
    # First line is often the title in Jina output
    lines = text.strip().split("\n")
    title = ""
    if lines and lines[0].startswith("# "):
        title = lines[0].lstrip("# ").strip()
    return {"url": url, "text": text[:500_000] if text else "", "title": title, "error": None}


# Registry: backend name -> callable(url: str) -> dict
_FETCH_BACKENDS: Dict[str, Callable[[str], Dict[str, Any]]] = {
    "jina": _jina_fetch,
    "simple": _simple_fetch,
}


def register_fetch_backend(name: str, fetch_fn: Callable[[str], Dict[str, Any]]) -> None:
    """Register a custom fetch backend (e.g. bright_data). fetch_fn(url) -> {text, title?, url, error?}."""
    _FETCH_BACKENDS[name] = fetch_fn


def _url_to_slug(url: str, max_len: int = 50) -> str:
    """Build a filesystem-safe subfolder name from URL. Same URL -> same slug; add short hash for uniqueness."""
    parsed = urlparse(url)
    netloc = (parsed.netloc or "url").replace(".", "_").lower()
    path = (parsed.path or "/").strip("/").replace("/", "_") or "index"
    raw = f"{netloc}_{path}"[: max_len * 2]
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", raw)[:max_len].strip("_") or "page"
    h = hashlib.md5(url.encode()).hexdigest()[:8]
    return f"{slug}_{h}"


def _doc_slug(url: str, max_len: int = 60) -> str:
    """Derive a short, human-readable per-document folder name from a URL.
    Uses host-short + last meaningful path segment(s) (e.g. huggingface-rlhf from https://huggingface.co/blog/rlhf).
    Deterministic: same URL always gives same slug."""
    parsed = urlparse(url or "")
    host = (parsed.netloc or "").lower()
    host = re.sub(r"^www\.", "", host)
    host = host.split(".")[0] if host else "page"
    path = (parsed.path or "/").strip("/")
    segments = [s for s in path.split("/") if s] if path else []
    if len(segments) >= 2:
        tail = segments[-1]
    elif len(segments) == 1:
        tail = segments[0]
    else:
        tail = ""
    tail = re.sub(r"\.(html?|php|aspx?|jsp|cgi|xml|json|pdf)$", "", tail, flags=re.IGNORECASE)
    if tail and tail.lower() != host:
        raw = f"{host}-{tail}"
    else:
        raw = host
    slug = re.sub(r"[^a-zA-Z0-9_-]", "-", raw).strip("-").lower()[:max_len] or "page"
    return slug


def _filename_from_title_or_url(url: str, title: Optional[str] = None, max_len: int = 80) -> str:
    """Derive a safe .md filename from page title (preferred) or URL. Called after fetch so title is available."""
    if title and title.strip():
        base = re.sub(r"[^a-zA-Z0-9\s_-]", "", title.strip())
        base = re.sub(r"\s+", "-", base).strip("-").lower()[: max_len - 4]
        if base:
            return f"{base}.md"
    parsed = urlparse(url or "")
    path = (parsed.path or "/").strip("/")
    if path:
        base = path.split("/")[-1]
    else:
        base = (parsed.netloc or "page").replace(".", "-").lower()
    base = re.sub(r"[^a-zA-Z0-9._-]", "-", base).strip("-")[: max_len - 4] or "page"
    return f"{base}.md"


def _subdir_only(value: str) -> str:
    """Treat save parameter as a single subdir name (e.g. 'fetched'); strip path segments and slashes."""
    segment = (value or "").strip().replace("\\", "/").strip("/").split("/")[0]
    return segment if segment else ""


import logging
import sys

_log = logging.getLogger("book_agent.web_fetch")


def _save_fetched_to_output(result: Dict[str, Any], download_path: Optional[str] = None) -> None:
    """If workspace output dir is set and fetch succeeded, save content. Path is always under _resolved_output_dir.
    When download_path (or saveToSubdir) is given, treat it as a base subdir only (e.g. 'fetched'). The tool
    adds a per-document subfolder derived from the URL (e.g. 'huggingface-rlhf') and a filename derived from
    the page title or URL. Final path: output_dir/<subdir>/<doc-slug>/<filename>.md
    (e.g. outputs/rlhf/fetched/huggingface-rlhf/introduction-to-rlhf.md).
    All folders are created automatically. Otherwise save to output_dir/fetches/<slug>/content.md."""
    _log.info("_save_fetched_to_output called: download_path=%r, has_error=%r, has_text=%r",
              download_path, bool(result.get("error")), bool(result.get("text")))
    if result.get("error"):
        _log.info("SKIP save: result has error: %s", result.get("error"))
        return
    if not result.get("text"):
        _log.info("SKIP save: result has no text")
        return
    try:
        from book_agent.config import get_output_dir_path

        out_dir = get_output_dir_path()
        _log.info("get_output_dir_path() returned: %r", out_dir)
    except Exception as exc:
        _log.warning("SKIP save: get_output_dir_path() raised: %s", exc)
        return
    if not out_dir:
        _log.info("SKIP save: out_dir is None/empty (no current workspace?)")
        return
    out_dir = Path(out_dir).resolve()
    _log.info("Resolved out_dir: %s", out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    title = (result.get("title") or "").strip()
    text = (result.get("text") or "").strip()
    body = f"# {title}\n\n{text}" if title and not (text.startswith("# ") if text else False) else text
    url = result.get("url") or ""

    if download_path and _subdir_only(download_path):
        subdir = _subdir_only(download_path)
        doc_folder = _doc_slug(url)
        save_dir = (out_dir / subdir / doc_folder).resolve()
        _log.info("Subdir mode: download_path=%r -> subdir=%r, doc_folder=%r, save_dir=%s",
                   download_path, subdir, doc_folder, save_dir)
        if not save_dir.is_relative_to(out_dir):
            _log.warning("SKIP save: save_dir %s is not under out_dir %s", save_dir, out_dir)
            return
        filename = _filename_from_title_or_url(url, title)
        content_path = save_dir / filename
        _log.info("Auto filename: %s -> content_path=%s", filename, content_path)
    else:
        slug = _url_to_slug(url)
        content_path = out_dir / "fetches" / slug / "content.md"
        _log.info("Default mode: slug=%s, content_path=%s", slug, content_path)

    _log.info("Creating parent dir: %s", content_path.parent)
    content_path.parent.mkdir(parents=True, exist_ok=True)
    _log.info("Writing %d bytes to %s", len(body), content_path)
    try:
        content_path.write_text(body, encoding="utf-8")
        _log.info("SUCCESS: wrote file %s", content_path)
    except OSError as exc:
        _log.error("FAILED to write file %s: %s", content_path, exc)
        return
    result["saved_path"] = str(content_path.resolve())


def run_web_fetch(
    url: str,
    backend: Optional[str] = None,
    download_path: Optional[str] = None,
    save_to_subdir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch a URL and return main text (and title). Uses the given backend or env WEB_FETCH_BACKEND or "jina".
    When a workspace output dir is set, can save the document under that dir. Path resolution uses only
    the workspace output dir (_resolved_output_dir from config); no cwd or paths outside it.

    Save behavior:
    - If download_path or save_to_subdir is given (e.g. "fetched"): treat it as a base subdir only. The tool
      creates output_dir/<subdir>/<doc-slug>/ (doc-slug derived from URL, e.g. huggingface-rlhf) and writes
      a file with a name derived from the page title or URL (e.g. introduction-to-rlhf.md). All dirs are
      created automatically. The caller does not need to know the per-document folder or filename.
    - If neither is given: save to output_dir/fetches/<slug>/content.md (default).
    - If there is no current workspace / no output dir: content is returned but no file is written; saved_path is None.

    Args:
        url: URL to fetch.
        backend: Backend name ("jina", "simple", "bright_data", etc.). If None, uses env WEB_FETCH_BACKEND or "jina".
        download_path: Optional subdir name under workspace output (e.g. "fetched"). Tool creates subdir and chooses filename from URL/title.
        save_to_subdir: Alias for download_path; same behavior.

    Returns:
        Dict with "text", "title", "url", "error" (if failed), and "saved_path" (path to saved file, or None).
    """
    url = (url or "").strip()
    if not url:
        return {"url": "", "text": "", "title": "", "error": "Empty URL", "saved_path": None}

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    name = backend or os.environ.get(ENV_BACKEND) or DEFAULT_BACKEND
    if name not in _FETCH_BACKENDS:
        return {
            "url": url,
            "text": "",
            "title": "",
            "error": f"Unknown fetch backend: {name}. Available: {list(_FETCH_BACKENDS)}",
            "saved_path": None,
        }

    result = _FETCH_BACKENDS[name](url)
    result.setdefault("saved_path", None)
    subdir_arg = download_path or save_to_subdir
    _save_fetched_to_output(result, download_path=subdir_arg)
    return result
