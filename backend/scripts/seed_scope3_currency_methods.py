"""Idempotently add the standard-currency branch to Scope 3 spend calculations."""

from __future__ import annotations

import asyncio
import copy
import os
from pathlib import Path
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from calc_engine.catalog_integrity import repair_scope3_spend_currency_catalog


PPP_FORMULA_ID = "6a3c49f2-3cd0-4a6e-ab9a-8ec2f4e1eecb"
STANDARD_FORMULA_ID = "8a9150c2-ea89-4f53-9f85-2a62f64d1028"


STANDARD_FORMULA_DEFINITION = {
    "inputs": [
        {
            "variable": "spent_value",
            "expected_unit": "INR",
            "required": True,
            "allow_dimension_conversion": True,
            "allowed_transformations": [],
        }
    ],
    "properties": [
        {"variable": "emission_factor", "expected_unit": ""},
        {"variable": "exchange_rate", "expected_unit": ""},
    ],
    "steps": [
        {
            "name": "co2e",
            "type": "expression",
            "expression": "spent_value * emission_factor / (1000 * exchange_rate)",
        }
    ],
    "outputs": [{"variable": "co2e", "unit": "tCO2e", "produced_by_step": "co2e"}],
}


async def seed() -> None:
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc).isoformat()

    await db.ce_variables.update_one(
        {"key": "exchange_rate"},
        {"$setOnInsert": {
            "id": "8b7fb6ce-75fb-4fa4-a8f3-773e89a7b6cc",
            "key": "exchange_rate",
            "label": "Standard Currency Exchange Rate",
            "type": "property",
            "dimension": "dimensionless",
            "default_unit": "",
            "is_system_defined": True,
            "description": "Configured market rate for a spend record's effective reporting period",
            "created_at": now,
        }},
        upsert=True,
    )
    exchange_rate_variable = await db.ce_variables.find_one({"key": "exchange_rate"}, {"_id": 0, "id": 1})
    await db.ce_properties.update_one(
        {"key": "exchange_rate"},
        {
            "$set": {"override_allowed": True},
            "$setOnInsert": {
                "id": "7752c218-f944-4dc0-8ebc-f7adfc3ef7c9",
                "key": "exchange_rate",
                "label": "Standard Currency Exchange Rate",
                "variable_id": exchange_rate_variable["id"],
                "unit": "",
                "is_system": True,
                "created_at": now,
            },
        },
        upsert=True,
    )

    scope3 = await db.scopes.find_one({"code": "scope3"}, {"_id": 0, "id": 1})
    if not scope3:
        raise RuntimeError("The Scope 3 emission scope was not found")
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
                "is_required": False,
                "is_override": True,
                "options": [],
                "display_order": 18,
                "applies_to_categories": [],
                "applies_to_scopes": [scope3["id"]],
                "placeholder": "",
                "help_text": "",
                "unit_source": "none",
                "validation_rules": {},
                "is_active": True,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": "b340e113-9e5a-4e4a-b6cf-f2f0a0e09f91",
                "field_key": "exchange_rate",
                "created_at": now,
            },
            "$unset": {
                "default_unit": "",
                "allowed_units": "",
            },
        },
        upsert=True,
    )

    existing_standard = await db.ce_formulas.find_one({"id": STANDARD_FORMULA_ID}, {"_id": 0})
    if not existing_standard:
        legacy_formula = await db.ce_formulas.find_one({"id": PPP_FORMULA_ID}, {"_id": 0})
        if not legacy_formula:
            raise RuntimeError("The existing Spend Based formula was not found")
        new_formula = copy.deepcopy(legacy_formula)
        new_formula.update({
            "id": STANDARD_FORMULA_ID,
            "name": "Spend Based — Standard Currency Conversion",
            "definition": STANDARD_FORMULA_DEFINITION,
            "created_at": now,
            "updated_at": now,
        })
        new_formula.pop("version_id", None)
        new_formula.pop("version_number", None)
        await db.ce_formulas.insert_one(new_formula)

    repair = await repair_scope3_spend_currency_catalog(
        db,
        created_by="seed-scope3-currency-methods",
    )
    print(
        "Standard formula ready; published "
        f"{len(repair['published_tree_ids'])} Scope 3 decision-tree versions."
    )
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())