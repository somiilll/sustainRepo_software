"""Centralized configuration + environment loading."""
from .env import (
    BACKEND_DIR,
    MONGO_URL,
    DB_NAME,
    JWT_SECRET,
    JWT_ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    RESEND_API_KEY,
    SENDER_EMAIL,
    ANTHROPIC_API_KEY,
)

__all__ = [
    "BACKEND_DIR",
    "MONGO_URL",
    "DB_NAME",
    "JWT_SECRET",
    "JWT_ALGORITHM",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "RESEND_API_KEY",
    "SENDER_EMAIL",
    "ANTHROPIC_API_KEY",
]
