"""Abstract interface for PDF → Markdown conversion backends."""

from abc import ABC, abstractmethod
from pathlib import Path

from book_agent.models import ConversionConfig, ConversionResult


class ConversionBackend(ABC):
    """Interface that each conversion backend must implement."""

    @abstractmethod
    def convert(self, pdf_path: Path, config: ConversionConfig) -> ConversionResult:
        """
        Convert the PDF at pdf_path to Markdown under config.output_dir.

        - Write full.md (and optionally per-chapter .md) under output_dir/md/
        - Extract figures to output_dir/figures/ if config.extract_figures
        - Write index.json and meta.json under output_dir
        - Use config.page_markers_in_md to insert <!-- page N --> in Markdown
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Backend identifier (e.g. 'pymupdf')."""
        ...
