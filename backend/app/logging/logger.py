"""Structured, customer-safe application logging."""
import contextvars
import json
import logging
import sys
import uuid
from typing import Any, Optional

_CONFIGURED = False
_REQUEST_ID: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_id", default=None)
_OPERATION_ID: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("operation_id", default=None)
_SENSITIVE_KEY_PARTS = {"password", "secret", "token", "authorization", "cookie", "email", "phone", "content", "file", "evidence", "input", "answer"}


class _StructuredJsonFormatter(logging.Formatter):
    """Render application events as searchable JSON without leaking request data."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
            "request_id": getattr(record, "request_id", None) or get_request_id() or "unavailable",
            "operation_id": getattr(record, "operation_id", None) or get_operation_id() or "unavailable",
            "action": getattr(record, "action", None) or "application.log",
            "outcome": getattr(record, "outcome", None) or "recorded",
        }
        if getattr(record, "error_code", None):
            payload["error_code"] = record.error_code
        if getattr(record, "context", None):
            payload["context"] = record.context
        if record.exc_info:
            payload["stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, separators=(",", ":"))


def configure_logging(level: int = logging.INFO) -> None:
    """Configure the existing platform logger once using JSON event output."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.set_name("platform-structured-json")
    handler.setFormatter(_StructuredJsonFormatter(datefmt="%Y-%m-%dT%H:%M:%S%z"))
    root = logging.getLogger()
    if not any(handler.get_name() == "platform-structured-json" for handler in root.handlers):
        root.addHandler(handler)
    root.setLevel(level)
    _CONFIGURED = True


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Return the platform logger configured for structured event output."""
    configure_logging()
    return logging.getLogger(name or "ghg")


def set_request_context(request_id: str, operation_id: Optional[str] = None) -> tuple[contextvars.Token, contextvars.Token]:
    """Bind safe correlation identifiers for the lifetime of one API request."""
    return (
        _REQUEST_ID.set(request_id),
        _OPERATION_ID.set(operation_id or str(uuid.uuid4())),
    )


def reset_request_context(tokens: tuple[contextvars.Token, contextvars.Token]) -> None:
    _REQUEST_ID.reset(tokens[0])
    _OPERATION_ID.reset(tokens[1])


def get_request_id() -> Optional[str]:
    return _REQUEST_ID.get()


def get_operation_id() -> Optional[str]:
    return _OPERATION_ID.get()


def _safe_context(value: Any, key: str = "") -> Any:
    """Keep operational identifiers and counts while dropping sensitive payload values."""
    normalized_key = key.casefold()
    if any(part in normalized_key for part in _SENSITIVE_KEY_PARTS):
        return "[redacted]"
    if isinstance(value, dict):
        return {
            str(item_key): sanitized
            for item_key, item_value in value.items()
            if (sanitized := _safe_context(item_value, str(item_key))) is not None
        }
    if isinstance(value, (list, tuple, set)):
        return [_safe_context(item, key) for item in list(value)[:25]]
    if isinstance(value, str):
        return value[:256]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)[:256]


def log_event(
    logger: logging.Logger,
    level: int,
    event: str,
    *,
    action: str,
    outcome: str,
    error_code: Optional[str] = None,
    context: Optional[dict[str, Any]] = None,
    exc_info: bool = False,
) -> None:
    """Emit one safe, correlated structured event through the existing logger."""
    logger.log(
        level,
        event,
        extra={
            "request_id": get_request_id() or "unavailable",
            "operation_id": get_operation_id() or "unavailable",
            "action": action,
            "outcome": outcome,
            "error_code": error_code,
            "context": _safe_context(context or {}),
        },
        exc_info=exc_info,
    )