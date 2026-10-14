"""Canonical reporting-period helpers for carbon sink records."""
import calendar
import re
from typing import Any, Dict

from shared.utils.emission_records import normalize_reporting_period_for_storage


_MONTHLY_PERIOD_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_FY_PERIOD_RE = re.compile(r"^FY (\d{4})-(\d{4})$")
_CY_PERIOD_RE = re.compile(r"^CY(\d{4})$")


def _fiscal_start_month(organization: Dict[str, Any]) -> int:
    return min(12, max(1, int(organization.get("financial_year_start_month") or 4)))


def _is_financial_year(organization: Dict[str, Any]) -> bool:
    return organization.get("reporting_year_type") == "financial_year"


def _period_dates(reporting_period: str, organization: Dict[str, Any]) -> tuple[str, str]:
    if _MONTHLY_PERIOD_RE.fullmatch(reporting_period):
        year, month = (int(part) for part in reporting_period.split("-"))
        return f"{year}-{month:02d}-01", f"{year}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"

    fy_match = _FY_PERIOD_RE.fullmatch(reporting_period)
    if fy_match:
        start_year = int(fy_match.group(1))
        start_month = _fiscal_start_month(organization)
        end_month = 12 if start_month == 1 else start_month - 1
        end_year = start_year if start_month == 1 else start_year + 1
        return f"{start_year}-{start_month:02d}-01", f"{end_year}-{end_month:02d}-{calendar.monthrange(end_year, end_month)[1]:02d}"

    cy_match = _CY_PERIOD_RE.fullmatch(reporting_period)
    if cy_match:
        year = int(cy_match.group(1))
        return f"{year}-01-01", f"{year}-12-31"
    raise ValueError("reporting_period must be a valid YYYY-MM, CYyyyy, or FY yyyy-yyyy value")


def canonical_sink_period_fields(
    reporting_period: str,
    frequency_type: str | None,
    organization: Dict[str, Any],
) -> Dict[str, Any]:
    """Build canonical period fields for a sink request."""
    frequency = (frequency_type or "monthly").lower()
    if frequency not in {"monthly", "yearly"}:
        raise ValueError("frequency_type must be 'monthly' or 'yearly'")

    normalized = normalize_reporting_period_for_storage(reporting_period)
    if not normalized:
        raise ValueError("reporting_period is required for sink records")

    if frequency == "monthly" and not _MONTHLY_PERIOD_RE.fullmatch(normalized):
        raise ValueError("Monthly sink reporting_period must use YYYY-MM")
    if frequency == "yearly" and not (_FY_PERIOD_RE.fullmatch(normalized) or _CY_PERIOD_RE.fullmatch(normalized)):
        raise ValueError("Yearly sink reporting_period must use CYyyyy or FY yyyy-yyyy")

    start_date, end_date = _period_dates(normalized, organization)
    return {
        "reporting_period": normalized,
        "frequency_type": frequency,
        "start_date": start_date,
        "end_date": end_date,
        "period_type": "financial_year" if normalized.startswith("FY ") else "calendar_year" if normalized.startswith("CY") else "monthly",
    }