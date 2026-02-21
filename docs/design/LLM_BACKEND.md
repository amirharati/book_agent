# LLM backend

**Scope:** Shared LLM backend for book-agent tools (e.g. TOC inference when rule-based parsing fails). OpenRouter by default; designed so the provider can be swapped.

---

## 1. Usage

```python
from book_agent.llm import get_client, complete

# One-shot completion (uses default backend and model)
text = complete("What are the main chapters?", system="You are a helpful assistant.")

# Explicit client and model
client = get_client()  # default: openrouter
text = client.complete(
    [{"role": "user", "content": "..."}],
    model="anthropic/claude-3-haiku",
)
```

---

## 2. Configuration

| Env var | Purpose |
|--------|---------|
| `OPENROUTER_API_KEY` | API key for OpenRouter (required when using openrouter backend). |
| `OPENROUTER_MODEL` or `BOOK_AGENT_LLM_MODEL` | Default model if not set in tool config. |
| `BOOK_AGENT_LLM_PROVIDER` | Provider name (default: `openrouter`). Future: `openai`, `anthropic`, etc. |

**Tools config (Python):** Tool settings (how tools run) live in **`book_agent_tools.py`** (same directory as `.book_agent.json`).

- **LLM_MODEL** – default model for all tools.
- **LLM_MODELS** (optional) – dict of tool name → model id for per-tool overrides, e.g. `{"default": "...", "toc": "openai/gpt-4o-mini", "summary": "anthropic/claude-3-haiku"}`. The indexer uses `tool="toc"` when calling the LLM for TOC inference; other tools can pass their own key. If a tool key is missing, `default` then `LLM_MODEL` is used.

If the file is missing, code defaults are used. Edit the file directly, or run:

- `book-agent config set-llm-model openai/gpt-4o-mini` (creates/overwrites `book_agent_tools.py`)
- `book-agent config show` (displays tools config path and `LLM model: ...`)

**Setting the key**

- **Option A – `.env` file (recommended)**  
  Add a line to your project’s `.env` (e.g. repo root or current working directory):

  ```
  OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
  ```

  If you install the optional `env` extra, the LLM backend will load `.env` automatically when first used:

  ```bash
  pip install -e ".[env]"
  ```

- **Option B – shell**  
  ```bash
  export OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
  ```

Get an OpenRouter key at [openrouter.ai](https://openrouter.ai); the same key works for many models (OpenAI, Anthropic, etc.) via OpenRouter.

---

## 3. Swapping the provider

- **Interface:** `book_agent.llm.base.LLMBackend` is a `Protocol`: any class with `complete(messages, model=..., max_tokens=..., temperature=...) -> str` and a `name` property works.
- **Registry:** In `book_agent.llm.__init__`, `_REGISTRY` maps provider names to backend classes. Add a new class that implements the protocol and register it:

  ```python
  _REGISTRY["openai"] = OpenAIBackend  # hypothetical
  ```

- **OpenRouter** uses the OpenAI SDK with `base_url="https://openrouter.ai/api/v1"` and `api_key=OPENROUTER_API_KEY`; other providers can use their own SDK or the same SDK with different base URL and key.

---

## 4. When to use the LLM (e.g. for TOC)

- **Rules first:** Keep rule-based TOC parsing (Contents section, table + heading+page lines, body-start detection). Use the LLM only when rules fail or yield a broken index.
- **Fallback conditions (for indexer):** e.g. no Contents section and no meta TOC; or TOC parsed but inverted ranges / almost all entries UNRESOLVED. Then call the LLM with the list of all headings and ask it to infer which are TOC vs body and where the main content starts.
