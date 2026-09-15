"""Configuration for the advanced invoice extraction pipeline."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


MODULE_DIR = Path(__file__).resolve().parent
MASTER_TAXONOMY_PATH = MODULE_DIR / "master_taxonomy.json"
NAICS_INDEX_PATH = MODULE_DIR / "useeio_naics_index.json"

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".csv", ".xlsx", ".xls"}
SPREADSHEET_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = 15


@dataclass(frozen=True)
class ExtractionMode:
    key: str
    label: str
    provider: str
    vision_model: str
    reasoning_model: str
    api_key_env: str


MODES = {
    "fast": ExtractionMode(
        key="fast",
        label="Fast",
        provider="anthropic",
        vision_model="claude-sonnet-4-6",
        reasoning_model="claude-haiku-4-5-20251001",
        api_key_env="ANTHROPIC_API_KEY",
    ),
    "think": ExtractionMode(
        key="think",
        label="Think",
        provider="openai",
        vision_model="gpt-5.5",
        reasoning_model="gpt-5.5",
        api_key_env="OPENAI_API_KEY",
    ),
}


def get_mode(mode_key: str) -> ExtractionMode:
    normalized = str(mode_key or "fast").strip().lower()
    if normalized not in MODES:
        raise ValueError("Extraction mode must be 'fast' or 'think'.")
    mode = MODES[normalized]
    if not os.environ.get(mode.api_key_env):
        raise RuntimeError(f"{mode.api_key_env} is not configured on the server.")
    return mode
