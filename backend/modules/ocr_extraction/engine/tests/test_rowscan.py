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


def test_generic_word_alias_is_automatic_but_similarity_is_not():
    assert facilities.match_name("Facility 1", FACS)["level"] == "alias"
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
    assert zero == 1 and set(by_row) == {2, 5, 7}
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


def test_credit_failures_are_not_retried_and_fall_back(monkeypatch):
    calls = {"openai": 0, "claude": 0}

    def fake(provider, status):
        def once(*a, **k):
            calls[provider] += 1
            if provider == "openai":
                e = Exception("insufficient_quota")
                e.status_code = status
                raise e
            return {"ok": True}, {"input_tokens": 1, "output_tokens": 1}
        return once

    monkeypatch.setattr(llm, "_ONCE", {"openai": fake("openai", 429), "claude": fake("claude", 0)})
    monkeypatch.setattr(llm, "provider_enabled", lambda p: True)
    monkeypatch.setattr(llm, "_blocked", {})
    data, usage = llm.call_json("interpret", "s", "c", {})
    assert data == {"ok": True} and usage["provider"] == "claude" and calls["openai"] == 1
    assert usage["failures"][0]["kind"] == "no_credit"
    llm.call_json("interpret", "s", "c", {})
    assert calls["openai"] == 1                                       # blocked: not even tried again


def test_unstructured_lines_are_not_mistaken_for_a_table():
    from extractor_core import normalise
    grid = [["Steel wire - 500000 rupees", "FAC 1"], ["300 km, 2t", "Facility 1"], ["Diesel consumption 2000 l", "fac11"],
            ["Paper 100", "Fac2"], ["Electricity", 1200, "kWh", "Fac1"], ["Petrol", 50, "ltr", 5400]]
    assert normalise.tables_from_grid("S", grid, False) == []
    real = [["Item", "Qty", "Unit"], ["Diesel", 100, "L"], ["Petrol", 50, "L"]]
    assert normalise.tables_from_grid("S", real, False)[0].row_nums == [2, 3]
