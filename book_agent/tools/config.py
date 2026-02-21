"""
Config tool: CLI subapp only. Implementation in book_agent.config.
"""

from pathlib import Path
from typing import Optional

import typer

from book_agent import config as config_module

config_app = typer.Typer(help="Workspace and document config (documents registry, workspaces, current workspace).")


@config_app.command("show")
def _show() -> None:
    """Show main config and resolved current workspace / document / output dir."""
    data = config_module.get_config()
    cf = data.get("_config_file", "")
    no_file = data.get("_no_file", False)
    if no_file:
        typer.echo(f"Config file: {cf} (not found; using defaults)")
    else:
        typer.echo(f"Config file: {cf}")
    typer.echo(f"Documents: {data.get('documents', {})}")
    typer.echo(f"Output root: {data.get('output_root')}")
    typer.echo(f"Current workspace: {data.get('current_workspace')}")
    typer.echo(f"Resolved workspace dir: {data.get('_resolved_current_workspace_dir')}")
    typer.echo(f"Workspace documents: {data.get('_workspace_documents', [])}")
    typer.echo(f"Resolved current document path: {data.get('_resolved_current_document_path')}")
    typer.echo(f"Resolved output dir: {data.get('_resolved_output_dir')}")
    tools = config_module.load_tools_config()
    tools_path = config_module.get_tools_config_path()
    typer.echo(f"Tools config: {tools_path} (exists: {tools_path.exists()})")
    typer.echo(f"LLM model: {tools.get('llm_model', '(default)')}")


@config_app.command("set-current-workspace")
def _set_current_workspace(workspace_id: str = typer.Argument(..., help="Workspace id (folder under output root)")) -> None:
    """Set the current workspace."""
    result = config_module.set_current_workspace(workspace_id)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Current workspace set to: {workspace_id}")
    typer.echo(f"Workspace dir: {result['config'].get('_resolved_current_workspace_dir')}")


@config_app.command("add-document")
def _add_document(
    doc_id: str = typer.Argument(..., help="Id for this document (unique in registry)"),
    path: str = typer.Argument(..., help="Path to book folder (relative to config file dir)"),
) -> None:
    """Add or update a document in the registry. Path must resolve to a folder with index.json and .md."""
    result = config_module.add_document(doc_id, path)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Added document '{doc_id}' -> {path}")
    typer.echo(f"Resolved: {result.get('resolved_path', '')}")


@config_app.command("create-workspace")
def _create_workspace(workspace_id: str = typer.Argument(..., help="Workspace id (unique folder name under output root)")) -> None:
    """Create a workspace directory and default .book_workspace.json."""
    result = config_module.create_workspace(workspace_id)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Created workspace '{workspace_id}'")
    typer.echo(f"Dir: {result.get('workspace_dir', '')}")


@config_app.command("add-to-workspace")
def _add_to_workspace(
    workspace_id: str = typer.Argument(..., help="Workspace id"),
    doc_id: str = typer.Argument(..., help="Document id (must be in registry)"),
) -> None:
    """Add a document to a workspace's document list."""
    result = config_module.add_document_to_workspace(workspace_id, doc_id)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    msg = result.get("message") or f"Added '{doc_id}' to workspace '{workspace_id}'."
    typer.echo(msg)


@config_app.command("remove-from-workspace")
def _remove_from_workspace(
    workspace_id: str = typer.Argument(..., help="Workspace id"),
    doc_id: str = typer.Argument(..., help="Document id to remove from workspace"),
) -> None:
    """Remove a document from a workspace's document list."""
    result = config_module.remove_document_from_workspace(workspace_id, doc_id)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Removed '{doc_id}' from workspace '{workspace_id}'.")


@config_app.command("set-workspace-current")
def _set_workspace_current(
    workspace_id: str = typer.Argument(..., help="Workspace id"),
    doc_id: Optional[str] = typer.Argument(None, help="Document id to set as current (omit to clear)"),
) -> None:
    """Set the current document for a workspace (used when path is omitted in toc/search/read)."""
    result = config_module.set_workspace_current_document(workspace_id, doc_id)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Workspace '{workspace_id}' current document: {doc_id}")


@config_app.command("set-output-subdir")
def _set_output_subdir(
    workspace_id: str = typer.Argument(..., help="Workspace id"),
    key: str = typer.Argument(..., help="Output key (e.g. notebooks, summaries)"),
    subdir: str = typer.Argument(..., help="Subdirectory name under workspace root"),
) -> None:
    """Set output subdir for a workspace (e.g. notebooks -> notebooks/ under workspace)."""
    result = config_module.set_workspace_output_subdir(workspace_id, key, subdir)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Workspace '{workspace_id}' output '{key}' -> {subdir}")


@config_app.command("set-llm-model")
def _set_llm_model(
    model_id: str = typer.Argument(..., help="OpenRouter model id (e.g. openai/gpt-4o-mini, anthropic/claude-3-haiku)"),
) -> None:
    """Set default LLM model for TOC inference. Writes book_agent_tools.py (or edit that file directly)."""
    result = config_module.set_llm_model(model_id)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"LLM model set to: {result.get('llm_model', model_id)}")


# Backward-compat aliases
@config_app.command("set-current")
def _set_current(book_id: str = typer.Argument(..., help="Book/document id (sets workspace and current document)")) -> None:
    """Set current workspace and current document (alias for set-current-workspace + set-workspace-current)."""
    result = config_module.set_current_book(book_id)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Current set to: {book_id}")
    typer.echo(f"Resolved path: {result['config'].get('_resolved_current_document_path')}")


@config_app.command("add-book")
def _add_book(
    book_id: str = typer.Argument(..., help="Id for this book"),
    path: str = typer.Argument(..., help="Path to book folder (relative to config file dir)"),
) -> None:
    """Add document and add to same-named workspace if it exists (alias for add-document + add-to-workspace)."""
    result = config_module.add_book(book_id, path)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(f"Added book '{book_id}' -> {path}")
    typer.echo(f"Resolved: {result.get('resolved_path', '')}")


@config_app.command("set-output")
def _set_output(
    key: str = typer.Argument(..., help="Output key (e.g. notebooks, summaries)"),
    path: str = typer.Argument(..., help="Subdir under current workspace root"),
) -> None:
    """Set output subdir for current workspace (alias for set-output-subdir on current workspace)."""
    result = config_module.set_output(key, path)
    if not result["ok"]:
        typer.echo(result.get("error", "Failed"), err=True)
        raise typer.Exit(1)
    typer.echo(f"Output '{key}' -> {path}")


@config_app.command("path")
def _path() -> None:
    """Print the config file path in use."""
    typer.echo(config_module.get_config_path())
