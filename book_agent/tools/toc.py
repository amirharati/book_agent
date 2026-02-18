"""
TOC tool: list table of contents for a book. Independent, atomic.
"""

from pathlib import Path
from typing import List, Optional

from book_agent.config import get_document_path_for_agent
from book_agent.core import load_index, list_toc as core_list_toc
from book_agent.path_utils import resolve_book_path


def run(path: Optional[Path] = None, depth: int = 2) -> List[str]:
    """Resolve path (or current document from config), load index, return TOC lines. Raises ValueError if no path."""
    if path is None:
        path = get_document_path_for_agent(None)
        if path is None:
            raise ValueError("No document path: set current workspace and current document (config set-current-workspace, add-to-workspace, set-workspace-current) or pass path.")
    index_path, _ = resolve_book_path(path)
    index = load_index(index_path)
    return core_list_toc(index, max_depth=depth)


def list_toc(index, max_depth: int = 2) -> List[str]:
    """Format index as TOC lines (for API use)."""
    return core_list_toc(index, max_depth=max_depth)
