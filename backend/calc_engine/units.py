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
    """Resolve a list of {unit_key, power} into (dimension_vector, to_base_factor)."""
    dv: Dict[str, int] = {}
    factor = 1.0
    for comp in components:
        u = await db.ce_units.find_one({"key": comp["unit_key"]}, {"_id": 0})
        if not u:
            raise ValueError(f"Unknown unit '{comp['unit_key']}' in compound unit")
        p = int(comp["power"])
        for d, v in (u.get("dimension_vector") or {}).items():
            dv[d] = dv.get(d, 0) + v * p
            if dv[d] == 0:
                del dv[d]
        factor *= (u["to_base_factor"] ** p)
    return dv, factor


async def resolve_unit(db, key: str) -> dict:
    """Look up a simple or compound unit by key. Returns normalized unit descriptor."""
    if not key:
        raise ValueError("Unit key is required")
    simple = await db.ce_units.find_one({"key": key}, {"_id": 0})
    if simple:
        return {
            "key": simple["key"],
            "kind": "simple",
            "dimension_vector": simple.get("dimension_vector", {}),
            "to_base_factor": simple["to_base_factor"],
        }
    compound = await db.ce_compound_units.find_one({"key": key}, {"_id": 0})
    if compound:
        return {
            "key": compound["key"],
            "kind": "compound",
            "dimension_vector": compound.get("derived_dimension_vector", {}),
            "to_base_factor": compound["to_base_factor"],
        }
    raise ValueError(f"Unknown unit '{key}' (register it in ce_units or ce_compound_units)")


def dims_equal(a: Dict[str, int], b: Dict[str, int]) -> bool:
    a = {k: v for k, v in (a or {}).items() if v != 0}
    b = {k: v for k, v in (b or {}).items() if v != 0}
    return a == b


async def convert(db, value: float, from_unit: str, to_unit: str) -> Tuple[float, dict]:
    """
    Convert value between units of the same dimension.
    Returns (converted_value, audit_entry).
    
    Priority:
    1. Check ce_unit_conversions table for direct conversion
    2. Check ce_unit_conversions table for reverse conversion (and invert)
    3. Fallback to dimension-based conversion using to_base_factor (for backwards compat)
    
    Raises ValueError on dimension mismatch or missing conversion.
    """
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
    
    # Priority 3: Fallback to dimension-based conversion using to_base_factor
    # This maintains backwards compatibility but should be phased out
    fu = await resolve_unit(db, from_unit)
    tu = await resolve_unit(db, to_unit)
    if not dims_equal(fu["dimension_vector"], tu["dimension_vector"]):
        raise ValueError(
            f"Dimension mismatch: '{from_unit}' {fu['dimension_vector']} vs "
            f"'{to_unit}' {tu['dimension_vector']}. Use a transformation instead."
        )
    factor = fu["to_base_factor"] / tu["to_base_factor"]
    converted = value * factor
    if not math.isfinite(converted):
        raise ValueError(f"Conversion produced non-finite value ({value} {from_unit} -> {to_unit})")
    return converted, {
        "step": "convert",
        "input": {"value": value, "unit": from_unit},
        "output": {"value": converted, "unit": to_unit},
        "factor": factor,
        "method": f"to_base_factor_fallback ({fu['kind']}→{tu['kind']})",
        "note": "Consider adding this conversion to ce_unit_conversions for full auditability",
    }
