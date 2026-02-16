"""
Read tool: get markdown content of a section by title query. Independent, atomic.
"""

from pathlib import Path

from book_agent.core import get_section_content, load_index, _flatten_sections
from book_agent.path_utils import resolve_book_path


def run(path: Path, query: str) -> str:
    """
    Resolve path, find first section matching query, return its content.
    Raises ValueError if path invalid or no section matches.
    """
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
