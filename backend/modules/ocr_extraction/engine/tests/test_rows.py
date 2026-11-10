"""Classification -> formula fields -> companions -> checks -> review status, with fake classifiers."""
from __future__ import annotations

import pytest

from extractor_core import fields, units
from extractor_core.config import load
from extractor_core.decider import rules
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


def test_scope3_without_quantity_is_spend_based(fake):
    eng = Engine(providers=[fake])
    [r] = rows_for(eng, item(description="Cold rolled steel sheets", amount=97500))
    assert r["calc"]["formula_id"] == "s3_spend"
    assert r["calc"]["fields"] == {"spent_value": 97500, "spent_value_unit": "INR"}
    assert any(c["code"] == "spend_based" for c in r["checks"])


def test_piece_counts_fall_back_to_spend(fake):
    eng = Engine(providers=[fake])
    [r] = rows_for(eng, item(description="Steel brackets", quantity=40, unit="Nos", amount=8000))
    assert r["calc"]["formula_id"] == "s3_spend"


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


# ------------------------------------------------------------------ waste / transport policy
def test_waste_with_transport_splits_in_two():
    eng = Engine(use_ai=False)
    it = item(description="Transportation and disposal of 5 MT ETP sludge to TSDF landfill", quantity=5, unit="MT",
              amount=40000, waste_type="ETP sludge", disposal_method="landfill", hazardous=True)
    rs = rows_for(eng, it)
    cats = sorted(r["ghg"]["category"] for r in rs)
    assert cats == ["cat_4", "cat_5"]
    waste = next(r for r in rs if r["ghg"]["category"] == "cat_5")
    trans = next(r for r in rs if r["ghg"]["category"] == "cat_4")
    assert waste["amount"] is None and trans["amount"] == 40000      # money once, on the transport row
    assert trans["parent_id"] == waste["row_id"]


def test_waste_transport_only_gives_cat4_only():
    eng = Engine(use_ai=False)
    rs = rows_for(eng, item(description="Waste transport charges", amount=7800))
    assert [r["ghg"]["category"] for r in rs] == ["cat_4"]


def test_no_split_when_document_has_its_own_transport_line():
    eng = Engine(use_ai=False)
    it = item(description="Disposal and transport of 6.5 MT waste to landfill", quantity=6.5, unit="MT", disposal_method="landfill",
              doc={"other_lines": ["Waste transportation and hauling, Faridabad to Bandhwari"]})
    rs = rows_for(eng, it)
    assert all(r["ghg"]["category"] != "cat_4" for r in rs)


# ------------------------------------------------------------------ rules
@pytest.mark.parametrize("text,unit,expected", [
    ("Refilling/repair of CO2 type 4.5 kg fire extinguisher", "Nos", "refrigerant.co2_extinguisher"),
    ("R-32 refrigerant gas top-up for AC", "kg", "refrigerant.r32"),
    ("HSD for forklift", "Ltr", "fuel.diesel"),
    ("Engine oil 15W40", "Ltr", "goods.lubricants"),
    ("Grid power consumption", "kWh", "elec.grid"),
])
def test_rules_pick_specific_activity(text, unit, expected):
    r = rules.evaluate(item(description=text, unit=unit, quantity=5))
    assert r["activity_id"] == expected


def test_rules_ignore_negated_words_in_notes():
    r = rules.evaluate(item(description="XCELIS LP MAX 07.00/29", hsn="84314990", unit="Nos", quantity=3,
                            notes="Export invoice. No freight, travel or energy lines."))
    assert not r["activity_id"].startswith("freight")


# ------------------------------------------------------------------ cascade / fallback
def test_fallback_when_jev_fails():
    bad = FakeProvider(FAKE_TABLE, name="jev", fail=True)
    good = FakeProvider(FAKE_TABLE, name="openai_decisions")
    clf = Classifier(providers=[bad, good])
    d = clf.classify(item(description="Mild steel plates misc lot", amount=5000))
    assert d["activity_id"] == "goods.steel" and d["source"].endswith("openai_decisions")
    assert bad.calls == 1 and good.calls >= 1
    assert any("error" in c for c in clf.calls)


def test_all_providers_down_still_gives_rows():
    clf = Classifier(providers=[FakeProvider(FAKE_TABLE, fail=True)])
    d = clf.classify(item(description="HSD diesel for DG set", quantity=100, unit="L"))
    assert d["activity_id"] == "fuel.diesel" and d["confidence"] <= 0.8 and "AI unavailable" in d["reason"]


def test_memory_overrides_after_user_correction(mem, fake):
    clf = Classifier(memory=mem, providers=[fake])
    it = item(description="Misc item ABC-77", amount=100, vendor="Acme")
    clf.remember(it, {"activity_id": "service.maintenance", "context": {}}, source="user")
    d = clf.classify(it)
    assert d["source"] == "memory" and d["activity_id"] == "service.maintenance" and d["confidence"] >= 0.95


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


def test_ready_only_when_confident_and_clean(fake, facilities):
    eng = Engine(providers=[fake], facilities=facilities[:1])
    [r, _] = rows_for(eng, item(description="Grid electricity", quantity=1000, unit="kWh", amount=9000,
                                consumer_number="177529058940", period_start="2025-10-01", period_end="2025-10-31"))
    assert r["review_status"] == "ready", r["checks"]


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


@pytest.mark.parametrize("text,unit,expected", [
    ("Grid Electricity Network T&D Losses", "kWh", "elec.td_losses"),
    ("Well-to-Tank (WTT) Diesel Fuel Upstream", "L", "fuel.upstream_wtt"),
    ("Tenant lease rental of surplus warehouse bay subleased to third party", None, "lease.downstream"),
    ("Post-consumer packaging recovery and end-of-life recycling program", None, "downstream.end_of_life"),
    ("Inbound logistics transportation charges for factory supplies", None, "freight.road"),
    ("Hazardous Chemical Effluent Waste Disposal and Treatment", "kg", "waste.haz_landfill"),
])
def test_rules_upstream_downstream(text, unit, expected):
    assert rules.evaluate(item(description=text, unit=unit, quantity=10 if unit else None, amount=1000))["activity_id"] == expected


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
    from extractor_core.export import approval_blockers, save_all_payload
    eng = Engine(providers=[fake])                       # no facilities configured -> facility missing
    rows = rows_for(eng, item(description="HSD diesel for DG set", quantity=500, unit="Ltr", amount=45000))
    parent = next(r for r in rows if not r.get("derived"))
    assert not parent["facility"].get("id")
    bad = approval_blockers(rows, {parent["row_id"]})
    assert parent["row_id"] in bad and len(bad) == len(rows)          # the companion rows are held back with it
    # even if such a row ended up approved (e.g. edited after approval) it must not be exported as a record
    for r in rows:
        r["review"] = {"state": "approved"}
    payload = save_all_payload(rows, "org")
    assert payload["records"] == [] and set(payload["not_calculable"]) == {r["row_id"] for r in rows}


def test_job_stops_when_the_credit_budget_is_exceeded(fake, tmp_path):
    from extractor_core.pipeline import OutOfCredits
    f = tmp_path / "fuel.csv"
    f.write_text("Item,Qty,Unit\nDiesel for DG set,500,Ltr\n", encoding="utf-8")
    eng = Engine(providers=[fake])
    with pytest.raises(OutOfCredits):
        eng.run([f], budget=-1)         # any spend (even 0) is over a negative budget
