"""Create isolated Scope 3 activity-basis formula and field-configuration groups."""

from __future__ import annotations

import argparse
import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import os
from pathlib import Path
import sys
from typing import Any
from uuid import uuid4

from bson import json_util
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, "/app/backend")
from calc_engine.formulas import create_formula, update_decision_tree


TARGET_DB_NAME = "test_database"
CREATED_BY = "scope3-activity-group-migration"
GROUPS = (
    ("scope3_activity_c1_c2", ("purchased_goods_and_services", "capital_goods")),
    ("scope3_activity_c3", ("fuel_and_energy_related_activities_not_included_in_scope_1_or_scope_2",)),
    ("scope3_activity_c4_c9", ("upstream_transportation_distribution", "downstream_transportation_and_distribution")),
    ("scope3_activity_c5_c12", ("waste_generated_in_operations", "end_of_life_treatment_of_sold_products")),
    ("scope3_activity_c6", ("business_travel",)),
    ("scope3_activity_c7", ("employee_commuting",)),
    ("scope3_activity_c8", ("upstream_leased_assets",)),
    ("scope3_activity_c10_c13_c14", ("processing_of_sold_products", "downstream_leased_assets", "franchises")),
    ("scope3_activity_c11", ("use_of_sold_products",)),
    ("scope3_activity_c15", ("investments",)),
)


def activity_branch(tree: dict[str, Any]) -> dict[str, Any]:
    options = tree.get("options") or {}
    branch = options.get("activity_basis")
    if not isinstance(branch, dict):
        raise ValueError("Decision tree has no activity_basis branch")
    if "next" in branch:
        return branch["next"]
    if "formula_id" in branch:
        return branch
    raise ValueError("activity_basis branch is invalid")


def leaf_paths(node: Any, path: str = "") -> dict[str, str]:
    found: dict[str, str] = {}
    if isinstance(node, dict):
        if isinstance(node.get("formula_id"), str):
            found[path or "root"] = node["formula_id"]
        for key, value in node.items():
            found.update(leaf_paths(value, f"{path}.{key}" if path else key))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            found.update(leaf_paths(value, f"{path}[{index}]"))
    return found


def decision_fields(node: Any) -> set[str]:
    fields: set[str] = set()
    if isinstance(node, dict):
        if isinstance(node.get("field_name"), str):
            fields.add(node["field_name"])
        for value in node.values():
            fields.update(decision_fields(value))
    elif isinstance(node, list):
        for value in node:
            fields.update(decision_fields(value))
    return fields


def replace_leaves(node: Any, replacements: dict[str, str], path: str = "") -> Any:
    copied = deepcopy(node)
    if isinstance(copied, dict):
        if path in replacements and isinstance(copied.get("formula_id"), str):
            copied["formula_id"] = replacements[path]
        for key, value in list(copied.items()):
            copied[key] = replace_leaves(value, replacements, f"{path}.{key}" if path else key)
    elif isinstance(copied, list):
        return [replace_leaves(value, replacements, f"{path}[{index}]") for index, value in enumerate(copied)]
    return copied


def replace_activity_branch(tree: dict[str, Any], replacements: dict[str, str]) -> dict[str, Any]:
    result = deepcopy(tree)
    branch = result["options"]["activity_basis"]
    if "next" in branch:
        branch["next"] = replace_leaves(branch["next"], replacements)
    else:
        branch["formula_id"] = replacements["root"]
    return result


def grouped_activity_option(option: dict[str, Any], replacements: dict[str, str]) -> dict[str, Any]:
    copied = deepcopy(option)
    if "next" in copied:
        copied["next"] = replace_leaves(copied["next"], replacements)
    else:
        copied["formula_id"] = replacements["root"]
    return copied


def mapping_applies(mapping: dict[str, Any], category_id: str, scope_id: str) -> bool:
    categories = mapping.get("applies_to_categories") or []
    scopes = mapping.get("applies_to_scopes") or []
    return (not categories or category_id in categories) and (not scopes or scope_id in scopes)


async def root_formula(db, formula: dict[str, Any]) -> dict[str, Any]:
    current = formula
    seen = set()
    while current.get("activity_formula_group_id") and current.get("source_formula_id"):
        if current["id"] in seen:
            raise ValueError(f"Formula clone cycle at {current['id']}")
        seen.add(current["id"])
        parent = await db.ce_formulas.find_one({"id": current["source_formula_id"]}, {"_id": 0})
        if not parent:
            raise ValueError(f"Formula clone source is missing for {current['id']}")
        current = parent
    return current


