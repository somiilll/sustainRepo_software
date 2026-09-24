"""Canonical reporting adjustments for GHG summaries and exports."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Dict, Iterable, List

from shared.utils.emission_records import emission_proration


ZERO = Decimal("0")
ONE = Decimal("1")
DISPLAY_QUANTUM = Decimal("0.01")


def decimal_value(value: Any) -> Decimal:
    """Convert an external numeric value without introducing binary float drift."""
    if value is None or value == "":
        return ZERO
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return ZERO


def emission_value(record: Dict[str, Any]) -> Decimal:
    """Return the canonical stored tCO2e value with legacy fallback support."""
    for field in ("total_emissions", "co2e_emissions", "calculated_co2e"):
        if record.get(field) is not None:
            return decimal_value(record.get(field))
    return ZERO


def uses_equity_share(organization: Dict[str, Any] | None) -> bool:
    return bool(organization and organization.get("org_boundaries_approach") == "equity_share")


def facility_equity_factor(facility: Dict[str, Any], apply_equity_share: bool) -> Decimal:
    if not apply_equity_share:
        return ONE
    stored_percentage = facility.get("equity_share_percentage") if facility else None
    percentage = decimal_value(stored_percentage if stored_percentage not in (None, "", 0) else 100)
    return percentage / Decimal("100")


def reporting_period_proration(
    reporting_period: str,
    reporting_period_start: str | None,
    reporting_period_end: str | None,
) -> Decimal:
    """Return the canonical in-range proportion for a stored GHG period."""
    return decimal_value(emission_proration(reporting_period, reporting_period_start, reporting_period_end))


def facility_equity_factors(
    organization: Dict[str, Any] | None,
    facilities: Iterable[Dict[str, Any]],
) -> Dict[str, Decimal]:
    apply_equity_share = uses_equity_share(organization)
    return {
        facility.get("id"): facility_equity_factor(facility, apply_equity_share)
        for facility in facilities
        if facility.get("id")
    }


def adjusted_emission_value(
    record: Dict[str, Any],
    reporting_period_start: str | None,
    reporting_period_end: str | None,
    equity_factors: Dict[str, Decimal] | None = None,
) -> Decimal:
    """Apply period proration and equity allocation without rounding."""
    return adjusted_numeric_value(
        emission_value(record), record.get("reporting_period", ""), record.get("facility_id"),
        reporting_period_start, reporting_period_end, equity_factors,
    )


def adjusted_numeric_value(
    value: Any,
    reporting_period: str,
    facility_id: str | None,
    reporting_period_start: str | None,
    reporting_period_end: str | None,
    equity_factors: Dict[str, Decimal] | None = None,
) -> Decimal:
    """Apply canonical reporting adjustments to a supplied unrounded numeric value."""
    proration = reporting_period_proration(reporting_period, reporting_period_start, reporting_period_end)
    equity_factor = (equity_factors or {}).get(facility_id, ONE)
    return decimal_value(value) * proration * equity_factor


def adjusted_reporting_records(
    records: Iterable[Dict[str, Any]],
    reporting_period_start: str,
    reporting_period_end: str,
    equity_factors: Dict[str, Decimal] | None = None,
) -> List[Dict[str, Any]]:
    """Keep in-period records and attach their unrounded reporting values."""
    adjusted = []
    for record in records:
        if reporting_period_proration(record.get("reporting_period", ""), reporting_period_start, reporting_period_end) <= 0:
            continue
        record_copy = dict(record)
        record_copy["reporting_value"] = adjusted_emission_value(
            record_copy, reporting_period_start, reporting_period_end, equity_factors
        )
        adjusted.append(record_copy)
    return adjusted


def adjusted_sink_value(sink: Dict[str, Any], equity_factors: Dict[str, Decimal] | None = None) -> Decimal:
    """Apply the already-resolved reporting-period share and equity allocation."""
    period_share = decimal_value(sink.get("_proportion", ONE))
    equity_factor = (equity_factors or {}).get(sink.get("facility_id"), ONE)
    return decimal_value(sink.get("total_emissions_reduced")) * period_share * equity_factor


def display_round(value: Decimal | Any, places: int = 2) -> Decimal:
    """Official two-decimal reporting presentation: Decimal ROUND_HALF_UP."""
    quantum = Decimal("1").scaleb(-places)
    return decimal_value(value).quantize(quantum, rounding=ROUND_HALF_UP)