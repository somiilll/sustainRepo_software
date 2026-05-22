"""
Base exception hierarchy for the GHG platform.

Why a hierarchy?
  - Routes can catch `AppError` to produce a uniform error envelope.
  - Domain modules subclass narrower types (CalculationError, AuditError,
    UploadError, ValidationError) for targeted handling and structured
    logging.
  - Centralizing the hierarchy avoids the "raise Exception('...')" pattern
    that makes debugging painful and obscures observability.

Phase B1 status: hierarchy declared. Routes still use `HTTPException`
directly to preserve API behaviour — future phases will migrate domain
modules to these types and convert at the controller boundary.
"""
from typing import Any, Dict, Optional


class AppError(Exception):
    """Root of all platform-level errors."""

    code: str = "app_error"
    http_status: int = 500

    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        http_status: Optional[int] = None,
        context: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if http_status is not None:
            self.http_status = http_status
        self.context = context or {}


class ValidationError(AppError):
    code = "validation_error"
    http_status = 400


class AuthorizationError(AppError):
    code = "authorization_error"
    http_status = 403


class NotFoundError(AppError):
    code = "not_found"
    http_status = 404


class CalculationError(AppError):
    """Raised by the calculation engine when a formula evaluation fails."""
    code = "calculation_error"
    http_status = 422


class UploadError(AppError):
    code = "upload_error"
    http_status = 422


class AuditError(AppError):
    """Critical: audit persistence failed. Should always be logged + escalated."""
    code = "audit_error"
    http_status = 500


__all__ = [
    "AppError",
    "ValidationError",
    "AuthorizationError",
    "NotFoundError",
    "CalculationError",
    "UploadError",
    "AuditError",
]
