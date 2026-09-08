"""Targeted immutable-catalog integrity repair for Scope 3 spend conversion."""

from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Dict

from .formulas import (
    ensure_decision_tree_current_snapshot,
    ensure_formula_current_version,
    update_decision_tree,
)


PPP_FORMULA_ID = "6a3c49f2-3cd0-4a6e-ab9a-8ec2f4e1eecb"
STANDARD_FORMULA_ID = "8a9150c2-ea89-4f53-9f85-2a62f64d1028"
SCOPE3_CATEGORY_PATTERN = re.compile(r"^C(?:[1-9]|1[0-5])\s+-")


def _correct_spend_branch(tree: Dict[str, Any]) -> tuple[Dict[str, Any], bool]:
    repaired = deepcopy(tree)
    options = repaired.get("options") or {}
    spend_branch = options.get("spend_basis")
    if not isinstance(spend_branch, dict):
        raise RuntimeError("Decision tree is missing its Spend Basis branch")

    expected = {
        "next": {
            "field_name": "spend_currency_conversion_method",
            "options": {
                "ppp_inflation": {"formula_id": PPP_FORMULA_ID},
                "standard": {"formula_id": STANDARD_FORMULA_ID},
            },
        }
    }
    if spend_branch == expected:
        return repaired, False
    options["spend_basis"] = expected
    repaired["options"] = options
    return repaired, True


async def inspect_scope3_spend_currency_catalog(db) -> Dict[str, Any]:
    scope3 = await db.scopes.find_one({"code": "scope3"}, {"_id": 0, "id": 1})
    if not scope3:
        raise RuntimeError("Scope 3 was not found")
    categories = await db.emission_categories.find(
        {"scope_id": scope3["id"], "is_active": True},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(100)
    categories = sorted(
        [category for category in categories if SCOPE3_CATEGORY_PATTERN.match(category.get("name") or "")],
        key=lambda category: int(category["name"].split(" ", 1)[0][1:]),
    )
    if len(categories) != 15:
        raise RuntimeError(f"Expected C1-C15, found {len(categories)} active Scope 3 categories")

    formula_status = {}
    for formula_id in (PPP_FORMULA_ID, STANDARD_FORMULA_ID):
        formula = await db.ce_formulas.find_one({"id": formula_id, "is_active": True}, {"_id": 0})
        version = None
        if formula and formula.get("version_id"):
            version = await db.ce_formula_versions.find_one(
                {"id": formula["version_id"], "formula_id": formula_id},
                {"_id": 0, "id": 1, "formula_id": 1, "definition_snapshot": 1},
            )
        formula_status[formula_id] = {
            "version_id": (formula or {}).get("version_id"),
            "valid": bool(
                formula
                and version
                and version.get("definition_snapshot") == formula.get("definition")
            ),
        }

    tree_status = []
    formula_versions_are_distinct = (
        formula_status[PPP_FORMULA_ID]["valid"]
        and formula_status[STANDARD_FORMULA_ID]["valid"]
        and formula_status[PPP_FORMULA_ID]["version_id"]
        != formula_status[STANDARD_FORMULA_ID]["version_id"]
    )
    for category in categories:
        tree = await db.ce_decision_trees.find_one(
            {"category_id": category["id"], "is_active": True},
            {"_id": 0},
        )
        if not tree:
            raise RuntimeError(f"No active decision tree for {category['name']}")
        _, branch_needs_repair = _correct_spend_branch(tree.get("tree") or {})
        snapshot = await db.ce_decision_tree_versions.find_one(
            {"$or": [{"id": tree.get("version_id")}, {"version_id": tree.get("version_id")}]},
            {"_id": 0},
        )
        expected_currency_map = {
            PPP_FORMULA_ID: formula_status[PPP_FORMULA_ID]["version_id"],
            STANDARD_FORMULA_ID: formula_status[STANDARD_FORMULA_ID]["version_id"],
        }
        maps_match = formula_versions_are_distinct and all(
            (tree.get("formula_version_map") or {}).get(formula_id) == version_id
            for formula_id, version_id in expected_currency_map.items()
        )
        tree_status.append({
            "category": category["name"],
            "tree_id": tree["id"],
            "version_id": tree.get("version_id"),
            "branch_valid": not branch_needs_repair,
            "snapshot_valid": bool(
                snapshot
                and snapshot.get("tree") == tree.get("tree")
                and snapshot.get("formula_version_map") == tree.get("formula_version_map")
            ),
            "currency_map_valid": maps_match,
        })

    return {
        "formulas": formula_status,
        "formula_versions_are_distinct": formula_versions_are_distinct,
        "trees": tree_status,
    }


async def repair_scope3_spend_currency_catalog(
    db,
    *,
    created_by: str = "scope3-spend-currency-catalog-repair",
) -> Dict[str, Any]:
    before = await inspect_scope3_spend_currency_catalog(db)
    repaired_formulas = []
    for formula_id in (PPP_FORMULA_ID, STANDARD_FORMULA_ID):
        _, changed = await ensure_formula_current_version(
            db,
            formula_id,
            created_by=created_by,
        )
        if changed:
            repaired_formulas.append(formula_id)

    categories = [tree["category"] for tree in before["trees"]]
    category_docs = await db.emission_categories.find(
        {"name": {"$in": categories}, "is_active": True},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(15)
    category_ids = [category["id"] for category in category_docs]
    await db.ce_formulas.update_many(
        {"id": {"$in": [PPP_FORMULA_ID, STANDARD_FORMULA_ID]}},
        {"$set": {"category_ids": category_ids}},
    )

    published_trees = []
    for category in category_docs:
        tree = await db.ce_decision_trees.find_one(
            {"category_id": category["id"], "is_active": True},
            {"_id": 0},
        )
        repaired_tree, branch_changed = _correct_spend_branch(tree.get("tree") or {})
        if branch_changed:
            updated = await update_decision_tree(
                db,
                tree["id"],
                tree=repaired_tree,
                created_by=created_by,
            )
            published_trees.append(updated["id"])
        else:
            updated, published = await ensure_decision_tree_current_snapshot(
                db,
                tree["id"],
                created_by=created_by,
            )
            if published:
                published_trees.append(updated["id"])

    after = await inspect_scope3_spend_currency_catalog(db)
    if not after["formula_versions_are_distinct"] or not all(
        tree["branch_valid"]
        and tree["snapshot_valid"]
        and tree["currency_map_valid"]
        for tree in after["trees"]
    ):
        raise RuntimeError("Scope 3 spend-currency catalog repair did not pass integrity verification")
    return {
        "repaired_formula_ids": repaired_formulas,
        "published_tree_ids": published_trees,
        "catalog": after,
    }