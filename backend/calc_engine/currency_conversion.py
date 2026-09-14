"""Shared period-aware currency-rate resolution for Scope 3 spend calculations."""

from __future__ import annotations

import re
from typing import Optional


PPP_INFLATION_METHOD = "ppp_inflation"
STANDARD_METHOD = "standard"


def parse_currency_period(reporting_period: Optional[str]) -> dict:
    value = str(reporting_period or "").strip()
    monthly_match = re.match(r"^(\d{4})-(\d{1,2})$", value)
    if monthly_match:
        year = int(monthly_match.group(1))
        month = int(monthly_match.group(2))
        if 1 <= month <= 12:
            return {
                "type": "month",
                "year": year,
                "month": month,
                "period_key": f"{year}-{month:02d}",
            }

    fy_match = re.match(r"^FY\s*(\d{4})\s*-\s*(\d{2,4})$", value, re.IGNORECASE)
    if fy_match:
        start_year = int(fy_match.group(1))
        end_part = fy_match.group(2)
        end_year = int(f"{str(start_year)[:2]}{end_part}") if len(end_part) == 2 else int(end_part)
        return {
            "type": "financial_year",
            "year": end_year,
            "month": None,
            "financial_year_start": start_year,
            "financial_year_end": end_year,
            "period_key": f"FY {start_year}-{str(end_year)[-2:]}",
        }

    cy_match = re.match(r"^CY\s*(\d{4})$", value, re.IGNORECASE)
    if cy_match:
        year = int(cy_match.group(1))
        return {"type": "calendar_year", "year": year, "month": None, "period_key": f"CY {year}"}

    year_match = re.match(r"^(\d{4})$", value)
    if year_match:
        year = int(year_match.group(1))
        return {"type": "calendar_year", "year": year, "month": None, "period_key": f"CY {year}"}

    return {"type": None, "year": None, "month": None, "period_key": value or None}


