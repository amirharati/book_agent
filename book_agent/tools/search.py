"""
Search tool: find sections by title query. Independent, atomic.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from book_agent.config import get_document_path_for_agent
from book_agent.core import _flatten_sections, load_index
from book_agent.path_utils import resolve_book_path


def search_sections(index: Dict[str, Any], query: str) -> List[Dict]:
    """Search for sections containing the query string in their title."""
    query = query.lower().strip()
    all_sections = _flatten_sections(index.get("chapters", []))
    return [sec for sec in all_sections if query in sec["title"].lower()]


def run(path: Optional[Path] = None, query: str = "") -> List[Dict]:
    """Resolve path (or current document from config), load index, return matching sections. Raises ValueError if no path."""
    if path is None:
        path = get_document_path_for_agent(None)
        if path is None:
            raise ValueError("No document path: set current workspace and current document (config set-current-workspace, add-to-workspace, set-workspace-current) or pass path.")
    index_path, _ = resolve_book_path(path)
    index = load_index(index_path)
    return search_sections(index, query)
