"""
Sync .cursor/rules/book-agent.mdc from tool_registry.TOOLS.
Used by scripts/sync_rule_from_registry.py and CLI `book-agent sync-rule`.
"""

from pathlib import Path
import re

# When used from the package, repo root is parent of book_agent.
_REPO_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_RULE_PATH = _REPO_ROOT / ".cursor" / "rules" / "book-agent.mdc"


def sync_rule(rule_path: Path | None = None) -> bool:
    """
    Update the rule file from the tool registry. Returns True if the file was changed.
    """
    from book_agent.tool_registry import TOOLS, RULE_CONFIG_IMPORTS

    path = rule_path or _DEFAULT_RULE_PATH
    text = path.read_text(encoding="utf-8")

    python_names = [t["python_name"] for t in TOOLS]
    # Full import list: get_config first, then config helpers from registry, then tool names (excluding get_config).
    all_imports = ["get_config"] + list(RULE_CONFIG_IMPORTS) + [n for n in python_names if n != "get_config"]

    line1 = "    " + ", ".join(all_imports[:3]) + ","
    line2 = "    " + ", ".join(all_imports[3:11]) + ",  # backward-compat"
    line3 = "    " + ", ".join(all_imports[11:]) + ","
    import_block = "\n".join([line1, line2, line3])

    pattern = re.compile(
        r"(from book_agent\.agent_tools import \()\n(.*?)(\n\))",
        re.DOTALL,
    )
    if not pattern.search(text):
        raise SystemExit("sync_rule: could not find import block in rule file")

    def repl(m: re.Match) -> str:
        return m.group(1) + "\n" + import_block + m.group(3)

    new_text = pattern.sub(repl, text)

    prose_list = ", ".join("config" if n == "get_config" else n for n in python_names)
    prose_pattern = re.compile(
        r"(\*\*Prefer book-agent tools\*\* \()[\w, ]+(\) over grep)"
    )
    new_text = prose_pattern.sub(rf"\g<1>{prose_list}\g<2>", new_text)

    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        return True
    return False
