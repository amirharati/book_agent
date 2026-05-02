"""
MCP server for book-agent. Exposes tools from tool_registry via the Model Context Protocol.
Run: python -m book_agent.mcp_server (requires pip install book-agent[mcp] or uv add mcp).
Cursor: configure .cursor/mcp.json with command "python", args ["-m", "book_agent.mcp_server"].
"""

import json
from pathlib import Path

from book_agent.agent_tools import (
    get_config as _get_config,
    get_document_path_for_agent,
    get_figure_for_agent,
    resolve_figure,
    run_index,
    run_read,
    run_search,
    run_toc,
    run_web_fetch,
    run_web_search,
)
from book_agent.agent_tools import (
    add_book as _add_book,
    add_document as _add_document,
    add_document_to_workspace as _add_document_to_workspace,
    create_workspace as _create_workspace,
    remove_document_from_workspace as _remove_document_from_workspace,
    set_current_book as _set_current_book,
    set_current_workspace as _set_current_workspace,
    set_output as _set_output,
    set_workspace_current_document as _set_workspace_current_document,
    set_workspace_output_subdir as _set_workspace_output_subdir,
)
from book_agent.tool_registry import TOOLS


def _path_or_none(path: str | None) -> Path | None:
    """Convert MCP path argument to Path or None for current document."""
    if path is None or (isinstance(path, str) and path.strip() == ""):
        return None
    return Path(path)


def _book_folder(path: str | None) -> Path:
    """Resolve to book folder; raise ValueError if no path and no current document."""
    p = _path_or_none(path)
    if p is None:
        p = get_document_path_for_agent(None)
    if p is None:
        raise ValueError(
            "No document path: set current workspace and current document "
            "(config set-current-workspace, add-to-workspace, set-workspace-current) or pass path."
        )
    return Path(p).resolve()


def _safe(fn, *args, **kwargs) -> str:
    """Run tool and return string; on ValueError return error message."""
    try:
        result = fn(*args, **kwargs)
        return _format_result(result, fn)
    except ValueError as e:
        return f"Error: {e}"
    except RuntimeError as e:
        return f"Error: {e}"


def _format_result(result, fn) -> str:
    """Format tool result as string for MCP."""
    if result is None:
        return ""
    if fn is _get_config:
        return json.dumps(result, indent=2)
    if isinstance(result, list):
        if not result:
            return "(empty)"
        if isinstance(result[0], dict):
            # search results
            lines = []
            for m in result:
                title = m.get("title", "")
                level = m.get("level", 0)
                pdf_page = m.get("pdf_page", "")
                md_start = m.get("md_start_line", "")
                md_end = m.get("md_end_line", "")
                lines.append(f"[{level}] {title} (p. {pdf_page})\n    Line: {md_start}-{md_end}")
            return "\n".join(lines)
        # toc lines (list of str)
        return "\n".join(result)
    if isinstance(result, dict):
        return json.dumps(result, indent=2)
    return str(result)


