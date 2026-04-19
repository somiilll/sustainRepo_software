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


async def _resolve_from_source_mapping(
    db, property_key: str, context: Dict[str, Any]
) -> Optional[Tuple[Any, str, dict]]:
    """Resolve property using ce_property_source_mappings configuration."""
    mapping = await db.ce_property_source_mappings.find_one(
        {"property_key": property_key, "is_active": True}, {"_id": 0}
    )
    if not mapping:
        return None
    
    source_table = mapping.get("source_table")
    source_field = mapping.get("source_field")
    source_unit_field = mapping.get("source_unit_field")
    lookup_context_key = mapping.get("lookup_context_key")
    lookup_table_field = mapping.get("lookup_table_field") or mapping.get("table_match_field")
    filter_field = mapping.get("filter_field")
    filter_value = mapping.get("filter_value")
    default_value = mapping.get("default_value")
    default_unit = mapping.get("default_unit")
    
    if not source_table or not source_field:
        return None
    
    # Special handling for gwp_config which can have:
    # 1. Top-level fields like co2_gwp, ch4_gwp, n2o_gwp
    # 2. Or a nested gwp_values array with gas_type filter
    if source_table == "gwp_config":
        gwp_doc = await db.gwp_config.find_one({"is_active": True}, {"_id": 0})
        if not gwp_doc:
            if default_value is not None:
                return default_value, default_unit, {
                    "source": "source_mapping_default",
                    "mapping_id": mapping.get("id"),
                    "property_key": property_key,
                }
            return None
        
        value = None
        resolved_from = None
        
        # First try: nested gwp_values array with filter
        gwp_values = gwp_doc.get("gwp_values", [])
        if gwp_values and filter_field and filter_value:
            actual_filter_value = context.get(filter_value) if filter_value in context else filter_value
            for gv in gwp_values:
                if gv.get(filter_field) == actual_filter_value:
                    value = gv.get(source_field)
                    resolved_from = f"gwp_config.gwp_values[{filter_field}={actual_filter_value}].{source_field}"
                    break
        
        # Second try: top-level fields like co2_gwp, ch4_gwp, n2o_gwp
        if value is None and filter_field == "gas_type" and filter_value:
            actual_filter_value = context.get(filter_value) if filter_value in context else filter_value
            # Map gas_type to field name: CO2 -> co2_gwp, CH4 -> ch4_gwp, N2O -> n2o_gwp
            gas_field_name = f"{actual_filter_value.lower()}_gwp"
            value = gwp_doc.get(gas_field_name)
            if value is not None:
                resolved_from = f"gwp_config.{gas_field_name}"
        
        # Third try: direct source_field lookup (e.g., source_field = "ch4_gwp")
        if value is None:
            value = gwp_doc.get(source_field)
            if value is not None:
                resolved_from = f"gwp_config.{source_field}"
        
        if value is None:
            if default_value is not None:
                return default_value, default_unit, {
                    "source": "source_mapping_default",
                    "mapping_id": mapping.get("id"),
                    "property_key": property_key,
                }
            return None
        
        return float(value), default_unit or "1", {
            "source": "source_mapping_gwp_config",
            "mapping_id": mapping.get("id"),
            "source_table": source_table,
            "resolved_from": resolved_from,
            "resolved_value": value,
        }
    
    # Standard table query for fuel_database and other tables
    query = {}
    
    # Add lookup condition
    if lookup_context_key and lookup_table_field:
        lookup_value = context.get(lookup_context_key)
        if lookup_value:
            # Try exact match and case-insensitive regex
            query["$or"] = [
                {lookup_table_field: lookup_value},
                {lookup_table_field: {"$regex": f"^{lookup_value}$", "$options": "i"}},
            ]
    
    # Add filter condition
    if filter_field and filter_value:
        actual_filter_value = context.get(filter_value) if filter_value in context else filter_value
        query[filter_field] = actual_filter_value
    
    # Query the source table
    collection = db[source_table]
    record = await collection.find_one(query, {"_id": 0})
    
    # Retry without filter if no match
    if not record and filter_field:
        query_without_filter = {k: v for k, v in query.items() if k != filter_field}
        if query_without_filter:
            record = await collection.find_one(query_without_filter, {"_id": 0})
    
    if not record:
        if default_value is not None:
            return default_value, default_unit, {
                "source": "source_mapping_default",
                "mapping_id": mapping.get("id"),
                "property_key": property_key,
            }
        return None
    
    value = record.get(source_field)
    if value is None:
        if default_value is not None:
            return default_value, default_unit, {
                "source": "source_mapping_default",
                "mapping_id": mapping.get("id"),
                "property_key": property_key,
            }
        return None
    
    unit = record.get(source_unit_field) if source_unit_field else default_unit
    
    return value, unit, {
        "source": "source_mapping",
        "mapping_id": mapping.get("id"),
        "source_table": source_table,
        "source_field": source_field,
        "lookup_key": lookup_context_key,
        "lookup_value": context.get(lookup_context_key) if lookup_context_key else None,
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
    Resolution order:
    1. User override
    2. Property values (context-specific)
    3. Source mapping (ce_property_source_mappings)
    4. Fuel database fallback (hardcoded mapping)
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

    # 4. Source mapping (ce_property_source_mappings)
    hit = await _resolve_from_source_mapping(db, property_key, context)
    if hit:
        value, unit, audit = hit
        return float(value), unit, {
            "step": "resolve_property",
            "property": property_key,
            "value": value,
            "unit": unit,
            **audit,
        }

    # 5. fuel_database fallback (hardcoded mapping for backward compatibility)
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
