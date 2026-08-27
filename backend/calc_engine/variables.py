"""
System variable registry.

A variable is a named, typed, dimensioned entity that formulas can reference.
Every formula expression MUST only reference variables registered here.

Types:
  - input        : provided by user at runtime (e.g. qty, calorific_value override)
  - property     : resolved from the property system (e.g. cv, density, ef_q_co2)
  - intermediate : produced by an earlier formula step
  - output       : final outputs (co2, ch4, n2o, co2e)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Iterable, List, Optional

from pydantic import BaseModel, ConfigDict


class Variable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    key: str
    label: str
    type: str  # input | output | property | intermediate
    dimension: str  # mass | energy | volume | money | mass_co2 | gwp_factor | dimensionless | ...
    default_unit: Optional[str] = None
    is_system_defined: bool = False
    description: Optional[str] = None
    created_at: str


SYSTEM_VARIABLES: List[dict] = [
    # Activity inputs
    {"key": "qty", "label": "Activity Quantity", "type": "input", "dimension": "generic", "default_unit": None,
     "description": "Primary activity value (fuel consumed, distance travelled, spend, etc.)"},
    # Properties
    {"key": "cv", "label": "Calorific Value", "type": "property", "dimension": "energy_per_mass",
     "default_unit": "MJ/kg"},
    {"key": "density", "label": "Density", "type": "property", "dimension": "mass_per_volume",
     "default_unit": "kg/m3"},
    {"key": "ef_q_co2", "label": "CO₂ Emission Factor per Quantity", "type": "property",
     "dimension": "emission_per_activity", "default_unit": "kgCO2/kg"},
    {"key": "ef_co2e", "label": "CO₂e Emission Factor (combined)", "type": "property",
     "dimension": "emission_per_activity", "default_unit": "kgCO2e/kg"},
    {"key": "gwp_ch4", "label": "GWP CH₄", "type": "property", "dimension": "gwp_factor", "default_unit": "1"},
    {"key": "gwp_n2o", "label": "GWP N₂O", "type": "property", "dimension": "gwp_factor", "default_unit": "1"},
    {"key": "exchange_rate", "label": "Standard Currency Exchange Rate", "type": "property", "dimension": "dimensionless", "default_unit": "1"},
    # Outputs
    {"key": "co2", "label": "CO₂ Emissions", "type": "output", "dimension": "mass_co2", "default_unit": "kgCO2"},
    {"key": "ch4", "label": "CH₄ Emissions", "type": "output", "dimension": "mass_ch4", "default_unit": "kgCH4"},
    {"key": "n2o", "label": "N₂O Emissions", "type": "output", "dimension": "mass_n2o", "default_unit": "kgN2O"},
    {"key": "co2e", "label": "CO₂e Emissions", "type": "output", "dimension": "mass_co2e", "default_unit": "kgCO2e"},
]


async def seed_variables(db) -> int:
    """Idempotently insert system-locked variables. Returns count inserted."""
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for v in SYSTEM_VARIABLES:
        existing = await db.ce_variables.find_one({"key": v["key"]}, {"_id": 0})
        if existing:
            continue
        await db.ce_variables.insert_one({
            "id": str(uuid.uuid4()),
            "key": v["key"],
            "label": v["label"],
            "type": v["type"],
            "dimension": v["dimension"],
            "default_unit": v.get("default_unit"),
            "is_system_defined": True,
            "description": v.get("description"),
            "created_at": now,
        })
        inserted += 1
    return inserted


async def validate_variables(db, keys: Iterable[str]) -> List[str]:
    """Return list of unknown variable keys."""
    keys = list(set(keys))
    if not keys:
        return []
    found = await db.ce_variables.find(
        {"key": {"$in": keys}}, {"_id": 0, "key": 1}
    ).to_list(len(keys))
    known = {f["key"] for f in found}
    return [k for k in keys if k not in known]
