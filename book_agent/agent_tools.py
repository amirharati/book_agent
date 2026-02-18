"""
Single entry point for all book-agent tools. Use this for both CLI wiring and
programmatic/agent use. Implementations live in core, config, and tools/*.
"""

from book_agent.config import (
    add_book,
    add_document,
    add_document_to_workspace,
    create_workspace,
    get_book_path,
    get_config,
    get_document_path,
    get_document_path_for_agent,
    get_output_dir,
    get_workspace_dir,
    remove_document_from_workspace,
    set_current_book,
    set_current_workspace,
    set_output,
    set_workspace_current_document,
    set_workspace_output_subdir,
)
from book_agent.core import (
    _flatten_sections,
    get_section_content,
    load_index,
    list_toc,
)
from book_agent.tools.config import config_app
from book_agent.tools.figure import figure_app, resolve_figure, get_figure_for_agent
from book_agent.tools.index import run as run_index
from book_agent.tools.read import run as run_read
from book_agent.tools.search import run as run_search, search_sections
from book_agent.tools.toc import run as run_toc

__all__ = [
    # Config / workspace
    "get_config",
    "get_book_path",
    "get_document_path",
    "get_document_path_for_agent",
    "get_workspace_dir",
    "get_output_dir",
    "set_current_book",
    "set_current_workspace",
    "add_book",
    "add_document",
    "add_document_to_workspace",
    "remove_document_from_workspace",
    "create_workspace",
    "set_workspace_current_document",
    "set_workspace_output_subdir",
    "set_output",
    "config_app",
    # Primitives (index/sections)
    "load_index",
    "_flatten_sections",
    "list_toc",
    "search_sections",
    "get_section_content",
    # Run-style API (one per tool)
    "run_index",
    "run_toc",
    "run_search",
    "run_read",
    "resolve_figure",
    "get_figure_for_agent",
    # CLI subapps
    "figure_app",
]
