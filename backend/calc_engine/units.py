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

SYSTEM_UNITS: List[dict] = [
    # mass
    {"key": "kg", "label": "kilogram", "dimension_vector": {"mass": 1}, "to_base_factor": 1.0},
    {"key": "g",  "label": "gram",     "dimension_vector": {"mass": 1}, "to_base_factor": 1e-3},
    {"key": "tonne", "label": "tonne", "dimension_vector": {"mass": 1}, "to_base_factor": 1e3},
    {"key": "mt",    "label": "metric ton", "dimension_vector": {"mass": 1}, "to_base_factor": 1e3},
    # volume
    {"key": "m3", "label": "cubic metre", "dimension_vector": {"volume": 1}, "to_base_factor": 1.0},
    {"key": "L",  "label": "litre",       "dimension_vector": {"volume": 1}, "to_base_factor": 1e-3},
    {"key": "ml", "label": "millilitre",  "dimension_vector": {"volume": 1}, "to_base_factor": 1e-6},
    # energy
    {"key": "J",   "label": "joule",      "dimension_vector": {"energy": 1}, "to_base_factor": 1.0},
    {"key": "kJ",  "label": "kilojoule",  "dimension_vector": {"energy": 1}, "to_base_factor": 1e3},
    {"key": "MJ",  "label": "megajoule",  "dimension_vector": {"energy": 1}, "to_base_factor": 1e6},
    {"key": "GJ",  "label": "gigajoule",  "dimension_vector": {"energy": 1}, "to_base_factor": 1e9},
    {"key": "TJ",  "label": "terajoule",  "dimension_vector": {"energy": 1}, "to_base_factor": 1e12},
    {"key": "kWh", "label": "kilowatt-hour", "dimension_vector": {"energy": 1}, "to_base_factor": 3.6e6},
    {"key": "MWh", "label": "megawatt-hour", "dimension_vector": {"energy": 1}, "to_base_factor": 3.6e9},
    # money
    {"key": "USD", "label": "US Dollar", "dimension_vector": {"money": 1}, "to_base_factor": 1.0},
    {"key": "INR", "label": "Indian Rupee", "dimension_vector": {"money": 1}, "to_base_factor": 1.0},
    {"key": "EUR", "label": "Euro", "dimension_vector": {"money": 1}, "to_base_factor": 1.0},
    # emission mass
    {"key": "kgCO2",  "label": "kg CO₂",  "dimension_vector": {"mass_co2": 1},  "to_base_factor": 1.0},
    {"key": "tCO2",   "label": "tonne CO₂", "dimension_vector": {"mass_co2": 1}, "to_base_factor": 1e3},
    {"key": "kgCH4",  "label": "kg CH₄",  "dimension_vector": {"mass_ch4": 1},  "to_base_factor": 1.0},
    {"key": "kgN2O",  "label": "kg N₂O",  "dimension_vector": {"mass_n2o": 1},  "to_base_factor": 1.0},
    {"key": "kgCO2e", "label": "kg CO₂e", "dimension_vector": {"mass_co2e": 1}, "to_base_factor": 1.0},
    {"key": "tCO2e",  "label": "tonne CO₂e", "dimension_vector": {"mass_co2e": 1}, "to_base_factor": 1e3},
    # dimensionless (gwp, 1)
    {"key": "1", "label": "dimensionless", "dimension_vector": {}, "to_base_factor": 1.0},
    # time / count
    {"key": "h", "label": "hour", "dimension_vector": {"time": 1}, "to_base_factor": 3600.0},
    {"key": "s", "label": "second", "dimension_vector": {"time": 1}, "to_base_factor": 1.0},
    {"key": "each", "label": "each", "dimension_vector": {"count": 1}, "to_base_factor": 1.0},
]

