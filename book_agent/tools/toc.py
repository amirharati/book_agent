"""
TOC tool: list table of contents for a book. Independent, atomic.
"""

from pathlib import Path
from typing import List

from book_agent.core import load_index, list_toc as core_list_toc
from book_agent.path_utils import resolve_book_path


def run(path: Path, depth: int = 2) -> List[str]:
    """Resolve path, load index, return formatted TOC lines. Raises ValueError if path invalid."""
    index_path, _ = resolve_book_path(path)
    index = load_index(index_path)
    return core_list_toc(index, max_depth=depth)


def list_toc(index, max_depth: int = 2) -> List[str]:
    """Format index as TOC lines (for API use)."""
    return core_list_toc(index, max_depth=max_depth)
