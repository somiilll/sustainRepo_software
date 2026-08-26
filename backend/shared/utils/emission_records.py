"""Canonical lifecycle, scope, and reporting-period rules for GHG records."""

from datetime import datetime
import re
from typing import Any, Optional


_MONTHLY_PERIOD_RE = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
_CY_PERIOD_RE = re.compile(r"^CY\s*(\d{4})$", re.IGNORECASE)
_FY_PERIOD_RE = re.compile(r"^(?:FY\s*)?(\d{4})\s*-\s*(\d{2}|\d{4})$", re.IGNORECASE)
_SCOPE_ALIASES = {
    "scope1": "scope1",
    "scope_1": "scope1",
    "scope2": "scope2",
    "scope_2": "scope2",
    "scope3": "scope3",
    "scope_3": "scope3",
    "biogenic": "biogenic",
}


def eligible_ghg_record_filter() -> dict[str, Any]:
    """Return the sole MongoDB lifecycle filter for dashboard-eligible GHG rows."""
    return {
        "is_deleted": {"$ne": True},
        "is_draft": {"$ne": True},
        "is_current_revision": {"$ne": False},
        "status": {"$nin": ["draft", "pending", "rejected", "deleted", "superseded"]},
        "approval_status": {"$in": ["approved", "not_required", None]},
    }


def normalize_scope(scope: Any) -> Optional[str]:
    """Normalize supported legacy scope labels without guessing unsupported values."""
    if not isinstance(scope, str):
        return None
    normalized = scope.strip().lower().replace(" ", "").replace("-", "_")
    return _SCOPE_ALIASES.get(normalized)


def normalize_reporting_period(period: Any) -> Optional[str]:
    """Normalize only valid monthly, CY, and FY values to their canonical strings."""
    if not isinstance(period, str):
        return None

    value = period.strip()
    monthly_match = _MONTHLY_PERIOD_RE.fullmatch(value)
    if monthly_match:
        return value

    cy_match = _CY_PERIOD_RE.fullmatch(value)
    if cy_match:
        return f"CY {cy_match.group(1)}"

    fy_match = _FY_PERIOD_RE.fullmatch(value)
    if not fy_match:
        return None

    start_year = int(fy_match.group(1))
    end_value = fy_match.group(2)
    end_year = int(f"{str(start_year)[:2]}{end_value}") if len(end_value) == 2 else int(end_value)
    if end_year != start_year + 1:
        return None
    return f"FY {start_year}-{end_year}"


def normalize_reporting_period_for_storage(period: Any) -> Optional[str]:
    """Return the single persisted GHG period representation for valid inputs."""
    canonical_period = normalize_reporting_period(period)
    if canonical_period and canonical_period.startswith("CY "):
        return f"CY{canonical_period[3:]}"
    return canonical_period


def reporting_period_variants(canonical_period: str) -> list[str]:
    """Return explicit exact legacy values that normalize to one canonical period."""
    if _MONTHLY_PERIOD_RE.fullmatch(canonical_period):
        return [canonical_period]
    if canonical_period.startswith("CY "):
        year = canonical_period[3:]
        return [canonical_period, f"CY{year}"]
    if canonical_period.startswith("FY "):
        start_year, end_year = canonical_period[3:].split("-", maxsplit=1)
        short_end = end_year[-2:]
        return [
            canonical_period,
            f"FY {start_year}-{short_end}",
            f"FY{start_year}-{end_year}",
            f"FY{start_year}-{short_end}",
            f"{start_year}-{end_year}",
            f"{start_year}-{short_end}",
        ]
    return []


