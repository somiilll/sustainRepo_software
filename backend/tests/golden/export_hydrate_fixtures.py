"""
Phase 0 helper: export real emission records as frontend hydration fixtures.

READ-ONLY. Writes
`/app/frontend/src/pages/emissions/utils/__tests__/fixtures/hydrate-fixtures.json`
containing one representative record per major GHG behaviour bucket plus the
minimal `fuelDatabase` / `scope3EFData` / `fugitiveEmissionsData` slices the
hydrator needs.

Usage:
    cd /app/backend && python3 tests/golden/export_hydrate_fixtures.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from collections import defaultdict
from typing import Any, Dict, List

sys.path.insert(0, "/app/backend")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ghg_golden_support import bucket_key, fixture_slug, mongo_db  # noqa: E402

OUT_DIR = "/app/frontend/src/pages/emissions/utils/__tests__/fixtures"
OUT_FILE = os.path.join(OUT_DIR, "hydrate-fixtures.json")

# One record per distinct scope/category/method combination keeps the fixture
# set representative without making it unwieldy.
SIGNATURE_FIELDS = ("scope", "category", "calculation_method_scope3", "is_custom_fuel")


async def main() -> None:
    db = mongo_db()
    records = [r async for r in db.emission_records.find({}, {"_id": 0})]

    by_signature: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in sorted(records, key=lambda r: r["id"]):
        sig = "|".join(str(rec.get(f)) for f in SIGNATURE_FIELDS)
        by_signature[sig].append(rec)

    chosen = [recs[0] for _sig, recs in sorted(by_signature.items())]

    fuel_ids = {r.get("fuel_database_id") for r in chosen if r.get("fuel_database_id")}
    fuel_names = {r.get("fuel_type") for r in chosen if r.get("fuel_type")}
    ef_ids = {r.get("scope3_ef_id") for r in chosen if r.get("scope3_ef_id")}

    fuels = [
        f
        async for f in db.fuel_database.find(
            {"$or": [{"id": {"$in": list(fuel_ids)}}, {"fuel_name": {"$in": list(fuel_names)}}]},
            {"_id": 0},
        )
    ]
    efs = [
        e async for e in db.scope3_ef.find({"id": {"$in": list(ef_ids)}}, {"_id": 0})
    ]
    fugitives = [
        f
        async for f in db.fuel_database.find(
            {"gwp_fugitives": {"$exists": True, "$ne": None}}, {"_id": 0}
        ).limit(25)
    ]

    payload = {
        "note": (
            "Real emission records exported for the hydrateEmissionForm golden "
            "snapshot test. Regenerate with tests/golden/export_hydrate_fixtures.py."
        ),
        "fixtures": [
            {
                "fixture_id": fixture_slug(rec),
                "bucket": bucket_key(rec),
                "emission": rec,
            }
            for rec in chosen
        ],
        "config": {
            "fuelDatabase": sorted(fuels, key=lambda f: str(f.get("id"))),
            "scope3EFData": sorted(efs, key=lambda e: str(e.get("id"))),
            "fugitiveEmissionsData": sorted(fugitives, key=lambda f: str(f.get("id"))),
        },
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, sort_keys=True, default=str)
        f.write("\n")

    print(
        f"{len(payload['fixtures'])} fixtures, "
        f"{len(fuels)} fuels, {len(efs)} scope3 EFs, {len(fugitives)} fugitive rows "
        f"-> {OUT_FILE}"
    )


if __name__ == "__main__":
    asyncio.run(main())
