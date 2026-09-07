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
    reporting_period: str | None,
    frequency_type: str | None,
    organization: Dict[str, Any],
    legacy_reporting_year: str | None = None,
    legacy_reporting_month: int | None = None,
) -> Dict[str, Any]:
    """Build canonical and compatibility fields from a new or legacy sink request."""
    frequency = (frequency_type or "monthly").lower()
    if frequency not in {"monthly", "yearly"}:
        raise ValueError("frequency_type must be 'monthly' or 'yearly'")

    normalized = normalize_reporting_period_for_storage(reporting_period) if reporting_period else None
    if not normalized:
        year_match = re.search(r"\d{4}", legacy_reporting_year or "")
        if not year_match:
            raise ValueError("reporting_period is required for new sink records")
        reporting_year = int(year_match.group())
        if frequency == "monthly":
            if legacy_reporting_month is None or not 0 <= int(legacy_reporting_month) <= 11:
                raise ValueError("Monthly sink records require reporting_month between 0 and 11")
            month = int(legacy_reporting_month) + 1
            actual_year = reporting_year + 1 if _is_financial_year(organization) and month < _fiscal_start_month(organization) else reporting_year
            normalized = f"{actual_year}-{month:02d}"
        elif _is_financial_year(organization):
            normalized = f"FY {reporting_year}-{reporting_year + 1}"
        else:
            normalized = f"CY{reporting_year}"

    if frequency == "monthly" and not _MONTHLY_PERIOD_RE.fullmatch(normalized):
        raise ValueError("Monthly sink reporting_period must use YYYY-MM")
    if frequency == "yearly" and not (_FY_PERIOD_RE.fullmatch(normalized) or _CY_PERIOD_RE.fullmatch(normalized)):
        raise ValueError("Yearly sink reporting_period must use CYyyyy or FY yyyy-yyyy")

    start_date, end_date = _period_dates(normalized, organization)
    if frequency == "monthly":
        year, month = (int(part) for part in normalized.split("-"))
        compatibility_year = year - 1 if _is_financial_year(organization) and month < _fiscal_start_month(organization) else year
        compatibility_month = month - 1
    else:
        year_match = re.search(r"\d{4}", normalized)
        compatibility_year = int(year_match.group())
        compatibility_month = None

    return {
        "reporting_period": normalized,
        "frequency_type": frequency,
        "reporting_year": str(compatibility_year),
        "reporting_month": compatibility_month,
        "start_date": start_date,
        "end_date": end_date,
        "period_type": "financial_year" if normalized.startswith("FY ") else "calendar_year" if normalized.startswith("CY") else "monthly",
    }


def migrate_sink_period_fields(sink: Dict[str, Any], organization: Dict[str, Any]) -> Dict[str, Any]:
    """Return canonical period fields for an existing sink document without mutating it."""
    inferred_frequency = sink.get("frequency_type") or (
        "yearly" if sink.get("reporting_month") is None else "monthly"
    )
    legacy_year = sink.get("reporting_year") or (sink.get("start_date") or "")[:4]
    legacy_month = sink.get("reporting_month")
    reporting_period = sink.get("reporting_period")
    if not reporting_period and legacy_month is None and inferred_frequency == "monthly" and sink.get("start_date"):
        reporting_period = sink["start_date"][:7]
    return canonical_sink_period_fields(
        reporting_period,
        inferred_frequency,
        organization,
        legacy_year,
        legacy_month,
    )