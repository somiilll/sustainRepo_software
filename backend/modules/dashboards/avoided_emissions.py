"""Counterfactual Scope 2 emissions avoided through renewable electricity."""
import re
from typing import Any, Dict, Iterable

from shared.services.ghg_reporting import adjusted_numeric_value
from shared.unit_registry import can_convert, convert


def _period_year(reporting_period: str) -> int:
    match = re.search(r"(?:19|20)\d{2}", reporting_period or "")
    return int(match.group()) if match else 0


def _normalized(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _is_renewable_electricity(record: Dict[str, Any]) -> bool:
    if _normalized(record.get("scope")) != "scope2":
        return False
    descriptors = " ".join(
        _normalized(record.get(field))
        for field in ("fuel_type", "sub_category", "category", "activity_type")
    )
    return "renewable electricity" in descriptors and "non renewable electricity" not in descriptors


def _quantity_and_unit(record: Dict[str, Any]) -> tuple[float, str]:
    dynamic_values = record.get("dynamic_field_values") or {}
    for key in ("qty_energy", "electricity_consumed", "quantity"):
        value = dynamic_values.get(key)
        if isinstance(value, dict) and value.get("value") not in (None, ""):
            return float(value["value"]), str(value.get("unit") or record.get("unit") or "")
        if value not in (None, ""):
            return float(value), str(record.get("unit") or "")
    return float(record.get("quantity") or 0), str(record.get("unit") or "")


def _geography_score(factor: Dict[str, Any], facility: Dict[str, Any]) -> int:
    facility_values = {
        _normalized(facility.get("state")),
        _normalized(facility.get("country")),
        _normalized(facility.get("region")),
    } - {""}
    score = 0
    for field, weight in (("state", 6), ("country", 5), ("region", 4)):
        factor_value = _normalized(factor.get(field))
        if not factor_value or factor_value == "global":
            continue
        if factor_value not in facility_values:
            return -1
        score = max(score, weight)
    return score


def _select_factor(
    factors: Iterable[Dict[str, Any]], facility: Dict[str, Any], reporting_period: str
) -> Dict[str, Any] | None:
    target_year = _period_year(reporting_period)
    ranked = []
    for factor in factors:
        geography = _geography_score(factor, facility)
        if geography < 0:
            continue
        factor_year = int(factor.get("year_applicable") or factor.get("year") or 0)
        is_historical_match = not target_year or not factor_year or factor_year <= target_year
        year_rank = factor_year if is_historical_match else -factor_year
        ranked.append(((geography, int(is_historical_match), year_rank), factor))
    return max(ranked, key=lambda item: item[0])[1] if ranked else None


def _counterfactual_tco2e(record: Dict[str, Any], factor: Dict[str, Any]) -> float:
    quantity, quantity_unit = _quantity_and_unit(record)
    factor_value = float(factor.get("emission_factor_basis_quantity") or 0)
    factor_unit = str(factor.get("emission_factor_basis_unit") or "")
    if quantity <= 0 or factor_value <= 0 or "/" not in factor_unit:
        return 0.0
    numerator_unit, denominator_unit = [part.strip() for part in factor_unit.split("/", 1)]
    if not can_convert(quantity_unit, denominator_unit):
        return 0.0
    normalized_quantity = convert(quantity, quantity_unit, denominator_unit)
    counterfactual = normalized_quantity * factor_value
    if can_convert(numerator_unit, "tCO2e"):
        return convert(counterfactual, numerator_unit, "tCO2e")
    return counterfactual if numerator_unit.lower().startswith("tco2") else 0.0


async def calculate_avoided_green_energy_emissions(
    db,
    records: Iterable[Dict[str, Any]],
    facilities_by_id: Dict[str, Dict[str, Any]],
    reporting_period_start: str | None,
    reporting_period_end: str | None,
    equity_factors: Dict[str, Any] | None = None,
) -> float:
    factors = await db.fuel_database.find(
        {
            "scope": "scope2",
            "fuel_name": {"$regex": "^Non[- ]Renewable Electricity$", "$options": "i"},
            "emission_factor_basis_quantity": {"$gt": 0},
            "is_active": {"$ne": False},
        },
        {"_id": 0},
    ).to_list(1000)
    total = 0.0
    for record in records:
        if not _is_renewable_electricity(record):
            continue
        facility = facilities_by_id.get(record.get("facility_id"))
        if not facility:
            continue
        factor = _select_factor(factors, facility, record.get("reporting_period", ""))
        if not factor:
            continue
        counterfactual = _counterfactual_tco2e(record, factor)
        total += float(adjusted_numeric_value(
            counterfactual,
            record.get("reporting_period", ""),
            record.get("facility_id"),
            reporting_period_start,
            reporting_period_end,
            equity_factors,
        ))
    return total