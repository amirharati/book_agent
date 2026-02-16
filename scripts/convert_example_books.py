#!/usr/bin/env python3
"""
Convert all PDFs in example_books/ to book_projects/<slug>.

Run from repo root:
    python scripts/convert_example_books.py
"""
from pathlib import Path

from book_agent import convert_pdf_to_markdown

REPO_ROOT = Path(__file__).resolve().parent.parent
EXAMPLE_BOOKS = REPO_ROOT / "example_books"
BOOK_PROJECTS = REPO_ROOT / "book_projects"

# Optional: custom slug per filename (short names for long filenames)
SLUG_OVERRIDES = {
    "Bishop C. Pattern Recognition and Machine Learning (ISBN 0387310738)(Springer, 2006)(749s)_CsAi_.pdf": "bishop-prml",
}


def main() -> None:
    if not EXAMPLE_BOOKS.is_dir():
        print(f"Missing {EXAMPLE_BOOKS}")
        return
    BOOK_PROJECTS.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(EXAMPLE_BOOKS.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs in {EXAMPLE_BOOKS}")
        return
    for pdf in pdfs:
        slug = SLUG_OVERRIDES.get(pdf.name) or pdf.stem[:50].replace(" ", "-").lower()
        out_dir = BOOK_PROJECTS / slug
        print(f"Converting {pdf.name} → {out_dir} ...")
        result = convert_pdf_to_markdown(pdf, out_dir, book_slug=slug)
        if result.success:
            print(f"  {result.message}")
        else:
            print(f"  Error: {result.message}")


if __name__ == "__main__":
    main()
