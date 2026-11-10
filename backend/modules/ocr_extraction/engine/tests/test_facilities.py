"""The customer chooses facilities before extraction; nothing is guessed behind their back."""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import pytest

from extractor_core import facilities
from extractor_core.memory import Memory
from extractor_core.pipeline import Engine

from conftest import FakeProvider
from test_testpack import FACILITIES, TABLE, TODAY, WORKBOOK

pytestmark = pytest.mark.skipif(not WORKBOOK.exists(), reason="test pack not found")


def test_peek_lists_the_facility_names_in_the_sheet_with_suggestions():
    peek = facilities.peek_sheet(WORKBOOK, FACILITIES)
    reg = next(t for t in peek["tables"] if t["sheet"] == "Invoice Register")
    assert reg["facility_column"] == "Facility"
    found = {n["name"]: n["suggestion"] and n["suggestion"]["id"] for n in reg["names"]}
    assert found["Plant A - Chakan"] == "TP-A" and found["Plant B - Vadodara"] == "TP-B" and found["Corporate Office"] == "TP-HO"
    assert found["Chakan Plant"] == "TP-A" and found["Plant Z - Unknown"] is None                                   # unknown stays unmatched: the customer must choose


def test_a_remembered_mapping_is_suggested_next_time():
    mem = Memory()
    mem.save_facility_alias("org", "Plant Z - Unknown", "TP-B")
    peek = facilities.peek_sheet(WORKBOOK, FACILITIES, alias_of=lambda n: mem.get_facility_alias("org", n))
    reg = next(t for t in peek["tables"] if t["sheet"] == "Invoice Register")
    z = next(n for n in reg["names"] if n["name"] == "Plant Z - Unknown")
    assert z["suggestion"]["id"] == "TP-B" and z["suggestion"]["method"] == "you chose this before"
    mem.save_facility_alias("org", "Plant Z - Unknown", None)
    assert mem.get_facility_alias("org", "plant  z -  unknown") is None


def test_apply_choice_order_column_then_sheet_then_default():
    items = [{"facility_hint": "Plant A", "source": {"sheet": "S1"}}, {"facility_hint": "Plant Z - Unknown", "source": {"sheet": "S1"}},
             {"facility_hint": None, "source": {"sheet": "S2"}}, {"facility_hint": None, "source": {"sheet": "S3"}}]
    facilities.apply_choice(items, {"map": {"Plant A": "TP-A", "Plant Z - Unknown": None}, "sheets": {"S2": "TP-B"}, "default": "TP-HO"}, FACILITIES)
    got = [facilities.fixed_facility(i) for i in items]
    assert [g["id"] for g in got] == ["TP-A", None, "TP-B", "TP-HO"]
    assert got[0]["confidence"] == 1.0 and got[1]["method"] == "left unassigned by you"
    other = [{"facility_hint": "Plant A"}]
    facilities.apply_choice(other, None, FACILITIES)
    assert facilities.fixed_facility(other[0]) is None                # no choice made: normal matching applies


@pytest.fixture(scope="module")
def run_with_choice(tmp_path_factory):
    old = os.environ.pop("ANTHROPIC_API_KEY", None)
    try:
        work = tmp_path_factory.mktemp("fac") / WORKBOOK.name
        shutil.copy(WORKBOOK, work)
        eng = Engine(providers=[FakeProvider(TABLE)], reference_date=TODAY, facilities=FACILITIES)
        choice = {work.name: {"map": {"Plant Z - Unknown": "TP-B", "Plant A - Chakan": "TP-HO"}, "default": None}}
        return eng.run([work], facility_choices=choice)
    finally:
        if old:
            os.environ["ANTHROPIC_API_KEY"] = old


def facility_of(res, sheet, row):
    r = next(r for r in res["rows"] if not r.get("derived") and (r.get("source") or {}).get("sheet") == sheet and r["source"].get("row") == row)
    return r["facility"]


def test_a_customer_choice_overrides_what_the_file_says(run_with_choice):
    z = facility_of(run_with_choice, "Invoice Register", 23)            # R22 'Plant Z' was unknown, the customer assigned it
    assert z["id"] == "TP-B" and z["method"] == "chosen by you" and z["confidence"] == 1.0
    a = facility_of(run_with_choice, "Invoice Register", 2)             # the file says Plant A, the customer said Corporate Office
    assert a["id"] == "TP-HO"


def test_a_name_the_customer_did_not_map_is_left_unassigned_not_auto_matched(run_with_choice):
    b = facility_of(run_with_choice, "Invoice Register", 4)             # 'Plant B - Vadodara' was not in the map and the default is None
    assert b["id"] is None and b["method"] == "left unassigned by you"
