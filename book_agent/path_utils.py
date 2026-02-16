"""Resolve book path to index and markdown file. No CLI (typer) dependency."""

from pathlib import Path


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
        raise ValueError(f"index.json not found at {index_path}")

    md_files = list(folder.glob("*.md"))
    if not md_files:
        raise ValueError(f"No .md file found in {folder}")

    md_path = max(md_files, key=lambda p: p.stat().st_size)
    return index_path, md_path
