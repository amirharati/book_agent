"""
CLI entry point: run conversion (and future commands) from the shell.

    book-agent convert path/to/book.pdf -o books/mybook
    book-agent index path/to/book_folder   # build index.json from markdown
    book-agent toc path/to/book_folder     # list table of contents
    book-agent search "term" path/to/book_folder
    book-agent read "Section Title" path/to/book_folder
"""

from pathlib import Path

import typer

from book_agent.agent_tools import figure_app, run_read, run_search, run_toc
from book_agent.api import convert_pdf_to_markdown
from book_agent.backends import REGISTRY
from book_agent.markdown_index import build_index, write_index

app = typer.Typer(
    name="book-agent",
    help="Convert book PDFs to Markdown and manage book-ingestion workflows.",
)


@app.command("convert")
def convert(
    pdf: Path = typer.Argument(..., help="Path to the PDF file", path_type=Path),
    output_dir: Path = typer.Option(
        ...,
        "-o",
        "--output-dir",
        help="Output root directory (e.g. books/<book_slug>)",
        path_type=Path,
    ),
    book_slug: str | None = typer.Option(
        None,
        "--slug",
        help="Book slug (default: from PDF filename)",
    ),
    no_split_chapters: bool = typer.Option(
        False,
        "--no-split-chapters",
        help="Do not write per-chapter files (ch01.md, ch02.md, ...); only full.md",
    ),
    no_page_markers: bool = typer.Option(
        False,
        "--no-page-markers",
        help="Do not insert <!-- page N --> in Markdown",
    ),
    no_figures: bool = typer.Option(
        False,
        "--no-figures",
        help="Do not extract figures",
    ),
    backend: str = typer.Option(
        "pymupdf",
        "--backend",
        "-b",
        help=f"Backend: {', '.join(REGISTRY)}",
    ),
) -> None:
    """Convert a PDF to Markdown with page mapping and optional figures."""
    if not pdf.is_file():
        typer.echo(f"Error: PDF not found: {pdf}", err=True)
        raise typer.Exit(1)
    if backend not in REGISTRY:
        typer.echo(f"Error: unknown backend '{backend}'. Choose: {', '.join(REGISTRY)}", err=True)
        raise typer.Exit(1)

    result = convert_pdf_to_markdown(
        pdf,
        output_dir,
        book_slug=book_slug,
        split_by_chapter=not no_split_chapters,
        page_markers_in_md=not no_page_markers,
        extract_figures=not no_figures,
        backend=backend,
    )

    if result.errors:
        for err in result.errors:
            typer.echo(f"Warning: {err}", err=True)
    if not result.success:
        typer.echo(f"Error: {result.message}", err=True)
        raise typer.Exit(1)

    typer.echo(result.message)
    typer.echo(f"  full.md  → {result.full_md_path}")
    if result.chapter_md_paths:
        typer.echo(f"  chapters → {len(result.chapter_md_paths)} files (ch01.md, ...)")
    if result.figures_dir:
        typer.echo(f"  figures → {result.figures_dir} ({result.figure_count} images)")
    typer.echo(f"  index   → {result.index_path}")
    typer.echo(f"  meta    → {result.meta_path}")


@app.command("index")
def index_cmd(
    path: Path = typer.Argument(
        ...,
        help="Path to book folder (containing a .md file) or directly to the .md file",
        path_type=Path,
    ),
    verbose: bool = typer.Option(False, "-v", "--verbose", help="Print diagnostic info"),
) -> None:
    """Build index.json from markdown + optional meta JSON."""
    import logging
    if verbose:
        logging.basicConfig(level=logging.INFO, format="%(message)s")

    path = path.resolve()
    if path.is_file() and path.suffix.lower() == ".md":
        md_path = path
        folder = path.parent
    elif path.is_dir():
        md_files = list(path.glob("*.md"))
        if not md_files:
            typer.echo(f"Error: no .md file in {path}", err=True)
            raise typer.Exit(1)
        md_path = md_files[0]
        folder = path
    else:
        typer.echo(f"Error: not a folder or .md file: {path}", err=True)
        raise typer.Exit(1)

    meta_path = md_path.parent / (md_path.stem + "_meta.json")
    if not meta_path.is_file():
        meta_path = None
        typer.echo("No meta JSON found, using markdown only")
    else:
        typer.echo(f"Meta JSON: {meta_path.name}")

    index = build_index(md_path, meta_path)
    out = folder / "index.json"
    write_index(index, out)

    # Print summary
    n_chapters = len(index["chapters"])
    n_annotations = len(index.get("annotations", []))
    typer.echo(f"\nWrote {out}")
    typer.echo(f"  Sections: {n_chapters} top-level")
    typer.echo(f"  Pages:    {index['page_count']}")
    typer.echo(f"  Offset:   {index.get('pdf_to_toc_offset')}")
    typer.echo(f"  Annotations: {n_annotations}")

    # Print diagnostics
    diag = index.get("diagnostics", [])
    if diag:
        typer.echo("\nDiagnostics:")
        for d in diag:
            typer.echo(f"  {d}")


def _run_tool(run_fn, *args, **kwargs):
    """Run a tool; on ValueError echo and exit."""
    try:
        return run_fn(*args, **kwargs)
    except ValueError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)


@app.command("toc")
def toc_cmd(
    path: Path = typer.Argument(..., help="Path to book folder or index.json", path_type=Path),
    depth: int = typer.Option(2, "--depth", "-d", help="Max depth to display"),
) -> None:
    """Show Table of Contents."""
    lines = _run_tool(run_toc, path.resolve(), depth)
    for line in lines:
        typer.echo(line)


@app.command("search")
def search_cmd(
    query: str = typer.Argument(..., help="Search query string"),
    path: Path = typer.Argument(..., help="Path to book folder or index.json", path_type=Path),
) -> None:
    """Search for sections by title."""
    matches = _run_tool(run_search, path.resolve(), query)
    if not matches:
        typer.echo("No matches found.")
        return
    for m in matches:
        typer.echo(f"[{m['level']}] {m['title']} (p. {m['pdf_page']})")
        typer.echo(f"    Line: {m['md_start_line']}-{m['md_end_line']}")


@app.command("read")
def read_cmd(
    query: str = typer.Argument(..., help="Section title (fuzzy match)"),
    path: Path = typer.Argument(..., help="Path to book folder or index.json", path_type=Path),
) -> None:
    """Read content of a specific section."""
    content = _run_tool(run_read, path.resolve(), query)
    typer.echo(content)


app.add_typer(figure_app, name="figure")


def main() -> None:
    """Entry point for the book-agent console script."""
    app()


if __name__ == "__main__":
    main()
