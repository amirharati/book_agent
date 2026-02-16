"""
Public API: run conversion from code.

    from book_agent import convert_pdf_to_markdown
    result = convert_pdf_to_markdown("book.pdf", output_dir="books/mybook")
"""

from pathlib import Path

from book_agent.backends import get_backend
from book_agent.models import ConversionConfig, ConversionResult


def convert_pdf_to_markdown(
    pdf_path: str | Path,
    output_dir: str | Path,
    *,
    book_slug: str | None = None,
    split_by_chapter: bool = False,
    page_markers_in_md: bool = True,
    extract_figures: bool = True,
    backend: str = "pymupdf",
) -> ConversionResult:
    """
    Convert a PDF to Markdown (library entry point).

    Creates output under output_dir: md/full.md, figures/, index.json, meta.json.

    Args:
        pdf_path: Path to the PDF file.
        output_dir: Root output directory (e.g. books/<book_slug>).
        book_slug: Optional slug; default from PDF filename.
        split_by_chapter: If True, also write one .md per chapter (when backend supports it).
        page_markers_in_md: Insert <!-- page N --> in Markdown.
        extract_figures: Extract images to figures/.
        backend: Conversion backend ('pymupdf' default).

    Returns:
        ConversionResult with paths and counts.
    """
    config = ConversionConfig(
        output_dir=Path(output_dir),
        book_slug=book_slug,
        split_by_chapter=split_by_chapter,
        page_markers_in_md=page_markers_in_md,
        extract_figures=extract_figures,
        backend=backend,
    )
    backend_cls = get_backend(config.backend)
    return backend_cls().convert(Path(pdf_path), config)
