"""Idempotently add the standard-currency branch to Scope 3 spend calculations."""

from __future__ import annotations

import asyncio
import copy
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


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
            "default_unit": "1",
            "is_system_defined": True,
            "description": "Configured market rate for a spend record's effective reporting period",
            "created_at": now,
        }},
        upsert=True,
    )
    exchange_rate_variable = await db.ce_variables.find_one({"key": "exchange_rate"}, {"_id": 0, "id": 1})
    await db.ce_properties.update_one(
        {"key": "exchange_rate"},
        {"$setOnInsert": {
            "id": "7752c218-f944-4dc0-8ebc-f7adfc3ef7c9",
            "key": "exchange_rate",
            "label": "Standard Currency Exchange Rate",
            "variable_id": exchange_rate_variable["id"],
            "unit": "1",
            "override_allowed": False,
            "is_system": True,
            "created_at": now,
        }},
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
        await db.ce_formulas.insert_one(new_formula)

    cursor = db.ce_decision_trees.find({"tree.options.spend_basis": {"$exists": True}}, {"_id": 0})
    updated_count = 0
    async for tree_doc in cursor:
        tree = copy.deepcopy(tree_doc["tree"])
        spend_node = tree["options"]["spend_basis"]
        if spend_node.get("next", {}).get("field_name") == "spend_currency_conversion_method":
            options = spend_node["next"].setdefault("options", {})
            options["ppp_inflation"] = {"formula_id": PPP_FORMULA_ID}
            options["standard"] = {"formula_id": STANDARD_FORMULA_ID}
        else:
            tree["options"]["spend_basis"] = {
                "next": {
                    "field_name": "spend_currency_conversion_method",
                    "options": {
                        "ppp_inflation": {"formula_id": PPP_FORMULA_ID},
                        "standard": {"formula_id": STANDARD_FORMULA_ID},
                    },
                }
            }
        await db.ce_decision_trees.update_one(
            {"id": tree_doc["id"]},
            {"$set": {"tree": tree, "version_number": int(tree_doc.get("version_number") or 0) + 1, "updated_at": now}},
        )
        updated_count += 1
    print(f"Standard formula ready; updated {updated_count} Scope 3 decision trees.")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())