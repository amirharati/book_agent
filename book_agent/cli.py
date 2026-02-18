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

from book_agent.agent_tools import config_app, figure_app, get_book_path, run_index, run_read, run_search, run_toc
from book_agent.api import convert_pdf_to_markdown
from book_agent.backends import REGISTRY

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
    path: Path | None = typer.Argument(
        None,
        help="Book folder or .md file (default: current book from config)",
        path_type=Path,
    ),
    verbose: bool = typer.Option(False, "-v", "--verbose", help="Print diagnostic info"),
) -> None:
    """Build index.json from markdown + optional meta JSON. Use the index tool so toc/search/read work."""
    resolved = _path_or_current(path)
    try:
        out = run_index(resolved)
    except ValueError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)
    typer.echo(f"Wrote {out}")


def _run_tool(run_fn, *args, **kwargs):
    """Run a tool; on ValueError echo and exit."""
    try:
        return run_fn(*args, **kwargs)
    except ValueError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)


def _path_or_current(path: Path | None) -> Path:
    """Resolve path; if None use current document from config. Exit with message if no path."""
    if path is not None:
        return path.resolve()
    p = get_book_path(None)
    if p is None:
        typer.echo("No document path: set current workspace and current document (config set-current-workspace, add-to-workspace, set-workspace-current) or pass path.", err=True)
        raise typer.Exit(1)
    return p


@app.command("toc")
def toc_cmd(
    path: Path | None = typer.Argument(None, help="Book folder or index.json (default: current book from config)", path_type=Path),
    depth: int = typer.Option(2, "--depth", "-d", help="Max depth to display"),
) -> None:
    """Show Table of Contents."""
    resolved = _path_or_current(path)
    lines = _run_tool(run_toc, resolved, depth)
    for line in lines:
        typer.echo(line)


@app.command("search")
def search_cmd(
    query: str = typer.Argument(..., help="Search query string"),
    path: Path | None = typer.Argument(None, help="Book folder or index.json (default: current book from config)", path_type=Path),
) -> None:
    """Search for sections by title."""
    resolved = _path_or_current(path)
    matches = _run_tool(run_search, resolved, query)
    if not matches:
        typer.echo("No matches found.")
        return
    for m in matches:
        typer.echo(f"[{m['level']}] {m['title']} (p. {m['pdf_page']})")
        typer.echo(f"    Line: {m['md_start_line']}-{m['md_end_line']}")


@app.command("read")
def read_cmd(
    query: str = typer.Argument(..., help="Section title (fuzzy match)"),
    path: Path | None = typer.Argument(None, help="Book folder or index.json (default: current book from config)", path_type=Path),
) -> None:
    """Read content of a specific section."""
    resolved = _path_or_current(path)
    content = _run_tool(run_read, resolved, query)
    typer.echo(content)


app.add_typer(config_app, name="config")
app.add_typer(figure_app, name="figure")


def main() -> None:
    """Entry point for the book-agent console script."""
    app()


if __name__ == "__main__":
    main()
