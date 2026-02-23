"""
Web fetch tool: fetch a URL and return main text (and optionally title).
Use when the agent or user needs the content of a specific page.
No book path. Backends: "jina" (default, r.jina.ai), "simple" (built-in), "bright_data" (optional).
"""

import os
import re
import urllib.error
import urllib.request
from html.parser import HTMLParser
from typing import Any, Callable, Dict, Optional

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


def run_web_fetch(
    url: str,
    backend: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch a URL and return main text (and title). Uses the given backend or env WEB_FETCH_BACKEND or "simple".

    Args:
        url: URL to fetch.
        backend: Backend name ("jina", "simple", "bright_data", etc.). If None, uses env WEB_FETCH_BACKEND or "jina".

    Returns:
        Dict with "text", "title", "url", and optionally "error" (if something failed).
    """
    url = (url or "").strip()
    if not url:
        return {"url": "", "text": "", "title": "", "error": "Empty URL"}

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    name = backend or os.environ.get(ENV_BACKEND) or DEFAULT_BACKEND
    if name not in _FETCH_BACKENDS:
        return {
            "url": url,
            "text": "",
            "title": "",
            "error": f"Unknown fetch backend: {name}. Available: {list(_FETCH_BACKENDS)}",
        }

    return _FETCH_BACKENDS[name](url)
