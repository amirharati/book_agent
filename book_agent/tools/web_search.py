"""
Web search tool: run a web search via Serper.dev (Google Search API).
Use when the agent or user needs to look something up outside the book.
No book path; requires SERPER_API_KEY in env.
"""

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List

SERPER_API_URL = "https://google.serper.dev/search"
ENV_API_KEY = "SERPER_API_KEY"


def run_web_search(query: str, num: int = 10) -> List[Dict[str, Any]]:
    """
    Run a web search via Serper.dev. Returns list of {"title", "link", "snippet"}.

    Args:
        query: Search query string.
        num: Max number of organic results (default 10).

    Returns:
        List of result dicts with title, link, snippet (and position if present).

    Raises:
        ValueError: If SERPER_API_KEY is missing or the API request fails.
    """
    query = (query or "").strip()
    if not query:
        return []

    api_key = os.environ.get(ENV_API_KEY)
    if not api_key or not api_key.strip():
        try:
            from dotenv import load_dotenv
            load_dotenv()
            api_key = os.environ.get(ENV_API_KEY)
        except ImportError:
            pass
    if not api_key or not api_key.strip():
        raise ValueError(
            f"{ENV_API_KEY} is not set. Set it in the environment or .env to use web search."
        )

    payload = {"q": query, "num": min(max(1, num), 100)}
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        SERPER_API_URL,
        data=body,
        headers={
            "X-API-KEY": api_key.strip(),
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else ""
        raise ValueError(f"Serper API error ({e.code}): {body or e.reason}") from e
    except urllib.error.URLError as e:
        raise ValueError(f"Serper request failed: {e.reason}") from e
    except json.JSONDecodeError as e:
        raise ValueError(f"Serper response not valid JSON: {e}") from e

    organic = data.get("organic") or []
    results: List[Dict[str, Any]] = []
    for item in organic[:num]:
        results.append({
            "title": item.get("title") or "",
            "link": item.get("link") or "",
            "snippet": item.get("snippet") or "",
            "position": item.get("position"),
        })
    return results
