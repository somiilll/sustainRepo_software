"""Row-by-row reading, three-level facility matching and AI failure handling."""
from __future__ import annotations

import pytest

from extractor_core import facilities, llm, rowscan

FACS = [{"id": "f1", "name": "Fac1"}, {"id": "f2", "name": "Fac2"}]
CTX = rowscan.Context(sheet="S", source={"file": "x.xlsx", "kind": "sheet"}, facilities=FACS)


def kinds(text):
    cands, rest = rowscan.extract_numbers(text)
    return [(c["kind"], c["value"], c["unit"] or c["currency"]) for c in cands], rest


def test_code_extracts_amounts_quantities_and_distances():
    assert kinds("Steel wire - 500000 rupees") == ([("amount", 500000.0, "INR")], "Steel wire")
    assert kinds("300 km, 2t")[0] == [("distance", 300.0, "km"), ("quantity", 2.0, "t")]
    assert kinds("Diesel consumption 2000 l") == ([("quantity", 2000.0, "l")], "Diesel consumption")
    assert kinds("Cost 5 lakh rupees")[0] == [("amount", 500000.0, "INR")]


def test_a_bare_number_is_never_treated_as_rupees():
    (cand,), rest = rowscan.extract_numbers("Paper 100")[0], "Paper"
    assert cand["kind"] == "bare" and cand["currency"] is None


def test_codes_and_dates_are_not_numbers():
    assert kinds("Invoice INV-2024-001 cement 40 MT")[0] == [("quantity", 40.0, "MT")]
    assert rowscan.extract_numbers("Fac1 steel")[0] == []


@pytest.mark.parametrize("name", ["Fac1", "FAC 1", "fac-1"])
def test_exact_normalised_match_is_automatic(name):
    assert facilities.match_name(name, FACS)["level"] == "exact"


def test_plant_site_unit_facility_are_not_interchangeable_but_recorded_aliases_work():
    assert facilities.match_name("Facility 1", FACS) is None and facilities.match_name("Plant 1", FACS) is None
    with_alias = [{"id": "f1", "name": "Fac1", "aliases": ["Facility 1"]}, {"id": "f2", "name": "Fac2"}]
    assert facilities.match_name("facility-1", with_alias)["level"] == "alias"
    assert facilities.match_name("Facility 1", FACS, alias_of=lambda n: "f1")["level"] == "alias"      # confirmed by the customer earlier
    near = facilities.match_name("fac11", FACS)
    assert near["level"] == "approximate" and near["id"] == "f1"
    item = {"facility_hint": "fac11", "source": {"kind": "sheet"}, "facility_default": {"id": "f2", "name": "Fac2"}}
    got = facilities.resolve(item, FACS)
    assert got["id"] is None and got["suggestion"]["id"] == "f1"            # never auto-assigned, default does not override a named facility


def test_default_applies_only_to_rows_without_a_facility():
    named = {"facility_hint": "FAC 1", "source": {"kind": "sheet"}, "facility_default": {"id": "f2", "name": "Fac2"}}
    blank = {"facility_hint": None, "source": {"kind": "sheet"}, "facility_default": {"id": "f2", "name": "Fac2"}}
    assert facilities.resolve(named, FACS)["id"] == "f1"
    assert facilities.resolve(blank, FACS)["id"] == "f2"


def test_every_row_keeps_its_number_and_a_state(monkeypatch):
    monkeypatch.setattr(llm, "enabled", lambda: False)
    rows = [(2, ["Steel wire - 500000 rupees", "FAC 1"]), (5, ["Just a note"]), (7, ["Paper", 100]), (9, ["Zero", 0])]
    items, zero = rowscan.scan_rows(rows, CTX)
    metrics: dict = {}
    rowscan.interpret(items, metrics, use_ai=True)
    by_row = {i["source"]["row"]: i for i in items}
    assert zero == [9] and set(by_row) == {2, 5, 7}
    assert by_row[2]["amount"] == 500000 and by_row[2]["facility_hint"] == "FAC 1" and by_row[2]["read_state"] == "extracted"
    assert by_row[5]["read_state"] == "unreadable"
    assert by_row[7]["processing_error"] and by_row[7]["read_state"] == "failed"      # AI needed but unreachable


def test_ai_answers_are_validated_against_the_row(monkeypatch):
    monkeypatch.setattr(llm, "enabled", lambda: True)
    answer = {"rows": [{"row": 7, "numbers": [{"id": 1, "role": "quantity", "unit": "kg", "unit_printed": True, "currency": ""}]},
                       {"row": 8, "numbers": [{"id": 1, "role": "amount", "unit": "", "unit_printed": False, "currency": ""}]}]}
    monkeypatch.setattr(llm, "call_json", lambda *a, **k: (answer, {"provider": "openai", "model": "m", "failures": []}))
    items, _ = rowscan.scan_rows([(7, ["Paper", 100]), (8, ["Cement", 250])], CTX)
    rowscan.interpret(items, {}, use_ai=True)
    paper, cement = items
    assert paper["quantity"] == 100 and paper["read_state"] == "needs_attention"      # 'kg' is not printed in the row: assumed, so confirm
    assert cement["amount"] == 250 and any("Currency not stated" in n for n in cement["read_notes"])


