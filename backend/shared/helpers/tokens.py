"""
JWT helpers — encoding + decoding access tokens.

Why a separate module?
  - The auth dependency (`get_current_user`) and the login route both
    need encoding/decoding. Co-locating them avoids duplication and
    makes secret-rotation a single-file change.
  - Tests can monkey-patch `JWT_SECRET` on `app.config.env` and these
    helpers automatically respect it.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt

from app.config.env import (
    JWT_SECRET,
    JWT_ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
)


def create_access_token(data: Dict[str, Any]) -> str:
    """Encode a JWT access token (short-lived)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(data: Dict[str, Any]) -> str:
    """Encode a JWT refresh token (long-lived)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """Decode + verify a JWT. Raises `jwt.ExpiredSignatureError` / `jwt.InvalidTokenError`."""
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
