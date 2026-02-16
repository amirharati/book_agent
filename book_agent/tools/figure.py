"""
Figure tool: resolve figure ref to path, and get path + prompt (+ optional image) for agent injection.
Single job — all figure logic and CLI live here.
"""

import base64
import re
from pathlib import Path
from typing import Any, Dict

import typer

from book_agent.path_utils import resolve_book_path

figure_app = typer.Typer(help="Resolve or show book figures (for agent image-injection test).")


def _normalize_figure_ref(ref: str) -> str:
    """Extract filename from figure ref: '![](_page_22_Figure_2.jpeg)' or '_page_22_Figure_2.jpeg' -> basename."""
    ref = ref.strip()
    m = re.match(r"^!?\s*\[\s*\]\s*\(\s*(.+?)\s*\)\s*$", ref)
    if m:
        ref = m.group(1).strip()
    return Path(ref).name


def resolve_figure(book_folder: Path, figure_ref: str) -> Dict[str, Any]:
    """
    Resolve a figure reference to an absolute file path under the book folder.
    Returns a small result dict: ok, path (if found), error (if not).
    """
    book_folder = Path(book_folder).resolve()
    filename = _normalize_figure_ref(figure_ref)
    if not filename:
        return {"ok": False, "error": "Empty figure reference", "path": None}
    candidate = book_folder / filename
    if not candidate.is_file():
        return {"ok": False, "error": f"Figure not found: {filename}", "path": None}
    return {"ok": True, "path": str(candidate), "error": None}


def get_figure_for_agent(
    book_folder: Path, figure_ref: str, include_image: bool = True
) -> Dict[str, Any]:
    """
    Get figure path + prompt (and optionally image as base64) for injecting into the calling agent.
    """
    result = resolve_figure(book_folder, figure_ref)
    if not result["ok"]:
        return result
    path = result["path"]
    prompt = (
        f"Figure from the book (path: {path}). "
        "Use this image to answer the user's question about the figure or the surrounding section."
    )
    out: Dict[str, Any] = {"ok": True, "path": path, "prompt": prompt, "error": None}
    if include_image and path:
        try:
            with open(path, "rb") as f:
                out["image_base64"] = base64.standard_b64encode(f.read()).decode("ascii")
            suffix = Path(path).suffix.lower()
            out["image_media_type"] = (
                "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png" if suffix == ".png" else "application/octet-stream"
            )
        except OSError as e:
            out["image_base64"] = None
            out["image_media_type"] = None
            out["image_error"] = str(e)
    else:
        out["image_base64"] = None
        out["image_media_type"] = None
    return out


@figure_app.command("resolve")
def _resolve_cmd(
    path: Path = typer.Argument(..., help="Path to book folder or index.json", path_type=Path),
    figure_ref: str = typer.Argument(..., help="Figure ref: filename or ![](filename)"),
) -> None:
    """Resolve figure reference to absolute path."""
    try:
        _, md_path = resolve_book_path(path)
    except ValueError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)
    book_folder = md_path.parent
    result = resolve_figure(book_folder, figure_ref)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo(result["path"])


@figure_app.command("show")
def _show_cmd(
    path: Path = typer.Argument(..., help="Path to book folder or index.json", path_type=Path),
    figure_ref: str = typer.Argument(..., help="Figure ref: filename or ![](filename)"),
    no_image: bool = typer.Option(False, "--no-image", help="Do not include base64 image (path + prompt only)"),
) -> None:
    """Output path + prompt (and optional base64 image) for agent injection test."""
    try:
        _, md_path = resolve_book_path(path)
    except ValueError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)
    book_folder = md_path.parent
    result = get_figure_for_agent(book_folder, figure_ref, include_image=not no_image)
    if not result["ok"]:
        typer.echo(result["error"], err=True)
        raise typer.Exit(1)
    typer.echo("PATH: " + str(result["path"]))
    typer.echo("PROMPT: " + str(result["prompt"]))
    if result.get("image_base64"):
        b64 = result["image_base64"]
        typer.echo("IMAGE_BASE64: " + (b64[:80] + "..." if len(b64) > 80 else b64))
        typer.echo("IMAGE_MEDIA_TYPE: " + str(result.get("image_media_type", "")))
    elif result.get("image_error"):
        typer.echo("IMAGE_ERROR: " + result["image_error"], err=True)
