"""Shared unit conversion utilities for all dashboard services."""


def to_kilolitres(value: float, unit: str) -> float:
    """Convert water quantity to KiloLitres."""
    normalized = (unit or "litres").lower()
    if "mega" in normalized:
        return value * 1000
    if "kilo" in normalized or normalized == "kl":
        return value
    return value / 1000


def to_mwh(value: float, unit: str) -> float:
    """Convert energy quantity to MWh."""
    normalized = (unit or "mwh").lower()
    if "kwh" in normalized:
        return value / 1000
    if "gwh" in normalized:
        return value * 1000
    if "tj" in normalized:
        return value * 277.778
    return value


def to_number(value) -> float:
    """Safely convert to float."""
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
