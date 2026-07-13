"""
Centralized environment configuration.

All env-var reads should funnel through this module so that:
  - tests can monkey-patch a single import path
  - missing required env vars fail fast at module-load time
  - `.env` is loaded exactly once per process

Backward compatibility note (Phase B1):
  `server.py` continues to load `os.environ` directly for variables it
  has always read inline (preserving exact boot behaviour). New code
  should import from this module instead.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Resolve the backend directory and load `.env` on import. Idempotent —
# subsequent imports are no-ops thanks to dotenv's internal caching.
BACKEND_DIR: Path = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_DIR / ".env")

# ---- Required (must exist at boot) ------------------------------------------------
MONGO_URL: str = os.environ["MONGO_URL"]
DB_NAME: str = os.environ["DB_NAME"]

# ---- Optional with documented defaults --------------------------------------------
# JWT_SECRET defaults are intentionally weak — production deployments
# MUST set JWT_SECRET via .env. The default exists for local development.
JWT_SECRET: str = os.environ.get("JWT_SECRET", "your-secret-key-change-in-production")
JWT_ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour
REFRESH_TOKEN_EXPIRE_DAYS: int = 30

RESEND_API_KEY: str = os.environ.get("RESEND_API_KEY", "")
SENDER_EMAIL: str = os.environ.get("SENDER_EMAIL", "noreply@sustainrepo.com")
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")
