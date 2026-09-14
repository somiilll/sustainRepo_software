"""Customer-safe API error responses with internal request correlation."""
import re
import uuid
from typing import Any, Tuple

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.errors.exceptions import AppError
from app.logging import get_logger, get_request_id, log_event


logger = get_logger(__name__)

STATUS_MESSAGES = {
    400: ("VALIDATION_FAILED", "Please check the entered information and try again."),
    401: ("SESSION_EXPIRED", "Your session has expired. Please sign in again."),
    403: ("PERMISSION_DENIED", "You don't have permission to perform this action."),
    404: ("NOT_FOUND", "The requested information could not be found."),
    409: ("CONFLICT", "This action cannot be completed because the information has changed."),
    422: ("VALIDATION_FAILED", "Please check the highlighted fields."),
    429: ("RATE_LIMITED", "Too many requests. Please wait a moment and try again."),
    500: ("INTERNAL_ERROR", "Something went wrong. Please try again."),
    502: ("SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly."),
    503: ("SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Please try again shortly."),
}
TECHNICAL_TERMS = re.compile(
    r"traceback|exception|stack.?trace|sql|mongo|pymongo|boto|r2|s3|clienterror|"
    r"nosuchkey|keyerror|attributeerror|typeerror|valueerror|integrityerror|"
    r"validationerror|connectionerror|timeout|openai|llamaparse|httpx",
    re.IGNORECASE,
)


def _request_id(request: Request) -> str:
    return get_request_id() or request.headers.get("X-Request-ID") or str(uuid.uuid4())


def _safe_message(detail: Any, status_code: int) -> Tuple[str, str]:
    default_code, default_message = STATUS_MESSAGES.get(
        status_code, ("REQUEST_FAILED", "Unable to complete this request. Please try again."),
    )
    if status_code >= 500 or status_code in {401, 403, 422, 429}:
        return default_code, default_message

    if isinstance(detail, dict):
        candidate = detail.get("message")
        error_code = str(detail.get("error_code") or detail.get("error") or default_code).upper()
    else:
        candidate = detail
        error_code = default_code

    if isinstance(candidate, str) and candidate.strip() and len(candidate) <= 280 and not TECHNICAL_TERMS.search(candidate):
        return error_code, candidate.strip()
    return default_code, default_message


def _response(status_code: int, error_code: str, message: str, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error_code": error_code, "message": message, "detail": message, "request_id": request_id},
        headers={"X-Request-ID": request_id},
    )


async def app_error_handler(request: Request, error: AppError) -> JSONResponse:
    request_id = _request_id(request)
    error_code, message = _safe_message(error.message, error.http_status)
    error_code = str(error.code or error_code).upper()
    log_event(logger, 40, "api.error.app", action="api.error", outcome="failed", error_code=error_code,
              context={"path": request.url.path, "status_code": error.http_status})
    return _response(error.http_status, error_code, message, request_id)


async def http_error_handler(request: Request, error: HTTPException) -> JSONResponse:
    request_id = _request_id(request)
    error_code, message = _safe_message(error.detail, error.status_code)
    log_event(logger, 40 if error.status_code >= 500 else 30, "api.error.http", action="api.error", outcome="failed",
              error_code=error_code, context={"path": request.url.path, "status_code": error.status_code})
    return _response(error.status_code, error_code, message, request_id)


async def starlette_http_error_handler(request: Request, error: StarletteHTTPException) -> JSONResponse:
    return await http_error_handler(request, HTTPException(status_code=error.status_code, detail=error.detail))


async def validation_error_handler(request: Request, error: RequestValidationError) -> JSONResponse:
    request_id = _request_id(request)
    log_event(logger, 30, "api.error.validation", action="api.validate", outcome="failed",
              error_code="VALIDATION_FAILED", context={"path": request.url.path, "status_code": 422})
    return _response(422, "VALIDATION_FAILED", "Please check the highlighted fields.", request_id)


async def unexpected_error_handler(request: Request, error: Exception) -> JSONResponse:
    request_id = _request_id(request)
    log_event(logger, 40, "api.error.unexpected", action="api.request", outcome="failed",
              error_code="INTERNAL_ERROR", context={"path": request.url.path, "status_code": 500}, exc_info=True)
    return _response(500, "INTERNAL_ERROR", "Something went wrong. Please try again.", request_id)


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(HTTPException, http_error_handler)
    app.add_exception_handler(StarletteHTTPException, starlette_http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unexpected_error_handler)