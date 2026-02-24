"""
Canonical list of book-agent tools for MCP and rules.
Use this so the MCP server and rules stay in sync: one place for name + description.
Policy ("when to use") lives in .cursor/rules; behavior lives in agent_tools and tools/*.
"""

from typing import Any

# Config/setup names for the rule's Python import block (not in TOOLS: path helpers only).
# TOOLS includes get_config + all run_* + all config/workspace mutators; this list is the rest for the rule import.
RULE_CONFIG_IMPORTS: list[str] = [
    "get_document_path_for_agent",
    "get_book_path",
]

# MCP tool name, short description, arg names, and Python name in agent_tools (for rule import / sync).
# When adding a tool: add here, implement in agent_tools + tools/*, then run book-agent sync-rule.
TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_config",
        "description": "Return current book-agent config (documents, current workspace, resolved paths). Call first when user wants to work on a book or set up workspace.",
        "args": [],
        "python_name": "get_config",
    },
    {
        "name": "create_workspace",
        "description": "Create a new workspace. Use when user says 'create workspace', 'make a workspace', 'set up project'. workspace_id: unique id (e.g. 'my_project').",
        "args": ["workspace_id"],
        "python_name": "create_workspace",
    },
    {
        "name": "add_document",
        "description": "Add a book/document to the registry. Use when user says 'add a book', 'add this book', 'register document'. doc_id: short id (e.g. 'bishop'); path: path to book folder (with index.json or .md).",
        "args": ["doc_id", "path"],
        "python_name": "add_document",
    },
    {
        "name": "set_current_workspace",
        "description": "Set the current workspace. Use when user wants to switch or set workspace. workspace_id must already exist (create with create_workspace).",
        "args": ["workspace_id"],
        "python_name": "set_current_workspace",
    },
    {
        "name": "add_document_to_workspace",
        "description": "Add a document to a workspace's list. Use after add_document when user wants this book in a workspace. doc_id must be in registry.",
        "args": ["workspace_id", "doc_id"],
        "python_name": "add_document_to_workspace",
    },
    {
        "name": "set_workspace_current_document",
        "description": "Set which document is current in a workspace. Use when user wants to 'work on' a specific book in the workspace. doc_id: document id or null to clear.",
        "args": ["workspace_id", "doc_id?"],
        "python_name": "set_workspace_current_document",
    },
    {
        "name": "set_workspace_output_subdir",
        "description": "Set an output subdirectory for a workspace (e.g. notebooks). workspace_id, key (e.g. 'notebooks'), subdir name.",
        "args": ["workspace_id", "key", "subdir"],
        "python_name": "set_workspace_output_subdir",
    },
    {
        "name": "remove_document_from_workspace",
        "description": "Remove a document from a workspace's list.",
        "args": ["workspace_id", "doc_id"],
        "python_name": "remove_document_from_workspace",
    },
    {
        "name": "add_book",
        "description": "Backward-compat: add document and set as current in same-named workspace. Use when user says 'add a book' and want it as current. book_id and path.",
        "args": ["book_id", "path"],
        "python_name": "add_book",
    },
    {
        "name": "set_current_book",
        "description": "Backward-compat: set current workspace and current document to book_id (creates workspace if needed).",
        "args": ["book_id"],
        "python_name": "set_current_book",
    },
    {
        "name": "set_output",
        "description": "Backward-compat: set output subdir for current workspace. key and path (subdir name).",
        "args": ["key", "path"],
        "python_name": "set_output",
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
        "description": "Fetch URL content (default: Jina). To save: pass a subdir name (e.g. downloadPath or saveToSubdir = 'fetched'). Tool creates that subdir under workspace output, derives filename from URL/title (e.g. coursera-rlhf.md), writes content there. Path is only under workspace output. url: required; backend, download_path, downloadPath, saveToSubdir optional.",
        "args": ["url", "backend?", "download_path?", "downloadPath?", "save_to_subdir?", "saveToSubdir?"],
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
