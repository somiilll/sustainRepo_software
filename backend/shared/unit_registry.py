"""
Centralized Unit Registry for ESG Metrics.

Single source of truth for all unit definitions, conversions, and type detection.
Used by: KPI engine, dashboards, targets, reports, data entry.
"""

from typing import Dict, List, Optional, Tuple

# =============================================================================
# Unit Registry — conversion factors are relative to the base unit of each type
# =============================================================================

UNIT_REGISTRY: Dict[str, Dict] = {
    "volume": {
        "base": "L",
        "label": "Volume",
        "units": {
            "ml":         {"factor": 0.001,       "label": "Millilitre",   "aliases": ["millilitre", "millilitres", "milliliter", "ml"]},
            "L":          {"factor": 1,            "label": "Litre",        "aliases": ["litre", "litres", "liter", "liters", "l"]},
            "kl":         {"factor": 1_000,        "label": "Kilolitre",    "aliases": ["kilolitre", "kilolitres", "kiloliter", "kl", "kiloliters"]},
            "MegaLitres": {"factor": 1_000_000,    "label": "MegaLitre",    "aliases": ["megalitre", "megalitres", "megaliter", "ml"]},
            "m3":         {"factor": 1_000,        "label": "Cubic Metre",  "aliases": ["cubic metre", "cubic meter", "m³", "m3"]},
            "cm3":        {"factor": 0.001,        "label": "Cubic cm",     "aliases": ["cubic centimetre", "cubic centimeter", "cm³", "cm3"]},
        },
    },
    "energy": {
        "base": "GJ",
        "label": "Energy",
        "units": {
            "J":   {"factor": 1e-9,   "label": "Joule",          "aliases": ["joule", "joules", "j"]},
            "kJ":  {"factor": 1e-6,   "label": "Kilojoule",      "aliases": ["kilojoule", "kilojoules", "kj", "kilojoule (kj)"]},
            "MJ":  {"factor": 0.001,  "label": "Megajoule",      "aliases": ["megajoule", "megajoules", "mj"]},
            "GJ":  {"factor": 1,      "label": "Gigajoule",      "aliases": ["gigajoule", "gigajoules", "gj"]},
            "TJ":  {"factor": 1_000,  "label": "Terajoule",      "aliases": ["terajoule", "terajoules", "tj"]},
            "kWh": {"factor": 0.0036, "label": "Kilowatt-hour",  "aliases": ["kilowatt-hour", "kilowatt hour", "kwh"]},
            "MWh": {"factor": 3.6,    "label": "Megawatt-hour",  "aliases": ["megawatt-hour", "megawatt hour", "mwh"]},
            "GWh": {"factor": 3_600,  "label": "Gigawatt-hour",  "aliases": ["gigawatt-hour", "gigawatt hour", "gwh"]},
        },
    },
    "mass": {
        "base": "kg",
        "label": "Mass / Weight",
        "units": {
            "g":     {"factor": 0.001,       "label": "Gram",            "aliases": ["gram", "grams", "g"]},
            "kg":    {"factor": 1,            "label": "Kilogram",        "aliases": ["kilogram", "kilograms", "kg"]},
            "t":     {"factor": 1_000,        "label": "Tonne",           "aliases": ["tonne", "tonnes", "metric ton", "metric tons", "t"]},
            "MT":    {"factor": 1_000_000,    "label": "Megatonne",       "aliases": ["megatonne", "megatonnes", "mt"]},
            "lb":    {"factor": 0.453592,     "label": "Pound",           "aliases": ["pound", "pounds", "lb", "lbs"]},
            "kgCO2": {"factor": 1,            "label": "kg CO₂",         "aliases": ["kgco2", "kg co2"]},
            "tCO2":  {"factor": 1_000,        "label": "Tonne CO₂",      "aliases": ["tco2", "t co2", "tco2e", "tonne co2"]},
            "kgCO2e":{"factor": 1,            "label": "kg CO₂e",        "aliases": ["kgco2e", "kg co2e"]},
            "tCO2e": {"factor": 1_000,        "label": "Tonne CO₂e",     "aliases": ["tco2e", "t co2e", "tonne co2e"]},
        },
    },
    "distance": {
        "base": "km",
        "label": "Distance",
        "units": {
            "m":    {"factor": 0.001,  "label": "Metre",          "aliases": ["metre", "meter", "metres", "meters", "m"]},
            "km":   {"factor": 1,      "label": "Kilometre",      "aliases": ["kilometre", "kilometers", "km"]},
            "mi":   {"factor": 1.60934,"label": "Mile",            "aliases": ["mile", "miles", "mi"]},
            "nmi":  {"factor": 1.852,  "label": "Nautical Mile",  "aliases": ["nautical mile", "nautical miles", "nmi"]},
        },
    },
    "area": {
        "base": "m2",
        "label": "Area",
        "units": {
            "m2":      {"factor": 1,         "label": "Sq. Metre",   "aliases": ["sq m", "sq metre", "m²", "m2", "square meter"]},
            "km2":     {"factor": 1_000_000,  "label": "Sq. Km",     "aliases": ["sq km", "km²", "km2", "square kilometer"]},
            "hectare": {"factor": 10_000,     "label": "Hectare",    "aliases": ["hectare", "hectares", "ha"]},
            "acre":    {"factor": 4_046.86,   "label": "Acre",       "aliases": ["acre", "acres"]},
        },
    },
    "currency": {
        "base": "INR",
        "label": "Currency",
        "units": {
            "INR":  {"factor": 1,      "label": "Indian Rupee",   "aliases": ["inr", "rupee", "rupees", "₹"]},
            "USD":  {"factor": 83,     "label": "US Dollar",      "aliases": ["usd", "dollar", "dollars", "$"]},
            "EUR":  {"factor": 90,     "label": "Euro",           "aliases": ["eur", "euro", "euros", "€"]},
        },
    },
}

