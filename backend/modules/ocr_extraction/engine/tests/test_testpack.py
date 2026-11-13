"""Whole-pipeline tests on the Sustainability OCR test pack (golden/testpack/upload). No AI and no network:
the classifier is a fake and the layout comes from the built-in column aliases, so every run is free and repeatable.
The reviewer answer key is golden/testpack/reviewer/Answer_Key.md.
"""
from __future__ import annotations

import shutil
from datetime import date
from pathlib import Path

import pytest

from extractor_core import llm
from extractor_core.decider.base import Answer
from extractor_core.pipeline import Engine

from conftest import FakeProvider

PACK = Path(__file__).resolve().parents[2] / "golden" / "testpack" / "upload"
WORKBOOK = PACK / "01_Sustainability_Mixed_Formats.xlsx"
TODAY = date(2026, 11, 9)                        # the pack's reference date
FACILITIES = [   # as in the answer key; Plant Z stays unknown
    {"id": "TP-A", "name": "Plant A - Chakan", "aliases": ["Chakan Plant"], "consumer_numbers": ["DEMO-A-001"], "gstins": [], "address_keywords": ["Chakan"]},
    {"id": "TP-B", "name": "Plant B - Vadodara", "aliases": [], "consumer_numbers": ["DEMO-B-002"], "gstins": [], "address_keywords": ["Vadodara"]},
    {"id": "TP-HO", "name": "Corporate Office", "aliases": [], "consumer_numbers": [], "gstins": [], "address_keywords": []},
]

pytestmark = pytest.mark.skipif(not WORKBOOK.exists(), reason="test pack not found")

TABLE = {
    "well-to-tank": ("fuel_combustion", "fuel.upstream_wtt", None),
    "diesel": ("fuel_combustion", "fuel.diesel", "stationary_equipment"),
    "electricity": ("electricity", "elec.grid", None),
    "meter readings": ("electricity", "elec.grid", None),
    "water": ("water", "water.municipal", None),
    "landfill": ("waste", "waste.msw_landfill", None),
    "waste": ("waste", "waste.msw_landfill", None),
    "refrigerant": ("refrigerant_fugitive", "refrigerant.r32", None),
    "software": ("purchased_services", "service.telecom_it", None),
    "solvent": ("purchased_goods", "goods.chemicals", None),
    "copper": ("purchased_goods", "goods.copper", None),
}


@pytest.fixture(scope="module")
def result(tmp_path_factory, monkeypatch=None):
    # no key => no layout AI call: the aliases must read the workbook on their own
    import os
    old = os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        eng = Engine(providers=[FakeProvider(TABLE)], reference_date=TODAY, facilities=FACILITIES)
        work = tmp_path_factory.mktemp("pack") / WORKBOOK.name
        shutil.copy(WORKBOOK, work)
        return eng.run([work], mode="fast")
    finally:
        if old:
            os.environ["ANTHROPIC_API_KEY"] = old


def parents(res, sheet=None, row=None):
    out = [r for r in res["rows"] if not r.get("derived")]
    if sheet:
        out = [r for r in out if (r.get("source") or {}).get("sheet") == sheet]
    if row is not None:
        out = [r for r in out if (r.get("source") or {}).get("row") == row]
    return out


def codes(r):
    return {c["code"] for c in r["checks"] if c["level"] != "info"}


def test_the_workbook_is_read_without_stopping(result):
    assert result["documents"][0]["status"] == "ok"
    assert len(parents(result)) >= 45                                  # four sheets, many lines


def test_impossible_and_future_dates_are_flagged(result):
    assert "bad_date" in codes(parents(result, "Invoice Register", 11)[0])          # R10: 31/02/2026
    r12 = parents(result, "Invoice Register", 12)[0]                                # R11: 2027-10-15
    assert "future_date" in codes(r12) and "date_period_conflict" in codes(r12)


def test_numbers_that_cannot_be_trusted_are_not_silently_parsed(result):
    assert "bad_number" in codes(parents(result, "Invoice Register", 14)[0])        # R13: '1.250,50'
    r15 = parents(result, "Invoice Register", 15)[0]                                # R14: '1O0' kg
    assert "bad_number" in codes(r15) and r15["review_status"] != "ready"


def test_a_unit_written_inside_a_cell_is_honoured(result):                          # M02: '0.55 KL' in a litres row
    sept = [r for r in parents(result, "Monthly Matrix", 6) if r["reporting_period"] == "2026-09"][0]
    assert (sept["quantity"], sept["unit"]) == (550.0, "L")
    assert "series_outlier" not in codes(sept)


def test_a_blank_or_dash_month_is_reported_as_missing_not_zero(result):             # M03 and M04, September
    for row in (7, 8):
        rs = parents(result, "Monthly Matrix", row)
        assert len(rs) == 3 and all("series_gap" in codes(r) for r in rs)
        assert not any(r["reporting_period"] == "2026-09" for r in rs)             # nothing was invented for September


def test_mwh_is_converted_and_kept_per_month(result):                               # M07
    kwh = sorted(r["quantity"] for r in parents(result, "Monthly Matrix", 11))
    assert kwh == [9500.0, 10000.0, 10200.0, 11000.0]


def test_explicit_upstream_fuel_is_flagged_against_the_automatic_one(result):       # R19 vs the auto row for R01
    assert "double_count_upstream" in codes(parents(result, "Invoice Register", 20)[0])


def test_wrong_dimension_and_unknown_facility_stay_flagged(result):                  # R21 and R22
    assert "unit_dimension" in codes(parents(result, "Invoice Register", 22)[0])
    assert "facility_unmatched" in codes(parents(result, "Invoice Register", 23)[0])


def test_credit_note_and_negative_quantity_are_flagged(result):                      # R08 and R23
    assert "negative" in codes(parents(result, "Invoice Register", 9)[0])
    assert "negative" in codes(parents(result, "Invoice Register", 24)[0])


def test_explicit_zero_is_preserved(result):                                         # R09
    r10 = parents(result, "Invoice Register", 10)[0]
    assert r10["quantity"] == 0 and r10["review_status"] != "ask"


def test_the_subtotal_row_is_not_imported_as_a_purchase(result):                     # Site Log SUBTOTAL
    assert not any("subtotal" in (r.get("extracted_item") or "").lower() for r in parents(result, "Site Log"))


def test_meter_reading_sheet_gives_one_row_per_reading_not_one_per_column(result):  # E01-E07
    rows = parents(result, "Meter Readings")
    assert sorted(r["quantity"] for r in rows) == [600.0, 1000.0, 2500.0, 2600.0, 3000.0, 11000.0, 11000.0]
    assert not any((r.get("extracted_item") or "").lower() in ("opening", "closing", "multiplier", "record id") for r in rows)


def test_a_flagged_row_is_never_ready(result):
    for r in result["rows"]:
        if codes(r) & {"bad_number", "bad_date", "future_date", "possible_duplicate", "series_gap", "document_check"}:
            assert r["review_status"] != "ready", r["extracted_item"]
