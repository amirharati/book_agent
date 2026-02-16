"""Data models for conversion config and results."""

from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class ConversionConfig(BaseModel):
    """Options for PDF → Markdown conversion."""

    output_dir: Path = Field(description="Root output directory (e.g. books/<book_slug>)")
    book_slug: str | None = Field(
        default=None,
        description="Slug for the book (default: derived from PDF filename)",
    )
    split_by_chapter: bool = Field(
        default=True,
        description="If True, write one .md file per chapter (ch01.md, ch02.md, ...) in addition to full.md",
    )
    page_markers_in_md: bool = Field(
        default=True,
        description="Insert <!-- page N --> comments in Markdown",
    )
    extract_figures: bool = Field(default=True, description="Extract images to figures/")
    backend: str = Field(
        default="pymupdf",
        description="Conversion backend: pymupdf (default)",
    )

    model_config = {"arbitrary_types_allowed": True}


class ChapterInfo(BaseModel):
    """Metadata for one chapter/section in the index."""

    id: str = Field(description="e.g. ch01, ch02 or section slug")
    title: str = Field(default="", description="Chapter/section title if detected")
    pages: list[int] = Field(default_factory=list, description="PDF page numbers (1-based)")
    start_page: int = Field(description="First PDF page (1-based)")
    end_page: int = Field(description="Last PDF page (1-based)")


class ConversionResult(BaseModel):
    """Result of a conversion run."""

    success: bool = Field(description="Whether conversion completed without fatal errors")
    output_dir: Path = Field(description="Root output directory used")
    full_md_path: Path | None = Field(default=None, description="Path to full.md if written")
    chapter_md_paths: list[Path] = Field(
        default_factory=list,
        description="Paths to per-chapter .md files if split_by_chapter",
    )
    figures_dir: Path | None = Field(default=None, description="Path to figures/ directory")
    index_path: Path | None = Field(default=None, description="Path to index.json")
    meta_path: Path | None = Field(default=None, description="Path to meta.json")
    page_count: int = Field(default=0, description="Number of PDF pages processed")
    figure_count: int = Field(default=0, description="Number of figures extracted")
    errors: list[str] = Field(default_factory=list, description="Non-fatal errors or warnings")
    message: str = Field(default="", description="Human-readable summary")

    model_config = {"arbitrary_types_allowed": True}
