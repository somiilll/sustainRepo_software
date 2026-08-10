"""Deterministic Internal Data AI reporting-period resolution and filtering."""
import calendar
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Dict, Optional

from dateutil.relativedelta import relativedelta

from modules.esg_records.services.dashboard.date_utils import build_date_filter
from modules.mis_reports.reporting_period_service import ReportingPeriodService
from shared.utils.period_utils import period_variants


MONTH_LOOKUP = {name.lower(): index for index, name in enumerate(calendar.month_name) if name}


@dataclass(frozen=True)
class ResolvedPeriod:
    start_month: str
    end_month: str
    label: str
    source: str

    def as_dict(self) -> Dict[str, str]:
        return {"start_month": self.start_month, "end_month": self.end_month, "label": self.label, "source": self.source}


def period_from_payload(value: Any) -> Optional[ResolvedPeriod]:
    if not isinstance(value, dict):
        return None
    start_month, end_month, label = value.get("start_month"), value.get("end_month"), value.get("label")
    if not all(isinstance(item, str) for item in (start_month, end_month, label)):
        return None
    if not re.match(r"^20\d{2}-(0[1-9]|1[0-2])$", start_month) or not re.match(r"^20\d{2}-(0[1-9]|1[0-2])$", end_month):
        return None
    return ResolvedPeriod(start_month, end_month, label, value.get("source", "explicit"))


def _month_period(year: int, month: int, label: str, source: str) -> ResolvedPeriod:
    value = f"{year:04d}-{month:02d}"
    return ResolvedPeriod(value, value, label, source)


def _range_period(start: date, end: date, label: str, source: str) -> ResolvedPeriod:
    return ResolvedPeriod(start.strftime("%Y-%m"), end.strftime("%Y-%m"), label, source)


def extract_explicit_period(question: str, organization: Optional[Dict[str, Any]]) -> Optional[ResolvedPeriod]:
    """Resolve only periods expressed in the user question; never trust LLM guesses."""
    text = question or ""
    service = ReportingPeriodService(organization, datetime.now(timezone.utc))

    month_match = re.search(r"\b(" + "|".join(MONTH_LOOKUP) + r")\s+(20\d{2})\b", text, re.IGNORECASE)
    if month_match:
        month_name, year = month_match.groups()
        month = MONTH_LOOKUP[month_name.lower()]
        return _month_period(int(year), month, f"{calendar.month_name[month]} {year}", "explicit")

    iso_month = re.search(r"\b(20\d{2})-(0[1-9]|1[0-2])\b", text)
    if iso_month:
        year, month = map(int, iso_month.groups())
        return _month_period(year, month, f"{calendar.month_name[month]} {year}", "explicit")

    fy_match = re.search(r"\bFY\s*(20\d{2})(?:\s*[-–]\s*(?:20)?\d{2})?\b", text, re.IGNORECASE)
    cy_match = re.search(r"\bCY\s*(20\d{2})\b", text, re.IGNORECASE)
    quarter_match = re.search(r"\bQ([1-4])\s+(FY|CY)\s*(20\d{2})(?:\s*[-–]\s*(?:20)?\d{2})?\b", text, re.IGNORECASE)

    if quarter_match:
        quarter, calendar_type, year = quarter_match.groups()
        start_month = 1 if calendar_type.upper() == "CY" else service.fiscal_start_month
        start = date(int(year), start_month, 1) + relativedelta(months=(int(quarter) - 1) * 3)
        end = start + relativedelta(months=3) - relativedelta(days=1)
        return _range_period(start, end, f"Q{quarter} {calendar_type.upper()} {year}", "explicit")

    if fy_match:
        year = int(fy_match.group(1))
        start = date(year, service.fiscal_start_month, 1)
        end = start + relativedelta(years=1) - relativedelta(days=1)
        return _range_period(start, end, f"FY {year}–{str(end.year)[-2:]}", "explicit")

    if cy_match:
        year = int(cy_match.group(1))
        return _range_period(date(year, 1, 1), date(year, 12, 31), f"CY {year}", "explicit")

    if re.search(r"\bcurrent\s+(FY|CY|reporting period)\b", text, re.IGNORECASE):
        start, end, label = service.calendar_range()
        return _range_period(start, end, label, "explicit_current")
    return None


def _period_candidate(value: Any) -> Optional[str]:
    if isinstance(value, str):
        match = re.match(r"^(20\d{2})-(0[1-9]|1[0-2])$", value)
        return value if match else None
    if not isinstance(value, dict):
        return None
    if value.get("date"):
        match = re.match(r"^(20\d{2})-(0[1-9]|1[0-2])", str(value["date"]))
        if match:
            return match.group(0)
    try:
        year = int(value.get("year"))
        month_raw = value.get("month")
        if isinstance(month_raw, int):
            month = month_raw
        elif str(month_raw).isdigit():
            month = int(month_raw)
        else:
            month = MONTH_LOOKUP.get(str(month_raw).lower())
        if month and 1 <= month <= 12:
            return f"{year:04d}-{month:02d}"
    except (TypeError, ValueError):
        return None
    return None


async def latest_available_period(db, collection_name: str, scope: Dict[str, Any], reporting_field: str = "reporting_period") -> Optional[ResolvedPeriod]:
    """Find a latest valid stored month before executing the answer query."""
    records = await db[collection_name].find(scope, {"_id": 0, reporting_field: 1}).to_list(1000)
    candidates = [_period_candidate(record.get(reporting_field)) for record in records]
    latest = max((candidate for candidate in candidates if candidate), default=None)
    if not latest:
        return None
    year, month = map(int, latest.split("-"))
    return _month_period(year, month, f"{calendar.month_name[month]} {year}", "latest_available")


def emission_period_filter(period: ResolvedPeriod) -> Dict[str, Any]:
    month_range = {"reporting_period": {"$gte": period.start_month, "$lte": period.end_month}}
    start_year = int(period.start_month[:4])
    end_year = int(period.end_month[:4])
    yearly_values = []
    for year in range(start_year, end_year + 1):
        yearly_values.extend(period_variants(year, "FY"))
        yearly_values.extend(period_variants(year, "CY"))
    return {"$or": [month_range, {"reporting_period": {"$in": yearly_values}}]}


def esg_period_filter(period: ResolvedPeriod) -> Dict[str, Any]:
    conditions = build_date_filter(period.start_month, period.end_month)
    return {"$or": conditions} if conditions else {"id": {"$in": []}}