# Build reverse lookup: alias/symbol → (unit_type, canonical_symbol)
_ALIAS_MAP: Dict[str, Tuple[str, str]] = {}

def _build_alias_map():
    for unit_type, type_cfg in UNIT_REGISTRY.items():
        for symbol, unit_cfg in type_cfg["units"].items():
            _ALIAS_MAP[symbol.lower()] = (unit_type, symbol)
            for alias in unit_cfg.get("aliases", []):
                _ALIAS_MAP[alias.lower()] = (unit_type, symbol)

_build_alias_map()


# =============================================================================
# Public API
# =============================================================================

def detect_unit_type(unit: str) -> Optional[str]:
    """Detect the unit type (volume, energy, mass, etc.) from a unit string."""
    entry = _ALIAS_MAP.get(unit.lower().strip())
    return entry[0] if entry else None


def resolve_symbol(unit: str) -> Optional[str]:
    """Resolve any alias to canonical symbol. Returns None if unknown."""
    entry = _ALIAS_MAP.get(unit.lower().strip())
    return entry[1] if entry else None


def convert(value: float, from_unit: str, to_unit: str) -> float:
    """
    Convert a value between two units of the same type.
    Returns the converted value, or the original if conversion not possible.
    """
    if not value or not from_unit or not to_unit:
        return value or 0

    from_entry = _ALIAS_MAP.get(from_unit.lower().strip())
    to_entry = _ALIAS_MAP.get(to_unit.lower().strip())

    if not from_entry or not to_entry:
        return value
    if from_entry[0] != to_entry[0]:
        return value  # different unit types, can't convert

    from_cfg = UNIT_REGISTRY[from_entry[0]]["units"][from_entry[1]]
    to_cfg = UNIT_REGISTRY[to_entry[0]]["units"][to_entry[1]]

    # Convert: value * from_factor / to_factor  (via base unit)
    return value * from_cfg["factor"] / to_cfg["factor"]


def get_base_unit(unit_type: str) -> Optional[str]:
    """Get the base unit symbol for a unit type."""
    cfg = UNIT_REGISTRY.get(unit_type)
    return cfg["base"] if cfg else None


def convert_to_base(value: float, from_unit: str) -> Tuple[float, Optional[str]]:
    """Convert a value to its base unit. Returns (converted_value, base_unit_symbol)."""
    entry = _ALIAS_MAP.get(from_unit.lower().strip())
    if not entry:
        return (value or 0, None)
    unit_type, symbol = entry
    base = UNIT_REGISTRY[unit_type]["base"]
    return (convert(value, from_unit, base), base)


def get_units_for_type(unit_type: str) -> List[Dict]:
    """Get all units for a given type, for populating dropdowns."""
    cfg = UNIT_REGISTRY.get(unit_type)
    if not cfg:
        return []
    return [
        {"symbol": sym, "label": u["label"], "is_base": sym == cfg["base"]}
        for sym, u in cfg["units"].items()
    ]


def get_all_unit_types() -> List[Dict]:
    """Get all unit types with their labels."""
    return [
        {"type": k, "label": v["label"], "base_unit": v["base"]}
        for k, v in UNIT_REGISTRY.items()
    ]
