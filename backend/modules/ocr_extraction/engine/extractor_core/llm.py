"""JSON-schema-constrained AI calls with a provider chain: OpenAI first, Claude second (policy.json -> ai_chain).

Only the customer's own OPENAI_API_KEY / ANTHROPIC_API_KEY are used - never a platform or shared key.
Every failure is classified so the caller can react correctly:
  rate_limit / timeout / server   temporary: retried with backoff, then the next provider is tried
  no_credit / auth                permanent for now: never retried, the provider is skipped for a cool-down period
  refusal / bad_response / other  this provider cannot answer this request: the next provider is tried
All failures become AIUnavailable (with .kind and .failures) so callers can fall back to rules or a review flag.
"""
from __future__ import annotations

import json
import logging
import os
import random
import threading
import time

from . import limits
from .config import load

log = logging.getLogger("extractor.llm")
RETRYABLE = {"rate_limit", "timeout", "server"}
BLOCKING = {"no_credit": "no_credit_block_s", "auth": "auth_block_s"}
KEY_ENV = {"openai": "OPENAI_API_KEY", "claude": "ANTHROPIC_API_KEY"}
_clients: dict[str, object] = {}
_lock = threading.Lock()
_blocked: dict[str, tuple[str, float]] = {}      # provider -> (kind, blocked until)


class AIUnavailable(Exception):
    def __init__(self, message: str, kind: str = "other", failures: list[dict] | None = None):
        super().__init__(message)
        self.kind = kind
        self.failures = failures or []
        self.retry_after: float | None = None


def provider_enabled(provider: str) -> bool:
    return bool(os.environ.get(KEY_ENV[provider]))


def enabled() -> bool:
    return any(provider_enabled(p) for p in KEY_ENV)


def chain() -> list[str]:
    return [p for p in load().policy.get("ai_chain", ["openai", "claude"]) if p in KEY_ENV]


def _model(provider: str, task: str) -> str:
    return load().policy["openai_models" if provider == "openai" else "models"][task]


def _client(provider: str):
    with _lock:
        if provider not in _clients:
            key = os.environ[KEY_ENV[provider]]
            if provider == "openai":
                import openai
                _clients[provider] = openai.OpenAI(api_key=key, timeout=120, max_retries=0)
            else:
                import anthropic
                _clients[provider] = anthropic.Anthropic(api_key=key, timeout=120, max_retries=0)
        return _clients[provider]


# ------------------------------------------------------------------------------- failure classification
def _body_text(e) -> str:
    body = getattr(e, "body", None)
    return (json.dumps(body, default=str) if isinstance(body, (dict, list)) else str(body or "")) + " " + str(getattr(e, "message", e))


def classify_failure(e: Exception) -> str:
    """HTTP 429 is NOT always 'no credit': OpenAI says insufficient_quota for an empty balance, plain 429 for rate limiting."""
    status = getattr(e, "status_code", None)
    text = _body_text(e).lower()
    if status == 402 or "insufficient_quota" in text or "credit balance is too low" in text:
        return "no_credit"
    if status in (401, 403):
        return "auth"
    if status == 429:
        return "rate_limit"
    if status in (408, 504) or type(e).__name__ in ("APITimeoutError", "APIConnectionError"):
        return "timeout"
    if status and (status >= 500 or status == 529):
        return "server"
    return "other"


def _retry_after(e) -> float | None:
    try:
        return float(e.response.headers.get("retry-after"))
    except (AttributeError, TypeError, ValueError):
        return None


def _log(event: str, **kw) -> None:
    log.info(json.dumps({"event": event, **kw}, default=str))


# ------------------------------------------------------------------------------- one provider, one attempt
def _openai_content(content) -> list[dict] | str:
    if isinstance(content, str):
        return content
    out = []
    for b in content:
        if b["type"] == "text":
            out.append({"type": "text", "text": b["text"]})
        else:
            s = b["source"]
            out.append({"type": "image_url", "image_url": {"url": f"data:{s['media_type']};base64,{s['data']}"}})
    return out


def _openai_once(model: str, system: str, content, schema: dict, max_tokens: int, effort: str) -> tuple[dict, dict]:
    resp = _client("openai").chat.completions.create(
        model=model, max_completion_tokens=max_tokens, reasoning_effort=effort,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": _openai_content(content)}],
        response_format={"type": "json_schema", "json_schema": {"name": "result", "strict": True, "schema": schema}})
    ch = resp.choices[0]
    if ch.message.refusal or ch.finish_reason == "length" or not ch.message.content:
        raise AIUnavailable(f"OpenAI stopped: {ch.message.refusal or ch.finish_reason}", "bad_response")
    return json.loads(ch.message.content), {"input_tokens": resp.usage.prompt_tokens, "output_tokens": resp.usage.completion_tokens}


