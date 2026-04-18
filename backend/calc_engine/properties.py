"""
Property system + resolver.

A **property** is a reference to a piece of configurable data keyed by context.
e.g. property `cv` for context `{"fuel_code": "diesel", "region": "IN", "year": 2024}`.

Resolution priority (Phase 1 implements user -> property_values -> fuel_db fallback;
org layer is stored in the schema but skipped at runtime).

  1. User-supplied override (passed in inputs with a property-matching key)
  2. org_property_values  (SKIPPED in Phase 1 — org overrides not enabled)
  3. property_values  (context-matched, most-specific first)
  4. fuel_database fallback (reads fuel.calorific_value, .density, .emission_factor_*)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


# Properties auto-seeded to match system variables of type=property
SYSTEM_PROPERTIES: List[dict] = [
    {"key": "cv", "label": "Calorific Value", "unit": "MJ/kg", "override_allowed": True},
    {"key": "density", "label": "Density", "unit": "kg/m3", "override_allowed": True},
    {"key": "ef_q_co2", "label": "CO₂ Emission Factor (per qty)", "unit": "kgCO2/kg", "override_allowed": True},
    {"key": "ef_q_ch4", "label": "CH₄ Emission Factor (per qty)", "unit": "kgCH4/kg", "override_allowed": True},
    {"key": "ef_q_n2o", "label": "N₂O Emission Factor (per qty)", "unit": "kgN2O/kg", "override_allowed": True},
    {"key": "ef_co2e", "label": "CO₂e Emission Factor (per qty)", "unit": "kgCO2e/kg", "override_allowed": True},
    {"key": "gwp_ch4", "label": "GWP CH₄", "unit": "1", "override_allowed": False},
    {"key": "gwp_n2o", "label": "GWP N₂O", "unit": "1", "override_allowed": False},
]


async def seed_properties(db) -> int:
    """Idempotent."""
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for p in SYSTEM_PROPERTIES:
        existing = await db.ce_properties.find_one({"key": p["key"]}, {"_id": 0})
        if existing:
            continue
        # Look up variable id for linkage (variables must be seeded first)
        var = await db.ce_variables.find_one({"key": p["key"]}, {"_id": 0})
        await db.ce_properties.insert_one({
            "id": str(uuid.uuid4()),
            "key": p["key"],
            "label": p["label"],
            "variable_id": var["id"] if var else None,
            "unit": p["unit"],
            "override_allowed": p.get("override_allowed", True),
            "is_system": True,
            "created_at": now,
        })
        inserted += 1
    return inserted


# ---------- Context matching ----------

def _context_specificity(value_ctx: Dict[str, Any], query_ctx: Dict[str, Any]) -> Optional[int]:
    """
    A value is usable if every key in value_ctx either is missing or matches query_ctx.
    Specificity = number of keys matched (more-specific wins).
    Returns None if incompatible.
    """
    score = 0
    for k, v in (value_ctx or {}).items():
        qv = (query_ctx or {}).get(k)
        if qv is None:
            # value requires a key we don't have
            return None
        if str(qv).lower() != str(v).lower():
            return None
        score += 1
    return score


async def _resolve_from_property_values(
    db, property_key: str, context: Dict[str, Any]
) -> Optional[Tuple[Any, str, dict]]:
    prop = await db.ce_properties.find_one({"key": property_key}, {"_id": 0})
    if not prop:
        return None
    candidates = await db.ce_property_values.find(
        {"property_id": prop["id"]}, {"_id": 0}
    ).to_list(10000)
    best_score = -1
    best = None
    for c in candidates:
        s = _context_specificity(c.get("context") or {}, context)
        if s is None:
            continue
        if s > best_score:
            best_score = s
            best = c
    if not best:
        return None
    return best["value"], best.get("unit") or prop.get("unit"), {
        "source": "property_values",
        "property_id": prop["id"],
        "property_value_id": best["id"],
        "version_id": best.get("version_id"),
        "matched_context": best.get("context") or {},
        "specificity": best_score,
    }


async def _resolve_from_fuel_database(
    db, property_key: str, context: Dict[str, Any]
) -> Optional[Tuple[Any, str, dict]]:
    """Read-through adapter: maps fuel_database columns onto property keys."""
    fuel_code = context.get("fuel_code") or context.get("fuel_type") or context.get("fuel_name")
    if not fuel_code:
        return None
    region = context.get("region")
    query: Dict[str, Any] = {
        "$or": [
            {"fuel_name": {"$regex": f"^{fuel_code}$", "$options": "i"}},
            {"fuel_code": fuel_code},
        ]
    }
    if region:
        query["region"] = region
    fuel = await db.fuel_database.find_one(query, {"_id": 0})
    if not fuel and region:
        # retry without region filter
        fuel = await db.fuel_database.find_one(
            {"$or": [{"fuel_name": {"$regex": f"^{fuel_code}$", "$options": "i"}},
                     {"fuel_code": fuel_code}]},
            {"_id": 0},
        )
    if not fuel:
        return None

    mapping = {
        "cv": ("calorific_value", "calorific_value_unit", "MJ/kg"),
        "density": ("density", "density_unit", "kg/m3"),
        "ef_q_co2": ("emission_factor_co2", "emission_factor_co2_unit", "kgCO2/kg"),
        "ef_q_ch4": ("emission_factor_ch4", "emission_factor_ch4_unit", "kgCH4/kg"),
        "ef_q_n2o": ("emission_factor_n2o", "emission_factor_n2o_unit", "kgN2O/kg"),
        "ef_co2e": ("emission_factor_co2e", "emission_factor_co2e_unit", "kgCO2e/kg"),
    }
    if property_key not in mapping:
        return None
    val_col, unit_col, default_unit = mapping[property_key]
    value = fuel.get(val_col)
    if value is None:
        return None
    unit = fuel.get(unit_col) or default_unit
    return float(value), unit, {
        "source": "fuel_database_fallback",
        "fuel_id": fuel.get("id"),
        "fuel_name": fuel.get("fuel_name"),
        "region": fuel.get("region"),
    }


async def resolve_property(
    db,
    property_key: str,
    context: Dict[str, Any],
    user_overrides: Optional[Dict[str, Any]] = None,
    org_id: Optional[str] = None,  # reserved for future; ignored in P1
) -> Tuple[Any, str, dict]:
    """
    Returns (value, unit, audit_entry). Raises ValueError if nothing resolves.
    """
    # 1. User override
    if user_overrides and property_key in user_overrides:
        ov = user_overrides[property_key]
        value = ov["value"] if isinstance(ov, dict) else ov
        unit = (ov.get("unit") if isinstance(ov, dict) else None) or (
            (await db.ce_properties.find_one({"key": property_key}, {"_id": 0}) or {}).get("unit")
        )
        return float(value), unit, {
            "step": "resolve_property",
            "property": property_key,
            "source": "user_override",
            "value": value,
            "unit": unit,
        }

    # 2. org override — SKIPPED in Phase 1

    # 3. property_values
    hit = await _resolve_from_property_values(db, property_key, context)
    if hit:
        value, unit, audit = hit
        return float(value), unit, {
            "step": "resolve_property",
            "property": property_key,
            "value": value,
            "unit": unit,
            **audit,
        }

    # 4. fuel_database fallback
    hit = await _resolve_from_fuel_database(db, property_key, context)
    if hit:
        value, unit, audit = hit
        return float(value), unit, {
            "step": "resolve_property",
            "property": property_key,
            "value": value,
            "unit": unit,
            **audit,
        }

    raise ValueError(
        f"Property '{property_key}' could not be resolved for context {context}. "
        "Define a property_value, enable org override, or add it to the fuel database."
    )
