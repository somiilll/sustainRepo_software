"""Deactivate accidental nested activity-group clones without deleting catalog history."""

from __future__ import annotations

import argparse
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import os
from pathlib import Path
import sys

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, "/app/backend")
from calc_engine.formulas import update_decision_tree


def replace(node, replacements):
    copied = deepcopy(node)
    if isinstance(copied, dict):
        if copied.get("formula_id") in replacements:
            copied["formula_id"] = replacements[copied["formula_id"]]
        for key, value in list(copied.items()):
            copied[key] = replace(value, replacements)
    elif isinstance(copied, list):
        return [replace(value, replacements) for value in copied]
    return copied


async def run(apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    if os.environ.get("DB_NAME") != "test_database":
        raise RuntimeError("This repair is locked to test_database")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)
    db = client[os.environ["DB_NAME"]]
    try:
        formulas = await db.ce_formulas.find({"activity_formula_group_id": {"$exists": True}}, {"_id": 0}).to_list(None)
        by_id = {formula["id"]: formula for formula in formulas}
        nested = [formula for formula in formulas if by_id.get(formula.get("source_formula_id"), {}).get("activity_formula_group_id")]
        replacements = {formula["id"]: formula["source_formula_id"] for formula in nested}
        mappings = await db.ce_input_field_mappings.find({"activity_formula_group_id": {"$exists": True}}, {"_id": 0}).to_list(None)
        mappings_by_id = {mapping["id"]: mapping for mapping in mappings}
        nested_mappings = [mapping for mapping in mappings if mappings_by_id.get(mapping.get("source_mapping_id"), {}).get("activity_formula_group_id")]
        trees = await db.ce_decision_trees.find({"is_active": True}, {"_id": 0}).to_list(None)
        affected_trees = [tree for tree in trees if any(formula_id in replacements for formula_id in _refs(tree.get("tree") or {}))]
        print(json_util.dumps({"nested_formulas": len(nested), "nested_mappings": len(nested_mappings), "affected_trees": len(affected_trees)}, indent=2))
        if not apply:
            return
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = Path("/app/.emergent/backups") / f"scope3-activity-group-repair-{stamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        (backup_dir / "before.json").write_text(json_util.dumps({"formulas": nested, "mappings": nested_mappings, "trees": affected_trees}, indent=2), encoding="utf-8")
        for tree in affected_trees:
            await update_decision_tree(db, tree["id"], tree=replace(tree["tree"], replacements), created_by="scope3-activity-group-repair")
        now = datetime.now(timezone.utc).isoformat()
        if nested:
            await db.ce_formulas.update_many({"id": {"$in": [formula["id"] for formula in nested]}}, {"$set": {"is_active": False, "updated_at": now, "deactivated_by": "scope3-activity-group-repair"}})
        if nested_mappings:
            await db.ce_input_field_mappings.update_many({"id": {"$in": [mapping["id"] for mapping in nested_mappings]}}, {"$set": {"is_active": False, "updated_at": now, "deactivated_by": "scope3-activity-group-repair"}})
        print(json_util.dumps({"status": "applied", "backup": str(backup_dir)}, indent=2))
    finally:
        client.close()


def _refs(node):
    if isinstance(node, dict):
        refs = [node["formula_id"]] if isinstance(node.get("formula_id"), str) else []
        for value in node.values(): refs.extend(_refs(value))
        return refs
    if isinstance(node, list): return [ref for value in node for ref in _refs(value)]
    return []


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.apply))