"""Classification -> formula fields -> companions -> checks -> review status, with fake classifiers."""
from __future__ import annotations

import pytest

from extractor_core import fields, units
from extractor_core.config import load
from extractor_core.decider.cascade import Classifier
from extractor_core.group import group_items
from extractor_core.pipeline import Engine
from extractor_core.validate import match_facility, resolve_period

from conftest import FAKE_TABLE, FakeProvider, item


def rows_for(eng, it, decision=None):
    it.setdefault("item_id", "d1-0")
    group_items([it])
    dec = decision or eng.classifier.classify(it)
    return eng.rows_for_item(it, dec)


# ------------------------------------------------------------------ units
@pytest.mark.parametrize("q,u,exp_q,exp_u,dim", [
    (1, "KL", 1000, "L", "volume"), (2, "MT", 2000, "kg", "mass"), (1, "MWh", 1000, "kWh", "energy"),
    (10, "SCM", 10, "m3", "gas_volume"), (100, "CCF", 283.168, "m3", "gas_volume"), (5, "Ltrs.", 5, "L", "volume"),
])
def test_unit_conversion(q, u, exp_q, exp_u, dim):
    qc, uc, d, _ = units.to_canonical(q, u)
    assert qc == pytest.approx(exp_q, rel=1e-3) and uc == exp_u
    assert d in (dim, "volume") if dim == "gas_volume" else d == dim


def test_indian_number_parsing():
    assert units.parse_number("1,23,456.50") == 123456.5
    assert units.parse_number("₹ 2,500") == 2500


# ------------------------------------------------------------------ formula fields
def test_fuel_with_litres_maps_to_qty_and_unit(fake):
    eng = Engine(providers=[fake])
    [main, wtt] = rows_for(eng, item(description="HSD diesel for DG set", quantity=500, unit="Ltr", amount=45000))
    assert main["ghg"]["scope"] == "scope_1"
    assert main["calc"]["fields"] == {"qty": 500, "qty_unit": "L"} or main["calc"]["fields"]["qty"] == 500
    assert wtt["derived"] and wtt["parent_id"] == main["row_id"] and wtt["ghg"]["category"] == "cat_3"
    assert wtt["amount"] is None                       # money is never counted twice


def test_scope1_without_quantity_needs_attention(fake):
    eng = Engine(providers=[fake])
    rs = rows_for(eng, item(description="Diesel for DG set", amount=9000))
    main = rs[0]
    assert main["calc"]["formula_id"] is None
    assert any(c["code"] == "needs_quantity" for c in main["checks"])
    assert main["review_status"] != "ready"


def test_lump_sum_quantity_is_dropped():
    act = load().taxonomy.get("fuel.diesel")
    ghg = load().taxonomy.resolve_ghg("fuel.diesel", {"use_context": "company_vehicle"})
    c = fields.build_calc(act, ghg, item(description="Diesel reimbursement", quantity=1, unit="L", amount=13025718))
    assert c["formula_id"] is None and any("lump sum" in n for n in c["notes"])


def test_co2_extinguisher_capacity_times_count():
    act = load().taxonomy.get("refrigerant.co2_extinguisher")
    ghg = load().taxonomy.resolve_ghg(act["id"])
    c = fields.build_calc(act, ghg, item(description="Refilling of CO2 type 4.5 kg fire extinguisher", quantity=5, unit="Nos"))
    assert c["formula_id"] == "s1_fugitive" and c["fields"]["qty"] == pytest.approx(22.5)


def test_electricity_gets_one_combined_c3_row(fake):
    eng = Engine(providers=[fake])
    rs = rows_for(eng, item(description="Grid electricity", quantity=225545, unit="kWh", amount=2586110))
    assert [r["ghg"]["category"] for r in rs] == ["purchased_electricity", "cat_3"]
    assert rs[1]["calc"]["fields"]["activity_value"] == 225545


def test_no_split_when_document_has_its_own_transport_line():
    eng = Engine(use_ai=False)
    it = item(description="Disposal and transport of 6.5 MT waste to landfill", quantity=6.5, unit="MT", disposal_method="landfill",
              doc={"other_lines": ["Waste transportation and hauling, Faridabad to Bandhwari"]})
    rs = rows_for(eng, it)
    assert all(r["ghg"]["category"] != "cat_4" for r in rs)


def test_all_providers_down_still_gives_rows():
    clf = Classifier(providers=[FakeProvider(FAKE_TABLE, fail=True)])
    d = clf.classify(item(description="HSD diesel for DG set", quantity=100, unit="L"))
    assert d["activity_id"] == "fuel.diesel" and d["confidence"] <= 0.8 and "AI unavailable" in d["reason"]


def test_fuel_without_use_context_asks():
    clf = Classifier(providers=[FakeProvider({"diesel": ("fuel_combustion", "fuel.diesel", None)})])
    d = clf.classify(item(description="Diesel issued", quantity=400, unit="L"))
    assert d["question"] and d["confidence"] <= 0.75


