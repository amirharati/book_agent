"""Abstract interface for LLM backends. Implement this to plug in a new provider."""

from typing import Protocol, runtime_checkable


@runtime_checkable
class LLMBackend(Protocol):
    """Interface for LLM completion. Implement to add a provider (OpenRouter, OpenAI, etc.)."""

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> str:
        """
        Send messages and return the assistant reply as text.

        Args:
            messages: List of {"role": "user"|"assistant"|"system", "content": "..."}.
            model: Model id (provider-specific; e.g. OpenRouter uses "openai/gpt-4o-mini").
            max_tokens: Max tokens to generate.
            temperature: Sampling temperature (0 = deterministic).

        Returns:
            Assistant content string. Empty if no content or on error.
        """
        ...

    @property
    def name(self) -> str:
        """Backend identifier (e.g. 'openrouter')."""
        ...
