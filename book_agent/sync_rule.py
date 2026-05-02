"""
Sync .cursor/rules/book-agent.mdc from tool_registry.TOOLS (MCP names + descriptions).
Used by scripts/sync_rule_from_registry.py and CLI `book-agent sync-rule`.
"""

import re
from pathlib import Path

# When used from the package, repo root is parent of book_agent.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_RULE_PATH = _REPO_ROOT / ".cursor" / "rules" / "book-agent.mdc"


def sync_rule(rule_path: Path | None = None) -> bool:
    """
    Update the Cursor rule from the tool registry (MCP prose line + tools table).
    Returns True if the file was changed.
    """
    from book_agent.tool_registry import TOOLS

    path = rule_path or _DEFAULT_RULE_PATH
    text = path.read_text(encoding="utf-8")
    new_text = text

    mcp_names = ", ".join(t["name"] for t in TOOLS)
    prose_pattern = re.compile(
        r"(\*\*Prefer book-agent MCP tools\*\* \()[^)]+(\) over grep)"
    )
    if not prose_pattern.search(new_text):
        raise SystemExit("sync_rule: could not find 'Prefer book-agent MCP tools' line in rule file")
    new_text = prose_pattern.sub(rf"\g<1>{mcp_names}\g<2>", new_text)

    table_rows = "\n".join(f"| **{t['name']}** | {t['description']} |" for t in TOOLS)
    table_pattern = re.compile(
        r"(\| MCP tool \| Purpose \|\n\|[-\s|]+\|\n)(.*?)(\n\nUsage flow:)",
        re.DOTALL,
    )
    if not table_pattern.search(new_text):
        raise SystemExit("sync_rule: could not find MCP tools table in rule file")
    new_text = table_pattern.sub(rf"\g<1>{table_rows}\g<3>", new_text)

    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False
