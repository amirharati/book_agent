"""Single-job tools: one module per tool (figure, etc.)."""

from book_agent.tools.figure import figure_app, resolve_figure, get_figure_for_agent

__all__ = ["figure_app", "resolve_figure", "get_figure_for_agent"]
