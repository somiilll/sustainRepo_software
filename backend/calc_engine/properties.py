"""
Property system + resolver.

A **property** is a reference to a piece of configurable data keyed by context.
e.g. property `cv` for context `{"fuel_name": "Diesel", "region": "IN", "year": 2024}`.

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


def _parse_numeric(value: Any) -> Any:
    """Try to parse value as numeric for comparison operators."""
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            if "." in value:
                return float(value)
            return int(value)
        except ValueError:
            return value
    return value


# Properties auto-seeded to match system variables of type=property
SYSTEM_PROPERTIES: List[dict] = [
    {"key": "cv", "label": "Calorific Value", "unit": "MJ/kg", "override_allowed": True},
    {"key": "density", "label": "Density", "unit": "kg/m3", "override_allowed": True},
    {"key": "ef_q_co2", "label": "CO₂ Emission Factor (per qty)", "unit": "kgCO2/kg", "override_allowed": True},
    {"key": "ef_co2e", "label": "CO₂e Emission Factor (per qty)", "unit": "kgCO2e/kg", "override_allowed": True},
    {"key": "gwp_ch4", "label": "GWP CH₄", "unit": "1", "override_allowed": False},
    {"key": "gwp_n2o", "label": "GWP N₂O", "unit": "1", "override_allowed": False},
    {"key": "exchange_rate", "label": "Standard Currency Exchange Rate", "unit": "1", "override_allowed": True},
]


async def seed_properties(db) -> int:
    """Idempotent."""
    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    for p in SYSTEM_PROPERTIES:
        existing = await db.ce_properties.find_one({"key": p["key"]}, {"_id": 0})
        if existing:
            if existing.get("override_allowed") != p.get("override_allowed", True):
                await db.ce_properties.update_one(
                    {"key": p["key"]},
                    {"$set": {"override_allowed": p.get("override_allowed", True)}},
                )
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

    scope = await db.scopes.find_one({"code": "scope3"}, {"_id": 0, "id": 1})
    if scope:
        await db.ce_input_field_mappings.update_one(
            {"field_key": "exchange_rate"},
            {
                "$set": {
                    "field_label": "Standard Currency Exchange Rate",
                    "field_type": "number",
                    "maps_to_variable": "exchange_rate",
                    "maps_to_context": "exchange_rate",
                    "maps_to_context_value_when_filled": "true",
                    "maps_to_context_value_when_empty": "false",
                    "default_unit": "1",
                    "allowed_units": [],
                    "is_required": False,
                    "is_override": True,
                    "options": [],
                    "display_order": 18,
                    "applies_to_categories": [],
                    "applies_to_scopes": [scope["id"]],
                    "placeholder": "",
                    "help_text": "",
                    "unit_source": "static",
                    "validation_rules": {},
                    "is_active": True,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "field_key": "exchange_rate",
                    "created_at": now,
                },
            },
            upsert=True,
        )
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
    
    # Special handling for gwp_config - SuperAdmin specifies the exact field name
    # Example mappings:
    #   gwp_co2 -> source_field: "co2_gwp"
    #   gwp_ch4_fossil -> source_field: "ch4_fossil_gwp"
    #   gwp_ch4_non_fossil -> source_field: "ch4_non_fossil_gwp"
    #   gwp_n2o -> source_field: "n2o_gwp"
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
        
        # Direct field lookup - SuperAdmin specifies exact field name in source_field
        value = gwp_doc.get(source_field)
        
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
            "source_name": gwp_doc.get("source_name", "GWP Config"),  # Show actual source like "IPCC AR6"
            "mapping_id": mapping.get("id"),
            "source_table": source_table,
            "source_field": source_field,
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
    
    # Add filter condition (legacy single filter)
    if filter_field and filter_value:
        actual_filter_value = context.get(filter_value) if filter_value in context else filter_value
        query[filter_field] = actual_filter_value
    
    # Add dynamic conditions (SuperAdmin-configurable)
    conditions = mapping.get("conditions") or []
    for cond in conditions:
        field = cond.get("field")
        operator = cond.get("operator", "equals")
        value = cond.get("value")
        value_from_context = cond.get("value_from_context")  # If True, value is a context key
        
        if not field:
            continue
        
        # Resolve value from context if specified
        actual_value = context.get(value) if value_from_context and value else value
        if actual_value is None:
            continue
        
        # Apply operator-based conditions
        if operator == "equals":
            query[field] = actual_value
        elif operator == "not_equals":
            query[field] = {"$ne": actual_value}
        elif operator == "greater_than":
            query[field] = {"$gt": _parse_numeric(actual_value)}
        elif operator == "greater_than_or_equals":
            query[field] = {"$gte": _parse_numeric(actual_value)}
        elif operator == "less_than":
            query[field] = {"$lt": _parse_numeric(actual_value)}
        elif operator == "less_than_or_equals":
            query[field] = {"$lte": _parse_numeric(actual_value)}
        elif operator == "in":
            # value should be a list or comma-separated string
            if isinstance(actual_value, list):
                query[field] = {"$in": actual_value}
            elif isinstance(actual_value, str):
                query[field] = {"$in": [v.strip() for v in actual_value.split(",")]}
        elif operator == "contains":
            query[field] = {"$regex": str(actual_value), "$options": "i"}
        elif operator == "exists":
            query[field] = {"$exists": actual_value in [True, "true", "1", 1]}
    
    # Get sort configuration (SuperAdmin-configurable)
    sort_by = mapping.get("sort_by")
    sort_order = mapping.get("sort_order", "desc")  # "asc" or "desc"
    
    # Query the source table
    collection = db[source_table]
    
    if sort_by:
        # Use sorting for "get latest" or "get highest" scenarios
        sort_direction = 1 if sort_order == "asc" else -1
        record = await collection.find_one(query, {"_id": 0}, sort=[(sort_by, sort_direction)])
    else:
        record = await collection.find_one(query, {"_id": 0})
    
    # Retry without conditions if no match (fallback behavior)
    fallback_behavior = mapping.get("fallback_behavior", "use_default")  # use_default, retry_without_conditions, error
    
    if not record and conditions and fallback_behavior == "retry_without_conditions":
        # Remove condition-based query fields and retry
        base_query = {}
        if lookup_context_key and lookup_table_field:
            lookup_value = context.get(lookup_context_key)
            if lookup_value:
                base_query["$or"] = [
                    {lookup_table_field: lookup_value},
                    {lookup_table_field: {"$regex": f"^{lookup_value}$", "$options": "i"}},
                ]
        if base_query:
            if sort_by:
                record = await collection.find_one(base_query, {"_id": 0}, sort=[(sort_by, sort_direction)])
            else:
                record = await collection.find_one(base_query, {"_id": 0})
    
    # Legacy retry without filter if no match
    if not record and filter_field:
        query_without_filter = {k: v for k, v in query.items() if k != filter_field}
        if query_without_filter:
            if sort_by:
                record = await collection.find_one(query_without_filter, {"_id": 0}, sort=[(sort_by, sort_direction)])
            else:
                record = await collection.find_one(query_without_filter, {"_id": 0})
    
    if not record:
        if default_value is not None:
            return default_value, default_unit, {
                "source": "source_mapping_default",
                "source_name": "Default Value",
                "mapping_id": mapping.get("id"),
                "property_key": property_key,
            }
        return None
    
    value = record.get(source_field)
    if value is None:
        if default_value is not None:
            return default_value, default_unit, {
                "source": "source_mapping_default",
                "source_name": "Default Value",
                "mapping_id": mapping.get("id"),
                "property_key": property_key,
            }
        return None
    
    unit = record.get(source_unit_field) if source_unit_field else default_unit
    
    # Get the source name from the record (e.g., "DEFRA", "IPCC", "USEPA")
    source_name = record.get("source") or record.get("source_of_information") or source_table
    
    return value, unit, {
        "source": "source_mapping",
        "source_name": source_name,
        "mapping_id": mapping.get("id"),
        "source_table": source_table,
        "source_field": source_field,
        "lookup_key": lookup_context_key,
        "lookup_value": context.get(lookup_context_key) if lookup_context_key else None,
        "conditions_applied": len(conditions) if conditions else 0,
        "sort_by": sort_by,
        "query_used": {k: str(v) for k, v in query.items() if k != "$or"},  # Simplified for logging
    }


async def _resolve_from_fuel_database(
    db, property_key: str, context: Dict[str, Any]
) -> Optional[Tuple[Any, str, dict]]:
    """Read-through adapter: maps fuel_database columns onto property keys."""
    fuel_name = context.get("fuel_name") or context.get("fuel_type")
    if not fuel_name:
        return None
    region = context.get("region")
    query: Dict[str, Any] = {
        "$or": [
            {"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}},
            {"id": fuel_name},
        ]
    }
    if region:
        query["region"] = region
    fuel = await db.fuel_database.find_one(query, {"_id": 0})
    if not fuel and region:
        # retry without region filter
        fuel = await db.fuel_database.find_one(
            {"$or": [{"fuel_name": {"$regex": f"^{fuel_name}$", "$options": "i"}},
                     {"id": fuel_name}]},
            {"_id": 0},
        )
    if not fuel:
        return None

    mapping = {
        "cv": ("calorific_value", "calorific_value_unit", "MJ/kg"),
        "density": ("density", "density_unit", "kg/m3"),
        "ef_q_co2": ("emission_factor_co2", "emission_factor_co2_unit", "kgCO2/kg"),
        "ef_co2e": ("emission_factor_co2e", "emission_factor_co2e_unit", "kgCO2e/kg"),
    }
    if property_key not in mapping:
        return None
    val_col, unit_col, default_unit = mapping[property_key]
    value = fuel.get(val_col)
    if value is None:
        return None
    unit = fuel.get(unit_col) or default_unit
    
    # Get the source name from the fuel database record (e.g., "IPCC", "DEFRA")
    source_name = fuel.get("source") or fuel.get("source_of_information") or "Fuel Database"
    
    return float(value), unit, {
        "source": "fuel_database_fallback",
        "source_name": source_name,
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
    # Get the label for this property from ce_variables or ce_input_field_mappings
    property_label = property_key  # Default to key if label not found
    var_def = await db.ce_variables.find_one({"key": property_key}, {"_id": 0})
    if var_def and var_def.get("label"):
        property_label = var_def.get("label")
    else:
        # Try ce_input_field_mappings as fallback
        mapping_def = await db.ce_input_field_mappings.find_one(
            {"maps_to_variable": property_key}, {"_id": 0}
        )
        if mapping_def and mapping_def.get("field_label"):
            property_label = mapping_def.get("field_label")
    
    # 1. User override
    if user_overrides and property_key in user_overrides:
        ov = user_overrides[property_key]
        value = ov["value"] if isinstance(ov, dict) else ov
        # Get unit from override, or fall back to ce_variables.default_unit
        unit = ov.get("unit") if isinstance(ov, dict) else None
        # Get source_name from override (e.g., for currency conversion data)
        override_source_name = ov.get("source_name") if isinstance(ov, dict) else None
        if not unit:
            if var_def:
                unit = var_def.get("default_unit")
            # If still no unit, try ce_properties (legacy fallback)
            if not unit:
                prop_def = await db.ce_properties.find_one({"key": property_key}, {"_id": 0})
                if prop_def:
                    unit = prop_def.get("unit")
        return float(value), unit, {
            "step": "resolve_property",
            "property": property_key,
            "property_label": property_label,
            "source": "user_override",
            "source_name": override_source_name or "User Specified",
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
            "property_label": property_label,
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
            "property_label": property_label,
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
            "property_label": property_label,
            "value": value,
            "unit": unit,
            **audit,
        }

    raise ValueError(
        f"Property '{property_key}' could not be resolved for context {context}. "
        "Define a property_value, enable org override, or add it to the fuel database."
    )
