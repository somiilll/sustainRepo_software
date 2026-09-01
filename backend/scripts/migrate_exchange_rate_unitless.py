"""Make every Exchange Rate catalog layer unitless without changing record identities."""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


async def migrate() -> None:
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    now = datetime.now(timezone.utc).isoformat()
    variable_result = await db.ce_variables.update_one(
        {"key": "exchange_rate"},
        {"$set": {"default_unit": "", "dimension": "generic", "is_overridable": True, "updated_at": now}},
    )
    property_result = await db.ce_properties.update_one(
        {"key": "exchange_rate"},
        {"$set": {"unit": "", "updated_at": now}},
    )
    mapping_result = await db.ce_input_field_mappings.update_one(
        {"field_key": "exchange_rate"},
        {"$set": {"unit_source": "none", "updated_at": now}, "$unset": {"default_unit": "", "allowed_units": ""}},
    )
    if not variable_result.matched_count or not property_result.matched_count or not mapping_result.matched_count:
        raise RuntimeError("The complete exchange_rate catalog was not found")

    variable = await db.ce_variables.find_one({"key": "exchange_rate"}, {"_id": 0})
    property_doc = await db.ce_properties.find_one({"key": "exchange_rate"}, {"_id": 0})
    mapping = await db.ce_input_field_mappings.find_one({"field_key": "exchange_rate"}, {"_id": 0})
    if variable.get("default_unit") or property_doc.get("unit") or mapping.get("unit_source") != "none" or "default_unit" in mapping or "allowed_units" in mapping:
        raise RuntimeError("Exchange Rate catalog validation failed")

    print("Exchange Rate variable, property, and input mapping are unitless.")
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())