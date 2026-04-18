"""
Engine-defined transformations.

A transformation converts a value across dimensions that a simple unit conversion
can't handle. Each transformation is IMPLEMENTED HERE (engine-level), but its
usage is CONTROLLED by:

  - category_transformations : which transformations are allowed for a given category
  - input_field.allowed_transformations : per-field allow list

Phase 1 ships ONE transformation:
  volume_to_mass : value[volume] × density[mass/volume] = value[mass]

Extensibility: adding a new transform = new entry in the registry + implementation.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Tuple

from .units import convert


async def _volume_to_mass(db, value: float, from_unit: str, context: Dict[str, Any],
                           user_overrides: Dict[str, Any]) -> Tuple[float, str, list]:
    from .properties import resolve_property
    density, density_unit, prop_audit = await resolve_property(
        db, "density", context, user_overrides
    )
    # Normalise density to kg/m3, value to m3
    value_m3, c1 = await convert(db, value, from_unit, "m3")
    density_kgm3, c2 = await convert(db, density, density_unit, "kg/m3")
    mass_kg = value_m3 * density_kgm3
    audit = [
        {"step": "transformation", "name": "volume_to_mass",
         "input": {"value": value, "unit": from_unit}},
        c1, prop_audit, c2,
        {"step": "transformation.apply",
         "formula": "value_m3 * density_kgm3",
         "output": {"value": mass_kg, "unit": "kg"}},
    ]
    return mass_kg, "kg", audit


TRANSFORMATIONS: Dict[str, Dict[str, Any]] = {
    "volume_to_mass": {
        "label": "Volume → Mass (via density)",
        "from_dimension": "volume",
        "to_dimension": "mass",
        "fn": _volume_to_mass,
    },
}


def list_transformations() -> list:
    return [
        {"key": k, "label": v["label"],
         "from_dimension": v["from_dimension"], "to_dimension": v["to_dimension"]}
        for k, v in TRANSFORMATIONS.items()
    ]


async def apply_transformation(
    db, key: str, value: float, from_unit: str, context: Dict[str, Any],
    user_overrides: Dict[str, Any],
) -> Tuple[float, str, list]:
    if key not in TRANSFORMATIONS:
        raise ValueError(f"Unknown transformation '{key}'")
    fn: Callable = TRANSFORMATIONS[key]["fn"]
    return await fn(db, value, from_unit, context, user_overrides)
