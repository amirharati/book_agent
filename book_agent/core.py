"""
Minimal shared primitives for book index and section content.
No CLI, no Typer. Used by independent tool modules.
"""

import json
from pathlib import Path
from typing import Any, Dict, List

from book_agent.markdown_index import (
    INDEX_VERSION,
    TOCEnrichmentRequiredError,
    build_index,
    write_index,
)
from book_agent.path_utils import resolve_folder_and_md


def load_index(index_path: Path) -> Dict[str, Any]:
    """
    Load the book index from a JSON file. If index_version is missing or less than
    the current INDEX_VERSION, the index is rebuilt and overwritten (so code updates
    can refresh old indices).
    """
    index_path = Path(index_path).resolve()
    with open(index_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    current = data.get("index_version")
    if current is not None and current >= INDEX_VERSION:
        return data
    folder = index_path.parent
    try:
        _, md_path = resolve_folder_and_md(folder)
    except ValueError:
        return data
    meta_path = md_path.parent / (md_path.stem + "_meta.json")
    if not meta_path.is_file():
        meta_path = None
    try:
        index = build_index(md_path, meta_path)
    except TOCEnrichmentRequiredError:
        # LLM unavailable; do not overwrite index with wrong process
        return data
    write_index(index, index_path)
    return index


def _flatten_sections(sections: List[Dict], parent_path: str = "") -> List[Dict]:
    """Recursively flatten the section tree for searching."""
    flat = []
    for sec in sections:
        title = sec.get("title", "Untitled")
        item = {
            "title": title,
            "level": sec.get("depth", 1),
            "pdf_page": sec.get("pdf_page"),
            "md_start_line": sec.get("md_start_line"),
            "md_end_line": sec.get("md_end_line"),
            "path": parent_path + " > " + title if parent_path else title,
        }
        flat.append(item)
        if "children" in sec and sec["children"]:
            flat.extend(_flatten_sections(sec["children"], item["path"]))
    return flat


def get_section_content(section: Dict, md_path: Path) -> str:
    """Read the markdown content for a specific section (by line range)."""
    start = section.get("md_start_line")
    end = section.get("md_end_line")
    if start is None or end is None:
        return ""
    with open(md_path, "r", encoding="utf-8") as f:
        all_lines = f.readlines()
    s_idx = max(0, start - 1)
    e_idx = min(len(all_lines), end - 1)
    return "".join(all_lines[s_idx:e_idx])


def list_toc(index: Dict[str, Any], max_depth: int = 2) -> List[str]:
    """Return formatted table of contents lines from index."""
    lines = []

    def _recurse(nodes, current_depth):
        if current_depth > max_depth:
            return
        for node in nodes:
            indent = "  " * (current_depth - 1)
            title = node.get("title", "Untitled")
            page = node.get("pdf_page")
            lines.append(f"{indent}- {title} (p. {page if page is not None else '?'})")
            if "children" in node:
                _recurse(node["children"], current_depth + 1)

    _recurse(index.get("chapters", []), 1)
    return lines
