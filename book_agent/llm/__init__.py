"""
LLM backend for book-agent tools (e.g. TOC inference when rules fail).

Uses OpenRouter by default (many providers, single API). Swap by passing a different
backend to get_client() or by implementing book_agent.llm.base.LLMBackend.

Usage:

    from book_agent.llm import get_client, complete

    client = get_client()  # default: openrouter
    text = complete("List the main chapters in this book.", system="You are a helpful assistant.")

    # Or with explicit messages and model
    text = client.complete(
        [{"role": "user", "content": "..."}],
        model="anthropic/claude-3-haiku",
    )
"""

import os
from typing import Any

from book_agent.llm.base import LLMBackend
from book_agent.llm.openrouter import OpenRouterBackend

__all__ = [
    "LLMBackend",
    "OpenRouterBackend",
    "get_client",
    "complete",
]

# Registry: provider name -> backend class (or factory)
_REGISTRY: dict[str, type[LLMBackend]] = {
    "openrouter": OpenRouterBackend,
}

# Default provider (env allows override for future use)
_DEFAULT_PROVIDER = os.environ.get("BOOK_AGENT_LLM_PROVIDER", "openrouter")


def get_client(
    provider: str | None = None,
    model: str | None = None,
    tool: str | None = None,
    **kwargs: Any,
) -> LLMBackend:
    """
    Return an LLM backend instance.

    Args:
        provider: One of "openrouter", or leave None for default (openrouter).
        model: Explicit model for this backend (overrides tool config).
        tool: Tool/feature name (e.g. "toc", "summary") to look up model from
              LLM_MODELS in book_agent_tools.py; falls back to default.
        **kwargs: Passed to the backend constructor (e.g. api_key).

    Returns:
        An LLMBackend (e.g. OpenRouterBackend) with .complete(messages, ...).
    """
    name = provider or _DEFAULT_PROVIDER
    if name not in _REGISTRY:
        raise KeyError(
            f"Unknown LLM provider: {name}. Available: {list(_REGISTRY)}"
        )
    if model is not None:
        kwargs["default_model"] = model
    else:
        try:
            from book_agent.config import load_tools_config
            tools = load_tools_config()
            models = tools.get("llm_models") or {}
            cfg_model = (tool and models.get(tool)) or models.get("default") or tools.get("llm_model")
            if cfg_model:
                kwargs["default_model"] = cfg_model
        except Exception:
            pass
    return _REGISTRY[name](**kwargs)


def complete(
    prompt: str,
    *,
    system: str | None = None,
    model: str | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.0,
    client: LLMBackend | None = None,
) -> str:
    """
    One-shot completion: build messages from prompt (and optional system), call LLM, return text.

    Args:
        prompt: User message content.
        system: Optional system message.
        model: Override default model for this call.
        max_tokens: Max tokens to generate.
        temperature: Sampling temperature.
        client: LLM backend to use; if None, uses get_client().

    Returns:
        Assistant reply text.
    """
    messages: list[dict[str, str]] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    backend = client or get_client()
    return backend.complete(
        messages,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature,
    )
