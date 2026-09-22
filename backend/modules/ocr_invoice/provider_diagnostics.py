"""Safe, allow-listed diagnostics for native OCR provider failures."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any


_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,160}$")
_QUOTA_CODES = {
    "billing_hard_limit_reached",
    "credit_balance_too_low",
    "credit_limit_reached",
    "insufficient_credits",
    "insufficient_quota",
}


def _safe_request_id(value: Any) -> str | None:
    return value if isinstance(value, str) and _REQUEST_ID_PATTERN.fullmatch(value) else None


def _status_code(error: BaseException) -> int | None:
    value = getattr(error, "status_code", None)
    return value if isinstance(value, int) and 100 <= value <= 599 else None


def _provider_request_id(error: BaseException) -> str | None:
    request_id = _safe_request_id(getattr(error, "request_id", None))
    if request_id:
        return request_id
    headers = getattr(getattr(error, "response", None), "headers", None)
    if headers:
        return _safe_request_id(headers.get("request-id") or headers.get("x-request-id"))
    return None


def _provider_error_codes(error: BaseException) -> set[str]:
    body = getattr(error, "body", None)
    if not isinstance(body, dict):
        return set()
    nested = body.get("error") if isinstance(body.get("error"), dict) else {}
    return {
        value.strip().lower()
        for value in (body.get("code"), body.get("type"), nested.get("code"), nested.get("type"))
        if isinstance(value, str)
    }


def _category(error: BaseException) -> str:
    codes = _provider_error_codes(error)
    status_code = _status_code(error)
    error_name = type(error).__name__.lower()
    if codes & _QUOTA_CODES or status_code == 402:
        return "quota"
    if "timeout" in error_name or status_code in {408, 504}:
        return "timeout"
    if "connection" in error_name or "network" in error_name:
        return "network"
    if status_code == 401:
        return "authentication"
    if status_code == 403:
        return "permission"
    if status_code in {400, 413, 422}:
        return "invalid_request"
    if status_code == 404:
        return "not_found"
    if status_code == 429:
        return "rate_limit"
    if status_code == 529 or "overloaded" in error_name:
        return "overloaded"
    if status_code and status_code >= 500:
        return "provider_server"
    if "validation" in error_name:
        return "response_validation"
    return "unknown"


class OcrProviderError(RuntimeError):
    """Provider failure that carries only bounded, non-secret diagnostic metadata."""

    def __init__(self, provider: str, original_error: BaseException):
        self.diagnostic = {
            "provider": provider,
            "request_id": _provider_request_id(original_error),
            "category": _category(original_error),
            "status_code": _status_code(original_error),
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        super().__init__("OCR provider request failed")


def get_provider_diagnostic(error: BaseException) -> dict | None:
    if not isinstance(error, OcrProviderError):
        return None
    return error.diagnostic.copy()