"""
Config and workspace: main config (documents, output_root, current_workspace) plus
per-workspace config under output_root/<workspace_id>/.book_workspace.json.
Paths are relative to config file directory. Document ids and workspace ids are unique and user-chosen.
"""

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from book_agent.path_utils import resolve_book_path

CONFIG_FILENAME = ".book_agent.json"
WORKSPACE_CONFIG_FILENAME = ".book_workspace.json"
DEFAULT_OUTPUT_ROOT = "outputs"


def _find_repo_root() -> Path | None:
    """Walk up from package dir to find a directory containing pyproject.toml or .book_agent.json."""
    try:
        start = Path(__file__).resolve().parent
    except NameError:
        return None
    for parent in [start, *start.parents]:
        if (parent / "pyproject.toml").exists() or (parent / CONFIG_FILENAME).exists():
            return parent
    return None


def get_config_path() -> Path:
    """Path to the config file. Env BOOK_AGENT_CONFIG wins; else cwd; else repo root; else cwd for create."""
    env_path = os.environ.get("BOOK_AGENT_CONFIG")
    if env_path:
        return Path(env_path).resolve()
    cwd_file = (Path.cwd() / CONFIG_FILENAME).resolve()
    if cwd_file.exists():
        return cwd_file
    repo = _find_repo_root()
    if repo is not None:
        repo_file = repo / CONFIG_FILENAME
        if repo_file.exists():
            return repo_file
        return repo_file
    return cwd_file


def _default_config() -> Dict[str, Any]:
    return {
        "documents": {},
        "output_root": DEFAULT_OUTPUT_ROOT,
        "current_workspace": None,
    }


def _config_base_path() -> Path:
    """Directory to resolve relative paths from (config file dir or cwd)."""
    p = get_config_path()
    if p.exists():
        return p.parent
    return Path.cwd()


def _find_config_file() -> Path | None:
    """Return path to existing .book_agent.json, or None."""
    env_path = os.environ.get("BOOK_AGENT_CONFIG")
    if env_path:
        p = Path(env_path).resolve()
        if p.exists():
            return p
    repo = _find_repo_root()
    if repo is not None:
        rp = (repo / CONFIG_FILENAME).resolve()
        if rp.exists():
            return rp
    for d in [Path.cwd(), *Path.cwd().parents]:
        cf = (d / CONFIG_FILENAME).resolve()
        if cf.exists():
            return cf
    return None


def _migrate_old_config(data: Dict[str, Any]) -> Dict[str, Any]:
    """Migrate books/current_book/outputs to documents + output_root + current_workspace + workspace config. Saves once."""
    if "books" not in data and "current_book" not in data:
        return data
    base = _config_base_path()
    documents = data.get("documents", {})
    if not documents and "books" in data and isinstance(data["books"], dict):
        documents = dict(data["books"])
    output_root = data.get("output_root", DEFAULT_OUTPUT_ROOT)
    if not isinstance(output_root, str):
        output_root = DEFAULT_OUTPUT_ROOT
    current_workspace = data.get("current_workspace")
    if current_workspace is None and data.get("current_book"):
        current_workspace = data["current_book"]
    data["documents"] = documents
    data["output_root"] = output_root
    data["current_workspace"] = current_workspace
    if "books" in data:
        del data["books"]
    if "current_book" in data:
        del data["current_book"]
    if "outputs" in data:
        del data["outputs"]
    if current_workspace and documents:
        workspace_dir = base / output_root / current_workspace
        workspace_dir.mkdir(parents=True, exist_ok=True)
        ws_path = workspace_dir / WORKSPACE_CONFIG_FILENAME
        if not ws_path.exists():
            doc_list = [current_workspace] if current_workspace in documents else list(documents.keys())[:1]
            ws_data = {"documents": doc_list, "current_document": current_workspace if current_workspace in documents else (doc_list[0] if doc_list else None), "output_subdirs": {}}
            with open(ws_path, "w", encoding="utf-8") as f:
                json.dump(ws_data, f, indent=2)
    save_config(data)
    return data