def extract_currency_period(reporting_period: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Compatibility tuple: FY periods continue exposing their ending year."""
    parsed = parse_currency_period(reporting_period)
    return parsed.get("year"), parsed.get("month")


def normalize_currency_method(method: Optional[str]) -> str:
    return STANDARD_METHOD if method == STANDARD_METHOD else PPP_INFLATION_METHOD


def currency_record_period(record: Optional[dict]) -> Optional[str]:
    if not record:
        return None
    if record.get("period_key"):
        return record["period_key"]
    applicability_type = record.get("applicability_type")
    if applicability_type == "financial_year" or record.get("financial_year_start"):
        start = record.get("financial_year_start")
        end = record.get("financial_year_end") or record.get("year_applicable")
        if start and end:
            return f"FY {start}-{str(end)[-2:]}"
    if record.get("month_applicable"):
        return f"{record.get('year_applicable')}-{int(record['month_applicable']):02d}"
    if record.get("year_applicable"):
        return f"CY {record['year_applicable']}"
    return record.get("effective_from")


def currency_conversion_source_name(record: Optional[dict], method: Optional[str]) -> str:
    if not record:
        return "Default"
    source = record.get("source") or "Currency conversion"
    period = currency_record_period(record)
    resolution = (record.get("resolution_metadata") or {}).get("resolution")
    fallback_suffix = " · fallback" if resolution and resolution != "exact" else ""
    return f"{source} ({period}{fallback_suffix})" if period else source


def _method_clause(normalized_method: str) -> dict:
    if normalized_method == PPP_INFLATION_METHOD:
        return {"$or": [
            {"conversion_method": PPP_INFLATION_METHOD},
            {"conversion_method": {"$exists": False}},
            {"conversion_method": None},
        ]}
    return {"conversion_method": STANDARD_METHOD}


def _calendar_annual_clause(year_condition) -> dict:
    return {
        "year_applicable": year_condition,
        "$and": [
            {"$or": [
                {"applicability_type": "calendar_year"},
                {"applicability_type": {"$exists": False}},
                {"applicability_type": None},
            ]},
            {"$or": [
                {"month_applicable": {"$exists": False}},
                {"month_applicable": None},
            ]},
        ],
    }


def _financial_year_clause(start_condition, end_year: Optional[int] = None) -> dict:
    clause = {
        "applicability_type": "financial_year",
        "financial_year_start": start_condition,
    }
    if end_year is not None:
        clause["financial_year_end"] = end_year
    return clause


def _with_resolution(record: Optional[dict], *, resolution: str, requested_period: Optional[str]) -> Optional[dict]:
    if not record:
        return None
    resolved = dict(record)
    resolved["resolution_metadata"] = {
        "resolution": resolution,
        "requested_period": requested_period,
        "resolved_period": currency_record_period(record),
    }
    return resolved


async def resolve_currency_conversion(
    db,
    *,
    source_currency: str,
    target_currency: str = "USD",
    reporting_period: Optional[str] = None,
    reporting_year_type: Optional[str] = None,
    method: Optional[str] = None,
) -> Optional[dict]:
    """Resolve exact period data first, followed by deterministic compatible fallbacks."""
    parsed = parse_currency_period(reporting_period)
    normalized_method = normalize_currency_method(method)
    base_query = {
        "source_currency": source_currency.upper(),
        "target_currency": target_currency.upper(),
        "is_active": True,
    }
    method_clause = _method_clause(normalized_method)

    async def find_period(period_clause: dict, sort=None) -> Optional[dict]:
        query = {**base_query, "$and": [method_clause, period_clause]}
        return await db.currency_conversion.find_one(query, {"_id": 0}, sort=sort)

    period_type = parsed.get("type")
    year = parsed.get("year")
    month = parsed.get("month")
    requested_period = parsed.get("period_key") or reporting_period

    if period_type == "month" and year and month:
        monthly = await find_period({
            "year_applicable": year,
            "$or": [
                {"applicability_type": "month", "month_applicable": month},
                {
                    "applicability_type": {"$exists": False},
                    "$or": [{"month_applicable": month}, {"effective_from": f"{year}-{month:02d}"}],
                },
                {"applicability_type": None, "month_applicable": month},
            ],
        })
        if monthly:
            return _with_resolution(monthly, resolution="exact", requested_period=requested_period)

        is_financial_reporting_year = str(reporting_year_type or "").lower() in {
            "financial",
            "financial_year",
            "fy",
        }
        if is_financial_reporting_year:
            financial_year_start = year if month >= 4 else year - 1
            financial_year_end = financial_year_start + 1
            financial_year = await find_period(
                _financial_year_clause(financial_year_start, financial_year_end),
            )
            if financial_year:
                return _with_resolution(
                    financial_year,
                    resolution="financial_year_fallback",
                    requested_period=requested_period,
                )

        calendar_year = await find_period(_calendar_annual_clause(year))
        return _with_resolution(
            calendar_year,
            resolution="calendar_year_fallback",
            requested_period=requested_period,
        )

    if period_type == "financial_year":
        start_year = parsed.get("financial_year_start")
        end_year = parsed.get("financial_year_end")
        exact_fy = await find_period(_financial_year_clause(start_year, end_year))
        if exact_fy:
            return _with_resolution(exact_fy, resolution="exact", requested_period=requested_period)

        starting_calendar_year = await find_period(_calendar_annual_clause(start_year))
        if starting_calendar_year:
            return _with_resolution(
                starting_calendar_year,
                resolution="starting_calendar_year_fallback",
                requested_period=requested_period,
            )

        previous_fy = await find_period(
            _financial_year_clause({"$lt": start_year}),
            sort=[("financial_year_start", -1)],
        )
        if previous_fy:
            return _with_resolution(
                previous_fy,
                resolution="previous_financial_year_fallback",
                requested_period=requested_period,
            )

        previous_calendar_year = await find_period(
            _calendar_annual_clause({"$lt": end_year}),
            sort=[("year_applicable", -1)],
        )
        return _with_resolution(
            previous_calendar_year,
            resolution="previous_calendar_year_fallback",
            requested_period=requested_period,
        )

    if period_type == "calendar_year" and year:
        exact_calendar_year = await find_period(_calendar_annual_clause(year))
        if exact_calendar_year:
            return _with_resolution(exact_calendar_year, resolution="exact", requested_period=requested_period)
        previous_calendar_year = await find_period(
            _calendar_annual_clause({"$lt": year}),
            sort=[("year_applicable", -1)],
        )
        return _with_resolution(
            previous_calendar_year,
            resolution="previous_calendar_year_fallback",
            requested_period=requested_period,
        )

    latest = await db.currency_conversion.find_one(
        {**base_query, **method_clause},
        {"_id": 0},
        sort=[("year_applicable", -1), ("month_applicable", -1), ("effective_from", -1)],
    )
    return _with_resolution(latest, resolution="latest_available_fallback", requested_period=requested_period)