def selected_reporting_periods(start_period: str, end_period: str) -> set[str]:
    """Build the exact monthly and overlapping yearly periods for a dashboard range."""
    if not (_MONTHLY_PERIOD_RE.fullmatch(start_period or "") and _MONTHLY_PERIOD_RE.fullmatch(end_period or "")):
        raise ValueError("Dashboard reporting periods must use YYYY-MM format.")
    if start_period > end_period:
        raise ValueError("start_period must be before or equal to end_period.")

    current = datetime.strptime(start_period, "%Y-%m")
    end = datetime.strptime(end_period, "%Y-%m")
    periods: set[str] = set()
    while current <= end:
        periods.add(current.strftime("%Y-%m"))
        periods.add(f"CY {current.year}")
        fy_start = current.year if current.month >= 4 else current.year - 1
        periods.add(f"FY {fy_start}-{fy_start + 1}")
        next_year = current.year + (1 if current.month == 12 else 0)
        next_month = 1 if current.month == 12 else current.month + 1
        current = current.replace(year=next_year, month=next_month)
    return periods


def reporting_period_query_values(start_period: Optional[str], end_period: Optional[str]) -> Optional[list[str]]:
    """Build strict exact MongoDB values for a complete dashboard reporting range."""
    if not start_period and not end_period:
        return None
    if not start_period or not end_period:
        raise ValueError("start_period and end_period must be provided together.")
    values = {
        variant
        for period in selected_reporting_periods(start_period, end_period)
        for variant in reporting_period_variants(period)
    }
    return sorted(values)


def canonicalize_emission_record(record: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Create one canonical in-memory GHG record or reject unsupported legacy values."""
    scope = normalize_scope(record.get("scope"))
    reporting_period = normalize_reporting_period(record.get("reporting_period"))
    if not scope or not reporting_period:
        return None

    normalized = {**record, "scope": scope, "reporting_period": reporting_period}
    frequency = record.get("frequency_type")
    if frequency not in {"monthly", "yearly"}:
        frequency = "monthly" if _MONTHLY_PERIOD_RE.fullmatch(reporting_period) else "yearly"
    if frequency == "monthly" and not _MONTHLY_PERIOD_RE.fullmatch(reporting_period):
        return None
    if frequency == "yearly" and _MONTHLY_PERIOD_RE.fullmatch(reporting_period):
        return None
    normalized["frequency_type"] = frequency
    return normalized


def emission_proration(period: str, start_period: Optional[str], end_period: Optional[str]) -> float:
    """Return the exact overlap proportion; malformed periods are never included."""
    canonical = normalize_reporting_period(period)
    if not canonical:
        return 0.0
    if not start_period and not end_period:
        return 1.0
    if not start_period or not end_period:
        return 0.0
    if canonical not in selected_reporting_periods(start_period, end_period):
        return 0.0
    if _MONTHLY_PERIOD_RE.fullmatch(canonical):
        return 1.0

    start = datetime.strptime(start_period, "%Y-%m")
    end = datetime.strptime(end_period, "%Y-%m")
    if canonical.startswith("CY "):
        record_start = datetime(int(canonical[3:]), 1, 1)
        record_end = datetime(int(canonical[3:]), 12, 1)
    else:
        year = int(canonical[3:7])
        record_start = datetime(year, 4, 1)
        record_end = datetime(year + 1, 3, 1)

    overlap_start = max(start, record_start)
    overlap_end = min(end, record_end)
    if overlap_start > overlap_end:
        return 0.0
    return ((overlap_end.year - overlap_start.year) * 12 + overlap_end.month - overlap_start.month + 1) / 12


def annual_coverage_keys(record: dict[str, Any]) -> set[str]:
    """Return annual periods covered by a canonical record for monthly/yearly deduplication."""
    period = record["reporting_period"]
    if record["frequency_type"] == "yearly":
        return {period}
    year, month = (int(part) for part in period.split("-"))
    fy_start = year if month >= 4 else year - 1
    return {f"CY {year}", f"FY {fy_start}-{fy_start + 1}"}


def deduplicate_monthly_against_yearly(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Prefer an eligible yearly row over matching monthly rows for its covered period."""
    yearly_keys = {
        (record.get("facility_id"), record.get("category"), record["scope"], coverage)
        for record in records
        if record["frequency_type"] == "yearly"
        for coverage in annual_coverage_keys(record)
    }
    return [
        record
        for record in records
        if record["frequency_type"] == "yearly"
        or not any(
            (record.get("facility_id"), record.get("category"), record["scope"], coverage) in yearly_keys
            for coverage in annual_coverage_keys(record)
        )
    ]