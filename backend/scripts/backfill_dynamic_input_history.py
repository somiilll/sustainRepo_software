"""Append missing per-field dynamic input deltas to existing emission history."""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from pymongo import MongoClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.helpers.audit_helpers import compute_field_changes


def _tracked_input_keys(field_changes: list[dict]) -> set[str]:
    tracked = set()
    for change in field_changes or []:
        if change.get("field") != "input_values":
            continue
        if change.get("input_key"):
            tracked.add(change["input_key"])
        for side in ("old_value", "new_value"):
            value = change.get(side)
            if isinstance(value, dict):
                tracked.update(value.keys())
    return tracked


def migrate(*, apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    client = MongoClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    try:
        labels = {
            row["maps_to_variable"]: row.get("field_label") or row["maps_to_variable"]
            for row in db.ce_input_field_mappings.find(
                {"maps_to_variable": {"$exists": True, "$ne": ""}},
                {"_id": 0, "maps_to_variable": 1, "field_label": 1},
            )
        }
        query = {
            "changes.old_values.dynamic_field_values": {"$exists": True},
            "changes.new_values.dynamic_field_values": {"$exists": True},
        }
        planned = []
        for history in db.emission_history.find(query):
            old_values = history.get("changes", {}).get("old_values", {})
            new_values = history.get("changes", {}).get("new_values", {})
            computed = compute_field_changes(old_values, new_values, input_label_map=labels)
            dynamic_changes = [
                change for change in computed
                if change.get("field") == "input_values" or change.get("field", "").startswith("input_justification_")
            ]
            existing_changes = history.get("field_changes", [])
            tracked_keys = _tracked_input_keys(existing_changes)
            tracked_fields = {change.get("field") for change in existing_changes}
            additions = [
                change for change in dynamic_changes
                if (
                    change.get("input_key") not in tracked_keys
                    if change.get("input_key")
                    else change.get("field") not in tracked_fields
                )
            ]
            if additions:
                planned.append((history, additions))

        print(f"Database: {db.name}")
        print(f"History records requiring dynamic-input backfill: {len(planned)}")
        if not apply:
            print("Dry run only. Re-run with --apply to write changes.")
            return

        backup_dir = Path("/app/.emergent/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backup_dir / f"dynamic-input-history-{stamp}.json"
        backup_path.write_text(
            json_util.dumps([history for history, _ in planned], indent=2),
            encoding="utf-8",
        )

        for history, additions in planned:
            result = db.emission_history.update_one(
                {"_id": history["_id"]},
                {"$push": {"field_changes": {"$each": additions}}},
            )
            if result.modified_count != 1:
                raise RuntimeError(f"Unable to backfill history record {history.get('id')}")
        print(f"Backfilled {len(planned)} history records.")
        print(f"Backup: {backup_path}")
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    migrate(apply=args.apply)