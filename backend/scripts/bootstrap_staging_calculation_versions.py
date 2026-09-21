"""Create an immutable version-1 baseline from the existing staging GHG catalog."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from bson import json_util
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient


TARGET_DB_NAME = "sustainrepo_staging"
BACKUP_COLLECTIONS = (
    "ce_formulas",
    "ce_formula_versions",
    "ce_decision_trees",
    "ce_decision_tree_versions",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def document_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def deterministic_id(kind: str, logical_id: str, payload: Any) -> str:
    return str(uuid5(NAMESPACE_URL, f"sustainrepo-staging:{kind}:{logical_id}:{document_hash(payload)}"))


def version_ref(document: dict[str, Any]) -> str | None:
    value = document.get("version_id") or document.get("id")
    return value if isinstance(value, str) and value else None


def formula_ids(node: Any) -> set[str]:
    result: set[str] = set()
    if isinstance(node, dict):
        formula_id = node.get("formula_id")
        if isinstance(formula_id, str) and formula_id:
            result.add(formula_id)
        for value in node.values():
            result.update(formula_ids(value))
    elif isinstance(node, list):
        for value in node:
            result.update(formula_ids(value))
    return result


def active_versions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if row.get("is_active", True)]


def version_document(
    formula: dict[str, Any],
    *,
    version_id: str,
    version_number: int,
    timestamp: str,
) -> dict[str, Any]:
    return {
        **formula,
        "id": version_id,
        "formula_id": formula["id"],
        "source_formula_id": formula["id"],
        "version_id": version_id,
        "version_number": version_number,
        "definition_snapshot": formula["definition"],
        "is_active": True,
        "effective_from": timestamp,
        "effective_to": None,
        "created_at": timestamp,
        "created_by": "staging-version-baseline",
    }


def tree_version_document(
    tree: dict[str, Any],
    *,
    snapshot_id: str,
    version_id: str,
    version_number: int,
    formula_version_map: dict[str, str],
    timestamp: str,
) -> dict[str, Any]:
    return {
        **tree,
        "id": snapshot_id,
        "source_tree_id": tree["id"],
        "version_id": version_id,
        "version_number": version_number,
        "formula_version_map": formula_version_map,
        "is_active": True,
        "effective_from": timestamp,
        "effective_to": None,
        "created_at": timestamp,
        "created_by": "staging-version-baseline",
    }


async def build_plan(db) -> dict[str, Any]:
    formulas = await db.ce_formulas.find({}, {"_id": 0}).to_list(None)
    formula_versions = await db.ce_formula_versions.find({}, {"_id": 0}).to_list(None)
    trees = await db.ce_decision_trees.find({}, {"_id": 0}).to_list(None)
    tree_versions = await db.ce_decision_tree_versions.find({}, {"_id": 0}).to_list(None)
    timestamp = now_iso()
    conflicts: list[str] = []
    formula_updates: list[dict[str, Any]] = []
    formula_inserts: list[dict[str, Any]] = []
    formula_version_by_id: dict[str, str] = {}

    versions_by_formula: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for version in formula_versions:
        if version.get("formula_id"):
            versions_by_formula[version["formula_id"]].append(version)

    for formula in formulas:
        formula_id = formula.get("id")
        definition = formula.get("definition")
        if not isinstance(formula_id, str) or not formula_id:
            conflicts.append("ce_formulas document is missing a usable id")
            continue
        if not isinstance(definition, dict):
            conflicts.append(f"ce_formulas:{formula_id} is missing a valid definition")
            continue
        linked = versions_by_formula.get(formula_id, [])
        current_id = formula.get("version_id")
        matched = next((row for row in linked if version_ref(row) == current_id), None) if current_id else None
        active = active_versions(linked)
        if current_id and not matched:
            version_id = current_id
            version_number = int(formula.get("version_number") or 1)
            formula_inserts.append(version_document(formula, version_id=version_id, version_number=version_number, timestamp=timestamp))
        elif matched:
            version_id = version_ref(matched)
            version_number = int(matched.get("version_number") or formula.get("version_number") or 1)
        elif len(active) == 1:
            version_id = version_ref(active[0])
            version_number = int(active[0].get("version_number") or 1)
        elif len(active) > 1:
            conflicts.append(f"ce_formulas:{formula_id} has multiple active version documents")
            continue
        else:
            version_id = deterministic_id("formula-baseline", formula_id, definition)
            version_number = 1
            formula_inserts.append(version_document(formula, version_id=version_id, version_number=version_number, timestamp=timestamp))
        formula_version_by_id[formula_id] = version_id
        if formula.get("version_id") != version_id or formula.get("version_number") != version_number:
            formula_updates.append({"id": formula_id, "version_id": version_id, "version_number": version_number})

    tree_updates: list[dict[str, Any]] = []
    tree_inserts: list[dict[str, Any]] = []
    versions_by_tree: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for version in tree_versions:
        tree_id = version.get("source_tree_id") or version.get("tree_id")
        if tree_id:
            versions_by_tree[tree_id].append(version)

    for tree in trees:
        tree_id = tree.get("id")
        if not isinstance(tree_id, str) or not tree_id:
            conflicts.append("ce_decision_trees document is missing a usable id")
            continue
        referenced_formula_ids = formula_ids(tree.get("tree") or {})
        missing_formula_ids = sorted(referenced_formula_ids - set(formula_version_by_id))
        if missing_formula_ids:
            conflicts.append(f"ce_decision_trees:{tree_id} references unversioned formulas {missing_formula_ids}")
            continue
        mapping = {formula_id: formula_version_by_id[formula_id] for formula_id in sorted(referenced_formula_ids)}
        linked = versions_by_tree.get(tree_id, [])
        current_id = tree.get("version_id")
        matched = next((row for row in linked if version_ref(row) == current_id), None) if current_id else None
        active = active_versions(linked)
        if current_id and not matched:
            version_id = current_id
            snapshot_id = deterministic_id("tree-snapshot", tree_id, {"version_id": version_id, "tree": tree.get("tree")})
            version_number = int(tree.get("version_number") or 1)
            tree_inserts.append(tree_version_document(tree, snapshot_id=snapshot_id, version_id=version_id, version_number=version_number, formula_version_map=mapping, timestamp=timestamp))
        elif matched:
            version_id = version_ref(matched)
            version_number = int(matched.get("version_number") or tree.get("version_number") or 1)
            snapshot_id = matched.get("id")
        elif len(active) == 1:
            version_id = version_ref(active[0])
            version_number = int(active[0].get("version_number") or 1)
            snapshot_id = active[0].get("id")
        elif len(active) > 1:
            conflicts.append(f"ce_decision_trees:{tree_id} has multiple active version documents")
            continue
        else:
            version_id = deterministic_id("tree-version-baseline", tree_id, tree.get("tree"))
            snapshot_id = deterministic_id("tree-snapshot-baseline", tree_id, tree.get("tree"))
            version_number = 1
            tree_inserts.append(tree_version_document(tree, snapshot_id=snapshot_id, version_id=version_id, version_number=version_number, formula_version_map=mapping, timestamp=timestamp))
        if (
            tree.get("version_id") != version_id
            or tree.get("version_number") != version_number
            or tree.get("formula_version_map") != mapping
        ):
            tree_updates.append({
                "id": tree_id,
                "version_id": version_id,
                "version_number": version_number,
                "formula_version_map": mapping,
                "snapshot_id": snapshot_id,
            })

    return {
        "timestamp": timestamp,
        "conflicts": conflicts,
        "formula_updates": formula_updates,
        "formula_inserts": formula_inserts,
        "tree_updates": tree_updates,
        "tree_inserts": tree_inserts,
        "summary": {
            "formulas_seen": len(formulas),
            "formula_versions_to_insert": len(formula_inserts),
            "formula_pointers_to_update": len(formula_updates),
            "decision_trees_seen": len(trees),
            "decision_tree_versions_to_insert": len(tree_inserts),
            "decision_tree_pointers_or_maps_to_update": len(tree_updates),
            "conflicts": len(conflicts),
        },
    }


async def create_backup(db, plan: dict[str, Any]) -> Path:
    backup_dir = Path("/app/.emergent/backups") / f"staging-version-baseline-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}"
    backup_dir.mkdir(parents=True, exist_ok=False)
    backup = {
        "database": db.name,
        "created_at": now_iso(),
        "plan_summary": plan["summary"],
        "collections": {
            name: await db[name].find({}).to_list(None)
            for name in BACKUP_COLLECTIONS
        },
    }
    (backup_dir / "catalog-before.json").write_text(json_util.dumps(backup, indent=2), encoding="utf-8")
    return backup_dir


async def validate(db) -> list[str]:
    errors: list[str] = []
    formulas = await db.ce_formulas.find({}, {"_id": 0, "id": 1, "version_id": 1}).to_list(None)
    for formula in formulas:
        if not formula.get("version_id"):
            errors.append(f"ce_formulas:{formula.get('id')} has no version_id")
            continue
        linked = await db.ce_formula_versions.find_one(
            {"formula_id": formula["id"], "$or": [{"id": formula["version_id"]}, {"version_id": formula["version_id"]}]},
            {"_id": 1},
        )
        if not linked:
            errors.append(f"ce_formulas:{formula['id']} points to a missing version")
    trees = await db.ce_decision_trees.find({}, {"_id": 0, "id": 1, "version_id": 1, "formula_version_map": 1}).to_list(None)
    for tree in trees:
        if not tree.get("version_id") or not isinstance(tree.get("formula_version_map"), dict):
            errors.append(f"ce_decision_trees:{tree.get('id')} has incomplete version metadata")
    return errors


async def run(*, apply: bool) -> None:
    settings = dotenv_values("/app/backend/.env")
    uri = os.environ.get("STAGING_MONGO_URL") or settings.get("STAGING_MONGO_URL")
    db_name = os.environ.get("STAGING_DB_NAME") or settings.get("STAGING_DB_NAME")
    if not uri or db_name != TARGET_DB_NAME:
        raise RuntimeError("STAGING_MONGO_URL and STAGING_DB_NAME=sustainrepo_staging are required")
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=15000, retryWrites=True)
    db = client[db_name]
    try:
        await client.admin.command("ping")
        plan = await build_plan(db)
        print(json.dumps({"database": db.name, **plan["summary"], "conflicts": plan["conflicts"]}, indent=2))
        if plan["conflicts"]:
            raise RuntimeError("Staging catalog baseline is ambiguous; no changes were written")
        if not apply:
            print("Dry run only. Re-run with --apply to write the immutable staging baseline.")
            return
        backup_path = await create_backup(db, plan)
        async with await client.start_session() as session:
            async with session.start_transaction():
                for version in plan["formula_inserts"]:
                    await db.ce_formula_versions.update_one({"id": version["id"]}, {"$setOnInsert": version}, upsert=True, session=session)
                for update in plan["formula_updates"]:
                    await db.ce_formulas.update_one(
                        {"id": update["id"]},
                        {"$set": {**{key: value for key, value in update.items() if key != "id"}, "updated_at": plan["timestamp"], "updated_by": "staging-version-baseline"}},
                        session=session,
                    )
                for version in plan["tree_inserts"]:
                    await db.ce_decision_tree_versions.update_one({"id": version["id"]}, {"$setOnInsert": version}, upsert=True, session=session)
                for update in plan["tree_updates"]:
                    await db.ce_decision_trees.update_one(
                        {"id": update["id"]},
                        {"$set": {**{key: value for key, value in update.items() if key not in {"id", "snapshot_id"}}, "updated_at": plan["timestamp"], "updated_by": "staging-version-baseline"}},
                        session=session,
                    )
        errors = await validate(db)
        if errors:
            raise RuntimeError(f"Baseline was written but validation failed; restore {backup_path}: {errors}")
        print(json.dumps({"status": "applied", "backup": str(backup_path), "validation_errors": []}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create immutable version-1 snapshots for the existing staging GHG catalog.")
    parser.add_argument("--apply", action="store_true", help="Persist the baseline; default is dry run.")
    arguments = parser.parse_args()
    asyncio.run(run(apply=arguments.apply))