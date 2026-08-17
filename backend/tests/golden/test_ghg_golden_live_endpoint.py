"""
Golden regression: the live GHG calculation endpoint must not change.

Replays `POST /api/calc-engine/execute-by-category` — the endpoint the Add and
Edit forms actually call — for every captured fixture and asserts that both the
resolved formula and the outputs are unchanged.

This is the complementary guard to `test_ghg_golden_calculation.py`:
that file locks the engine in isolation, this one additionally locks the
router-side enrichment the forms depend on:
  * `scope3_ef_id` -> activity / fuel context enrichment,
  * fugitive `co2_gwp_fugitives` injection from `fuel_database`,
  * `spend_basis` inflation_rate / ppp resolution from `currency_conversion`,
  * decision-tree traversal and the decision path returned to the UI.

NOTE: for 4 `spend_basis` fixtures this endpoint legitimately returns a
different number than the in-process engine replay, because `inflation_rate`
has two independent resolution paths. That pre-existing inconsistency is
documented in `baselines/ghg_known_inconsistencies.json`; both baselines are
individually stable, so both remain valid regression guards.

READ-ONLY: every request sends `dry_run: true`.
"""
from __future__ import annotations

from typing import Any, Dict, List

import pytest
import requests

from ghg_golden_support import (
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    API,
    HTTP_BASELINE,
    auth_header,
    compare_outputs,
    load_baseline,
    login,
    normalise_outputs,
)

BASELINE = load_baseline(HTTP_BASELINE)
FIXTURES: List[Dict[str, Any]] = BASELINE["fixtures"]


@pytest.fixture(scope="module")
def headers() -> Dict[str, str]:
    token = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not token:
        pytest.skip("Admin login failed")
    return auth_header(token)


def test_baseline_is_populated():
    assert FIXTURES, "No live-endpoint fixtures captured"
    assert BASELINE["bucket_count"] >= 35


@pytest.mark.parametrize(
    "fixture", FIXTURES, ids=[f["fixture_id"] for f in FIXTURES]
)
def test_live_endpoint_unchanged(fixture, headers):
    assert fixture["request"]["dry_run"] is True, "fixture must stay read-only"

    resp = requests.post(
        f"{API}/calc-engine/execute-by-category",
        json=fixture["request"],
        headers=headers,
        timeout=180,
    )
    assert resp.status_code == 200, (
        f"{fixture['fixture_id']} ({fixture['bucket']}) -> "
        f"{resp.status_code}: {resp.text[:300]}"
    )
    payload = resp.json()

    assert (payload.get("resolved_formula") or {}).get("id") == fixture[
        "baseline_resolved_formula_id"
    ], f"Resolved formula changed for {fixture['fixture_id']} ({fixture['bucket']})"

    assert payload.get("decision_path") == fixture["baseline_decision_path"], (
        f"Decision path changed for {fixture['fixture_id']}: "
        f"expected {fixture['baseline_decision_path']} "
        f"got {payload.get('decision_path')}"
    )

    diffs = compare_outputs(
        fixture["baseline_outputs"], normalise_outputs(payload.get("outputs") or {})
    )
    assert not diffs, (
        f"Endpoint output changed for {fixture['fixture_id']} "
        f"(bucket={fixture['bucket']}):\n  " + "\n  ".join(diffs)
    )
