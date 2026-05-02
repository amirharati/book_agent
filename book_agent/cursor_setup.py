"""
One-time setup for Cursor: merge book-agent into the user's global ~/.cursor/mcp.json
so MCP tools work in any folder you open (install book-agent once; cwd follows workspace).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

MCP_SERVER_KEY = "book-agent"


def mcp_server_entry(*, python_executable: str | None = None) -> dict[str, Any]:
    """Single server entry for Cursor's mcpServers (stdio MCP)."""
    exe = python_executable or sys.executable
    return {
        "command": exe,
        "args": ["-m", "book_agent.mcp_server"],
        "cwd": "${workspaceFolder}",
        "env": {"BOOK_AGENT_CONFIG": "${workspaceFolder}/.book_agent.json"},
    }


def global_mcp_json_path() -> Path:
    return Path.home() / ".cursor" / "mcp.json"


def merge_book_agent_mcp(
    *,
    python_executable: str | None = None,
    dry_run: bool = False,
) -> tuple[Path, dict[str, Any]]:
    """
    Merge book-agent into ~/.cursor/mcp.json without removing other servers.
    Returns (path, full merged document).
    """
    path = global_mcp_json_path()
    data: dict[str, Any] = {}
    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in {path}: {e}") from e
        if isinstance(raw, dict):
            data = raw
    servers = data.get("mcpServers")
    if not isinstance(servers, dict):
        servers = {}
    servers[MCP_SERVER_KEY] = mcp_server_entry(python_executable=python_executable)
    data["mcpServers"] = servers
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return path, data


def print_mcp_fragment(*, python_executable: str | None = None) -> str:
    """JSON snippet with only book-agent (for manual merge)."""
    body = {
        "mcpServers": {
            MCP_SERVER_KEY: mcp_server_entry(python_executable=python_executable),
        }
    }
    return json.dumps(body, indent=2) + "\n"
