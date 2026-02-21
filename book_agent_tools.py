# Book-agent tools config (how tools run). Edit as needed.
# See docs/design/LLM_BACKEND.md for options.

# Default model when a tool doesn't have its own entry in LLM_MODELS.
LLM_MODEL = "openai/gpt-4o-mini"

# Optional: per-tool model overrides. Keys are tool names (e.g. "toc", "summary").
# Omit or leave empty to use LLM_MODEL for all tools.
LLM_MODELS = {
    "default": "openai/gpt-4o-mini",
    "toc": "google/gemini-2.0-flash-001",
    # "summary": "anthropic/claude-3-haiku",  # example for a future tool
}
