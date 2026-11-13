"""Excel/CSV understanding: merged cells, title rows, months across columns, several tables per sheet, hidden sheets."""
from __future__ import annotations

import openpyxl
import pytest

from extractor_core import layout, normalise


def _apply(path, mem=None):
    out = []
    for t in normalise.read_tables(path):
        spec = layout.map_table(t, "org", mem, False, {"llm_calls": []})
        out.append((t, spec, layout.apply_spec(t, spec, {"file": path.name, "kind": "sheet"}) if spec["shape"] != "unknown" else []))
    return out


def test_ledger_with_title_and_merged_header(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Fuel"
    ws["A1"] = "Diesel purchase register FY 2025-26"
    ws.merge_cells("A1:E1")
    ws.append([])
    ws.append(["Date", "Description", "Qty", "Unit", "Amount (Rs)"])
    ws.append(["2025-04-03", "HSD for DG set", 500, "Ltr", 45000])
    ws.append(["2025-05-03", "HSD for DG set", 450, "Ltr", 41000])
    p = tmp_path / "fuel.xlsx"
    wb.save(p)
    [(t, spec, items)] = _apply(p)
    assert spec["shape"] == "ledger"
    assert t.header[:3] == ["Date", "Description", "Qty"]
    assert len(items) == 2
    assert items[0]["quantity"] == 500 and items[0]["unit"].lower().startswith("l")
    assert items[0]["amount"] == 45000


def test_wide_months_unpivot_uses_financial_year(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Utilities"
    ws.append(["Monthly consumption FY 2025-26"])
    ws.append(["Parameter", "Unit", "Apr", "May", "Jun", "Jan", "Feb"])
    ws.append(["Grid electricity", "kWh", 1000, 1100, 1200, 900, 950])
    ws.append(["Water", "KL", 50, 55, 60, 40, 45])
    p = tmp_path / "wide.xlsx"
    wb.save(p)
    [(t, spec, items)] = _apply(p)
    assert spec["shape"] == "wide_months"
    assert len(items) == 10
    periods = {(i["description"], i["period_hint"]) for i in items}
    assert ("Grid electricity", "2025-04") in periods
    assert ("Grid electricity", "2026-01") in periods          # Jan belongs to the second calendar year of the FY


def test_two_tables_on_one_sheet(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Description", "Qty", "Unit"])
    ws.append(["Diesel", 100, "L"])
    ws.append(["Petrol", 20, "L"])
    ws.append([])
    ws.append([])
    ws.append(["Item", "Quantity", "UOM", "Vendor"])
    ws.append(["Steel sheets", 1500, "kg", "JSW"])
    ws.append(["Copper wire", 200, "kg", "Hindalco"])
    p = tmp_path / "two.xlsx"
    wb.save(p)
    res = _apply(p)
    assert len(res) == 2
    assert [len(r[2]) for r in res] == [2, 2]
    assert res[1][2][0]["vendor"] == "JSW"


def test_hidden_sheet_marked(tmp_path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Description", "Qty", "Unit"])
    ws.append(["Diesel", 100, "L"])
    h = wb.create_sheet("old")
    h.append(["Description", "Qty", "Unit"])
    h.append(["Diesel", 90, "L"])
    h.sheet_state = "hidden"
    p = tmp_path / "hidden.xlsx"
    wb.save(p)
    res = _apply(p)
    hidden = [it for _, _, its in res for it in its if it["source"].get("hidden_sheet")]
    assert len(hidden) == 1


def test_csv_ledger(tmp_path):
    p = tmp_path / "x.csv"
    p.write_text('Item,Quantity,UOM,Amount\n"Diesel, HSD",120,Litre,10800\nElectricity,5000,kWh,40000\n', encoding="utf-8")
    [(t, spec, items)] = _apply(p)
    assert spec["shape"] == "ledger"
    assert items[0]["description"] == "Diesel, HSD"
    assert items[1]["quantity"] == 5000


def test_layout_remembered_by_fingerprint(tmp_path, mem):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Description", "Qty", "Unit"])
    ws.append(["Diesel", 100, "L"])
    p = tmp_path / "a.xlsx"
    wb.save(p)
    [t] = normalise.read_tables(p)
    s1 = layout.map_table(t, "org", mem, False, {"llm_calls": []})
    s2 = layout.map_table(t, "org", mem, False, {"llm_calls": []})
    assert s1["shape"] == s2["shape"] == "ledger"
    assert layout.fingerprint(t) == layout.fingerprint(normalise.read_tables(p)[0])
