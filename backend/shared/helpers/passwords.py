"""
Password helpers — random generation + bcrypt hashing.

bcrypt context lives at module level so the cost factor is configured
once. Do NOT instantiate `CryptContext` per call — it's expensive.
"""
import secrets
import string

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def generate_random_password(length: int = 12) -> str:
    """Cryptographically secure random password — letters + digits + punctuation."""
    characters = string.ascii_letters + string.digits + string.punctuation
    return "".join(secrets.choice(characters) for _ in range(length))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return _pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return _pwd_context.hash(password)


# Re-export the underlying CryptContext for callers that need it directly
# (e.g., legacy `pwd_context` references in server.py during the migration).
pwd_context = _pwd_context
