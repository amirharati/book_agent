#!/usr/bin/env python3
"""
Update .cursor/rules/book-agent.mdc from book_agent.tool_registry.TOOLS so the rule
and MCP share one source of truth. Run after adding or renaming a tool in the registry.

Usage:
  python scripts/sync_rule_from_registry.py
  uv run python scripts/sync_rule_from_registry.py
  book-agent sync-rule
"""

from pathlib import Path

# Repo root (script lives in scripts/)
ROOT = Path(__file__).resolve().parent.parent
RULE_PATH = ROOT / ".cursor" / "rules" / "book-agent.mdc"


def main() -> None:
    from book_agent.sync_rule import sync_rule

    if sync_rule(rule_path=RULE_PATH):
        print(f"Updated {RULE_PATH} (import block and prose tool list from registry).")
    else:
        print("Rule already in sync with registry.")


if __name__ == "__main__":
    main()
