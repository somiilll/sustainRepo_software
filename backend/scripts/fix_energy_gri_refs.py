"""Energy: set GRI refs on the listed KPIs/fields (others untouched; idempotent, backs up first)."""
import asyncio
import json
import os
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
B2 = "103-2-b-ii"
WANTED = {
    "Non-Renewable Energy Consumption - Cooling": [B2], "Renewable Energy Consumption - Cooling": [B2],
    "Total Energy Consumption - Cooling": [B2, "302-1-c-iii"],
    "Grid Electricity Consumption": [B2], "Other Renewable Electricity Consumption": [], "Renewable Electricity Consumption": [B2],
    "Solar Electricity Consumption": [], "Total Energy Consumption - Electricity": ["302-1-c-i"], "Wind Electricity Consumption": [],
    "Total Energy Consumption (Renewable + Non-Renewable)": ["302-1-e"],
    "Renewable Other-source Energy Consumption (Total)": ["103-2-b-i"],
    "Non-Renewable Other-source Energy Consumption (Total)": [B2],
    "Total Energy Consumption - Fuel": ["103-2-a", "302-1-a"],
    "Non-Renewable Energy Consumption - Steam": [B2], "Renewable Energy Consumption - Steam": [B2],
    "Total Energy Consumption - Steam": [B2, "302-1-c-iv"],
    "Non-Renewable Energy Consumption - Heating": [B2], "Renewable Energy Consumption - Heating": [B2],
    "Total Energy Consumption - Heating": [B2, "302-1-c-ii"],
}


def _ref(code: str) -> dict:
    return {"framework": "GRI", "reference": code, "question_key": "gri_" + code.replace("-", "_"), "answer_path": None, "reference_type": "exact"}


async def main():
    kpis = await db.esg_kpi_definitions.find({"category_name": "Energy", "metric_name": {"$in": list(WANTED)}}).to_list(None)
    categories = await db.esg_record_categories.find({"category": "Energy"}).to_list(None)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = f"{BACKUP_DIR}/energy_gri_{stamp}.json"
    with open(path, "w") as file:
        json.dump({"kpis": [{k: v for k, v in kpi.items() if k != "_id"} for kpi in kpis],
                   "categories": [{"subcategory": c["subcategory"], "fields": c["fields"]} for c in categories]}, file, default=str)
    field_gri = {}
    for kpi in kpis:
        codes = WANTED[kpi["metric_name"]]
        refs = [r for r in kpi.get("framework_references") or [] if r.get("framework") != "GRI"]
        gri = ", ".join(codes) or None
        await db.esg_kpi_definitions.update_one(
            {"id": kpi["id"]}, {"$set": {"framework_references": [_ref(c) for c in codes] + refs, "gri_disclosure": gri}})
        value_field = (kpi.get("source_config") or {}).get("records", {}).get("value_field")
        if value_field:
            field_gri[(kpi["subcategory"], value_field)] = gri
    for category in categories:
        changed = False
        for field in category["fields"]:
            key = (category["subcategory"], field["field_key"])
            if key in field_gri:
                field["gri_disclosure"], changed = field_gri[key], True
        if changed:
            await db.esg_record_categories.update_one({"_id": category["_id"]}, {"$set": {"fields": category["fields"]}})
    print(f"backup={path} matched={len(kpis)}/{len(WANTED)}")


if __name__ == "__main__":
    asyncio.run(main())
