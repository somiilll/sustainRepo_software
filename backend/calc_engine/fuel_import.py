"""
One-shot importer: materialise property_values from fuel_database rows.

This turns the read-through fuel_database fallback into persistent, versioned
property_values — ready for the eventual parallel-engine decommissioning.

Usage:
  result = await import_from_fuel_database(db, dry_run=False, overwrite=False)

Idempotency:
  - For every (property_key, context={fuel_code, region}) combination that has
    a non-null value on the fuel row, we upsert into ce_property_values.
  - If a matching property_value already exists:
      - overwrite=False (default): skip, incrementing "skipped_existing"
      - overwrite=True: update value/unit + bump version_id
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# (property_key, value_col, unit_col, default_unit)
FUEL_COLUMN_MAP = [
    ("cv",       "calorific_value",       "calorific_value_unit",       "MJ/kg"),
    ("density",  "density",               "density_unit",               "kg/m3"),
    ("ef_q_co2", "emission_factor_co2",   "emission_factor_co2_unit",   "kgCO2/kg"),
    ("ef_q_ch4", "emission_factor_ch4",   "emission_factor_ch4_unit",   "kgCH4/kg"),
    ("ef_q_n2o", "emission_factor_n2o",   "emission_factor_n2o_unit",   "kgN2O/kg"),
    ("ef_co2e",  "emission_factor_co2e",  "emission_factor_co2e_unit",  "kgCO2e/kg"),
]


def _same_context(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    a = {k: str(v).lower() for k, v in (a or {}).items() if v is not None}
    b = {k: str(v).lower() for k, v in (b or {}).items() if v is not None}
    return a == b


async def import_from_fuel_database(
    db,
    dry_run: bool = False,
    overwrite: bool = False,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()

    # Build a {key: property_doc} map once
    prop_docs = await db.ce_properties.find(
        {"key": {"$in": [m[0] for m in FUEL_COLUMN_MAP]}}, {"_id": 0},
    ).to_list(100)
    props_by_key = {p["key"]: p for p in prop_docs}
    missing = [m[0] for m in FUEL_COLUMN_MAP if m[0] not in props_by_key]
    if missing:
        raise ValueError(
            f"Calc engine properties missing — run startup seed first. Missing: {missing}"
        )

    fuels = await db.fuel_database.find(
        {}, {"_id": 0},
    ).to_list(100000)

    stats: Dict[str, Dict[str, int]] = {
        key: {"inserted": 0, "updated": 0, "skipped_existing": 0, "skipped_no_value": 0}
        for key, *_ in FUEL_COLUMN_MAP
    }
    sample_ops: List[dict] = []
    total_ops = 0

    for fuel in fuels:
        fuel_code = fuel.get("fuel_code") or fuel.get("fuel_name")
        if not fuel_code:
            continue
        context = {"fuel_code": fuel_code}
        if fuel.get("region"):
            context["region"] = fuel["region"]

        for prop_key, value_col, unit_col, default_unit in FUEL_COLUMN_MAP:
            value = fuel.get(value_col)
            if value is None or value == "":
                stats[prop_key]["skipped_no_value"] += 1
                continue
            try:
                value = float(value)
            except (TypeError, ValueError):
                stats[prop_key]["skipped_no_value"] += 1
                continue
            unit = fuel.get(unit_col) or default_unit

            prop = props_by_key[prop_key]

            # Find existing property_value with same context
            existing_candidates = await db.ce_property_values.find(
                {"property_id": prop["id"]}, {"_id": 0},
            ).to_list(10000)
            match = next(
                (c for c in existing_candidates if _same_context(c.get("context") or {}, context)),
                None,
            )

            if match:
                if overwrite:
                    op = {
                        "action": "update", "property_key": prop_key,
                        "context": context, "value": value, "unit": unit,
                        "from_fuel": fuel.get("fuel_name"),
                    }
                    if not dry_run:
                        await db.ce_property_values.update_one(
                            {"id": match["id"]},
                            {"$set": {
                                "value": value,
                                "unit": unit,
                                "version_id": str(uuid.uuid4()),
                                "source": "fuel_db_import",
                                "updated_at": now,
                            }},
                        )
                    stats[prop_key]["updated"] += 1
                else:
                    stats[prop_key]["skipped_existing"] += 1
                    continue
            else:
                op = {
                    "action": "insert", "property_key": prop_key,
                    "context": context, "value": value, "unit": unit,
                    "from_fuel": fuel.get("fuel_name"),
                }
                if not dry_run:
                    await db.ce_property_values.insert_one({
                        "id": str(uuid.uuid4()),
                        "property_id": prop["id"],
                        "property_key": prop_key,
                        "value": value,
                        "unit": unit,
                        "context": context,
                        "version_id": str(uuid.uuid4()),
                        "effective_from": now,
                        "effective_to": None,
                        "source": "fuel_db_import",
                        "source_fuel_id": fuel.get("id"),
                        "created_at": now,
                    })
                stats[prop_key]["inserted"] += 1

            total_ops += 1
            if len(sample_ops) < 10:
                sample_ops.append(op)

    return {
        "dry_run": dry_run,
        "overwrite": overwrite,
        "fuels_scanned": len(fuels),
        "total_operations": total_ops,
        "per_property": stats,
        "sample": sample_ops,
        "ran_at": now,
    }
