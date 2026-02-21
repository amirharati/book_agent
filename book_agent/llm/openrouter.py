"""OpenRouter LLM backend (OpenAI-compatible API; supports many providers)."""

import logging
import os
from pathlib import Path
from typing import Any

from book_agent.llm.base import LLMBackend

log = logging.getLogger(__name__)


def _load_dotenv_if_available() -> None:
    """Load .env from project root or cwd so OPENROUTER_API_KEY is set. No-op if python-dotenv not installed."""
    try:
        from dotenv import load_dotenv
        # Prefer cwd (e.g. project root), then repo root
        for path in (Path.cwd() / ".env", Path(__file__).resolve().parents[2] / ".env"):
            if path.is_file():
                load_dotenv(path)
                break
    except ImportError:
        pass

# Default model: fast and cheap for structured tasks (TOC inference, etc.)
DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterBackend:
    """LLM backend using OpenRouter (https://openrouter.ai). Uses OpenAI SDK with custom base URL."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        default_model: str | None = None,
    ):
        _load_dotenv_if_available()
        self._api_key = api_key or os.environ.get("OPENROUTER_API_KEY", "")
        self._base_url = base_url or OPENROUTER_BASE_URL
        self._default_model = (
            default_model
            or os.environ.get("OPENROUTER_MODEL")
            or os.environ.get("BOOK_AGENT_LLM_MODEL")
            or DEFAULT_OPENROUTER_MODEL
        )
        self._client: Any = None

    def _get_client(self):
        if self._client is None:
            try:
                from openai import OpenAI
            except ImportError as e:
                raise ImportError(
                    "OpenRouter backend requires the openai package. Install with: pip install openai"
                ) from e
            if not self._api_key:
                raise ValueError(
                    "OpenRouter API key not set. Set OPENROUTER_API_KEY or pass api_key=..."
                )
            self._client = OpenAI(
                base_url=self._base_url,
                api_key=self._api_key,
            )
        return self._client

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        max_tokens: int = 4096,
        temperature: float = 0.0,
    ) -> str:
        model = model or self._default_model
        try:
            client = self._get_client()
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            choice = resp.choices[0] if resp.choices else None
            if choice and choice.message and choice.message.content:
                return choice.message.content.strip()
            return ""
        except Exception as e:
            log.warning("OpenRouter completion failed: %s", e)
            raise

    @property
    def name(self) -> str:
        return "openrouter"
