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
    
    Smart approach:
    1. Get density (may be from user override or fuel database)
    2. If user overrode density with different unit, normalize to fuel's default unit
    3. Parse the density unit to understand volume component
    4. Convert input volume to that unit
    5. Multiply: volume × density = mass
    """
    from .properties import resolve_property, _resolve_from_source_mapping
    
    # Get density value and unit
    density, density_unit, prop_audit = await resolve_property(
        db, "density", context, user_overrides
    )
    
    audit = [
        {"step": "transformation", "name": "volume_to_mass",
         "input": {"value": value, "unit": from_unit}},
        prop_audit,
    ]
    
    # Check if density was from user override and has a different unit than fuel's default
    # If so, normalize to the fuel's default density unit
    if user_overrides and "density" in user_overrides:
        override_unit = user_overrides["density"].get("unit", "")
        
        # Get the fuel's default density unit from source mapping
        fuel_density_result = await _resolve_from_source_mapping(db, "density", context)
        if fuel_density_result:
            _, default_density_unit, _ = fuel_density_result
            
            # If override unit differs from default, convert override to default unit
            if override_unit and default_density_unit and override_unit != default_density_unit:
                try:
                    # Convert density value from override unit to default unit
                    # e.g., kg/m³ → kg/L
                    converted_density, density_conv_audit = await convert(
                        db, density, override_unit, default_density_unit
                    )
                    audit.append({
                        "step": "normalize_density",
                        "input": {"value": density, "unit": override_unit},
                        "output": {"value": converted_density, "unit": default_density_unit},
                        "note": "Normalized override density to fuel's default unit",
                    })
                    audit.append(density_conv_audit)
                    density = converted_density
                    density_unit = default_density_unit
                except ValueError as e:
                    # If conversion fails, continue with original unit
                    audit.append({
                        "step": "normalize_density",
                        "note": f"Could not normalize density unit: {e}. Using override unit as-is.",
                    })
    
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