@pytest.mark.parametrize("status,body,kind", [(429, '{"error":{"code":"insufficient_quota"}}', "no_credit"), (429, "Too many requests", "rate_limit"),
                                              (401, "bad key", "auth"), (503, "overloaded", "server"), (402, "pay", "no_credit")])
def test_http_429_is_not_always_out_of_credit(status, body, kind):
    class E(Exception):
        status_code = status
    e = E(body)
    assert llm.classify_failure(e) == kind


def test_unstructured_lines_are_not_mistaken_for_a_table():
    from extractor_core import normalise
    grid = [["Steel wire - 500000 rupees", "FAC 1"], ["300 km, 2t", "Facility 1"], ["Diesel consumption 2000 l", "fac11"],
            ["Paper 100", "Fac2"], ["Electricity", 1200, "kWh", "Fac1"], ["Petrol", 50, "ltr", 5400]]
    assert normalise.tables_from_grid("S", grid, False) == []
    real = [["Item", "Qty", "Unit"], ["Diesel", 100, "L"], ["Petrol", 50, "L"]]
    assert normalise.tables_from_grid("S", real, False)[0].row_nums == [2, 3]


@pytest.mark.parametrize("text,value,currency", [("Invoice USD 1,234.50 diesel", 1234.5, "USD"), ("Fuel 12.500,75 EUR", 12500.75, "EUR"),
                                                 ("Strom CHF 1'234.50", 1234.5, "CHF"), ("Transport £2 million", 2e6, "GBP"), ("Steel 45 lakh INR", 4.5e6, "INR")])
def test_currencies_and_number_formats_are_data_driven(text, value, currency):
    (c,), _ = rowscan.extract_numbers(text)
    assert c["kind"] == "amount" and c["currency"] == currency and c["value"] == pytest.approx(value)


def test_decimal_comma_files_are_read_by_their_own_convention():
    from extractor_core.units import detect_decimal_comma
    assert detect_decimal_comma(["1.234,56 kg", "7,5 l"]) is True and detect_decimal_comma(["1,234.56", "3.5"]) is False
    assert rowscan.extract_numbers("Diesel 1,234 l", decimal_comma=True)[0][0]["value"] == pytest.approx(1.234)
    assert rowscan.extract_numbers("Diesel 1,234 l", decimal_comma=False)[0][0]["value"] == 1234


def test_titles_with_numbers_are_still_titles_but_data_lines_are_not():
    from extractor_core import normalise
    scope = [["Scope 1", "Quantity", "Unit"], ["Diesel", 100, "L"], ["Petrol", 50, "L"]]
    assert normalise.tables_from_grid("S", scope, False)[0].row_nums == [2, 3]
    years = [["Item", "FY 2025", "FY 2024"], ["Diesel", 1, 2], ["Gas", 3, 4]]
    assert len(normalise.tables_from_grid("S", years, False)) == 1
    data_lines = [["Paper 100", "Fac2"], ["Electricity", 1200, "kWh", "Fac1"], ["Petrol", 50, "ltr", 5400]]
    assert normalise.tables_from_grid("S", data_lines, False) == []


def test_summary_rows_are_told_apart_from_activity_rows_that_start_with_total():
    from extractor_core.layout import is_summary_row
    above = [["Diesel", 100], ["Petrol", 50]]
    assert is_summary_row(["Grand total", 150], lambda: above)
    assert is_summary_row(["Total", 12345], lambda: above)                    # label only: nothing of its own to record
    assert is_summary_row(["Total fuel", 150], lambda: above)                 # a sum of the rows above
    assert not is_summary_row(["Total waste 500 kg", 500], lambda: above)     # real activity that merely starts with 'Total'
    assert not is_summary_row(["Diesel", 100], lambda: above)


def test_every_source_row_gets_a_disposition_and_nothing_is_dropped(tmp_path):
    import openpyxl
    from extractor_core.pipeline import Engine
    wb = openpyxl.Workbook()
    ws = wb.active
    for r in [["Fuel register"], ["Item", "Qty", "Unit"], ["Diesel", 100, "L"], ["Petrol", 50, "L"], ["Total fuel", 150], ["Total waste 500 kg"],
              ["Spare", 0, "L"], [None], ["a stray note"]]:
        ws.append(r)
    path = tmp_path / "mixed.xlsx"
    wb.save(path)
    res = Engine(None, org="t", facilities=[], use_ai=False).run([str(path)], facility_choices={})
    sheet = res["documents"][0]["sheets"][0]
    assert sheet["non_empty_rows"] == 8
    assert sum(sheet.get(k, 0) for k in ("read", "read_row_by_row", "needs_attention", "couldnt_read", "failed", "summary", "zero", "structure")) == 8
    assert res["metrics"]["import_report"]["reconciled"]
    shown = {r["row"]: r["disposition"] for r in res["source_rows"]}
    assert shown[1] == "structure" and shown[5] == "summary"
    read_rows = {r["source"]["row"] for r in res["rows"] if not r.get("derived")}
    assert {3, 4, 6, 9} <= read_rows                                           # 'Total waste 500 kg' and the stray note are kept


