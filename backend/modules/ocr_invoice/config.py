"""Configuration for the advanced invoice extraction pipeline."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


MODULE_DIR = Path(__file__).resolve().parent
MASTER_TAXONOMY_PATH = MODULE_DIR / "master_taxonomy.json"
NAICS_INDEX_PATH = MODULE_DIR / "useeio_naics_index.json"

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".csv", ".xlsx", ".xls"}
SPREADSHEET_EXTENSIONS = {".csv", ".xlsx", ".xls"}
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_PDF_PAGES = 15

OCR_SAVE_SCOPE_RULES = {
    "scope1": {
        "enabled": True,
        "generic_activity_preferences": {
            "cng": "Natural Gas",
            "compressednaturalgas": "Natural Gas",
        },
    },
    "scope2": {"enabled": True},
    "scope3": {
        "enabled": True,
        "generic_activity_preferences": {
            "diesel": "Diesel (100% mineral diesel)",
            "petrol": "Petrol (100% mineral petrol)",
            "wttdiesel": "Diesel (100% mineral diesel)",
            "wttpetrol": "Petrol (100% mineral petrol)",
            "wttpetrolgasoline": "Petrol (100% mineral petrol)",
            "cng": "Natural Gas",
            "compressednaturalgas": "Natural Gas",
        },
        "fuzzy_activity_preferences": (
            {
                "category_prefix": "c3",
                "token_groups": (("electricity",),),
                "activity": "Electricity - T&D losses and Generation",
            },
            {
                "category_prefix": "c4",
                "token_groups": (("freight",), ("truck", "trucking")),
                "activity": "Freight Truck Transportation",
            },
        ),
    },
}


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
        vision_model="claude-sonnet-5",
        reasoning_model="claude-haiku-4-5",
        api_key_env="ANTHROPIC_API_KEY",
    ),
    "think": ExtractionMode(
        key="think",
        label="Think",
        provider="openai",
        vision_model="gpt-5.6-sol",
        reasoning_model="gpt-5.6-terra",
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
