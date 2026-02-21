"""
Index tool: build index.json from markdown (+ optional meta). Use this so the book has an index before toc/search/read.
"""

from pathlib import Path
from typing import Optional

from book_agent.config import get_document_path_for_agent
from book_agent.markdown_index import (
    TOCEnrichmentRequiredError,
    build_index,
    write_index,
)
from book_agent.path_utils import resolve_folder_and_md


def run(path: Optional[Path] = None) -> Path:
    """
    Build index.json in the book folder. Path can be folder or .md file; index.json is not required to exist yet.
    If path is None, use current document from config.
    Pipeline: parse TOC → enrich hierarchy via LLM (when TOC present) → resolve headings → build tree.
    Returns the path to the written index.json.
    Raises ValueError if no path and no current document, or if folder has no .md.
    """
    if path is None:
        path = get_document_path_for_agent(None)
        if path is None:
            raise ValueError("No document path: set current workspace and current document or pass path.")
    folder, md_path = resolve_folder_and_md(path)
    meta_path = md_path.parent / (md_path.stem + "_meta.json")
    if not meta_path.is_file():
        meta_path = None
    try:
        index = build_index(md_path, meta_path)
    except TOCEnrichmentRequiredError as e:
        raise RuntimeError(str(e)) from e
    out = folder / "index.json"
    write_index(index, out)
    return out
