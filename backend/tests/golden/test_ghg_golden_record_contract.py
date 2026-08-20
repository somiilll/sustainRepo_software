"""
Golden regression: the persisted GHG record contract must not change.

For every behaviour bucket present in the database, this locks:
  * which top-level fields the flow populates,
  * the `dynamic_field_values` shape (key, unit, is_override presence),
  * the `outputs` keys and their units,
  * which emission total fields are written,
  * the C7 multi-employee aggregation shape (which has no calculation audit
    log by design, so it cannot be covered by the calculation replay).

A refactor that renames, drops or restructures a saved field fails here.
READ-ONLY: Mongo is only read.
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from ghg_golden_support import (
    RECORD_CONTRACT_BASELINE,
    bucket_key,
    load_baseline,
    mongo_db,
    stable_hash,
)

BASELINE = load_baseline(RECORD_CONTRACT_BASELINE)
BUCKETS: Dict[str, Any] = BASELINE["buckets"]
BUCKET_KEYS: List[str] = sorted(BUCKETS.keys())


def _dfv_shape(dfv: Dict[str, Any]) -> Dict[str, Any]:
    """Must stay in lock-step with capture_ghg_baseline._dfv_shape."""
    shape = {}
    for key, val in sorted((dfv or {}).items()):
        if isinstance(val, dict):
            shape[key] = {
                "unit": val.get("unit"),
                "value_type": type(val.get("value")).__name__,
                "has_is_override": "is_override" in val,
                "is_override": bool(val.get("is_override")),
                "has_justification": bool(val.get("justification")),
            }
        else:
            shape[key] = {"value_type": type(val).__name__, "flat": True}
    return shape


@pytest.fixture(scope="module")
def records() -> Dict[str, Any]:
    async def run() -> Dict[str, Any]:
        db = mongo_db()
        docs = [r async for r in db.emission_records.find({}, {"_id": 0})]
        return {r["id"]: r for r in docs}

    return asyncio.run(run())


def test_baseline_is_populated():
    assert BUCKET_KEYS, "No record-contract baselines captured"
    assert BASELINE["total_records"] > 0


@pytest.mark.parametrize("bucket", BUCKET_KEYS, ids=[b[:70] for b in BUCKET_KEYS])
def test_record_contract_unchanged(bucket, records):
    expected = BUCKETS[bucket]
    rec = records.get(expected["representative_record_id"])
    assert rec is not None, (
        f"Representative record {expected['representative_record_id']} for bucket "
        f"{bucket} disappeared"
    )
    assert bucket_key(rec) == bucket, "Record moved to a different behaviour bucket"

    populated = sorted(k for k, v in rec.items() if v not in (None, "", [], {}))
    assert populated == expected["populated_top_level_fields"], (
        f"Populated field set changed for {bucket}\n"
        f"  missing: {sorted(set(expected['populated_top_level_fields']) - set(populated))}\n"
        f"  added:   {sorted(set(populated) - set(expected['populated_top_level_fields']))}"
    )

    assert stable_hash(_dfv_shape(rec.get("dynamic_field_values") or {})) == stable_hash(
        expected["dynamic_field_values_shape"]
    ), f"dynamic_field_values shape changed for {bucket}"

    assert sorted((rec.get("outputs") or {}).keys()) == expected["output_keys"]
    actual_units = {
        k: (v.get("unit") if isinstance(v, dict) else None)
        for k, v in sorted((rec.get("outputs") or {}).items())
    }
    assert actual_units == expected["output_units"], (
        f"Output units changed for {bucket}"
    )

    present_totals = sorted(
        f
        for f in (
            "co2_emissions",
            "ch4_emissions",
            "n2o_emissions",
            "co2e_emissions",
            "total_emissions",
        )
        if rec.get(f) is not None
    )
    assert present_totals == expected["emission_total_fields_present"]


def test_c7_multi_employee_contract_unchanged(records):
    expected = BASELINE.get("c7_multi_employee_contract")
    if not expected:
        pytest.skip("No C7 multi-employee records captured")

    rec = records.get(expected["representative_record_id"])
    assert rec is not None, "C7 representative record disappeared"

    employees = rec.get("employees") or []
    assert sorted(employees[0].keys()) == expected["employee_item_keys"], (
        "C7 employee item shape changed"
    )
    assert sorted((rec.get("monthly_totals") or {}).keys()) == expected[
        "monthly_totals_month_keys"
    ]
    first_month = next(iter((rec.get("monthly_totals") or {}).values()), {})
    assert sorted(first_month.keys()) == expected["monthly_totals_value_keys"]
    assert sorted((rec.get("yearly_total") or {}).keys()) == expected[
        "yearly_total_keys"
    ]
