"""Normalize non-environmental units and persist General Training attendee totals."""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from modules.esg_records.env_schema import field_default_unit
from shared.database.mongo import db


BACKUP_DIR = Path("/app/backups")


def number(value: Any) -> float:
    try:
        return float(value) if value not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


async def plan_collection(collection_name: str, include_training_total: bool) -> Dict[str, Any]:
    records = await db[collection_name].find({}, {"_id": 0}).to_list(100000)
    backup = []
    updates_by_record = []
    unit_changes = 0
    attendee_totals = 0

    for record in records:
        field_values = record.get("field_values") or {}
        updates = {}
        for unit_key, saved_unit in field_values.items():
            if not unit_key.endswith("_unit") or saved_unit != "Litres":
                continue
            field_key = unit_key[:-5]
            target_unit = field_default_unit(record.get("category"), record.get("subcategory"), field_key) or "Number"
            updates[f"field_values.{unit_key}"] = target_unit
            unit_changes += 1

        if include_training_total and record.get("category") == "Training" and record.get("subcategory") == "General Training":
            female = field_values.get("no_of_female_attendees")
            male = field_values.get("no_of_male_attendees")
            if female not in (None, "") or male not in (None, ""):
                updates["field_values.total_attendees"] = number(female) + number(male)
                updates["field_values.total_attendees_unit"] = "Number"
                attendee_totals += 1

        if not updates:
            continue
        backup.append({"id": record.get("id"), "before": {key.removeprefix("field_values."): field_values.get(key.removeprefix("field_values.")) for key in updates}})
        updates_by_record.append({"id": record["id"], "updates": updates})

    return {
        "updates": updates_by_record,
        "backup": backup,
        "unit_changes": unit_changes,
        "attendee_totals": attendee_totals,
    }


async def apply_plan(collection_name: str, plan: Dict[str, Any]) -> int:
    now = datetime.now(timezone.utc).isoformat()
    for change in plan["updates"]:
        await db[collection_name].update_one(
            {"id": change["id"]}, {"$set": {**change["updates"], "updated_at": now}}
        )
    return len(plan["updates"])


async def run() -> Dict[str, Any]:
    social = await plan_collection("social_records", include_training_total=True)
    governance = await plan_collection("governance_records", include_training_total=False)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = BACKUP_DIR / f"social_governance_unit_normalization_{stamp}.json"
    backup_path.write_text(json.dumps({"social": social["backup"], "governance": governance["backup"]}, indent=2), encoding="utf-8")
    social_updated = await apply_plan("social_records", social)
    governance_updated = await apply_plan("governance_records", governance)
    return {
        "social": {"updated_records": social_updated, "unit_changes": social["unit_changes"], "attendee_totals": social["attendee_totals"]},
        "governance": {"updated_records": governance_updated, "unit_changes": governance["unit_changes"]},
        "backup": str(backup_path),
    }


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run()), indent=2))