# Agent Capabilities & Roadmap

This document outlines the current capabilities of the Book Agent and the roadmap for future enhancements.

## Current Capabilities (Phase 1: Text Foundation)

As of **Feb 2026**, the agent utilizes a **"Search-Read-Answer"** loop to interact with book content.

### 1. Navigation & Search
*   **Table of Contents:** Can list the full book structure (chapters, sections, subsections) with PDF page numbers.
*   **Topic Search:** Can locate specific sections by title keywords (e.g., finding where "Gaussian Processes" are discussed).

### 2. Reading & Comprehension
*   **Text Extraction:** Can read the full Markdown text of any section.
*   **Math Support:** Can read and interpret LaTeX-formatted math equations embedded in the text.
*   **Contextual Answering:** Can synthesize answers to user questions based *strictly* on the retrieved text, minimizing hallucinations.

### 3. Tooling
The agent uses the book-agent tools (CLI or Python `book_agent.agent_tools`) when answering about the book or using book content in notebooks. Cursor is instructed via `.cursor/rules/book-agent.mdc`.
*   `book-agent toc` / `run_toc` — list table of contents
*   `book-agent search` / `run_search` — find sections by title
*   `book-agent read` / `run_read` — get section markdown
*   `book-agent figure resolve|show` / `resolve_figure`, `get_figure_for_agent` — resolve figure ref to path (and optional base64); agent loads image to interpret or insert

---

## Roadmap (Future Phases)

The following features are planned to build upon the text foundation.

### Phase 2: Multi-hop Reasoning
*   **Goal:** Answer questions that span multiple sections (e.g., "Compare the definition of X in Chapter 3 vs Chapter 9").
*   **Implementation:** Enhanced agent protocol to maintain context across multiple `read` operations before synthesizing a final answer.

### Phase 3: Visual Intelligence (Multimodal)
*   **Goal:** Enable the agent to "see" and describe charts, graphs, and diagrams.
*   **Status (v1):** Figure tool implemented: resolve ref → path (+ optional base64). Agent (Cursor) loads the image from path and interprets it; no separate vision API. See `docs/design/TOOL_IMAGE_FIGURE.md`.
*   **Future:** Optional "describe" step (vision API) if needed for non-Cursor callers.

### Phase 4: Active Coding
*   **Goal:** Turn mathematical descriptions into executable Python code.
*   **Scenario:** "Implement the algorithm described in Equation 3.15."
*   **Implementation:**
    *   Refined prompt engineering to translate LaTeX math to NumPy/PyTorch code.
    *   Integration with a sandbox to run and verify the generated code.

### Phase 5: PDF Linking
*   **Goal:** Deep link between Markdown text and the original PDF.
*   **Implementation:** Use the `meta.json` layout data (polygons) to map text locations back to specific coordinates in the PDF for a "Click to View" experience.
