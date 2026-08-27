"""Make the Exchange Rate input mapping unitless without changing formula metadata."""

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

    result = await db.ce_input_field_mappings.update_one(
        {"field_key": "exchange_rate"},
        {
            "$set": {
                "unit_source": "none",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            "$unset": {
                "default_unit": "",
                "allowed_units": "",
            },
        },
    )
    if not result.matched_count:
        raise RuntimeError("The exchange_rate input-field mapping was not found")

    print(f"Updated {result.modified_count} Exchange Rate mapping(s) to unitless.")
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())