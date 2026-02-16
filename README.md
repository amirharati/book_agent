# Book Agent

Tools and agents to **read**, **learn**, and **apply** content from books: work from Markdown (page/chapter mapping, index) and use Cursor or other agents to study and build from the material.

**Input:** Markdown can be produced externally (e.g. your own PDF→Markdown pipeline) or via the built-in PyMuPDF backend. Output layout: `book_projects/<slug>/md/`, `figures/`, `index.json`, `meta.json`.

Currently, I am using Marker :https://github.com/datalab-to/marker 


See [PROJECT.md](PROJECT.md) for the high-level plan. Details in [docs/PHASE1_MARKDOWN_CONVERSION.md](docs/PHASE1_MARKDOWN_CONVERSION.md).

**Book index and reading tools:** After conversion (or if you have existing Markdown + meta), run `book-agent index <path>` to build `index.json`. Then use `toc`, `search`, and `read` to browse and read sections from the CLI or from an AI agent. Full usage for both humans and AI: **[docs/BOOK_AGENT_TOOLS.md](docs/BOOK_AGENT_TOOLS.md)**.

---

## Folder layout

Keep code, input data, and converted work separate:

| Folder | Purpose |
|--------|---------|
| `example_books/` | **Input:** PDFs you want to convert (e.g. books you copied here). |
| `book_projects/` | **Output:** One subfolder per book (e.g. `book_projects/mackaybook/`, `book_projects/bishop-prml/`) with `md/`, `figures/`, `index.json`, `meta.json`. |

Converted output is written only under `book_projects/` (or whatever path you pass to `-o`).

---

## Install

From the project root:

```bash
pip install -e .
```

Optional dev deps:

```bash
pip install -e ".[dev]"
```

---

## CLI (run independently)

**Convert** a PDF to Markdown:

```bash
book-agent path/to/book.pdf -o book_projects/mybook
# or with explicit subcommand (if your install uses it):
book-agent convert path/to/book.pdf -o book_projects/mybook
```

Options:

- `-o, --output-dir` — Output root (e.g. `book_projects/<book_slug>`). Created if missing.
- `--slug` — Book slug (default: from PDF filename).
- `--no-split-chapters` — Do not write per-chapter files (ch01.md, …); only full.md (default: chapters are written when detected).
- `--no-page-markers` — Do not insert `<!-- page N -->` in Markdown.
- `--no-figures` — Do not extract images.
- `-b, --backend` — Backend: `pymupdf` (default).

Example:

```bash
book-agent example_books/mackaybook.pdf -o book_projects/mackaybook
book-agent example_books/somebook.pdf -o book_projects/mybook --slug mybook
```

Output layout under `book_projects/mybook/`:

```
book_projects/mybook/
├── md/
│   ├── full.md       # Full book Markdown (layout-aware paragraphs, <!-- page N -->)
│   └── ch01.md, ch02.md, ...   # One file per chapter (when detected)
├── figures/          # Extracted images (p1_fig1.png, ...)
├── index.json        # Chapter/page mapping (full + per-chapter ranges)
└── meta.json         # Title, source PDF, conversion date
```

- **Layout:** Text is grouped into lines and paragraphs (no more “one word per line”); headings are detected and emitted as `## ...`.
- **Chapters:** By default, chapter starts (e.g. “Chapter 1”, “28 Model Comparison…”) are detected and per-chapter files are written. Use `--no-split-chapters` to get only `full.md`. See [docs/LAYOUT_AND_CHAPTERS.md](docs/LAYOUT_AND_CHAPTERS.md) for details.

**Index and read from a book project** (folder with `index.json` + `.md`):

```bash
book-agent index book_projects/mybook                    # build/rebuild index.json
book-agent toc book_projects/mybook                      # table of contents
book-agent search "regression" book_projects/mybook      # find sections by title
book-agent read "1.1 Example" book_projects/mybook       # print section markdown
```

See **[docs/BOOK_AGENT_TOOLS.md](docs/BOOK_AGENT_TOOLS.md)** for options and for AI/agent usage.

---

## Library (call programmatically)

Use the same conversion from Python and chain with other tools:

```python
from book_agent import convert_pdf_to_markdown

result = convert_pdf_to_markdown(
    "path/to/book.pdf",
    "books/mybook",
    book_slug="mybook",
    extract_figures=True,
    page_markers_in_md=True,
)

if result.success:
    print(result.message)
    print("Full MD:", result.full_md_path)
    print("Figures:", result.figure_count)
else:
    print("Errors:", result.errors)
```

With custom options:

```python
from book_agent import convert_pdf_to_markdown

result = convert_pdf_to_markdown(
    "book.pdf",
    "books/out",
    split_by_chapter=False,
    page_markers_in_md=True,
    extract_figures=True,
    backend="pymupdf",
)
```

---

## Backends

| Backend   | Description                          |
|----------|--------------------------------------|
| `pymupdf` | Default. Layout-aware text (lines + paragraphs), heading detection, figures, page markers, chapter detection and per-chapter files (ch01.md, …), index and meta. |

See [docs/LAYOUT_AND_CHAPTERS.md](docs/LAYOUT_AND_CHAPTERS.md) for layout extraction and chapter splitting.

---

## Development

- Run CLI as module: `python -m book_agent.cli book.pdf -o book_projects/out`
- Run tests: `pytest` (after `pip install -e ".[dev]"`)