# Lazy import FastMCP so the rest of the package works without mcp installed.
def _mcp_app():
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("book-agent", json_response=True)

    @mcp.tool()
    def get_config() -> str:
        """Return current book-agent config (documents, current workspace, resolved paths). Call first when user wants to work on a book or set up workspace."""
        return _safe(_get_config)

    @mcp.tool()
    def create_workspace(workspace_id: str) -> str:
        """Create a new workspace. Use when user says 'create workspace', 'make a workspace'. workspace_id: unique id (e.g. 'my_project')."""
        return _safe(_create_workspace, (workspace_id or "").strip())

    @mcp.tool()
    def add_document(doc_id: str, path: str) -> str:
        """Add a book/document to the registry. Use when user says 'add a book', 'add this book'. doc_id: short id (e.g. 'bishop'); path: path to book folder (with index.json or .md)."""
        return _safe(_add_document, (doc_id or "").strip(), (path or "").strip())

    @mcp.tool()
    def set_current_workspace(workspace_id: str) -> str:
        """Set the current workspace. workspace_id must already exist (create with create_workspace)."""
        return _safe(_set_current_workspace, (workspace_id or "").strip())

    @mcp.tool()
    def add_document_to_workspace(workspace_id: str, doc_id: str) -> str:
        """Add a document to a workspace's list. Use after add_document when user wants this book in a workspace."""
        return _safe(_add_document_to_workspace, (workspace_id or "").strip(), (doc_id or "").strip())

    @mcp.tool()
    def set_workspace_current_document(workspace_id: str, doc_id: str | None = None) -> str:
        """Set which document is current in a workspace. doc_id: document id or omit/null to clear."""
        return _safe(_set_workspace_current_document, (workspace_id or "").strip(), (doc_id or "").strip() or None)

    @mcp.tool()
    def set_workspace_output_subdir(workspace_id: str, key: str, subdir: str) -> str:
        """Set an output subdirectory for a workspace (e.g. notebooks). key (e.g. 'notebooks'), subdir name."""
        return _safe(_set_workspace_output_subdir, (workspace_id or "").strip(), (key or "").strip(), (subdir or "").strip())

    @mcp.tool()
    def remove_document_from_workspace(workspace_id: str, doc_id: str) -> str:
        """Remove a document from a workspace's list."""
        return _safe(_remove_document_from_workspace, (workspace_id or "").strip(), (doc_id or "").strip())

    @mcp.tool()
    def add_book(book_id: str, path: str) -> str:
        """Backward-compat: add document and set as current in same-named workspace. Use when user says 'add a book' and want it as current. book_id and path."""
        return _safe(_add_book, (book_id or "").strip(), (path or "").strip())

    @mcp.tool()
    def set_current_book(book_id: str) -> str:
        """Backward-compat: set current workspace and current document to book_id (creates workspace if needed)."""
        return _safe(_set_current_book, (book_id or "").strip())

    @mcp.tool()
    def set_output(key: str, path: str) -> str:
        """Backward-compat: set output subdir for current workspace. key and path (subdir name)."""
        return _safe(_set_output, (key or "").strip(), (path or "").strip())

    @mcp.tool()
    def toc(path: str | None = None, depth: int = 2) -> str:
        """List table of contents. path: book folder or null for current document. depth: max depth (default 2)."""
        p = _path_or_none(path)
        return _safe(run_toc, p, depth)

    @mcp.tool()
    def search(path: str | None = None, query: str = "") -> str:
        """Search sections in the book by title. path: optional; query: required."""
        p = _path_or_none(path)
        return _safe(run_search, p, query or "")

    @mcp.tool()
    def read(path: str | None = None, query: str = "") -> str:
        """Read section content by section title (fuzzy match). path: optional; query: required."""
        p = _path_or_none(path)
        return _safe(run_read, p, query or "")

    @mcp.tool()
    def web_search(query: str, num: int = 10) -> str:
        """Web search via Serper. query: required; num: max results (default 10). Requires SERPER_API_KEY."""
        try:
            results = run_web_search(query, num=num)
        except ValueError as e:
            return f"Error: {e}"
        if not results:
            return "(no results)"
        lines = []
        for r in results:
            lines.append(r.get("title", ""))
            lines.append(f"  {r.get('link', '')}")
            lines.append(f"  {r.get('snippet', '')}")
            lines.append("")
        return "\n".join(lines)

    @mcp.tool()
    def web_fetch(
        url: str,
        backend: str | None = None,
        download_path: str | None = None,
        downloadPath: str | None = None,
        save_to_subdir: str | None = None,
        saveToSubdir: str | None = None,
    ) -> str:
        """Fetch URL content (default: Jina). To save to disk: pass a base subdir name (e.g. saveToSubdir='fetched'). The tool creates output_dir/<subdir>/<doc-slug>/<filename>.md automatically: doc-slug is derived from URL (e.g. huggingface-rlhf), filename from page title or URL (e.g. introduction-to-rlhf.md). All folders are created. The caller only passes the base subdir; the tool owns the per-document folder and filename. No file is written if there is no current workspace. url: required; backend and save params optional."""
        import logging as _logging
        _log = _logging.getLogger("book_agent.mcp_server")
        _log.info("MCP web_fetch called: url=%r, download_path=%r, downloadPath=%r, save_to_subdir=%r, saveToSubdir=%r",
                   url, download_path, downloadPath, save_to_subdir, saveToSubdir)
        subdir_arg = download_path or downloadPath or save_to_subdir or saveToSubdir
        _log.info("MCP web_fetch resolved subdir_arg=%r", subdir_arg)
        out = run_web_fetch(url, backend=backend, download_path=subdir_arg)
        _log.info("MCP web_fetch result: saved_path=%r, error=%r", out.get("saved_path"), out.get("error"))
        if out.get("error"):
            return f"Error: {out['error']}"
        parts = []
        if out.get("title"):
            parts.append(f"# {out['title']}\n")
        parts.append(out.get("text") or "(no text extracted)")
        if out.get("saved_path"):
            parts.append(f"\n\n---\nSaved to: {out['saved_path']}")
        return "".join(parts)

    @mcp.tool()
    def figure_resolve(path: str | None = None, figure_ref: str = "") -> str:
        """Resolve figure reference to file path. path: optional (book folder); figure_ref: required."""
        folder = _book_folder(path)
        result = resolve_figure(folder, figure_ref or "")
        return json.dumps(result, indent=2)

    @mcp.tool()
    def figure_show(
        path: str | None = None,
        figure_ref: str = "",
        no_image: bool = False,
    ) -> str:
        """Figure path + prompt + optional base64 for agent. path: optional; figure_ref: required; no_image: optional."""
        folder = _book_folder(path)
        result = get_figure_for_agent(folder, figure_ref or "", include_image=not no_image)
        # Omit large base64 from JSON for readability; client can still get it from the dict if needed
        out = {k: v for k, v in result.items() if k != "image_base64"}
        if result.get("image_base64"):
            out["image_base64"] = "(present, omitted from display)"
        return json.dumps(out, indent=2)

    @mcp.tool()
    def index(path: str | None = None) -> str:
        """Build index.json in the book folder. path: optional (current document if null)."""
        p = _path_or_none(path)
        try:
            out_path = run_index(p)
            return f"Index written to: {out_path}"
        except ValueError as e:
            return f"Error: {e}"
        except RuntimeError as e:
            return f"Error: {e}"

    @mcp.prompt()
    def book_agent_context() -> str:
        """Context for book-agent: when to use config/workspace tools and how to set up a new folder."""
        return (
            "You are in a book-agent workspace. Book-agent manages documents (books) and workspaces; "
            "config is stored in .book_agent.json in the project.\n\n"
            "• Always call get_config first when the user wants to work on a book or set up a workspace.\n"
            "• 'Add a book' / 'add this book': use add_document(doc_id, path). Optionally create_workspace(doc_id), "
            "add_document_to_workspace(doc_id, doc_id), set_current_workspace(doc_id), set_workspace_current_document(doc_id, doc_id). "
            "Or use add_book(book_id, path) then set_current_book(book_id) to do both in one go.\n"
            "• 'Create workspace' / 'make a workspace': use create_workspace(workspace_id).\n"
            "• If there is no .book_agent.json yet, the first config-changing MCP call creates it under the workspace when BOOK_AGENT_CONFIG points there; "
            "get_config shows current state. Create workspace and add documents so tools (toc, search, read) have a current document."
        )

    return mcp


def main() -> None:
    import logging
    import sys
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
        stream=sys.stderr,
    )
    mcp = _mcp_app()
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