def load_config() -> Dict[str, Any]:
    """Load config from file or return defaults. Migrates old schema if present."""
    path = _find_config_file()
    if path is None:
        out = _default_config()
        out["_config_file"] = str(get_config_path())
        out["_no_file"] = True
        return out
    path = path.resolve()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        out = _default_config()
        out["_config_file"] = str(path)
        out["_load_error"] = True
        return out
    if "documents" not in data or not isinstance(data.get("documents"), dict):
        data.setdefault("documents", {})
    if "output_root" not in data or not isinstance(data.get("output_root"), str):
        data["output_root"] = DEFAULT_OUTPUT_ROOT
    if "current_workspace" not in data:
        data["current_workspace"] = None
    data = _migrate_old_config(data)
    data["_config_file"] = str(path)
    data["_no_file"] = False
    return data


def save_config(data: Dict[str, Any]) -> None:
    """Save main config. Only writes documents, output_root, current_workspace."""
    path = data.get("_config_file")
    if path:
        path = Path(path)
    else:
        path = get_config_path()
    to_save = {
        "documents": data.get("documents", {}),
        "output_root": data.get("output_root", DEFAULT_OUTPUT_ROOT),
        "current_workspace": data.get("current_workspace"),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_save, f, indent=2)


def get_workspace_dir(workspace_id: Optional[str] = None) -> Optional[Path]:
    """Return path to workspace directory. If workspace_id is None, use current_workspace."""
    data = load_config()
    if workspace_id is None:
        workspace_id = data.get("current_workspace")
    if not workspace_id:
        return None
    base = _config_base_path()
    root = data.get("output_root", DEFAULT_OUTPUT_ROOT)
    path = (base / root / workspace_id).resolve()
    return path if path.is_dir() else None


def load_workspace_config(workspace_id: str) -> Dict[str, Any]:
    """Load workspace config from output_root/workspace_id/.book_workspace.json. Returns defaults if missing."""
    base = _config_base_path()
    data = load_config()
    root = data.get("output_root", DEFAULT_OUTPUT_ROOT)
    path = base / root / workspace_id / WORKSPACE_CONFIG_FILENAME
    defaults = {"documents": [], "current_document": None, "output_subdirs": {}}
    if not path.exists():
        return defaults
    try:
        with open(path, "r", encoding="utf-8") as f:
            ws = json.load(f)
    except (json.JSONDecodeError, OSError):
        return defaults
    if not isinstance(ws.get("documents"), list):
        ws["documents"] = []
    if "current_document" not in ws:
        ws["current_document"] = None
    if not isinstance(ws.get("output_subdirs"), dict):
        ws["output_subdirs"] = {}
    return ws


