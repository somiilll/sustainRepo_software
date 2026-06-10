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
    compound = await db.ce_compound_units.find_one({"key": key}, {"_id": 0})
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
    chained_result = await _find_chained_conversion(db, from_unit, to_unit, value)
    if chained_result:
        return chained_result
    
    # Priority 4: Try compound unit conversion (e.g., MJ/kg → TJ/kg)
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
    db, from_unit: str, to_unit: str, value: float, max_depth: int = 3
) -> Optional[Tuple[float, dict]]:
    """
    Find a conversion path through intermediate units.
    
    Example: kL → L → kg (if kL→L exists and L→kg via transformation)
    
    Uses BFS to find shortest path. Max depth prevents infinite loops.
    Returns (converted_value, audit_entry) or None if no path found.
    """
    # Get all available conversions
    all_conversions = await db.ce_unit_conversions.find(
        {"is_active": True}, {"_id": 0}
    ).to_list(500)
    
    # Build adjacency map: unit -> [(target_unit, factor)]
    graph: Dict[str, List[Tuple[str, float]]] = {}
    for conv in all_conversions:
        if conv.get("factor") is None:
            continue
        src, tgt, fac = conv["from_unit"], conv["to_unit"], conv["factor"]
        if src not in graph:
            graph[src] = []
        graph[src].append((tgt, fac))
        # Add reverse direction
        if fac != 0:
            if tgt not in graph:
                graph[tgt] = []
            graph[tgt].append((src, 1.0 / fac))
    
    # BFS to find shortest path
    from collections import deque
    
    # Queue items: (current_unit, accumulated_factor, path)
    queue = deque([(from_unit, 1.0, [from_unit])])
    visited = {from_unit}
    
    while queue:
        current, acc_factor, path = queue.popleft()
        
        if len(path) > max_depth + 1:
            continue
        
        # Check if we can reach target from current
        for next_unit, factor in graph.get(current, []):
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
                    "note": f"Chained: {' → '.join(path + [to_unit])}",
                }
            
            if next_unit not in visited and len(path) < max_depth:
                visited.add(next_unit)
                queue.append((next_unit, acc_factor * factor, path + [next_unit]))
    
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
    
    # Look up compound units
    from_compound = await db.ce_compound_units.find_one({"key": from_unit}, {"_id": 0})
    to_compound = await db.ce_compound_units.find_one({"key": to_unit}, {"_id": 0})
    
    if not from_compound or not to_compound:
        return None
    
    # Check if same derived dimension (skip if either is empty - legacy units)
    from_dim = from_compound.get("derived_dimension_vector", {})
    to_dim = to_compound.get("derived_dimension_vector", {})
    
    # Only check dimensions if BOTH have non-empty vectors
    # Empty vector = legacy unit without dimension info, allow conversion attempt
    if from_dim and to_dim and not dims_equal(from_dim, to_dim):
        return None
    
    from_components = from_compound.get("components", [])
    to_components = to_compound.get("components", [])
    
    if not from_components or not to_components:
        return None
    
    # Build lookup for to_compound components by power
    to_comp_map = {}
    for tc in to_components:
        power = tc.get("power", 1)
        key = f"{'pos' if power > 0 else 'neg'}_{abs(power)}"
        to_comp_map[key] = tc
    
    # Calculate total conversion factor
    total_factor = 1.0
    component_conversions = []
    
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
    
    return converted, {
        "step": "convert",
        "input": {"value": value, "unit": from_unit},
        "output": {"value": converted, "unit": to_unit},
        "factor": total_factor,
        "method": "compound_same_dimension",
        "component_conversions": component_conversions,
    }


