"""Shared currency-rate resolution for Scope 3 spend calculations."""

from __future__ import annotations

import re
from typing import Optional


PPP_INFLATION_METHOD = "ppp_inflation"
STANDARD_METHOD = "standard"


def extract_currency_period(reporting_period: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Return the reporting year and, for monthly periods, the calendar month."""
    if not reporting_period:
        return None, None
    value = str(reporting_period).strip()
    monthly_match = re.match(r"^(\d{4})-(\d{1,2})$", value)
    if monthly_match:
        month = int(monthly_match.group(2))
        return int(monthly_match.group(1)), month if 1 <= month <= 12 else None
    fy_match = re.match(r"^FY\s*(\d{4})\s*-\s*(\d{2,4})$", value, re.IGNORECASE)
    if fy_match:
        start_year = int(fy_match.group(1))
        end_part = fy_match.group(2)
        return int(f"{str(start_year)[:2]}{end_part}") if len(end_part) == 2 else int(end_part), None
    cy_match = re.match(r"^CY\s*(\d{4})$", value, re.IGNORECASE)
    if cy_match:
        return int(cy_match.group(1)), None
    year_match = re.match(r"^(\d{4})$", value)
    return (int(year_match.group(1)), None) if year_match else (None, None)


def normalize_currency_method(method: Optional[str]) -> str:
    return STANDARD_METHOD if method == STANDARD_METHOD else PPP_INFLATION_METHOD


async def resolve_currency_conversion(
    db,
    *,
    source_currency: str,
    target_currency: str = "USD",
    reporting_period: Optional[str] = None,
    method: Optional[str] = None,
) -> Optional[dict]:
    """Resolve the most specific active rate without changing legacy-rate behavior."""
    year, month = extract_currency_period(reporting_period)
    normalized_method = normalize_currency_method(method)
    base_query = {
        "source_currency": source_currency.upper(),
        "target_currency": target_currency.upper(),
        "is_active": True,
    }
    method_clause: dict
    if normalized_method == PPP_INFLATION_METHOD:
        method_clause = {"$or": [
            {"conversion_method": PPP_INFLATION_METHOD},
            {"conversion_method": {"$exists": False}},
            {"conversion_method": None},
        ]}
    else:
        method_clause = {"conversion_method": STANDARD_METHOD}

    if year and month:
        monthly_query = {
            **base_query,
            "year_applicable": year,
            "$and": [
                method_clause,
                {"$or": [{"month_applicable": month}, {"effective_from": f"{year}-{month:02d}"}]},
            ],
        }
        monthly = await db.currency_conversion.find_one(monthly_query, {"_id": 0})
        if monthly:
            return monthly

    if year:
        yearly_query = {**base_query, "year_applicable": year, "$and": [
            method_clause,
            {"$or": [{"month_applicable": {"$exists": False}}, {"month_applicable": None}]},
        ]}
        return await db.currency_conversion.find_one(yearly_query, {"_id": 0})

    return await db.currency_conversion.find_one(
        {**base_query, **method_clause},
        {"_id": 0},
        sort=[("year_applicable", -1), ("month_applicable", -1), ("effective_from", -1)],
    )