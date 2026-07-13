"""
Reporting Period Utilities

Single source of truth for formatting FY/CY period strings.
All modules should use these instead of hardcoding FY/CY logic.
"""

import re
from typing import Optional


def format_period(year: int, reporting_type: str = "FY") -> str:
    """Format a year into the org's reporting period string.
    
    FY → 'FY 2026-2027'
    CY → 'CY 2026'
    """
    if reporting_type == "CY":
        return f"CY {year}"
    return f"FY {year}-{year + 1}"


def format_period_short(year: int, reporting_type: str = "FY") -> str:
    """Short display format.
    
    FY → 'FY 2026-27'
    CY → 'CY 2026'
    """
    if reporting_type == "CY":
        return f"CY {year}"
    return f"FY {year}-{str(year + 1)[-2:]}"


def extract_year(period_str: str) -> Optional[int]:
    """Extract the start year from any period string."""
    if not period_str:
        return None
    m = re.search(r'(\d{4})', period_str)
    return int(m.group(1)) if m else None


def detect_type(period_str: str) -> str:
    """Detect if a period string is FY or CY."""
    if not period_str:
        return "FY"
    return "CY" if period_str.strip().upper().startswith("CY") else "FY"


def period_variants(year: int, reporting_type: str = "FY") -> list:
    """Return all format variants for DB lookups (backward compat).
    
    For FY: ['FY 2026-2027', 'FY 2026-27', '2026-2027', '2026-27']
    For CY: ['CY 2026']
    """
    if reporting_type == "CY":
        return [f"CY {year}"]
    return [
        f"FY {year}-{year + 1}",
        f"FY {year}-{str(year + 1)[-2:]}",
        f"{year}-{year + 1}",
        f"{year}-{str(year + 1)[-2:]}",
    ]


def normalize_period(period_str: str) -> str:
    """Normalize any period string to canonical format.
    
    'FY 2026-27' → 'FY 2026-2027'
    '2026-27'    → 'FY 2026-2027'
    'CY 2026'    → 'CY 2026'
    """
    s = period_str.strip()
    if s.upper().startswith("CY"):
        return s
    m = re.search(r'(\d{4})', s)
    if m:
        start = int(m.group(1))
        return f"FY {start}-{start + 1}"
    return s
