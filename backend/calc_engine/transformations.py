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
    """
    Convert volume to mass using density.
    
    Smart approach: Parse the density unit to understand its components.
    If density_unit is 'kg/L', we need to convert volume to L, then multiply by density.
    This avoids requiring hardcoded m3 and kg/m3 units.
    """
    from .properties import resolve_property
    density, density_unit, prop_audit = await resolve_property(
        db, "density", context, user_overrides
    )
    
    audit = [
        {"step": "transformation", "name": "volume_to_mass",
         "input": {"value": value, "unit": from_unit}},
        prop_audit,
    ]
    
    # Parse density unit to extract mass and volume components
    # Common formats: "kg/L", "kg/m³", "g/mL", "t/kL"
    mass_unit = "kg"  # default output mass unit
    volume_unit = from_unit  # default: assume density volume matches input
    
    if density_unit:
        # Try to parse "X/Y" format where X is mass, Y is volume
        if "/" in density_unit:
            parts = density_unit.split("/")
            if len(parts) == 2:
                mass_unit = parts[0].strip()
                volume_unit = parts[1].strip()
    
    # Convert input volume to the volume unit used in density
    try:
        converted_volume, c1 = await convert(db, value, from_unit, volume_unit)
        audit.append(c1)
    except ValueError:
        # If direct conversion fails, try same unit (no conversion needed)
        if from_unit == volume_unit:
            converted_volume = value
            audit.append({
                "step": "convert",
                "input": {"value": value, "unit": from_unit},
                "output": {"value": value, "unit": volume_unit},
                "factor": 1.0,
                "note": "same unit, no conversion",
            })
        else:
            raise ValueError(
                f"Cannot convert volume '{from_unit}' to '{volume_unit}' for density calculation. "
                f"Density unit is '{density_unit}'. Add a conversion from {from_unit} to {volume_unit}."
            )
    
    # Calculate mass: volume * density
    mass_value = converted_volume * density
    
    audit.append({
        "step": "transformation.apply",
        "formula": f"volume ({volume_unit}) × density ({density_unit})",
        "calculation": f"{converted_volume} × {density} = {mass_value}",
        "output": {"value": mass_value, "unit": mass_unit},
    })
    
    return mass_value, mass_unit, audit


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