async def _convert_component(db, from_unit: str, to_unit: str, context: dict = None, user_overrides: dict = None) -> Tuple[float, dict]:
    """
    Convert between simple units for compound unit decomposition.
    Uses all available conversion methods: direct, reverse, chained, property-based.
    
    Args:
        context: Optional dict with fuel_database_id for property-based conversions
        user_overrides: Optional dict with user-provided property values (e.g., density)
    
    Returns (factor, audit_entry) where factor converts 1 unit of from_unit to to_unit.
    """
    context = context or {}
    user_overrides = user_overrides or {}
    
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
                    factor = float(override_val.get("value", 0))
                    override_unit = override_val.get("unit", "")
                    
                    # For density-based conversions (L → kg), normalize the unit
                    # Expected density format: mass_unit/volume_unit where volume_unit matches from_unit
                    # e.g., for L → kg, we expect kg/L. If user provides kg/cm3, convert it.
                    if override_unit and "/" in override_unit and property_key == "density":
                        parts = override_unit.split("/")
                        if len(parts) == 2:
                            mass_part = parts[0].strip()
                            volume_part = parts[1].strip()
                            
                            # Check if volume part matches the from_unit
                            if volume_part.lower() != from_unit.lower():
                                # Need to convert density to expected unit format (mass_part/from_unit)
                                # Use full convert() which handles chained conversions
                                # e.g., 0.6 kg/cm3 → ? kg/L requires cm3 → L (chained: cm3 → mL → L)
                                try:
                                    # Convert 1 unit of volume_part to from_unit
                                    # e.g., cm3 → L: factor = 0.001 (1 cm3 = 0.001 L)
                                    vol_converted, _ = await convert(db, 1.0, volume_part, from_unit)
                                    if vol_converted and vol_converted != 0:
                                        # density in X/cm3 to X/L:
                                        # 0.6 kg/cm3 means 0.6 kg per 1 cm3
                                        # 1 cm3 = 0.001 L, so 0.6 kg per 0.001 L = 600 kg/L
                                        # Formula: factor = original_factor / vol_converted
                                        factor = factor / vol_converted
                                except ValueError:
                                    pass  # If conversion fails, use raw factor
                else:
                    factor = float(override_val)
                if factor and factor != 0:
                    return factor, {
                        "factor": factor,
                        "method": "property_based_user_override",
                        "property_key": property_key,
                        "source": "user_overrides"
                    }
            
            # Fallback to fuel database
            fuel_db_id = context.get("fuel_database_id") or context.get("fuel_code") or context.get("fuel_id")
            if fuel_db_id:
                fuel = await db.fuel_database.find_one({"id": fuel_db_id}, {"_id": 0, property_key: 1})
                if fuel and fuel.get(property_key):
                    factor = float(fuel[property_key])
                    return factor, {
                        "factor": factor,
                        "method": "property_based",
                        "property_key": property_key,
                        "fuel_database_id": fuel_db_id
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
                    base_factor = float(override_val.get("value", 0))
                    override_unit = override_val.get("unit", "")
                    
                    # For density-based reverse conversions (kg → L), normalize the unit
                    # The reverse conversion record has from_unit=L, to_unit=kg (we're doing kg → L)
                    # So the density should be in mass/volume where volume = from_unit of the record (L)
                    if override_unit and "/" in override_unit and property_key == "density":
                        parts = override_unit.split("/")
                        if len(parts) == 2:
                            mass_part = parts[0].strip()
                            volume_part = parts[1].strip()
                            
                            # The reverse_conv record is L → kg, so volume_part should match from_unit of the record
                            target_volume = reverse_conv.get("from_unit", "L")
                            if volume_part.lower() != target_volume.lower():
                                # Use full convert() which handles chained conversions
                                try:
                                    vol_converted, _ = await convert(db, 1.0, volume_part, target_volume)
                                    if vol_converted and vol_converted != 0:
                                        base_factor = base_factor / vol_converted
                                except ValueError:
                                    pass
                else:
                    base_factor = float(override_val)
                if base_factor and base_factor != 0:
                    factor = 1.0 / base_factor
                    return factor, {
                        "factor": factor,
                        "method": "property_based_reverse_user_override",
                        "property_key": property_key,
                        "source": "user_overrides"
                    }
            
            # Fallback to fuel database
            fuel_db_id = context.get("fuel_database_id") or context.get("fuel_code") or context.get("fuel_id")
            if fuel_db_id:
                fuel = await db.fuel_database.find_one({"id": fuel_db_id}, {"_id": 0, property_key: 1})
                if fuel and fuel.get(property_key) and float(fuel[property_key]) != 0:
                    factor = 1.0 / float(fuel[property_key])
                    return factor, {
                        "factor": factor,
                        "method": "property_based_reverse",
                        "property_key": property_key,
                        "fuel_database_id": fuel_db_id
                    }
    
    # Priority 3: Chained conversion
    chained_result = await _find_chained_conversion(db, from_unit, to_unit, 1.0)
    if chained_result:
        _, audit = chained_result
        return audit.get("factor", 1.0), {
            "factor": audit.get("factor", 1.0),
            "method": "chained_conversion",
            "path": audit.get("path", [])
        }
    
    # No conversion found
    raise ValueError(f"No conversion path from '{from_unit}' to '{to_unit}'")