def save_workspace_config(workspace_id: str, ws_data: Dict[str, Any]) -> None:
    """Write workspace config to output_root/workspace_id/.book_workspace.json."""
    base = _config_base_path()
    data = load_config()
    root = data.get("output_root", DEFAULT_OUTPUT_ROOT)
    dir_path = base / root / workspace_id
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / WORKSPACE_CONFIG_FILENAME
    to_save = {
        "documents": ws_data.get("documents", []),
        "current_document": ws_data.get("current_document"),
        "output_subdirs": ws_data.get("output_subdirs", {}),
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(to_save, f, indent=2)


def get_document_path(doc_id: str) -> Optional[Path]:
    """Resolve document id to book folder path. Returns None if not in registry or path invalid."""
    data = load_config()
    documents = data.get("documents", {})
    if not doc_id or doc_id not in documents:
        return None
    base = _config_base_path()
    raw = documents[doc_id]
    candidate = (base / raw).resolve()
    try:
        index_path, md_path = resolve_book_path(candidate)
        return md_path.parent
    except ValueError:
        return None


def get_document_path_for_agent(doc_id: Optional[str] = None) -> Optional[Path]:
    """
    Resolve to a book folder path for toc/search/read/figure.
    If doc_id is given, resolve that document. If None: use current workspace's current_document,
    or single document in workspace; else None.
    """
    if doc_id:
        return get_document_path(doc_id)
    workspace_id = load_config().get("current_workspace")
    if not workspace_id:
        return None
    ws = load_workspace_config(workspace_id)
    current = ws.get("current_document")
    if current and get_document_path(current) is not None:
        return get_document_path(current)
    docs = ws.get("documents", [])
    if len(docs) == 1:
        return get_document_path(docs[0])
    return None


def get_output_dir(workspace_id: Optional[str] = None, subdir_key: Optional[str] = None) -> Optional[Path]:
    """Return directory for writing outputs. Uses workspace root or output_subdirs[subdir_key] if set."""
    dir_path = get_workspace_dir(workspace_id)
    if dir_path is None:
        return None
    if not subdir_key:
        return dir_path
    ws_id = workspace_id or load_config().get("current_workspace")
    if not ws_id:
        return dir_path
    ws = load_workspace_config(ws_id)
    subdirs = ws.get("output_subdirs", {})
    subdir = subdirs.get(subdir_key) if isinstance(subdirs, dict) else None
    if subdir:
        return (dir_path / subdir).resolve()
    return dir_path


def add_document(doc_id: str, path: str) -> Dict[str, Any]:
    """Add or update a document in the registry. doc_id must be non-empty; path validated. Saves config."""
    doc_id = (doc_id or "").strip()
    if not doc_id:
        return {"ok": False, "error": "Document id cannot be empty.", "config": get_config()}
    data = load_config()
    if data.get("_no_file") or data.get("_load_error"):
        data = _default_config()
        data["_config_file"] = str(get_config_path())
    if "documents" not in data:
        data["documents"] = {}
    base = _config_base_path()
    candidate = (base / path).resolve()
    try:
        index_path, md_path = resolve_book_path(candidate)
        book_folder = md_path.parent
    except ValueError as e:
        return {"ok": False, "error": str(e), "config": get_config()}
    data["documents"][doc_id] = path
    save_config(data)
    return {"ok": True, "config": get_config(), "resolved_path": str(book_folder)}


def create_workspace(workspace_id: str) -> Dict[str, Any]:
    """Create workspace directory and default config. Fails if workspace_id already exists (unique)."""
    workspace_id = (workspace_id or "").strip()
    if not workspace_id:
        return {"ok": False, "error": "Workspace id cannot be empty.", "config": get_config()}
    data = load_config()
    if data.get("_no_file") or data.get("_load_error"):
        data = _default_config()
        data["_config_file"] = str(get_config_path())
    base = _config_base_path()
    root = data.get("output_root", DEFAULT_OUTPUT_ROOT)
    dir_path = base / root / workspace_id
    if dir_path.exists():
        return {"ok": False, "error": f"Workspace '{workspace_id}' already exists at {dir_path}.", "config": get_config()}
    dir_path.mkdir(parents=True, exist_ok=True)
    save_workspace_config(workspace_id, {"documents": [], "current_document": None, "output_subdirs": {}})
    return {"ok": True, "config": get_config(), "workspace_dir": str(dir_path)}


def set_current_workspace(workspace_id: str) -> Dict[str, Any]:
    """Set current workspace. workspace_id must exist (directory under output_root). Saves config."""
    workspace_id = (workspace_id or "").strip()
    if not workspace_id:
        return {"ok": False, "error": "Workspace id cannot be empty.", "config": get_config()}
    if get_workspace_dir(workspace_id) is None:
        data = load_config()
        base = _config_base_path()
        root = data.get("output_root", DEFAULT_OUTPUT_ROOT)
        path = base / root / workspace_id
        return {"ok": False, "error": f"Workspace '{workspace_id}' not found at {path}. Create it with config create-workspace.", "config": get_config()}
    data = load_config()
    if data.get("_no_file") or data.get("_load_error"):
        data = _default_config()
        data["_config_file"] = str(get_config_path())
    data["current_workspace"] = workspace_id
    save_config(data)
    return {"ok": True, "config": get_config()}


def add_document_to_workspace(workspace_id: str, doc_id: str) -> Dict[str, Any]:
    """Add document to workspace's list. doc_id must be in main documents; no duplicate in list."""
    data = load_config()
    if doc_id not in data.get("documents", {}):
        return {"ok": False, "error": f"Document '{doc_id}' not in registry. Add it with config add-document.", "config": get_config()}
    if get_workspace_dir(workspace_id) is None:
        return {"ok": False, "error": f"Workspace '{workspace_id}' not found.", "config": get_config()}
    ws = load_workspace_config(workspace_id)
    docs: List[str] = list(ws.get("documents", []))
    if doc_id in docs:
        return {"ok": True, "config": get_config(), "message": f"Document '{doc_id}' already in workspace."}
    docs.append(doc_id)
    ws["documents"] = docs
    save_workspace_config(workspace_id, ws)
    return {"ok": True, "config": get_config()}


def remove_document_from_workspace(workspace_id: str, doc_id: str) -> Dict[str, Any]:
    """Remove document from workspace's list."""
    if get_workspace_dir(workspace_id) is None:
        return {"ok": False, "error": f"Workspace '{workspace_id}' not found.", "config": get_config()}
    ws = load_workspace_config(workspace_id)
    docs = [d for d in ws.get("documents", []) if d != doc_id]
    ws["documents"] = docs
    if ws.get("current_document") == doc_id:
        ws["current_document"] = docs[0] if docs else None
    save_workspace_config(workspace_id, ws)
    return {"ok": True, "config": get_config()}


def set_workspace_current_document(workspace_id: str, doc_id: Optional[str]) -> Dict[str, Any]:
    """Set current_document in workspace. doc_id must be in workspace's documents or None."""
    if get_workspace_dir(workspace_id) is None:
        return {"ok": False, "error": f"Workspace '{workspace_id}' not found.", "config": get_config()}
    ws = load_workspace_config(workspace_id)
    if doc_id is not None and doc_id not in ws.get("documents", []):
        return {"ok": False, "error": f"Document '{doc_id}' not in workspace.", "config": get_config()}
    ws["current_document"] = doc_id
    save_workspace_config(workspace_id, ws)
    return {"ok": True, "config": get_config()}


def set_workspace_output_subdir(workspace_id: str, key: str, subdir: str) -> Dict[str, Any]:
    """Set output_subdirs[key] = subdir for workspace."""
    if get_workspace_dir(workspace_id) is None:
        return {"ok": False, "error": f"Workspace '{workspace_id}' not found.", "config": get_config()}
    ws = load_workspace_config(workspace_id)
    if "output_subdirs" not in ws or not isinstance(ws["output_subdirs"], dict):
        ws["output_subdirs"] = {}
    ws["output_subdirs"][key] = subdir
    save_workspace_config(workspace_id, ws)
    return {"ok": True, "config": get_config()}


def get_config() -> Dict[str, Any]:
    """Full config with resolved workspace and current document path for agent."""
    data = load_config()
    base = _config_base_path()
    data["_resolved_output_root"] = str((base / data.get("output_root", DEFAULT_OUTPUT_ROOT)).resolve())
    workspace_id = data.get("current_workspace")
    data["_resolved_current_workspace_dir"] = str(get_workspace_dir(None)) if get_workspace_dir(None) else None
    ws_docs = []
    if workspace_id:
        ws = load_workspace_config(workspace_id)
        ws_docs = list(ws.get("documents", []))
    data["_workspace_documents"] = ws_docs
    path = get_document_path_for_agent(None)
    data["_resolved_current_document_path"] = str(path) if path else None
    data["_resolved_output_dir"] = str(get_output_dir(None)) if get_output_dir(None) else None
    return data


def get_book_path(book_id: Optional[str] = None) -> Optional[Path]:
    """Backward-compat: same as get_document_path_for_agent. Prefer get_document_path_for_agent."""
    return get_document_path_for_agent(book_id)


def set_current_book(book_id: str) -> Dict[str, Any]:
    """Backward-compat: set current workspace to a workspace with same id if it exists, and set current_document to book_id."""
    data = load_config()
    if book_id not in data.get("documents", {}):
        return {"ok": False, "error": f"Document '{book_id}' not in config. Add it with config add-document.", "config": get_config()}
    ws_dir = get_workspace_dir(book_id)
    if ws_dir is None:
        create_workspace(book_id)
        add_document_to_workspace(book_id, book_id)
        set_workspace_current_document(book_id, book_id)
    set_current_workspace(book_id)
    set_workspace_current_document(book_id, book_id)
    return {"ok": True, "config": get_config()}


def add_book(book_id: str, path: str) -> Dict[str, Any]:
    """Backward-compat: add document and optionally add to same-named workspace."""
    result = add_document(book_id, path)
    if not result["ok"]:
        return result
    ws_dir = get_workspace_dir(book_id)
    if ws_dir is not None:
        add_document_to_workspace(book_id, book_id)
        set_workspace_current_document(book_id, book_id)
    return result


def set_output(key: str, path: str) -> Dict[str, Any]:
    """Backward-compat: set output subdir for current workspace. path = subdir name under workspace root."""
    workspace_id = load_config().get("current_workspace")
    if not workspace_id:
        return {"ok": False, "error": "No current workspace. Set one with config set-current-workspace.", "config": get_config()}
    return set_workspace_output_subdir(workspace_id, key, path)
