"""Conversion backends: each implements PDF → Markdown with page mapping and figures."""

from book_agent.backends.base import ConversionBackend
from book_agent.backends.pymupdf_backend import PyMuPDFBackend

__all__ = ["ConversionBackend", "PyMuPDFBackend"]

REGISTRY: dict[str, type[ConversionBackend]] = {
    "pymupdf": PyMuPDFBackend,
}


def get_backend(name: str) -> type[ConversionBackend]:
    """Return backend class for the given name. Raises KeyError if unknown."""
    if name not in REGISTRY:
        raise KeyError(f"Unknown backend: {name}. Available: {list(REGISTRY)}")
    return REGISTRY[name]
