"""
Canonical list of book-agent tools for MCP and rules.
Use this so the MCP server and rules stay in sync: one place for name + description.
Policy ("when to use") lives in .cursor/rules; behavior lives in agent_tools and tools/*.
"""

from typing import Any

# Config/setup names for the rule's Python import block (not exposed as MCP tools).
# Order matches the rule: get_config is first (in TOOLS), then these, then TOOLS run_*.
RULE_CONFIG_IMPORTS: list[str] = [
    "get_document_path_for_agent",
    "get_book_path",
    "set_current_workspace",
    "add_document",
    "create_workspace",
    "add_document_to_workspace",
    "set_workspace_current_document",
    "set_current_book",
    "add_book",
    "set_output",
]

# MCP tool name, short description, arg names, and Python name in agent_tools (for rule import / sync).
# When adding a tool: add here, implement in agent_tools + tools/*, then run book-agent sync-rule.
TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_config",
        "description": "Return current book-agent config (documents, current workspace, resolved paths).",
        "args": [],
        "python_name": "get_config",
    },
    {
        "name": "toc",
        "description": "List table of contents. path: book folder or null for current document. depth: max depth (default 2).",
        "args": ["path?", "depth?"],
        "python_name": "run_toc",
    },
    {
        "name": "search",
        "description": "Search sections in the book by title. path: optional; query: required.",
        "args": ["path?", "query"],
        "python_name": "run_search",
    },
    {
        "name": "read",
        "description": "Read section content by section title (fuzzy match). path: optional; query: required.",
        "args": ["path?", "query"],
        "python_name": "run_read",
    },
    {
        "name": "web_search",
        "description": "Web search via Serper. query: required; num: max results (default 10). Requires SERPER_API_KEY.",
        "args": ["query", "num?"],
        "python_name": "run_web_search",
    },
    {
        "name": "web_fetch",
        "description": "Fetch URL content (default: Jina). url: required; backend: optional.",
        "args": ["url", "backend?"],
        "python_name": "run_web_fetch",
    },
    {
        "name": "figure_resolve",
        "description": "Resolve figure reference to file path. path: optional (book folder); figure_ref: required.",
        "args": ["path?", "figure_ref"],
        "python_name": "resolve_figure",
    },
    {
        "name": "figure_show",
        "description": "Figure path + prompt + optional base64 for agent. path: optional; figure_ref: required; no_image: optional.",
        "args": ["path?", "figure_ref", "no_image?"],
        "python_name": "get_figure_for_agent",
    },
    {
        "name": "index",
        "description": "Build index.json in the book folder. path: optional (current document if null).",
        "args": ["path?"],
        "python_name": "run_index",
    },
]
