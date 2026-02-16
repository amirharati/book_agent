"""
Single entry point for all book-agent tools. Use this for both CLI wiring and
programmatic/agent use. Implementations live in core and tools/*.
"""

from book_agent.core import (
    _flatten_sections,
    get_section_content,
    load_index,
    list_toc,
)
from book_agent.tools.figure import figure_app, resolve_figure, get_figure_for_agent
from book_agent.tools.read import run as run_read
from book_agent.tools.search import run as run_search, search_sections
from book_agent.tools.toc import run as run_toc

__all__ = [
    # Primitives (index/sections)
    "load_index",
    "_flatten_sections",
    "list_toc",
    "search_sections",
    "get_section_content",
    # Run-style API (one per tool)
    "run_toc",
    "run_search",
    "run_read",
    "resolve_figure",
    "get_figure_for_agent",
    # CLI subapp
    "figure_app",
]
