"""
Book Agent: PDF → Markdown conversion and book-ingestion tools.

Use as a library:

    from book_agent import convert_pdf_to_markdown
    result = convert_pdf_to_markdown("path/to/book.pdf", output_dir="books/mybook")

Or run the CLI:

    book-agent convert path/to/book.pdf -o books/mybook
"""

from book_agent.api import convert_pdf_to_markdown
from book_agent.models import ConversionResult, ConversionConfig

__all__ = [
    "convert_pdf_to_markdown",
    "ConversionResult",
    "ConversionConfig",
]
