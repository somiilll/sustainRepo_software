"""
Golden regression: GHG calculation results must not change.

Replays every captured fixture through the real calc engine and compares the
outputs to the baseline recorded in
`tests/golden/baselines/ghg_calc_replay.json`.

READ-ONLY: every replay uses `dry_run=True`, so no audit log is persisted and
no emission record is touched.

If this file fails after a refactor, a calculation result changed. That is a
hard stop — the architecture may change, the numbers may not.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from ghg_golden_support import (
    CALC_BASELINE,
    compare_outputs,
    load_baseline,
    mongo_db,
    normalise_outputs,
)

BASELINE = load_baseline(CALC_BASELINE)
FIXTURES: List[Dict[str, Any]] = BASELINE["fixtures"]


@pytest.fixture(scope="module")
def replayed() -> Dict[str, Any]:
    """Replay all fixtures once (single event loop, single Mongo client)."""

    async def run() -> Dict[str, Any]:
        from calc_engine import CalcEngine

        db = mongo_db()
        engine = CalcEngine(db)
        formulas = {f["id"]: f async for f in db.ce_formulas.find({}, {"_id": 0})}

        results: Dict[str, Any] = {}
        for fixture in FIXTURES:
            formula_doc = formulas.get(fixture["formula_id"])
            if not formula_doc:
                results[fixture["fixture_id"]] = {
                    "error": f"formula {fixture['formula_id']} no longer exists"
                }
                continue
            definition = dict(formula_doc["definition"])
            definition.setdefault("id", formula_doc["id"])
            definition.setdefault("version_id", formula_doc.get("version_id"))
            try:
                res = await engine.execute(
                    formula=definition,
                    inputs=fixture["inputs"],
                    context=fixture["context"],
                    user_overrides=fixture["user_overrides"],
                    dry_run=True,
                )
            except Exception as exc:  # noqa: BLE001
                results[fixture["fixture_id"]] = {
                    "error": f"{type(exc).__name__}: {exc}"
                }
                continue
            results[fixture["fixture_id"]] = {
                "outputs": normalise_outputs(res.get("outputs") or {}),
                "formula_version_id": res.get("formula_version_id"),
                "dry_run": res.get("dry_run"),
            }
        return results

    return asyncio.run(run())


def test_baseline_is_populated():
    assert FIXTURES, "No calculation fixtures captured — run capture_ghg_baseline.py"
    assert BASELINE["bucket_count"] >= 40, (
        f"Baseline only covers {BASELINE['bucket_count']} buckets; "
        "expected the full GHG spread (>=40)"
    )


@pytest.mark.parametrize(
    "fixture", FIXTURES, ids=[f["fixture_id"] for f in FIXTURES]
)
def test_calculation_output_unchanged(fixture, replayed):
    actual = replayed[fixture["fixture_id"]]
    assert "error" not in actual, (
        f"{fixture['fixture_id']} ({fixture['bucket']}) failed to replay: "
        f"{actual.get('error')}"
    )
    diffs = compare_outputs(fixture["baseline_outputs"], actual["outputs"])
    assert not diffs, (
        f"Calculation changed for {fixture['fixture_id']} "
        f"(bucket={fixture['bucket']}, formula={fixture['formula_name']}):\n  "
        + "\n  ".join(diffs)
    )


@pytest.mark.parametrize(
    "fixture", FIXTURES, ids=[f["fixture_id"] for f in FIXTURES]
)
def test_replay_never_persists(fixture, replayed):
    """Guard: the golden suite must stay read-only."""
    actual = replayed[fixture["fixture_id"]]
    if "error" in actual:
        pytest.skip(actual["error"])
    assert actual["dry_run"] is True
