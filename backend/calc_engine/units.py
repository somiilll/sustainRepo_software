"""
Unit system — dimension vectors, simple units, compound units, conversions.

A base dimension is a symbolic axis: mass, volume, energy, money, time, count, gwp.
Dimension vector is a dict like {"mass": 1} for kg, {"energy": 1, "mass": -1} for MJ/kg.

Emission units (kgCO2, kgCH4, …) ARE expressed as "mass" dimension + a gas_tag.
We handle them as separate effective dimensions (mass_co2, mass_ch4, …) so
"kgCO2/kg" carries dimension {mass_co2: 1, mass: -1}.

A compound unit is defined as a list of components: [{unit_key, power}, …].
Its factor to base is the product of component factors ^ power.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict

# Base dimensions we recognise
BASE_DIMENSIONS = [
    "mass", "volume", "energy", "money", "time", "count",
    "mass_co2", "mass_ch4", "mass_n2o", "mass_co2e",
    "gwp",
]

# ---------- System unit catalogue ----------
# NOTE: System units are NO LONGER auto-seeded.
# SuperAdmin must manually add all units via the UI.
# These arrays are kept empty for backwards compatibility.

SYSTEM_UNITS: List[dict] = []

# System compound units — NO LONGER auto-seeded.
SYSTEM_COMPOUND_UNITS: List[dict] = []

# Emissions-mass labels retain the same metric mass relationship as their
# underlying units. This lets the calculator use Super Admin's configured
# `t → kg` conversion when a formula compares `tCO2` with `kgCO2`, without
# hard-coding a numeric factor in the Custom Fuel client.
EMISSION_MASS_BASE_UNITS = {
    "kgCO2": ("kg", "CO2"),
    "tCO2": ("t", "CO2"),
    "kgCH4": ("kg", "CH4"),
    "tCH4": ("t", "CH4"),
    "kgN2O": ("kg", "N2O"),
    "tN2O": ("t", "N2O"),
    "kgCO2e": ("kg", "CO2e"),
    "tCO2e": ("t", "CO2e"),
}


def _compound_unit_lookup_keys(key: str) -> List[str]:
    """Return exact registered-key aliases for legacy kL/kl denominators."""
    keys = [key]
    if str(key or "").endswith("/kl"):
        keys.append(f"{key[:-3]}/kL")
    elif str(key or "").endswith("/kL"):
        keys.append(f"{key[:-3]}/kl")
    return keys


async def seed_units(db) -> Tuple[int, int]:
    """No-op: Units are no longer auto-seeded. SuperAdmin must add them manually."""
    # Previously this function seeded system units automatically.
    # Now it does nothing - all units must be added by SuperAdmin via UI.
    return 0, 0


async def _resolve_compound(db, components: List[dict]) -> Tuple[Dict[str, int], float]:
    """
    Resolve a list of {unit_key, power} into (dimension_vector, to_base_factor).
    Note: to_base_factor is computed but will be deprecated. Conversions should use ce_unit_conversions.
    """
    dv: Dict[str, int] = {}
    for comp in components:
        unit_key = comp["unit_key"]
        
        # Check main 'units' table
        main_unit = await db.units.find_one({"symbol": unit_key, "is_active": True}, {"_id": 0})
        if not main_unit:
            raise ValueError(f"Unknown unit '{unit_key}' in compound unit. Add it in the Units module first.")
        
        # Map unit_type to dimension_vector
        unit_type = main_unit.get("unit_type", "mass")
        dimension_map = {
            "mass": {"mass": 1},
            "volume": {"volume": 1},
            "energy": {"energy": 1},
            "money": {"money": 1},
            "currency": {"money": 1},
            "emissions": {"mass_co2e": 1},
        }
        unit_dv = dimension_map.get(unit_type, {"mass": 1})
        
        p = int(comp["power"])
        for d, v in unit_dv.items():
            dv[d] = dv.get(d, 0) + v * p
            if dv[d] == 0:
                del dv[d]
    
    # Return 1.0 as factor - actual conversions should use ce_unit_conversions table
    return dv, 1.0


async def resolve_unit(db, key: str) -> dict:
    """Look up a simple or compound unit by key. Returns normalized unit descriptor."""
    if not key:
        raise ValueError("Unit key is required")
    
    # Check the main 'units' table
    main_unit = await db.units.find_one({"symbol": key, "is_active": True}, {"_id": 0})
    if main_unit:
        # Map unit_type to dimension_vector
        unit_type = main_unit.get("unit_type", "mass")
        dimension_map = {
            "mass": {"mass": 1},
            "volume": {"volume": 1},
            "energy": {"energy": 1},
            "money": {"money": 1},
            "currency": {"money": 1},
            "emissions": {"emissions": 1},
        }
        return {
            "key": main_unit["symbol"],
            "kind": "simple",
            "dimension_vector": dimension_map.get(unit_type, {"mass": 1}),
            "unit_type": unit_type,
        }
    
    # Check compound units
    compound = await db.ce_compound_units.find_one(
        {"key": {"$in": _compound_unit_lookup_keys(key)}},
        {"_id": 0},
    )
    if compound:
        return {
            "key": compound["key"],
            "kind": "compound",
            "dimension_vector": compound.get("derived_dimension_vector", {}),
        }
    raise ValueError(f"Unknown unit '{key}' (register it in Units module or create it as a compound unit)")


def dims_equal(a: Dict[str, int], b: Dict[str, int]) -> bool:
    a = {k: v for k, v in (a or {}).items() if v != 0}
    b = {k: v for k, v in (b or {}).items() if v != 0}
    return a == b


async def convert(db, value: float, from_unit: str, to_unit: str, context: dict = None, user_overrides: dict = None) -> Tuple[float, dict]:
    """
    Convert value between units of the same dimension.
    Returns (converted_value, audit_entry).
    
    Priority:
    1. Check ce_unit_conversions table for direct conversion
    2. Check ce_unit_conversions table for reverse conversion (and invert)
    3. Try chained conversion through intermediate units (e.g., kL → L → mL)
    4. Fallback to dimension-based conversion using to_base_factor (for backwards compat)
    
    Args:
        context: Optional dict with fuel_database_id for property-based conversions
        user_overrides: Optional dict with user-provided property values (e.g., density)
    
    Raises ValueError on dimension mismatch or missing conversion.
    """
    context = context or {}
    user_overrides = user_overrides or {}
    
    # Handle empty or None units - assume no conversion needed
    if not from_unit or not to_unit:
        return value, {
            "step": "convert",
            "input": {"value": value, "unit": from_unit or "unitless"},
            "output": {"value": value, "unit": to_unit or "unitless"},
            "factor": 1.0,
            "note": "no conversion (missing unit specification)",
        }
    
    if from_unit == to_unit:
        return value, {
            "step": "convert",
            "input": {"value": value, "unit": from_unit},
            "output": {"value": value, "unit": to_unit},
            "factor": 1.0,
            "note": "no-op (same unit)",
        }
    
    # Priority 1: Check for direct DB-defined conversion
    direct_conv = await db.ce_unit_conversions.find_one(
        {"from_unit": from_unit, "to_unit": to_unit, "is_active": True},
        {"_id": 0}
    )
    if direct_conv and direct_conv.get("factor") is not None:
        factor = direct_conv["factor"]
        converted = value * factor
        if not math.isfinite(converted):
            raise ValueError(f"Conversion produced non-finite value ({value} {from_unit} -> {to_unit})")
        return converted, {
            "step": "convert",
            "input": {"value": value, "unit": from_unit},
            "output": {"value": converted, "unit": to_unit},
            "factor": factor,
            "method": "db_conversion",
            "conversion_id": direct_conv.get("id"),
            "defined_by": direct_conv.get("defined_by"),
        }
    
    # Priority 2: Check for reverse DB-defined conversion
    reverse_conv = await db.ce_unit_conversions.find_one(
        {"from_unit": to_unit, "to_unit": from_unit, "is_active": True},
        {"_id": 0}
    )
    if reverse_conv and reverse_conv.get("factor") is not None and reverse_conv.get("factor") != 0:
        factor = 1.0 / reverse_conv["factor"]
        converted = value * factor
        if not math.isfinite(converted):
            raise ValueError(f"Conversion produced non-finite value ({value} {from_unit} -> {to_unit})")
        return converted, {
            "step": "convert",
            "input": {"value": value, "unit": from_unit},
            "output": {"value": converted, "unit": to_unit},
            "factor": factor,
            "method": "db_conversion_reverse",
            "conversion_id": reverse_conv.get("id"),
            "defined_by": reverse_conv.get("defined_by"),
            "note": f"Reverse of {to_unit}→{from_unit}",
        }
    
    # Priority 3: Try chained conversion through intermediate units
    # Find all conversions from 'from_unit' and to 'to_unit'
    chained_result = await _find_chained_conversion(
        db,
        from_unit,
        to_unit,
        value,
        context=context,
        user_overrides=user_overrides,
    )
    if chained_result:
        return chained_result

    # Priority 4: Apply property-based simple-unit conversions. These were
    # previously available only while decomposing compound units, which made
    # a valid kg → L density conversion fail before the formula could use it.
    try:
        factor, property_audit = await _convert_component(
            db, from_unit, to_unit, context, user_overrides,
        )
        converted = value * factor
        if not math.isfinite(converted):
            raise ValueError(
                f"Conversion produced non-finite value ({value} {from_unit} -> {to_unit})"
            )
        return converted, {
            "step": "convert",
            "input": {"value": value, "unit": from_unit},
            "output": {"value": converted, "unit": to_unit},
            **property_audit,
        }
    except ValueError:
        pass
    
    # Priority 5: Try compound unit conversion (e.g., MJ/kg → TJ/kg)
    compound_result = await _try_compound_conversion(db, from_unit, to_unit, value, context, user_overrides)
    if compound_result:
        return compound_result
    
    # No conversion found - raise error
    # SuperAdmin must define the conversion in Unit Conversions
    raise ValueError(
        f"No conversion defined for '{from_unit}' → '{to_unit}'. "
        f"Please add it in Calc Engine → Unit Conversions."
    )


async def _find_chained_conversion(
    db,
    from_unit: str,
    to_unit: str,
    value: float,
    max_depth: int = 3,
    context: dict = None,
    user_overrides: dict = None,
) -> Optional[Tuple[float, dict]]:
    """
    Find a conversion path through intermediate units.
    
    Example: kL → L → kg (if kL→L exists and L→kg via transformation)
    
    Uses BFS to find shortest path. Max depth prevents infinite loops.
    Returns (converted_value, audit_entry) or None if no path found.
    """
    context = context or {}
    user_overrides = user_overrides or {}

    # Get all available conversions
    all_conversions = await db.ce_unit_conversions.find(
        {"is_active": True}, {"_id": 0}
    ).to_list(500)
    
    # Build adjacency map. Property-based edges retain their conversion record
    # so their factor can be resolved from a user override or fuel default when
    # that edge is reached in a mixed chain such as kl -> L -> kg.
    graph: Dict[str, List[dict]] = {}
    for conv in all_conversions:
        src = conv.get("from_unit")
        tgt = conv.get("to_unit")
        fac = conv.get("factor")
        is_property_edge = (
            conv.get("conversion_type") == "property_based"
            and bool(conv.get("property_key"))
        )
        if not src or not tgt or (fac is None and not is_property_edge):
            continue
        graph.setdefault(src, []).append({
            "to": tgt,
            "factor": fac,
            "conversion": conv,
            "reverse": False,
        })
        # Add reverse direction
        if is_property_edge or fac != 0:
            graph.setdefault(tgt, []).append({
                "to": src,
                "factor": None if is_property_edge else 1.0 / fac,
                "conversion": conv,
                "reverse": True,
            })
    
    # BFS to find shortest path
    from collections import deque
    
    # Queue items: (current_unit, accumulated_factor, path, edge_audits,
    # property_resolutions)
    queue = deque([(from_unit, 1.0, [from_unit], [], [])])
    visited = {from_unit}
    
    while queue:
        current, acc_factor, path, edge_audits, property_resolutions = queue.popleft()
        
        if len(path) > max_depth + 1:
            continue
        
        # Check if we can reach target from current
        for edge in graph.get(current, []):
            next_unit = edge["to"]
            factor = edge.get("factor")
            # Keep a direct property conversion on its existing dedicated path
            # in _convert_component(). The chain walker is only needed when a
            # property edge follows or precedes another conversion edge.
            if factor is None and current == from_unit and next_unit == to_unit and len(path) == 1:
                continue
            edge_audit = {
                "from": current,
                "to": next_unit,
                "factor": factor,
                "method": "db_conversion_reverse" if edge.get("reverse") else "db_conversion",
                "conversion_id": edge.get("conversion", {}).get("id"),
            }
            edge_property_resolutions = []

            if factor is None:
                try:
                    factor, resolved_audit = await _convert_component(
                        db,
                        current,
                        next_unit,
                        context,
                        user_overrides,
                        allow_chained=False,
                    )
                except ValueError:
                    continue
                edge_audit.update({
                    "factor": factor,
                    "method": resolved_audit.get("method", "property_based"),
                    "property_key": resolved_audit.get("property_key"),
                })
                if resolved_audit.get("property_resolution"):
                    edge_property_resolutions.append(resolved_audit["property_resolution"])
                edge_property_resolutions.extend(
                    resolved_audit.get("property_resolutions") or []
                )

            next_edge_audits = edge_audits + [edge_audit]
            next_property_resolutions = property_resolutions + edge_property_resolutions
            if next_unit == to_unit:
                # Found the target!
                total_factor = acc_factor * factor
                converted = value * total_factor
                if not math.isfinite(converted):
                    continue
                return converted, {
                    "step": "convert",
                    "input": {"value": value, "unit": from_unit},
                    "output": {"value": converted, "unit": to_unit},
                    "factor": total_factor,
                    "method": "chained_conversion",
                    "path": path + [to_unit],
                    "component_conversions": next_edge_audits,
                    "property_resolutions": next_property_resolutions,
                    "note": f"Chained: {' → '.join(path + [to_unit])}",
                }
            
            if next_unit not in visited and len(path) < max_depth:
                visited.add(next_unit)
                queue.append((
                    next_unit,
                    acc_factor * factor,
                    path + [next_unit],
                    next_edge_audits,
                    next_property_resolutions,
                ))
    
    return None



async def _try_compound_conversion(
    db, from_unit: str, to_unit: str, value: float, context: dict = None, user_overrides: dict = None
) -> Optional[Tuple[float, dict]]:
    """
    Try compound unit conversion by decomposing into components.
    
    Example: MJ/kg → TJ/kg
    - Decompose MJ/kg into: MJ (power: 1), kg (power: -1)
    - Decompose TJ/kg into: TJ (power: 1), kg (power: -1)
    - Convert MJ → TJ (uses chained conversion if needed)
    - Convert kg → kg (same unit, factor 1)
    - Total factor = (MJ→TJ factor)^1 × (kg→kg factor)^(-1)
    
    Uses the full convert() logic for each component, which supports:
    - Direct conversion
    - Reverse conversion  
    - Chained conversion (e.g., cm3 → m³ → L)
    - Property-based conversion (e.g., L → kg using density from fuel_database or user_overrides)
    
    Returns (converted_value, audit_entry) or None if not applicable.
    """
    context = context or {}
    user_overrides = user_overrides or {}
    
    def derived_emission_factor_components(unit_key: str) -> Optional[List[dict]]:
        """Decompose a labelled emissions factor when no compound row exists."""
        parts = str(unit_key or "").split("/")
        if len(parts) != 2:
            return None
        numerator, denominator = parts
        if numerator not in EMISSION_MASS_BASE_UNITS or not denominator:
            return None
        return [
            {"unit_key": numerator, "power": 1},
            {"unit_key": denominator, "power": -1},
        ]

    # Look up compound units. Labelled emissions factors may be derived from
    # their configured simple-unit components, so Super Admin does not need to
    # duplicate every `tCO2/...` companion of an existing `kgCO2/...` unit.
    from_compound = await db.ce_compound_units.find_one(
        {"key": {"$in": _compound_unit_lookup_keys(from_unit)}},
        {"_id": 0},
    )
    to_compound = await db.ce_compound_units.find_one(
        {"key": {"$in": _compound_unit_lookup_keys(to_unit)}},
        {"_id": 0},
    )

    from_components = (from_compound or {}).get("components") or derived_emission_factor_components(from_unit)
    to_components = (to_compound or {}).get("components") or derived_emission_factor_components(to_unit)
    if not from_components or not to_components:
        return None
    
    # Check whether compound dimensions differ. A mismatch is still valid when
    # a corresponding component can be converted through a property such as
    # density (for example kgCO2/L → kgCO2/kg). Component conversion below
    # remains authoritative and rejects unsupported mismatches.
    # Build lookup for to_compound components by power
    to_comp_map = {}
    for tc in to_components:
        power = tc.get("power", 1)
        key = f"{'pos' if power > 0 else 'neg'}_{abs(power)}"
        to_comp_map[key] = tc
    
    # Calculate total conversion factor
    total_factor = 1.0
    component_conversions = []
    property_resolutions = []
    
    for fc in from_components:
        from_unit_key = fc.get("unit_key")
        power = fc.get("power", 1)
        match_key = f"{'pos' if power > 0 else 'neg'}_{abs(power)}"
        
        # Find corresponding to_component
        tc = to_comp_map.get(match_key)
        if not tc:
            # Try to find any component with matching power
            for tcomp in to_components:
                if tcomp.get("power") == power:
                    tc = tcomp
                    break
        
        if not tc:
            return None  # Cannot match components
        
        to_unit_key = tc.get("unit_key")
        
        if from_unit_key == to_unit_key:
            # Same unit, factor is 1
            comp_factor = 1.0
            conv_method = "same_unit"
        else:
            # Use the full conversion logic which handles:
            # - Direct conversion
            # - Reverse conversion
            # - Chained conversion (e.g., cm3 → m³ → L)
            # - Property-based conversion (e.g., L → kg using density)
            try:
                _, conv_audit = await _convert_component(db, from_unit_key, to_unit_key, context, user_overrides)
                comp_factor = conv_audit.get("factor", 1.0)
                conv_method = conv_audit.get("method", "unknown")
                if conv_audit.get("property_resolution"):
                    property_resolutions.append(conv_audit["property_resolution"])
                property_resolutions.extend(conv_audit.get("property_resolutions") or [])
            except ValueError:
                return None  # No conversion path found
        
        # Apply power to factor (e.g., for kg^-1, we need factor^-1)
        total_factor *= (comp_factor ** power)
        component_conversions.append({
            "from": from_unit_key,
            "to": to_unit_key,
            "factor": comp_factor,
            "power": power,
            "method": conv_method if from_unit_key != to_unit_key else "same_unit"
        })
    
    converted = value * total_factor
    if not math.isfinite(converted):
        return None
    
    conversion_audit = {
        "step": "convert",
        "input": {"value": value, "unit": from_unit},
        "output": {"value": converted, "unit": to_unit},
        "factor": total_factor,
        "method": "compound_same_dimension",
        "component_conversions": component_conversions,
    }
    if property_resolutions:
        conversion_audit["property_resolutions"] = property_resolutions
    return converted, conversion_audit


async def _convert_component(
    db,
    from_unit: str,
    to_unit: str,
    context: dict = None,
    user_overrides: dict = None,
    allow_chained: bool = True,
) -> Tuple[float, dict]:
    """
    Convert between simple units for compound unit decomposition.
    Uses all available conversion methods: direct, reverse, chained, property-based.
    
    Args:
        context: Optional dict with fuel_database_id for property-based conversions
        user_overrides: Optional dict with user-provided property values (e.g., density)
    
    Returns (factor, audit_entry) where factor converts 1 unit of from_unit to to_unit.
    Set allow_chained=False when resolving an edge already selected by the chain
    walker, preventing that edge from recursively starting another chain search.
    """
    context = context or {}
    user_overrides = user_overrides or {}

    def property_resolution_audit(
        property_key: str,
        value: float,
        unit: str,
        source: str,
        source_name: str,
    ) -> dict:
        return {
            "step": "resolve_property",
            "property": property_key,
            "property_label": property_key.replace("_", " ").title(),
            "value": value,
            "unit": unit,
            "source": source,
            "source_name": source_name,
        }

    async def normalize_density_factor(value: float, unit: str, expected_unit: str) -> float:
        """Normalize a density or its reciprocal to a requested conversion factor unit."""
        if not unit or not expected_unit or unit.lower() == expected_unit.lower():
            return value
        try:
            converted, _ = await convert(db, value, unit, expected_unit)
            return converted
        except ValueError:
            inverse_expected = "/".join(reversed(expected_unit.split("/")))
            if not inverse_expected or "/" not in inverse_expected:
                return value
            try:
                inverse_value, _ = await convert(db, value, unit, inverse_expected)
                if inverse_value:
                    return 1.0 / inverse_value
            except ValueError:
                pass
        return value
    
    # Priority 1: Direct DB conversion
    direct_conv = await db.ce_unit_conversions.find_one(
        {"from_unit": from_unit, "to_unit": to_unit, "is_active": True},
        {"_id": 0}
    )
    if direct_conv:
        if direct_conv.get("factor") is not None:
            return direct_conv["factor"], {
                "factor": direct_conv["factor"],
                "method": "db_conversion"
            }
        # Handle property-based conversion (e.g., L → kg using density)
        elif direct_conv.get("conversion_type") == "property_based" and direct_conv.get("property_key"):
            property_key = direct_conv["property_key"]
            
            # Priority: user_overrides > fuel_database
            # Check if user provided a custom value for this property
            if user_overrides.get(property_key):
                override_val = user_overrides[property_key]
                # Handle both dict format {"value": x, "unit": y} and raw value
                if isinstance(override_val, dict):
                    property_value = float(override_val.get("value", 0))
                    factor = property_value
                    override_unit = override_val.get("unit", "")
                    source_name = override_val.get("source_name") or "User Specified"
                    
                    # Normalize to the directional conversion factor (e.g. kg/L for L → kg).
                    if override_unit and "/" in override_unit and property_key == "density":
                        expected_density_unit = f"{to_unit}/{from_unit}"
                        factor = await normalize_density_factor(factor, override_unit, expected_density_unit)
                else:
                    property_value = float(override_val)
                    factor = property_value
                    override_unit = f"{to_unit}/{from_unit}"
                    source_name = "User Specified"
                if factor and factor != 0:
                    return factor, {
                        "factor": factor,
                        "method": "property_based_user_override",
                        "property_key": property_key,
                        "source": "user_overrides",
                        "property_resolution": property_resolution_audit(
                            property_key,
                            property_value,
                            override_unit,
                            "user_override",
                            source_name,
                        ),
                    }
            
            # Fallback to fuel database
            fuel_db_id = context.get("fuel_database_id") or context.get("fuel_code") or context.get("fuel_id")
            if fuel_db_id:
                property_unit_key = f"{property_key}_unit"
                fuel = await db.fuel_database.find_one(
                    {"id": fuel_db_id},
                    {
                        "_id": 0,
                        property_key: 1,
                        property_unit_key: 1,
                        "source": 1,
                        "source_of_information": 1,
                    },
                )
                if fuel and fuel.get(property_key):
                    property_value = float(fuel[property_key])
                    property_unit = fuel.get(property_unit_key) or f"{to_unit}/{from_unit}"
                    factor = property_value
                    if property_key == "density" and property_unit:
                        factor = await normalize_density_factor(
                            factor,
                            property_unit,
                            f"{to_unit}/{from_unit}",
                        )
                    return factor, {
                        "factor": factor,
                        "method": "property_based",
                        "property_key": property_key,
                        "fuel_database_id": fuel_db_id,
                        "property_resolution": property_resolution_audit(
                            property_key,
                            property_value,
                            property_unit,
                            "fuel_database_fallback",
                            fuel.get("source") or fuel.get("source_of_information") or "Fuel Database",
                        ),
                    }
    
    # Priority 2: Reverse DB conversion
    reverse_conv = await db.ce_unit_conversions.find_one(
        {"from_unit": to_unit, "to_unit": from_unit, "is_active": True},
        {"_id": 0}
    )
    if reverse_conv:
        if reverse_conv.get("factor") and reverse_conv.get("factor") != 0:
            factor = 1.0 / reverse_conv["factor"]
            return factor, {
                "factor": factor,
                "method": "db_conversion_reverse"
            }
        # Handle reverse property-based conversion (e.g., kg → L using 1/density)
        elif reverse_conv.get("conversion_type") == "property_based" and reverse_conv.get("property_key"):
            property_key = reverse_conv["property_key"]
            
            # Priority: user_overrides > fuel_database
            if user_overrides.get(property_key):
                override_val = user_overrides[property_key]
                if isinstance(override_val, dict):
                    property_value = float(override_val.get("value", 0))
                    base_factor = property_value
                    override_unit = override_val.get("unit", "")
                    source_name = override_val.get("source_name") or "User Specified"
                    
                    # The requested conversion is kg → L, so accept L/kg directly.
                    # A conventional physical density (kg/L) is also accepted and inverted.
                    if override_unit and "/" in override_unit and property_key == "density":
                        expected_density_unit = f"{to_unit}/{from_unit}"
                        base_factor = await normalize_density_factor(base_factor, override_unit, expected_density_unit)
                else:
                    property_value = float(override_val)
                    base_factor = property_value
                    override_unit = f"{from_unit}/{to_unit}"
                    source_name = "User Specified"
                if base_factor and base_factor != 0:
                    return base_factor, {
                        "factor": base_factor,
                        "method": "property_based_reverse_user_override",
                        "property_key": property_key,
                        "source": "user_overrides",
                        "property_resolution": property_resolution_audit(
                            property_key,
                            property_value,
                            override_unit,
                            "user_override",
                            source_name,
                        ),
                    }
            
            # Fallback to fuel database
            fuel_db_id = context.get("fuel_database_id") or context.get("fuel_code") or context.get("fuel_id")
            if fuel_db_id:
                property_unit_key = f"{property_key}_unit"
                fuel = await db.fuel_database.find_one(
                    {"id": fuel_db_id},
                    {
                        "_id": 0,
                        property_key: 1,
                        property_unit_key: 1,
                        "source": 1,
                        "source_of_information": 1,
                    },
                )
                if fuel and fuel.get(property_key) and float(fuel[property_key]) != 0:
                    property_value = float(fuel[property_key])
                    property_unit = fuel.get(property_unit_key) or f"{from_unit}/{to_unit}"
                    factor = await normalize_density_factor(
                        property_value,
                        property_unit,
                        f"{to_unit}/{from_unit}",
                    ) if property_key == "density" else 1.0 / property_value
                    return factor, {
                        "factor": factor,
                        "method": "property_based_reverse",
                        "property_key": property_key,
                        "fuel_database_id": fuel_db_id,
                        "property_resolution": property_resolution_audit(
                            property_key,
                            property_value,
                            property_unit,
                            "fuel_database_fallback",
                            fuel.get("source") or fuel.get("source_of_information") or "Fuel Database",
                        ),
                    }
    
    if not allow_chained:
        raise ValueError(f"No direct conversion path from '{from_unit}' to '{to_unit}'")

    # Priority 3: Chained conversion
    from_emission_base = EMISSION_MASS_BASE_UNITS.get(from_unit)
    to_emission_base = EMISSION_MASS_BASE_UNITS.get(to_unit)
    if (
        from_emission_base
        and to_emission_base
        and from_emission_base[1] == to_emission_base[1]
    ):
        base_from_unit, gas_tag = from_emission_base
        base_to_unit, _ = to_emission_base
        if base_from_unit != base_to_unit:
            base_factor, base_audit = await _convert_component(
                db, base_from_unit, base_to_unit, context, user_overrides
            )
            return base_factor, {
                "factor": base_factor,
                "method": "emission_mass_component",
                "gas_tag": gas_tag,
                "base_conversion": base_audit,
            }

    chained_result = await _find_chained_conversion(
        db,
        from_unit,
        to_unit,
        1.0,
        context=context,
        user_overrides=user_overrides,
    )
    if chained_result:
        _, audit = chained_result
        chained_audit = {
            "factor": audit.get("factor", 1.0),
            "method": "chained_conversion",
            "path": audit.get("path", []),
            "component_conversions": audit.get("component_conversions", []),
        }
        if audit.get("property_resolutions"):
            chained_audit["property_resolutions"] = audit["property_resolutions"]
        return audit.get("factor", 1.0), chained_audit
    
    # No conversion found
    raise ValueError(f"No conversion path from '{from_unit}' to '{to_unit}'")
