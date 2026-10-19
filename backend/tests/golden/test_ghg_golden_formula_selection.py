"""
Golden regression: GHG formula SELECTION must not change.

Two guards:
  1. Every active decision tree still enumerates to exactly the same set of
     leaves (decision path -> formula id) as the captured baseline.
  2. Every captured record-level decision-input set still resolves, through the
     production traversal function `calc_engine.formulas.resolve_formula_id`,
     to the same formula that was used when the record was created.

Guard 2 is what protects "which formula runs for this scope/category/method"
during the Create/Edit refactor.

READ-ONLY: Mongo is only read; nothing is executed or persisted.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from ghg_golden_support import (
    TREE_BASELINE,
    enumerate_tree_paths,
    load_baseline,
    mongo_db,
    stable_hash,
    strip_volatile,
)

BASELINE = load_baseline(TREE_BASELINE)
TREES: List[Dict[str, Any]] = BASELINE["trees"]
SELECTION: List[Dict[str, Any]] = BASELINE["selection_fixtures"]


@pytest.fixture(scope="module")
def live() -> Dict[str, Any]:
    async def run() -> Dict[str, Any]:
        db = mongo_db()
        trees = [
            t async for t in db.ce_decision_trees.find({"is_active": True}, {"_id": 0})
        ]
        return {
            "by_category": {t["category_id"]: t for t in trees},
            "count": len(trees),
        }

    return asyncio.run(run())


def test_baseline_is_populated():
    assert TREES, "No decision trees captured — run capture_ghg_baseline.py"
    assert SELECTION, "No formula-selection fixtures captured"


def test_active_decision_tree_count_unchanged(live):
    assert live["count"] == BASELINE["tree_count"], (
        f"Active decision tree count changed: baseline {BASELINE['tree_count']} "
        f"-> now {live['count']}"
    )


@pytest.mark.parametrize(
    "snapshot",
    TREES,
    ids=[f"{t['category_name']}__{t['category_id'][:8]}" for t in TREES],
)
def test_decision_tree_leaves_unchanged(snapshot, live):
    tree = live["by_category"].get(snapshot["category_id"])
    assert tree is not None, (
        f"Active decision tree for category {snapshot['category_name']} "
        f"({snapshot['category_id']}) disappeared"
    )
    assert stable_hash(strip_volatile(tree.get("tree") or {})) == stable_hash(
        snapshot["tree"]
    ), f"Decision tree structure changed for {snapshot['category_name']}"

    leaves = enumerate_tree_paths(tree.get("tree") or {})
    assert len(leaves) == snapshot["leaf_count"]
    expected = {
        stable_hash(leaf["decision_inputs"]): leaf["formula_id"]
        for leaf in snapshot["leaves"]
    }
    actual = {
        stable_hash(leaf["decision_inputs"]): leaf["formula_id"] for leaf in leaves
    }
    assert actual == expected, (
        f"Decision path -> formula mapping changed for {snapshot['category_name']}"
    )


@pytest.mark.parametrize(
    "fixture", SELECTION, ids=[f["fixture_id"] for f in SELECTION]
)
def test_record_still_resolves_to_same_formula(fixture, live):
    from calc_engine.formulas import resolve_formula_id

    tree = live["by_category"].get(fixture["category_id"])
    if not fixture["has_decision_tree"]:
        assert tree is None or fixture["decision_inputs"] == {}
        pytest.skip("category has no decision tree — formula resolved directly")

    assert tree is not None, (
        f"Decision tree for {fixture['category_name']} disappeared"
    )
    formula_id, _path = resolve_formula_id(tree["tree"], fixture["decision_inputs"])
    assert formula_id == fixture["expected_formula_id"], (
        f"Formula selection changed for {fixture['fixture_id']} "
        f"(bucket={fixture['bucket']}, decision_inputs={fixture['decision_inputs']}): "
        f"expected {fixture['expected_formula_id']} got {formula_id}"
    )
