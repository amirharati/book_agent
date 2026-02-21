"""Resolve book path to index and markdown file. No CLI (typer) dependency."""

from pathlib import Path

from book_agent.markdown_index import (
    TOCEnrichmentRequiredError,
    build_index,
    write_index,
)


def resolve_folder_and_md(path: Path) -> tuple[Path, Path]:
    """
    Resolve a path (folder or .md file) to (folder, md_path). Does NOT require index.json.
    Use this when building the index. Raises ValueError if no .md file found.
    """
    path = Path(path).resolve()
    if path.is_file() and path.suffix.lower() == ".md":
        return path.parent, path
    if path.is_dir():
        md_files = list(path.glob("*.md"))
        if not md_files:
            raise ValueError(f"No .md file found in {path}")
        md_path = max(md_files, key=lambda p: p.stat().st_size)
        return path, md_path
    raise ValueError(f"Not a folder or .md file: {path}")


def resolve_book_path(path: Path) -> tuple[Path, Path]:
    """
    Resolve a path (folder, index.json, or .md file) to (index_path, md_path).
    Raises ValueError with a message if index or .md is not found.
    """
    path = Path(path).resolve()
    if path.is_file():
        if path.name == "index.json":
            folder = path.parent
            index_path = path
        elif path.suffix.lower() == ".md":
            folder = path.parent
            index_path = folder / "index.json"
        else:
            folder = path.parent
            index_path = folder / "index.json"
    else:
        folder = path
        index_path = folder / "index.json"

    if not index_path.exists():
        # Bulletproof: create index when missing so tools don't fail
        try:
            folder, md_path = resolve_folder_and_md(path)
        except ValueError:
            raise ValueError(f"index.json not found at {index_path} and could not build (no .md in folder)")
        meta_path = md_path.parent / (md_path.stem + "_meta.json")
        if not meta_path.is_file():
            meta_path = None
        try:
            index = build_index(md_path, meta_path)
        except TOCEnrichmentRequiredError as e:
            raise ValueError(
                f"index.json not found at {index_path} and could not build: {e}"
            ) from e
        write_index(index, folder / "index.json")
        index_path = folder / "index.json"

    md_files = list(folder.glob("*.md"))
    if not md_files:
        raise ValueError(f"No .md file found in {folder}")

    md_path = max(md_files, key=lambda p: p.stat().st_size)
    return index_path, md_path
