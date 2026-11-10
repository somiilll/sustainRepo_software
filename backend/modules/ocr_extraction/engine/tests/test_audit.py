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


def test_log_is_append_only_newest_first_and_scoped_by_org_and_job(tmp_path):
    log = audit.AuditLog(tmp_path / "a.db")
    log.record("org1", "job1", "edited", item_id="i1", label="Diesel", changes={"quantity": [100, 120]}, ts=1)
    log.record("org1", "job1", "approved", item_id="i1", actor="meera", ts=2)
    log.record("org1", "job1", "approved", item_id="i2", ts=3)
    log.record("org2", "job1", "approved", item_id="i1", ts=4)                # another organisation never shows up
    mine = log.for_item("org1", "job1", "i1")
    assert [e["action"] for e in mine] == ["approved", "edited"]
    assert mine[0]["actor"] == "meera" and mine[1]["changes"] == {"quantity": [100, 120]}
    assert len(log.for_job("org1", "job1")) == 3 and len(log.recent("org2")) == 1
