"""Classify all C4/C9 Scope 3 factors with canonical transport activity types."""

from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

CATEGORY_PATTERN = re.compile(r"^c[49]\b", re.IGNORECASE)
TRANSPORT_TYPE_PATTERNS = (
    (re.compile(r"^van\b", re.IGNORECASE), "van"),
    (re.compile(r"^sea\s+tanker\b", re.IGNORECASE), "sea_tanker"),
    (re.compile(r"^cargo\s+ship\b", re.IGNORECASE), "cargo_ship"),
    (re.compile(r"^road\s*-\s*hdv\b", re.IGNORECASE), "road_hdv"),
    (re.compile(r"^air\b", re.IGNORECASE), "air"),
    (re.compile(r"\b(?:inland\s+)?waterways?\b", re.IGNORECASE), "waterways"),
    (re.compile(r"^rail\b", re.IGNORECASE), "rail"),
)


def classify_activity(activity: object) -> str:
    value = str(activity or "").strip()
    for pattern, activity_type in TRANSPORT_TYPE_PATTERNS:
        if pattern.search(value):
            return activity_type
    return ""


async def classify_transport_factors() -> None:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        raise RuntimeError("MONGO_URL and DB_NAME must be configured")

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    try:
        factors = await db.scope3_ef.find(
            {},
            {"_id": 0, "id": 1, "category": 1, "activity": 1, "activity_type": 1},
        ).to_list(None)
        transport_factors = [
            factor for factor in factors
            if CATEGORY_PATTERN.match(str(factor.get("category") or "").strip())
        ]

        updated = classified = unmatched = unchanged = 0
        for factor in transport_factors:
            factor_id = factor.get("id")
            if not factor_id:
                raise RuntimeError("C4/C9 Scope 3 factor is missing its canonical id")
            activity_type = classify_activity(factor.get("activity"))
            classified += bool(activity_type)
            unmatched += not bool(activity_type)
            if (factor.get("activity_type") or "") == activity_type:
                unchanged += 1
                continue
            await db.scope3_ef.update_one(
                {"id": factor_id},
                {"$set": {"activity_type": activity_type}},
            )
            updated += 1

        print(
            "C4/C9 transport activity classification complete: "
            f"total={len(transport_factors)}, classified={classified}, "
            f"unmatched={unmatched}, updated={updated}, unchanged={unchanged}"
        )
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(classify_transport_factors())