@pytest.mark.parametrize("cell,value", [("12.5 KL", 12.5), ("Rs. 678987", 678987.0), ("30000 ruppe", 30000.0), ("(500)", -500.0), ("1.234,56", 1234.56), (7, 7.0)])
def test_strict_values_accept_numbers_with_currency_or_unit(cell, value):
    from extractor_core.values import parse_value
    assert parse_value(cell) == pytest.approx(value)


@pytest.mark.parametrize("cell", ["fac1", "2026-09", "FY 2026-2027", "INV-2024-001", "300km , 2t", "Plant 7", None, True])
def test_identifiers_periods_and_codes_are_never_plain_numbers(cell):
    from extractor_core.values import parse_value
    assert parse_value(cell) is None


def _sheet(tmp_path, rows, name="m.xlsx"):
    import openpyxl
    wb = openpyxl.Workbook()
    for r in rows:
        wb.active.append(r)
    path = tmp_path / name
    wb.save(path)
    return path


def _run(path, facilities=None):
    from extractor_core.pipeline import Engine
    return Engine(None, org="t", facilities=facilities or FACS, use_ai=False).run([str(path)], facility_choices={})


def test_a_data_row_taken_as_header_with_a_facility_name_as_pivot_item_is_rejected_and_every_row_is_read(tmp_path):
    rows = [["Steel wire - 5000 rupees", None, "Fac2", None, "FY 26-27"], [None, "Cargo", "Fac1", 30, "2026-09"]]
    rows += [[f"item {i}", f"Spare part {i}", "Fac2" if i % 2 else "Fac1", 1000 + i, "2026-09"] for i in range(8)]
    res = _run(_sheet(tmp_path, rows))
    sheet = res["documents"][0]["sheets"][0]
    assert sheet["non_empty_rows"] == 10 and res["metrics"]["import_report"]["reconciled"]
    assert {r["source"]["row"] for r in res["rows"] if not r.get("derived")} == set(range(1, 11))
    assert not any((r["original_text"] or "").strip().lower() in ("fac1", "fac2") for r in res["rows"])


def test_layout_rows_that_contradict_their_source_row_are_read_again(tmp_path):
    rows = [["Item", "Qty", "Unit"]] + [[f"Diesel {i}", 100 + i, "L"] for i in range(6)]
    path = _sheet(tmp_path, rows)
    from extractor_core import crosscheck, layout
    real = layout.apply_spec

    def corrupt(t, spec, src):
        items = real(t, spec, src)
        items[2]["description"] = "Fac1"                 # one row wrongly read as a facility name
        items[3]["quantity"] = 99999.0                   # one value that is not in the row
        return items
    layout.apply_spec = corrupt
    try:
        res = _run(path)
    finally:
        layout.apply_spec = real
    sheet = res["documents"][0]["sheets"][0]
    assert sheet["re_read_rows"] == 2 and sheet["read"] == 4 and sheet.get("read_row_by_row", 0) + sheet.get("needs_attention", 0) >= 2
    assert {r["source"]["row"] for r in res["rows"] if not r.get("derived")} == set(range(2, 8))
    assert crosscheck.check_item({"description": "Fac1", "source": {"row": 1}, "quantity": None, "raw": {}}, ["Fac1", 5], rowscan.Context("S", {}, facilities=FACS), set())["issues"]


def test_import_report_keeps_source_ignored_and_failed_apart(tmp_path):
    rows = [["Item", "Qty", "Unit"], ["Diesel", 100, "L"], ["Petrol", 50, "L"], ["Total", 150], ["Spare", 0, "L"], ["note"]]
    rep = _run(_sheet(tmp_path, rows))["metrics"]["import_report"]
    assert rep["source_rows"] == 6 and rep["ignored"] == {"structure": 1, "summary": 1, "zero": 0, "total": 2}     # an explicit 0 in a table is a reading, kept
    assert rep["reconciled"] and rep["unaccounted"] == 0 and rep["technical_failures"] == 0


def test_items_carry_source_cell_references(tmp_path):
    res = _run(_sheet(tmp_path, [["Item", "Qty", "Unit"], ["Diesel", 100, "L"], ["Petrol", 50, "L"]]))
    cells = [r["source"]["cells"] for r in res["rows"] if not r.get("derived")]
    assert {"description": "A2", "quantity": "B2", "unit": "C2"}.items() <= cells[0].items() or cells[0].get("quantity") == "B2"
