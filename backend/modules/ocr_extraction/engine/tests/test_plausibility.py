"""Plausibility checks and a whole document pipeline with the vision AI mocked (no network, no credits)."""
from __future__ import annotations

from datetime import date

import pytest

from extractor_core import extract, plausibility
from extractor_core.memory import Memory
from extractor_core.pipeline import Engine

from conftest import FAKE_TABLE, FakeProvider

TODAY = date(2026, 11, 9)


@pytest.mark.parametrize("raw,flag", [
    ("1O0", True), ("10O", True), ("O5", True), ("1.250,50", True), ("1250,50", True), ("1l0", True),
    ("100", False), ("1,250", False), ("12,50,000", False), ("1250.50", False), ("5 l", False), ("12.5 KL", False),
    ("450 L", False), (100, False), (None, False),
])
def test_ambiguous_numbers(raw, flag):
    assert bool(plausibility.ambiguous_number(raw)) is flag


def test_dates_future_impossible_and_out_of_period():
    codes = lambda it: {c for c, _ in plausibility.item_issues(it, TODAY)}          # noqa: E731
    assert "future_date" in codes({"date": "2027-10-15"})
    assert "bad_date" in codes({"raw": {"date": "31/02/2026"}, "date": None})
    assert "date_period_conflict" in codes({"date": "2027-10-15", "period_hint": "2026-10"})
    assert codes({"date": "2026-11-05", "period_hint": "2026-10"}) == set()           # a bill dated just after its month is normal
    assert codes({"date": "2026-10-20", "period_hint": "2026-10"}) == set()


def _row(i, qty, period, unit="L", col="Jul", sheet="S", activity="fuel.diesel", amount=None):
    return {"row_id": f"r{i}", "item_id": f"i{i}", "derived": False, "file": "f.xlsx", "activity_id": activity, "quantity": qty, "unit": unit,
            "amount": amount, "reporting_period": period, "source": {"sheet": sheet, "row": 6, "column": col}, "checks": [],
            "review_status": "ready", "calc": {"formula_id": "x"}, "decision": {"confidence": 0.99}, "facility": {"id": "F", "confidence": 1.0},
            "period": {"confidence": 0.95}, "ghg": {"scope": "scope_1"}}


def _items(rows):
    return [{"item_id": r["item_id"], "source": r["source"], "line_confidence": 0.97} for r in rows]


def _run(rows, history=None):
    plausibility.apply(_items(rows), rows, [], history=history, today=TODAY)
    return {r["row_id"]: {c["code"] for c in r["checks"]} for r in rows}


def test_series_gap_and_outlier():
    rows = [_row(1, 450, "2026-07"), _row(2, 500, "2026-08"), _row(3, 0.55, "2026-09"), _row(4, 600, "2026-10")]
    out = _run(rows)
    assert out["r3"] == {"series_outlier"} and out["r1"] == set()
    assert all(r["review_status"] != "ready" for r in rows if r["row_id"] == "r3")
    gap = [_row(1, 120, "2026-07"), _row(2, 125, "2026-08"), _row(3, 130, "2026-10")]
    assert all("series_gap" in c for c in _run(gap).values())


def test_possible_duplicate_across_files_in_one_upload():
    a, b = _row(1, 100, "2026-10", amount=9000), _row(2, 100, "2026-10", amount=9000)
    b["file"], b["source"] = "invoice.pdf", {"page": 1}
    out = _run([a, b])
    assert out["r1"] == set() and out["r2"] == {"possible_duplicate"}


def test_history_outlier_uses_only_earlier_approved_months():
    mem = Memory()
    r = _row(1, 5000, "2026-10", activity="fuel.diesel")
    key = plausibility.history_key(r)
    for p, q in (("2026-07", 450), ("2026-08", 500), ("2026-09", 550)):
        mem.add_history("org", key, p, q, "L", "job0", "r")
    assert _run([r], history=lambda k: mem.get_history("org", k))["r1"] == {"history_outlier"}
    ok = _row(2, 520, "2026-10")
    assert _run([ok], history=lambda k: mem.get_history("org", k))["r2"] == set()
    assert _run([_row(3, 5000, "2026-10")], history=lambda k: [("2026-09", 500, "L")])["r3"] == set()     # one month is not a pattern


# ------------------------------------------------------------------ a whole utility-bill document, vision AI mocked
ELEC = {
    "document_type": "utility_bill", "language": "en", "vendor_name": "Demo Power Co", "vendor_gstin": None, "buyer_name": "Demo Industries",
    "invoice_number": "GRID-2026-1002", "invoice_date": "2026-10-20", "billing_period_start": "2026-09-16", "billing_period_end": "2026-10-14",
    "consumer_number": "DEMO-B-002", "currency": "INR", "service_address": "Plant A - Chakan",
    "meter": {"previous_reading": 40000, "current_reading": 42500, "units_billed": 2600, "multiplying_factor": 1},
    "line_items": [{"description": "Electricity energy charges", "description_en": "Electricity energy charges", "quantity": 2600, "unit": "kWh",
                    "amount": 20800, "nature": "electricity", "confidence": 0.95}],
    "totals": {"subtotal": 20800, "grand_total": 24544},
}


def _mock_document(monkeypatch, inv):
    def ingest(self, path, src, think, metrics):
        chk = extract.cross_check(inv)
        items = extract.to_items(inv, src, 0)
        for it in items:
            it["doc_checks"] = chk
        return items, {"pages": 1, "warnings": [], "checks": chk, "invoices": 1, "document_types": [inv["document_type"]]}
    monkeypatch.setattr(Engine, "_ingest_document", ingest)


def test_meter_mismatch_on_a_bill_reaches_the_row_and_blocks_ready(monkeypatch, tmp_path):
    _mock_document(monkeypatch, ELEC)
    f = tmp_path / "03_Electricity_Bill.pdf"
    f.write_bytes(b"%PDF-1.4 test")
    res = Engine(providers=[FakeProvider(FAKE_TABLE)], reference_date=TODAY).run([f])
    main = next(r for r in res["rows"] if not r.get("derived"))
    assert main["raw_quantity"] == 2600 and main["raw_unit"] == "kWh"
    assert "document_check" in {c["code"] for c in main["checks"]}
    assert any("Meter readings give 2,500" in c["message"] for c in main["checks"])
    assert main["review_status"] != "ready"
    assert main["period"]["allocation"] and {a["period"] for a in main["period"]["allocation"]} == {"2026-09", "2026-10"}   # not all in one month


def test_a_clean_bill_still_goes_through_untouched(monkeypatch, tmp_path):
    clean = {**ELEC, "meter": {"previous_reading": 40000, "current_reading": 42600, "units_billed": 2600, "multiplying_factor": 1}}
    _mock_document(monkeypatch, clean)
    f = tmp_path / "clean.pdf"
    f.write_bytes(b"%PDF-1.4 test2")
    res = Engine(providers=[FakeProvider(FAKE_TABLE)], reference_date=TODAY).run([f])
    main = next(r for r in res["rows"] if not r.get("derived"))
    assert "document_check" not in {c["code"] for c in main["checks"]}
