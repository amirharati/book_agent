"""
Read tool: get markdown content of a section by title query. Independent, atomic.
"""

from pathlib import Path
from typing import Optional

from book_agent.config import get_document_path_for_agent
from book_agent.core import get_section_content, load_index, _flatten_sections
from book_agent.path_utils import resolve_book_path


def run(path: Optional[Path] = None, query: str = "") -> str:
    """
    Resolve path (or current document from config), find first section matching query, return content.
    Raises ValueError if no path or no section matches.
    """
    if path is None:
        path = get_document_path_for_agent(None)
        if path is None:
            raise ValueError("No document path: set current workspace and current document (config set-current-workspace, add-to-workspace, set-workspace-current) or pass path.")
    index_path, md_path = resolve_book_path(path)
    index = load_index(index_path)
    matches = [
        sec
        for sec in _flatten_sections(index.get("chapters", []))
        if query.lower().strip() in sec["title"].lower()
    ]
    if not matches:
        raise ValueError(f"No section found matching '{query}'")
    return get_section_content(matches[0], md_path)
