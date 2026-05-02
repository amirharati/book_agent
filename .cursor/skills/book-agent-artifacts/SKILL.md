---
name: book-agent-artifacts
description: When the project uses book-agent (.book_agent.json and MCP), resolve every book artifact write via get_config _resolved_output_dir only; never repo root or inputs unless the user overrides with an explicit path.
---

# Book-agent artifact paths

Use this skill whenever you are about to **create or save** files that come from working with a book (notes, summaries, notebooks, exports, figures you generate, logs, temp outputs).

## Steps

1. Ensure **book-agent MCP** is available. Call **`get_config`**.
2. Set **`AGENT_WRITE_ROOT`** to **`_resolved_output_dir`** from the response. If null, configure workspace first (`create_workspace`, `add_document`, etc.); do not pick a fallback folder.
3. Write **only** under **`AGENT_WRITE_ROOT`**. Subdirs (`study/`, `notebook_artifacts/`, `notebooks/`, …) must be **nested inside** that path.
4. **Forbidden** unless the user explicitly supplies a full path: **`inputs/`**, **project root**, or any directory outside the resolved output tree.

Re-call **`get_config`** before a new batch of writes if the workspace may have changed.

## Reference

- Canonical rule: `.cursor/rules/book-agent.mdc` (**Output root (hard requirement)**).
- Human summary: `docs/USAGE.md` — **One-time setup** (global skill symlink) and **Reference → Outputs policy**.
