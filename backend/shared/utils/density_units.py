"""Canonical formatting helpers for density units."""
from typing import Any, Dict, Optional


def normalize_density_unit(unit: Optional[str]) -> Optional[str]:
    if unit is None:
        return None
    compact_unit = "".join(str(unit).split())
    return "/".join(
        "kl" if component.lower() == "kl" else component
        for component in compact_unit.split("/")
    )


def normalize_density_dynamic_values(values: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    normalized = dict(values or {})
    density = normalized.get("density")
    if not isinstance(density, dict):
        return normalized
    normalized_density = dict(density)
    if "unit" in normalized_density:
        normalized_density["unit"] = normalize_density_unit(normalized_density["unit"])
    normalized["density"] = normalized_density
    return normalized