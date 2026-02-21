"""
Search tool: find sections by query, searching in section content (and title) using index boundaries.
Results are in document order (sequential).
"""

from pathlib import Path
from typing import Any, Dict, List, Optional

from book_agent.config import get_document_path_for_agent
from book_agent.core import _flatten_sections, get_section_content, load_index
from book_agent.path_utils import resolve_book_path


def search_sections(index: Dict[str, Any], query: str) -> List[Dict]:
    """Search for sections containing the query string in their title only (no md_path)."""
    query = query.lower().strip()
    all_sections = _flatten_sections(index.get("chapters", []))
    return [sec for sec in all_sections if query in sec["title"].lower()]


def search_sections_in_content(
    index: Dict[str, Any], query: str, md_path: Path
) -> List[Dict]:
    """
    Search for sections containing the query in title or in section content.
    Uses index section boundaries (md_start_line..md_end_line) only; content is sequential.
    Returns matches sorted by md_start_line (document order).
    """
    query_lower = query.lower().strip()
    if not query_lower:
        return []
    all_sections = _flatten_sections(index.get("chapters", []))
    # Sort by start line so we search in document order
    all_sections = sorted(
        [s for s in all_sections if s.get("md_start_line") and s.get("md_end_line")],
        key=lambda s: (s["md_start_line"], s["md_end_line"]),
    )
    matches = []
    for sec in all_sections:
        if query_lower in (sec.get("title") or "").lower():
            matches.append(sec)
            continue
        content = get_section_content(sec, md_path)
        if query_lower in content.lower():
            matches.append(sec)
    return matches


def run(path: Optional[Path] = None, query: str = "") -> List[Dict]:
    """
    Resolve path (or current document from config), load index, search in section content
    (within index boundaries) and titles. Returns matching sections in document order.
    Raises ValueError if no path.
    """
    if path is None:
        path = get_document_path_for_agent(None)
        if path is None:
            raise ValueError(
                "No document path: set current workspace and current document "
                "(config set-current-workspace, add-to-workspace, set-workspace-current) or pass path."
            )
    index_path, md_path = resolve_book_path(path)
    index = load_index(index_path)
    return search_sections_in_content(index, query, md_path)