# System compound units — encoded as components with signed powers.
# e.g. MJ/kg  -> [{unit_key: "MJ", power: 1}, {unit_key: "kg", power: -1}]
SYSTEM_COMPOUND_UNITS: List[dict] = [
    {"key": "MJ/kg",   "label": "megajoule per kilogram",
     "components": [{"unit_key": "MJ", "power": 1}, {"unit_key": "kg", "power": -1}]},
    {"key": "GJ/tonne", "label": "gigajoule per tonne",
     "components": [{"unit_key": "GJ", "power": 1}, {"unit_key": "tonne", "power": -1}]},
    {"key": "TJ/tonne", "label": "terajoule per tonne",
     "components": [{"unit_key": "TJ", "power": 1}, {"unit_key": "tonne", "power": -1}]},
    {"key": "kg/m3",    "label": "kilogram per cubic metre",
     "components": [{"unit_key": "kg", "power": 1}, {"unit_key": "m3", "power": -1}]},
    {"key": "kg/L",     "label": "kilogram per litre",
     "components": [{"unit_key": "kg", "power": 1}, {"unit_key": "L",  "power": -1}]},
    {"key": "kgCO2/kg",   "label": "kg CO₂ per kg",
     "components": [{"unit_key": "kgCO2", "power": 1}, {"unit_key": "kg", "power": -1}]},
    {"key": "kgCO2/MJ",   "label": "kg CO₂ per MJ",
     "components": [{"unit_key": "kgCO2", "power": 1}, {"unit_key": "MJ", "power": -1}]},
    {"key": "kgCO2/L",    "label": "kg CO₂ per L",
     "components": [{"unit_key": "kgCO2", "power": 1}, {"unit_key": "L", "power": -1}]},
    {"key": "kgCO2/kWh",  "label": "kg CO₂ per kWh",
     "components": [{"unit_key": "kgCO2", "power": 1}, {"unit_key": "kWh", "power": -1}]},
    {"key": "kgCH4/kg",   "label": "kg CH₄ per kg",
     "components": [{"unit_key": "kgCH4", "power": 1}, {"unit_key": "kg", "power": -1}]},
    {"key": "kgN2O/kg",   "label": "kg N₂O per kg",
     "components": [{"unit_key": "kgN2O", "power": 1}, {"unit_key": "kg", "power": -1}]},
    {"key": "kgCO2e/kg",  "label": "kg CO₂e per kg",
     "components": [{"unit_key": "kgCO2e", "power": 1}, {"unit_key": "kg", "power": -1}]},
    {"key": "kgCO2e/MJ",  "label": "kg CO₂e per MJ",
     "components": [{"unit_key": "kgCO2e", "power": 1}, {"unit_key": "MJ", "power": -1}]},
    {"key": "kgCO2e/kWh", "label": "kg CO₂e per kWh",
     "components": [{"unit_key": "kgCO2e", "power": 1}, {"unit_key": "kWh", "power": -1}]},
]


async def seed_units(db) -> Tuple[int, int]:
    """Idempotently seed system units + compound units."""
    now = datetime.now(timezone.utc).isoformat()
    simple_inserted = 0
    for u in SYSTEM_UNITS:
        existing = await db.ce_units.find_one({"key": u["key"]}, {"_id": 0})
        if existing:
            continue
        await db.ce_units.insert_one({
            "id": str(uuid.uuid4()),
            "key": u["key"],
            "label": u["label"],
            "dimension_vector": u["dimension_vector"],
            "to_base_factor": u["to_base_factor"],
            "is_system": True,
            "created_at": now,
        })
        simple_inserted += 1

    compound_inserted = 0
    for c in SYSTEM_COMPOUND_UNITS:
        existing = await db.ce_compound_units.find_one({"key": c["key"]}, {"_id": 0})
        if existing:
            continue
        # Compute derived dimension vector + factor
        dv, factor = await _resolve_compound(db, c["components"])
        await db.ce_compound_units.insert_one({
            "id": str(uuid.uuid4()),
            "key": c["key"],
            "label": c["label"],
            "components": c["components"],
            "derived_dimension_vector": dv,
            "to_base_factor": factor,
            "is_system": True,
            "created_at": now,
        })
        compound_inserted += 1

    return simple_inserted, compound_inserted


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
    Raises ValueError on dimension mismatch.
    """
    if from_unit == to_unit:
        return value, {
            "step": "convert",
            "input": {"value": value, "unit": from_unit},
            "output": {"value": value, "unit": to_unit},
            "factor": 1.0,
            "note": "no-op (same unit)",
        }
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
        "method": f"{fu['kind']}→{tu['kind']}",
    }