def test_grouping_collapses_repeated_items(fake):
    its = [item(description="HSD diesel", quantity=q, unit="L", vendor="IOCL", item_id=f"d-{i}") for i, q in enumerate(range(100, 200))]
    groups = group_items(its)
    assert len(groups) == 1 and len(groups[0]["item_ids"]) == 100


# ------------------------------------------------------------------ facility / period / status
def test_facility_by_consumer_number(facilities):
    f = match_facility(item(consumer_number="1775 2905 8940"), facilities)
    assert f["id"] == "F1" and f["method"] == "consumer/meter number"


def test_no_facility_is_flagged_not_defaulted(facilities):
    f = match_facility(item(facility_hint="Mathura refinery"), facilities)
    assert f["id"] is None


def test_billing_period_split():
    p = resolve_period(item(period_start="2025-09-28", period_end="2025-10-27"))
    assert p["reporting_period"] == "2025-10"
    assert {a["period"] for a in p["allocation"]} == {"2025-09", "2025-10"}


def test_future_period_is_error(fake):
    eng = Engine(providers=[fake])
    [r, _] = rows_for(eng, item(description="Grid electricity", quantity=1000, unit="kWh", period_hint="2099-01"))
    assert any(c["code"] == "future_period" and c["level"] == "error" for c in r["checks"])


def test_unit_price_check_catches_wrong_unit(fake):
    eng = Engine(providers=[fake])
    [r, _] = rows_for(eng, item(description="HSD diesel for DG set", quantity=5, unit="L", amount=45000))
    assert any(c["code"] == "unit_price" for c in r["checks"])


# ------------------------------------------------------------------ duplicates
def test_same_file_twice_is_duplicate(tmp_path, mem):
    p1 = tmp_path / "a.csv"
    p1.write_text("Item,Quantity,UOM\nDiesel for DG set,100,L\n", encoding="utf-8")
    p2 = tmp_path / "b.csv"
    p2.write_bytes(p1.read_bytes())
    r = Engine(mem, use_ai=False).run([p1, p2])
    assert [d["status"] for d in sorted(r["documents"], key=lambda d: d["file"])] == ["ok", "duplicate"]
    r2 = Engine(mem, use_ai=False).run([p1])
    assert any("uploaded before" in w for w in r2["documents"][0]["warnings"])


def test_big_sheet_classifies_unique_items_only(tmp_path, fake):
    lines = ["Date,Item,Qty,Unit"] + [f"2025-{(i % 12) + 1:02d}-01,{['HSD diesel for DG set', 'Grid electricity', 'Water supply'][i % 3]},{100 + i},{['L', 'kWh', 'KL'][i % 3]}" for i in range(3000)]
    p = tmp_path / "big.csv"
    p.write_text("\n".join(lines), encoding="utf-8")
    r = Engine(providers=[fake]).run([p])
    assert r["metrics"]["items"] == 3000 and r["metrics"]["groups"] == 3
    assert fake.calls <= 6                              # two-stage questions at most, per unique item


def test_extinguisher_row_shows_kg(fake):
    eng = Engine(use_ai=False)
    [r] = rows_for(eng, item(description="Refilling of CO2 type 4.5 kg fire extinguisher", quantity=5, unit="Nos"))
    assert r["quantity"] == pytest.approx(22.5) and r["unit"] == "kg" and r["raw_quantity"] == 5


def test_dead_provider_is_switched_off():
    bad = FakeProvider(FAKE_TABLE, name="jev", fail=True)
    good = FakeProvider(FAKE_TABLE, name="claude")
    clf = Classifier(providers=[bad, good])
    for i in range(10):
        clf.classify(item(description=f"Mild steel plates lot {i}", amount=5000))
    assert bad.calls == 3 and "jev" in clf.disabled


# ------------------------------------------------------------------ bare "units"
def test_bare_units_means_kwh():
    """In India 'Units' on a bill is kWh (households especially), so it stays kWh; the warning asks the user to confirm."""
    q, u, dim, warn = units.to_canonical(7840, "Units")
    assert (q, u, dim) == (7840, "kWh", "energy") and warn


# ------------------------------------------------------------------ approval guard
def test_incomplete_rows_cannot_be_approved_or_exported(fake):
    from extractor_core.export import approval_blockers
    eng = Engine(providers=[fake])                       # no facilities configured -> facility missing
    rows = rows_for(eng, item(description="HSD diesel for DG set", quantity=500, unit="Ltr", amount=45000))
    parent = next(r for r in rows if not r.get("derived"))
    assert not parent["facility"].get("id")
    bad = approval_blockers(rows, {parent["row_id"]})
    assert parent["row_id"] in bad and len(bad) == len(rows)          # the companion rows are held back with it


def test_job_stops_when_the_credit_budget_is_exceeded(fake, tmp_path):
    from extractor_core.pipeline import OutOfCredits
    f = tmp_path / "fuel.csv"
    f.write_text("Item,Qty,Unit\nDiesel for DG set,500,Ltr\n", encoding="utf-8")
    eng = Engine(providers=[fake])
    with pytest.raises(OutOfCredits):
        eng.run([f], budget=-1)         # any spend (even 0) is over a negative budget
