"""
Security Middleware & Utilities

Centralized security: rate limiting, headers, file validation, regex escaping.
"""

import re
import os
from typing import Optional
from fastapi import Request, Response, UploadFile, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# =============================================================================
# Rate Limiter (singleton)
# =============================================================================

limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    """Custom handler for rate limit errors."""
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."}
    )


# =============================================================================
# Security Headers Middleware
# =============================================================================

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


# =============================================================================
# File Upload Validation
# =============================================================================

ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".csv", ".txt", ".json", ".xml",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
    ".zip", ".rar", ".7z",
}

ALLOWED_MIME_PREFIXES = {
    "application/pdf", "application/msword", "application/vnd.",
    "text/", "image/", "application/zip", "application/x-rar",
    "application/json", "application/xml", "application/csv",
    "application/octet-stream",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def validate_upload(file: UploadFile, content: bytes) -> None:
    """Validate file upload: extension, MIME type, size."""
    # Extension check
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type '{ext}' not allowed")

    # Size check
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
        )

    # MIME type check
    content_type = file.content_type or ""
    if content_type and not any(content_type.startswith(p) for p in ALLOWED_MIME_PREFIXES):
        raise HTTPException(status_code=400, detail=f"Content type '{content_type}' not allowed")


# =============================================================================
# Regex Escaping (prevents ReDoS)
# =============================================================================

def safe_regex(user_input: str) -> str:
    """Escape user input for safe use in MongoDB $regex queries."""
    return re.escape(user_input)


# =============================================================================
# Mass Assignment Protection
# =============================================================================

# Fields that should NEVER be writable by clients
PROTECTED_FIELDS = frozenset({
    "id", "organization_id", "created_by", "created_at", "updated_at",
    "created_by_name", "updated_by", "updated_by_name", "version",
    "is_deleted", "deleted_at", "role", "password_hash", "is_active",
})


def strip_protected_fields(data: dict) -> dict:
    """Remove protected fields from client-submitted data."""
    return {k: v for k, v in data.items() if k not in PROTECTED_FIELDS}
