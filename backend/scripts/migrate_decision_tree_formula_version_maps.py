"""Backfill immutable formula-version maps for legacy decision-tree snapshots."""

from __future__ import annotations

import argparse
import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient


def _formula_ids(node: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(node, dict):
        formula_id = node.get("formula_id")
        if isinstance(formula_id, str) and formula_id:
            found.add(formula_id)
        for value in node.values():
            found.update(_formula_ids(value))
    elif isinstance(node, list):
        for value in node:
            found.update(_formula_ids(value))
    return found


def _parse_time(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _version_id(version: dict) -> Optional[str]:
    return version.get("version_id") or version.get("id")


def _version_at(versions: list[dict], effective_at: Optional[datetime]) -> Optional[str]:
    if effective_at is not None:
        eligible = []
        for version in versions:
            starts = _parse_time(version.get("effective_from") or version.get("created_at"))
            ends = _parse_time(version.get("effective_to"))
            if starts and starts <= effective_at and (ends is None or effective_at < ends):
                eligible.append(version)
        if eligible:
            chosen = max(
                eligible,
                key=lambda item: (
                    _parse_time(item.get("effective_from") or item.get("created_at"))
                    or datetime.min.replace(tzinfo=timezone.utc),
                    int(item.get("version_number") or 0),
                ),
            )
            return _version_id(chosen)
    if len(versions) == 1:
        return _version_id(versions[0])
    return None


async def _formula_versions(db, formula_ids: set[str]) -> tuple[dict[str, dict], dict[str, list[dict]]]:
    if not formula_ids:
        return {}, {}
    current_rows = await db.ce_formulas.find(
        {"id": {"$in": list(formula_ids)}},
        {"_id": 0, "id": 1, "version_id": 1},
    ).to_list(len(formula_ids))
    version_rows = await db.ce_formula_versions.find(
        {"formula_id": {"$in": list(formula_ids)}},
        {
            "_id": 0,
            "id": 1,
            "version_id": 1,
            "formula_id": 1,
            "version_number": 1,
            "effective_from": 1,
            "effective_to": 1,
            "created_at": 1,
        },
    ).to_list(100000)
    current = {row["id"]: row for row in current_rows}
    versions: dict[str, list[dict]] = {}
    for row in version_rows:
        versions.setdefault(row["formula_id"], []).append(row)
    return current, versions


async def _build_map(
    db,
    document: dict,
    *,
    use_current_versions: bool,
) -> tuple[dict[str, str], list[str]]:
    formula_ids = _formula_ids(document.get("tree") or {})
    current, versions = await _formula_versions(db, formula_ids)
    effective_at = _parse_time(
        document.get("effective_from")
        or document.get("updated_at")
        or document.get("created_at")
    )
    result: dict[str, str] = {}
    unresolved: list[str] = []
    for formula_id in sorted(formula_ids):
        selected = None
        if use_current_versions:
            selected = (current.get(formula_id) or {}).get("version_id")
        if not selected:
            selected = _version_at(versions.get(formula_id, []), effective_at)
        if selected:
            result[formula_id] = selected
        else:
            unresolved.append(formula_id)
    return result, unresolved


async def migrate(*, apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    try:
        current_trees = await db.ce_decision_trees.find({}).to_list(10000)
        current_by_id = {row["id"]: row for row in current_trees}
        current_version_ids = {
            row.get("version_id") for row in current_trees if row.get("version_id")
        }
        snapshots = await db.ce_decision_tree_versions.find({}).to_list(100000)
        planned: list[tuple[str, Any, dict[str, str]]] = []
        unresolved: list[str] = []

        for tree in current_trees:
            if isinstance(tree.get("formula_version_map"), dict):
                continue
            mapping, missing = await _build_map(db, tree, use_current_versions=True)
            if missing:
                unresolved.append(f"ce_decision_trees:{tree.get('id')} -> {', '.join(missing)}")
            else:
                planned.append(("ce_decision_trees", tree["_id"], mapping))

        for snapshot in snapshots:
            if isinstance(snapshot.get("formula_version_map"), dict):
                continue
            source_tree = current_by_id.get(snapshot.get("source_tree_id"))
            is_current = snapshot.get("version_id") in current_version_ids
            source = source_tree if is_current and source_tree else snapshot
            mapping, missing = await _build_map(
                db,
                source,
                use_current_versions=is_current,
            )
            if missing:
                identity = snapshot.get("version_id") or snapshot.get("id")
                unresolved.append(f"ce_decision_tree_versions:{identity} -> {', '.join(missing)}")
            else:
                planned.append(("ce_decision_tree_versions", snapshot["_id"], mapping))

        if unresolved:
            raise RuntimeError(
                "Cannot safely backfill decision-tree mappings:\n" + "\n".join(unresolved)
            )

        print(f"Database: {db.name}")
        print(f"Decision-tree documents requiring backfill: {len(planned)}")
        if not apply:
            print("Dry run only. Re-run with --apply to write the mappings.")
            return

        backup_dir = Path("/app/.emergent/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_path = backup_dir / f"decision-tree-formula-version-maps-{stamp}.json"
        backup_docs = {
            "database": db.name,
            "ce_decision_trees": current_trees,
            "ce_decision_tree_versions": snapshots,
        }
        backup_path.write_text(json_util.dumps(backup_docs, indent=2), encoding="utf-8")

        migrated_at = datetime.now(timezone.utc).isoformat()
        for collection_name, mongo_id, mapping in planned:
            result = await db[collection_name].update_one(
                {"_id": mongo_id, "formula_version_map": {"$exists": False}},
                {
                    "$set": {
                        "formula_version_map": mapping,
                        "version_map_backfilled_at": migrated_at,
                        "version_map_backfilled_by": "decision-tree-version-map-migration",
                    }
                },
            )
            if result.modified_count != 1:
                raise RuntimeError(f"Concurrent catalog change detected in {collection_name}:{mongo_id}")

        print(f"Backfilled {len(planned)} decision-tree documents.")
        print(f"Backup: {backup_path}")
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(migrate(apply=args.apply))