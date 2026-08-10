"""Shared unit conversion utilities for all dashboard services."""


def to_kilolitres(value: float, unit: str) -> float:
    """Convert water quantity to KiloLitres."""
    try:
        value = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    normalized = (unit or "litres").lower()
    if "mega" in normalized:
        return value * 1000
    if "kilo" in normalized or normalized == "kl":
        return value
    return value / 1000


def to_mwh(value: float, unit: str) -> float:
    """Convert energy quantity to MWh."""
    normalized = (unit or "mwh").lower()
    
    # kWh conversions
    if "kwh" in normalized:
        return value / 1000
    
    # GWh conversions
    if "gwh" in normalized:
        return value * 1000
    
    # TJ conversions
    if "tj" in normalized:
        return value * 277.778
    
    # GJ conversions
    if "gj" in normalized:
        return value * 0.27778  # 1 GJ = 0.27778 MWh
    
    # MJ conversions
    if "mj" in normalized:
        return value * 0.00027778  # 1 MJ = 0.00027778 MWh
    
    # kJ conversions (kilojoule)
    if "kj" in normalized or "kilojoule" in normalized:
        return value * 2.778e-7  # 1 kJ = 2.778e-7 MWh
    
    # Joules (J)
    if normalized == "j" or "joule" in normalized:
        return value * 2.778e-10  # 1 J = 2.778e-10 MWh
    
    # Default: assume MWh
    return value


def to_number(value) -> float:
    """Safely convert to float."""
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