async def build_plan(db) -> dict[str, Any]:
    scope = await db.scopes.find_one({"code": "scope3"}, {"_id": 0})
    if not scope:
        raise ValueError("Scope 3 is not configured")
    categories = await db.emission_categories.find(
        {"scope_id": scope["id"], "is_active": {"$ne": False}}, {"_id": 0},
    ).to_list(None)
    by_code = {category.get("code"): category for category in categories}
    mappings = await db.ce_input_field_mappings.find({"is_active": {"$ne": False}}, {"_id": 0}).to_list(None)
    plan = []
    conflicts = []
    for group_id, codes in GROUPS:
        missing = [code for code in codes if code not in by_code]
        if missing:
            conflicts.append(f"{group_id}: missing categories {missing}")
            continue
        members = [by_code[code] for code in codes]
        trees = []
        for category in members:
            tree = await db.ce_decision_trees.find_one(
                {"category_id": category["id"], "is_active": True}, {"_id": 0},
            )
            if not tree:
                conflicts.append(f"{group_id}: {category['code']} has no active decision tree")
                continue
            try:
                branch = activity_branch(tree["tree"])
            except ValueError as error:
                conflicts.append(f"{group_id}: {category['code']}: {error}")
                continue
            trees.append((category, tree, branch))
        if len(trees) != len(members):
            continue
        canonical_category, canonical_tree, canonical_branch = trees[0]
        canonical_option = canonical_tree["tree"]["options"]["activity_basis"]
        canonical_paths = leaf_paths(canonical_branch)
        canonical_formulas = await db.ce_formulas.find(
            {"id": {"$in": list(canonical_paths.values())}, "is_active": True}, {"_id": 0},
        ).to_list(None)
        raw_formulas_by_id = {formula["id"]: formula for formula in canonical_formulas}
        if set(canonical_paths.values()) - set(raw_formulas_by_id):
            conflicts.append(f"{group_id}: canonical activity formulas are missing or inactive")
            continue
        formulas_by_id = {}
        normalized_paths = {}
        for path, formula_id in canonical_paths.items():
            root = await root_formula(db, raw_formulas_by_id[formula_id])
            formulas_by_id[root["id"]] = root
            normalized_paths[path] = root["id"]
        canonical_paths = normalized_paths
        input_variables = {
            field.get("variable")
            for formula in canonical_formulas
            for field in (formula.get("definition", {}).get("inputs", []) + formula.get("definition", {}).get("properties", []))
            if field.get("variable")
        }
        fields = decision_fields(canonical_branch)
        source_mappings = [
            mapping for mapping in mappings
            if not mapping.get("activity_formula_group_id")
            and mapping_applies(mapping, canonical_category["id"], scope["id"])
            and (
                mapping.get("maps_to_variable") in input_variables
                or mapping.get("maps_to_context") in fields
                or mapping.get("field_key") in fields
            )
        ]
        plan.append({
            "group_id": group_id,
            "category_ids": [member["id"] for member in members],
            "category_codes": list(codes),
            "canonical_tree_id": canonical_tree["id"],
            "canonical_paths": canonical_paths,
            "canonical_option": canonical_option,
            "trees": [{"id": tree["id"], "category": category["code"]} for category, tree, branch in trees],
            "formulas": formulas_by_id,
            "source_mappings": source_mappings,
        })
    return {"scope_id": scope["id"], "plan": plan, "conflicts": conflicts}


