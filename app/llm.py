"""Thin Anthropic SDK wrapper: timeout + one retry, token usage always returned."""
from __future__ import annotations

import os
from dataclasses import dataclass

from anthropic import Anthropic, APIError, APITimeoutError

from app.config import LLM_MAX_RETRIES, LLM_MODEL, LLM_TIMEOUT_SECONDS

_client: Anthropic | None = None


def get_client() -> Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
            )
        _client = Anthropic(api_key=api_key, timeout=LLM_TIMEOUT_SECONDS)
    return _client


@dataclass
class LLMResult:
    text: str
    tokens_in: int
    tokens_out: int


def call_llm(
    system: str,
    user: str,
    max_tokens: int = 1500,
) -> LLMResult:
    """Call the configured model. One retry on API failure. Raises on final failure."""
    last_exc: Exception | None = None
    for attempt in range(LLM_MAX_RETRIES + 1):
        try:
            resp = get_client().messages.create(
                model=LLM_MODEL,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            text = "".join(
                block.text for block in resp.content if getattr(block, "type", "") == "text"
            )
            return LLMResult(
                text=text,
                tokens_in=resp.usage.input_tokens,
                tokens_out=resp.usage.output_tokens,
            )
        except (APITimeoutError, APIError) as exc:
            last_exc = exc
    raise RuntimeError(f"LLM call failed after {LLM_MAX_RETRIES + 1} attempts: {last_exc}")
