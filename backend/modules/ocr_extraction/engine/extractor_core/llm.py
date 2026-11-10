"""Claude calls with a JSON-schema-constrained answer (same pattern as the PCF module's ai/client.py).

All failures become AIUnavailable so callers can fall back (rules, another provider, or a review flag).
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time

from . import limits

log = logging.getLogger("extractor.llm")
_client = None
_lock = threading.Lock()


class AIUnavailable(Exception):
    pass


def enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _get():
    global _client
    if not enabled():
        raise AIUnavailable("ANTHROPIC_API_KEY not set")
    with _lock:
        if _client is None:
            import anthropic
            _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=120, max_retries=2)
    return _client


def call_json(model: str, system: str, content: list[dict] | str, schema: dict, max_tokens: int = 8000,
              effort: str = "low") -> tuple[dict, dict]:
    """Returns (parsed JSON, usage dict)."""
    import anthropic
    client = _get()
    t0 = time.time()
    try:
        with limits.gate("claude"):                      # shared across all jobs, so one big upload cannot trip the rate limit
            t0 = time.time()
            resp = client.messages.create(
                model=model, max_tokens=max_tokens, system=system,
                messages=[{"role": "user", "content": content}],
                output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
            )
    except anthropic.APIStatusError as e:
        raise AIUnavailable(f"Claude error {e.status_code}: {getattr(e, 'message', e)}") from e
    except anthropic.APIConnectionError as e:
        raise AIUnavailable("Could not reach Claude") from e
    if resp.stop_reason in ("refusal", "max_tokens"):
        raise AIUnavailable(f"Claude stopped: {resp.stop_reason}")
    text = next((b.text for b in resp.content if b.type == "text"), None)
    if not text:
        raise AIUnavailable("Claude returned no text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise AIUnavailable("Claude returned invalid JSON") from e
    usage = {"provider": "anthropic", "model": model, "input_tokens": resp.usage.input_tokens,
             "output_tokens": resp.usage.output_tokens, "seconds": round(time.time() - t0, 3)}
    return data, usage


def nullable(t: dict) -> dict:
    return {"anyOf": [t, {"type": "null"}]}


def obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "additionalProperties": False, "properties": props,
            "required": list(props) if required is None else required}