async def apply_plan(db, result: dict[str, Any]) -> dict[str, int]:
    formulas_created = mappings_created = trees_rebound = 0
    for group in result["plan"]:
        formula_map = {}
        for source_id, source in group["formulas"].items():
            existing = await db.ce_formulas.find_one(
                {"activity_formula_group_id": group["group_id"], "source_formula_id": source_id, "is_active": True},
                {"_id": 0},
            )
            if not existing:
                clone = await create_formula(
                    db,
                    name=f"{group['group_id']} — {source.get('name', source_id)}",
                    description=f"Isolated activity-basis clone of {source_id}",
                    scope_ids=source.get("scope_ids") or [],
                    category_ids=group["category_ids"],
                    category_id=None,
                    definition=deepcopy(source["definition"]),
                    created_by=CREATED_BY,
                )
                await db.ce_formulas.update_one({"id": clone["id"]}, {"$set": {
                    "activity_formula_group_id": group["group_id"], "source_formula_id": source_id,
                }})
                clone["activity_formula_group_id"] = group["group_id"]
                existing = clone
                formulas_created += 1
            formula_map[source_id] = existing["id"]
        for source in group["source_mappings"]:
            exists = await db.ce_input_field_mappings.find_one(
                {"activity_formula_group_id": group["group_id"], "source_mapping_id": source["id"]}, {"_id": 0, "id": 1},
            )
            if not exists:
                clone = {**source, "id": str(uuid4()), "activity_formula_group_id": group["group_id"],
                         "source_mapping_id": source["id"], "applies_to_methods": ["activity_basis"],
                         "applies_to_categories": group["category_ids"], "created_at": datetime.now(timezone.utc).isoformat(),
                         "created_by": CREATED_BY}
                await db.ce_input_field_mappings.insert_one(clone)
                mappings_created += 1
        if group["group_id"] == "scope3_activity_c15":
            existing_c15 = await db.ce_input_field_mappings.find_one(
                {"activity_formula_group_id": group["group_id"], "maps_to_variable": "investment_percentage"},
                {"_id": 0, "id": 1},
            )
            if not existing_c15:
                await db.ce_input_field_mappings.insert_one({
                    "id": str(uuid4()),
                    "field_key": "investment_percentage",
                    "field_label": "Investment Percentage",
                    "field_type": "number",
                    "maps_to_variable": "investment_percentage",
                    "maps_to_context": None,
                    "default_unit": "",
                    "allowed_units": [],
                    "is_required": True,
                    "is_override": False,
                    "options": [],
                    "display_order": 10,
                    "applies_to_categories": group["category_ids"],
                    "applies_to_scopes": [result["scope_id"]],
                    "applies_to_methods": ["activity_basis"],
                    "activity_formula_group_id": group["group_id"],
                    "source_mapping_id": None,
                    "unit_source": "none",
                    "validation_rules": {"max": 100},
                    "is_active": True,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "created_by": CREATED_BY,
                })
                mappings_created += 1
        replacements = {path: formula_map[source_id] for path, source_id in group["canonical_paths"].items()}
        cloned_option = grouped_activity_option(group["canonical_option"], replacements)
        for tree in group["trees"]:
            current_tree = (await db.ce_decision_trees.find_one({"id": tree["id"]}, {"_id": 0}))["tree"]
            updated = deepcopy(current_tree)
            updated["options"]["activity_basis"] = cloned_option
            await update_decision_tree(db, tree["id"], tree=updated, created_by=CREATED_BY)
            trees_rebound += 1
    return {"formulas_created": formulas_created, "mappings_created": mappings_created, "trees_rebound": trees_rebound}


async def run(apply: bool) -> None:
    load_dotenv("/app/backend/.env")
    if os.environ.get("DB_NAME") != TARGET_DB_NAME:
        raise RuntimeError("This migration is locked to test_database")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)
    db = client[os.environ["DB_NAME"]]
    try:
        result = await build_plan(db)
        summary = {"groups": len(result["plan"]), "conflicts": result["conflicts"],
                   "formulas_to_clone": sum(len(group["formulas"]) for group in result["plan"]),
                   "mappings_to_clone": sum(len(group["source_mappings"]) for group in result["plan"])}
        print(json_util.dumps(summary, indent=2))
        if result["conflicts"]:
            raise RuntimeError("Group migration stopped before writes because the catalog is not equivalent within a requested group")
        if not apply:
            print("Dry run only. Re-run with --apply to create clones and publish re-bound decision trees.")
            return
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = Path("/app/.emergent/backups") / f"scope3-activity-groups-{stamp}"
        backup_dir.mkdir(parents=True, exist_ok=False)
        backup = {name: await db[name].find({}).to_list(None) for name in ("ce_formulas", "ce_formula_versions", "ce_decision_trees", "ce_decision_tree_versions", "ce_input_field_mappings")}
        (backup_dir / "before.json").write_text(json_util.dumps(backup, indent=2), encoding="utf-8")
        outcome = await apply_plan(db, result)
        print(json_util.dumps({"status": "applied", "backup": str(backup_dir), **outcome}, indent=2))
    finally:
        client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Isolate Scope 3 activity-basis formula groups in test_database.")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.apply))