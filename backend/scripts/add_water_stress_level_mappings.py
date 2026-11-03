"""Map water-stress discharge treatment-level KPIs (primary/secondary/tertiary) to the BRSR water-stress question as dynamic rows."""
import asyncio
import uuid
from datetime import datetime, timezone
from shared.database.mongo import db

QUESTION_KEY = "p6_water_stress_areas"
DESTINATIONS = [
    ("surface", "surface", "To Surface water"),
    ("ground", "ground", "To Groundwater"),
    ("sea", "seawater", "To Seawater"),
    ("third", "third_party", "Sent to third-parties"),
    ("others", "others", "Others"),
]
LEVELS = ["primary", "secondary", "tertiary"]


async def main():
    now = datetime.now(timezone.utc).isoformat()
    template = await db.kpi_framework_mappings.find_one(
        {"question_key": QUESTION_KEY, "answer_path": "rows.discharge_surface_with"}, {"_id": 0}
    )
    if not template:
        raise SystemExit("Template mapping rows.discharge_surface_with not found")
    changed = 0
    for row_dest, kpi_dest, label in DESTINATIONS:
        for level in LEVELS:
            kpi = await db.esg_kpi_definitions.find_one(
                {"value_field": f"ws_discharge_{kpi_dest}_{level}", "status": "active"}, {"_id": 0}
            )
            if not kpi:
                print(f"KPI missing for {kpi_dest} {level}")
                continue
            row_key = f"discharge_{row_dest}_{level}"
            doc = {
                **{k: v for k, v in template.items() if k not in ("id", "created_at")},
                "kpi_id": kpi["id"],
                "source_kpi_ids": [kpi["id"]],
                "source_metric_code": kpi["metric_code"],
                "source_metric_name": kpi["metric_name"],
                "answer_path": f"rows.{row_key}",
                "dynamic_row": {
                    "key": row_key,
                    "label": f"{label} — With treatment: {level.capitalize()} treatment",
                    "indent": True,
                    "parent_key": f"discharge_{row_dest}_with",
                    "default_unit": "kl",
                },
                "updated_at": now,
            }
            result = await db.kpi_framework_mappings.update_one(
                {"question_key": QUESTION_KEY, "answer_path": doc["answer_path"]},
                {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
                upsert=True,
            )
            changed += int(bool(result.upserted_id or result.modified_count))
    print(f"mappings upserted/updated: {changed}")


if __name__ == "__main__":
    asyncio.run(main())