def _claude_once(model: str, system: str, content, schema: dict, max_tokens: int, effort: str) -> tuple[dict, dict]:
    resp = _client("claude").messages.create(
        model=model, max_tokens=max_tokens, system=system, messages=[{"role": "user", "content": content}],
        output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}})
    if resp.stop_reason in ("refusal", "max_tokens"):
        raise AIUnavailable(f"Claude stopped: {resp.stop_reason}", "bad_response")
    text = next((b.text for b in resp.content if b.type == "text"), None)
    if not text:
        raise AIUnavailable("Claude returned no text", "bad_response")
    return json.loads(text), {"input_tokens": resp.usage.input_tokens, "output_tokens": resp.usage.output_tokens}


_ONCE = {"openai": _openai_once, "claude": _claude_once}


def call_provider(provider: str, model: str, system: str, content, schema: dict, max_tokens: int = 8000,
                  effort: str = "low", task: str = "ai") -> tuple[dict, dict]:
    """One provider with retries for temporary failures. Returns (parsed JSON, usage); raises AIUnavailable."""
    if not provider_enabled(provider):
        raise AIUnavailable(f"{KEY_ENV[provider]} not set", "auth")
    kind, until = _blocked.get(provider, (None, 0.0))
    if kind and time.time() < until:
        raise AIUnavailable(f"skipped ({kind}, will be tried again later)", kind)
    pol = load().policy.get("ai_retry", {})
    attempts = int(pol.get("attempts", 3))
    err = AIUnavailable(f"{provider} failed")
    for attempt in range(1, attempts + 1):
        t0 = time.time()
        try:
            with limits.gate(provider):
                t0 = time.time()
                data, usage = _ONCE[provider](model, system, content, schema, max_tokens, effort)
            _log("ai_call", provider=provider, model=model, task=task, status="ok", attempt=attempt, seconds=round(time.time() - t0, 2))
            return data, {"provider": provider, "model": model, "seconds": round(time.time() - t0, 3), "attempts": attempt, **usage}
        except AIUnavailable as e:
            err = e
        except json.JSONDecodeError:
            err = AIUnavailable(f"{provider} returned invalid JSON", "bad_response")
        except Exception as e:  # noqa: BLE001 - SDK errors differ per provider; classified here
            err = AIUnavailable(f"HTTP {getattr(e, 'status_code', '?')}: {_body_text(e)[:200]}", classify_failure(e))
            err.retry_after = _retry_after(e)
        _log("ai_call", provider=provider, model=model, task=task, status="failed", kind=err.kind, attempt=attempt, reason=str(err)[:200])
        if err.kind in RETRYABLE and attempt < attempts:
            time.sleep(min(err.retry_after or float(pol.get("backoff_s", 1.5)) * 2 ** (attempt - 1), 20) + random.random() * 0.5)
            continue
        break
    if err.kind in BLOCKING:
        _blocked[provider] = (err.kind, time.time() + float(pol.get(BLOCKING[err.kind], 900)))
    raise err


# ------------------------------------------------------------------------------- the provider chain
def call_json(task: str, system: str, content, schema: dict, max_tokens: int = 8000, effort: str = "low") -> tuple[dict, dict]:
    """task is a key of policy.json -> models / openai_models. Returns (parsed JSON, usage); usage['failures'] lists the
    providers that failed on the way (a fallback happened). Raises AIUnavailable when every provider failed."""
    failures: list[dict] = []
    for provider in chain():
        model = _model(provider, task)
        try:
            data, usage = call_provider(provider, model, system, content, schema, max_tokens, effort, task)
            return data, {**usage, "failures": failures}
        except AIUnavailable as e:
            failures.append({"provider": provider, "model": model, "task": task, "kind": e.kind, "reason": str(e)[:200]})
    kinds = {f["kind"] for f in failures}
    kind = "no_credit" if "no_credit" in kinds else "rate_limit" if "rate_limit" in kinds else (failures[-1]["kind"] if failures else "auth")
    raise AIUnavailable("; ".join(f"{f['provider']}: {f['reason']}" for f in failures) or "No AI provider is configured", kind, failures)


def nullable(t: dict) -> dict:
    return {"anyOf": [t, {"type": "null"}]}


def obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "additionalProperties": False, "properties": props,
            "required": list(props) if required is None else required}
