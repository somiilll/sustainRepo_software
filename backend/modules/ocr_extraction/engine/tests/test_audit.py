"""Audit trail: snapshots, diffs and an append-only log."""
from extractor_core import audit


def _row(state="needs_attention", qty=100, unit="L", period="2026-10", fac=None):
    return {"review": {"state": state}, "activity_id": "fuel.diesel", "activity_label": "Diesel",
            "ghg": {"scope_label": "Scope 1", "category_label": "Stationary combustion"},
            "raw_quantity": qty, "raw_unit": unit, "amount": 9000, "reporting_period": period,
            "facility": {"name": fac}, "decision": {"context": {"use_context": "stationary_equipment"}}}


def test_snapshot_and_diff_show_only_what_changed():
    a, b = audit.snapshot(_row()), audit.snapshot(_row(state="approved", qty=120, fac="Plant A"))
    assert audit.diff(a, b) == {"review_state": ["needs_attention", "approved"], "quantity": [100, 120], "facility": [None, "Plant A"]}
    assert audit.diff(a, a) == {}
    assert audit.snapshot(None) == {}
