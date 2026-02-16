import json
import re
from pathlib import Path
from typing import List, Dict, Optional, Any

def load_index(index_path: Path) -> Dict[str, Any]:
    """Load the book index from a JSON file."""
    with open(index_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def _flatten_sections(sections: List[Dict], parent_path: str = "") -> List[Dict]:
    """Recursively flatten the section tree for searching."""
    flat = []
    for sec in sections:
        # Create a display title that includes the number if present
        title = sec.get("title", "Untitled")
        
        # Store essential info
        item = {
            "title": title,
            "level": sec.get("depth", 1),
            "pdf_page": sec.get("pdf_page"),
            "md_start_line": sec.get("md_start_line"),
            "md_end_line": sec.get("md_end_line"),
            "path": parent_path + " > " + title if parent_path else title
        }
        flat.append(item)
        
        if "children" in sec and sec["children"]:
            flat.extend(_flatten_sections(sec["children"], item["path"]))
            
    return flat

def search_sections(index: Dict[str, Any], query: str) -> List[Dict]:
    """
    Search for sections containing the query string in their title.
    Returns a list of flattened section objects.
    """
    query = query.lower().strip()
    all_sections = _flatten_sections(index.get("chapters", []))
    
    matches = []
    for sec in all_sections:
        if query in sec["title"].lower():
            matches.append(sec)
            
    return matches

def get_section_content(section: Dict, md_path: Path) -> str:
    """
    Read the markdown content for a specific section.
    """
    start = section.get("md_start_line")
    end = section.get("md_end_line")
    
    if start is None or end is None:
        return ""
        
    lines = []
    with open(md_path, 'r', encoding='utf-8') as f:
        # 1-based indexing in file reading logic usually implies enumerate or skipping
        # But commonly we just read all lines and slice. 
        # For very large files, linecache or seeking might be better, 
        # but reading all lines is fine for <50MB text files.
        all_lines = f.readlines()
        
        # Convert 1-based start to 0-based index
        # End is exclusive in Python slice, which matches our "end line is start of next" logic usually.
        # But we need to check if end_line is inclusive or exclusive in our index spec.
        # In markdown_index.py, md_end_line is the start of the next section, so it's exclusive.
        
        # Handle cases where start/end might be 0 or out of bounds
        s_idx = max(0, start - 1)
        e_idx = min(len(all_lines), end - 1)
        
        lines = all_lines[s_idx:e_idx]
        
    return "".join(lines)

def list_toc(index: Dict[str, Any], max_depth: int = 2) -> List[str]:
    """Return a formatted table of contents."""
    lines = []
    
    def _recurse(nodes, current_depth):
        if current_depth > max_depth:
            return
        for node in nodes:
            indent = "  " * (current_depth - 1)
            title = node.get("title", "Untitled")
            page = node.get("pdf_page", "?")
            lines.append(f"{indent}- {title} (p. {page})")
            
            if "children" in node:
                _recurse(node["children"], current_depth + 1)

    _recurse(index.get("chapters", []), 1)
    return lines
