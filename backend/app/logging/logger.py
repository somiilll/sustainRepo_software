"""
Structured logger.

Usage:
    from app.logging import get_logger
    logger = get_logger(__name__)
    logger.info("calc.evaluated", extra={"category": cat, "co2e": value})

Why this wrapper instead of stdlib `logging.getLogger` directly?
  - Single configuration entry point (`configure_logging()`).
  - Consistent format across modules — payload fields go via `extra`
    so future log shippers (CloudWatch, Datadog) can index them.
  - Easy to swap to JSON output later by editing one function.
"""
import logging
import sys
from typing import Optional

_CONFIGURED = False


def configure_logging(level: int = logging.INFO) -> None:
    """Configure root logger once. Idempotent."""
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    root = logging.getLogger()
    # Avoid double-handlers when uvicorn/supervisor reload the module.
    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        root.addHandler(handler)
    root.setLevel(level)
    _CONFIGURED = True


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Return a stdlib Logger configured for the platform."""
    configure_logging()
    return logging.getLogger(name or "ghg")
