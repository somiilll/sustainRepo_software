from __future__ import annotations

from typing import Any


def canonicalize_calc_engine_unit(value: Any) -> str:
    """Return the Calc Engine symbol for common mass and volume aliases."""
    raw = str(value or "").strip()
    if not raw:
        return raw
    key = raw.lower().replace(" ", "")
    aliases = {
        "ton": "t", "tons": "t", "tonne": "t", "tonnes": "t", "mt": "t",
        "metricton": "t", "metrictons": "t", "metrictonne": "t", "metrictonnes": "t",
        "l": "L", "ltr": "L", "ltrs": "L", "litre": "L", "litres": "L",
        "liter": "L", "liters": "L",
        "kl": "kL", "kilolitre": "kL", "kilolitres": "kL", "kiloliter": "kL", "kiloliters": "kL",
    }
    return aliases.get(key, raw)


def canonicalize_calculation_units(values: dict) -> dict:
    """Normalize main and dynamic activity units before they enter Calc Engine."""
    normalized = dict(values or {})
    if "unit" in normalized:
        normalized["unit"] = canonicalize_calc_engine_unit(normalized.get("unit"))
    dynamic_values = normalized.get("dynamic_field_values")
    if isinstance(dynamic_values, dict):
        normalized["dynamic_field_values"] = {
            key: {**value, "unit": canonicalize_calc_engine_unit(value.get("unit"))}
            if isinstance(value, dict) else value
            for key, value in dynamic_values.items()
        }
    return normalized
