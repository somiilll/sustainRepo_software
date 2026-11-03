"""CBAM module runtime configuration (demo data, log-only notifications)."""
import os
from pathlib import Path

MODULE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = MODULE_DIR.parents[1]


class Settings:
    adapter = "mock"
    sustainrepo_api_base = ""
    reference_dir = MODULE_DIR / "reference" / "data"
    storage_dir = BACKEND_DIR / "storage" / "cbam"
    notifier = "log"

    @property
    def public_base_url(self) -> str:
        return os.environ.get("FRONTEND_URL", "").rstrip("/")


settings = Settings()
