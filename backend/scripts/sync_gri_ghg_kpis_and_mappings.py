"""GRI 102-5 / 102-6 / 102-7: GHG breakdown KPIs (gas, biogenic, Scope 3 category) + GRI KPI framework mappings (idempotent, backs up first)."""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

from shared.database.mongo import db

BACKUP_DIR = "/app/backups"
TOTALS = {"scope1": "GHG_SCOPE1_TOTAL", "scope2": "GHG_SCOPE2_TOTAL", "scope3": "GHG_SCOPE3_TOTAL"}
DISCLOSURE = {"scope1": "102-5", "scope2": "102-6", "scope3": "102-7"}
GASES = (("co2", "CO2"), ("ch4", "CH4"), ("n2o", "N2O"))
CATEGORY_NAMES = ["Purchased Goods and Services", "Capital Goods", "Fuel and energy-related activities", "Upstream Transportation and Distribution",
                  "Waste Generated in Operations", "Business Travel", "Employee Commuting", "Upstream Leased Assets",
                  "Downstream Transportation and Distribution", "Processing of Sold Products", "Use of Sold Products",
                  "End-of-Life Treatment of Sold Products", "Downstream Leased Assets", "Franchises", "Investments"]


def _visibility() -> dict:
    return {"show_in_kpi_library": True, "show_in_dashboards": False, "show_in_targets": False, "show_in_reports": True, "allow_manual_entry": False}


async def upsert_kpi(code, name, sub, now, unit="tCO2e", **extra):
    existing = await db.esg_kpi_definitions.find_one({"metric_code": code}, {"_id": 0, "id": 1})
    kpi_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {"id": kpi_id, "metric_code": code, "metric_name": name, "short_name": name, "description": f"Live {name} from approved GHG records.",
           "section": "environment", "category_name": "GHG Emissions", "subcategory": sub, "aggregation_type": "sum",
           "unit_config": {"default_unit": unit, "allowed_units": [unit], "allow_unit_conversion": False}, "status": "active", "output_type": "number",
           "metadata": {"source_module": "ghg"}, "visibility": _visibility(), "updated_at": now, **extra}
    if existing:
        await db.esg_kpi_definitions.update_one({"id": kpi_id}, {"$set": doc})
    else:
        await db.esg_kpi_definitions.insert_one({"created_at": now, "created_by": None, "created_by_name": "GRI GHG sync", "validation_rules": [],
                                                 "version": 1, **doc})
    return kpi_id


def ghg(key, field=None):
    return {"source_type": "ghg", "baseline_mapping_key": key, "value_field": field or "total_emissions"}


async def build_kpis(now):
    ids = {code: (await db.esg_kpi_definitions.find_one({"metric_code": code}, {"id": 1}))["id"] for code in TOTALS.values()}
    for scope, label in (("scope1", "Scope 1"), ("scope2", "Scope 2"), ("scope3", "Scope 3")):
        for gas, gas_label in GASES:
            ids[f"{scope}_{gas}"] = await upsert_kpi(f"GHG_{scope.upper()}_{gas.upper()}", f"{label} {gas_label} emissions", f"{label} Breakdown", now, unit="t",
                                                     **ghg(f"gri_{scope}_{gas}", f"{gas}_emissions"))
    for kind in ("direct", "indirect"):
        ids[f"biogenic_{kind}"] = await upsert_kpi(f"GHG_BIOGENIC_{kind.upper()}", f"Biogenic ({kind}) emissions", "Biogenic Breakdown", now, **ghg(f"gri_biogenic_{kind}"))
    for n, name in enumerate(CATEGORY_NAMES, 1):
        ids[f"s3_c{n}"] = await upsert_kpi(f"GHG_SCOPE3_C{n}", f"Scope 3 - C{n} {name}", "Scope 3 Breakdown", now, **ghg(f"gri_scope3_c{n}"))
        ids[f"bio_c{n}"] = await upsert_kpi(f"GHG_BIOGENIC_C{n}", f"Biogenic (indirect) - C{n} {name}", "Biogenic Breakdown", now, **ghg(f"gri_biogenic_c{n}"))
    for scope, bio, label in (("scope1", "biogenic_direct", "Scope 1 + biogenic (direct) emissions"), ("scope2", "biogenic_indirect", "Scope 2 + biogenic (indirect) emissions"),
                              ("scope3", "biogenic_indirect", "Scope 3 + biogenic (indirect) emissions")):
        sources = [ids[TOTALS[scope]], ids[bio]]
        ids[f"{scope}_plus_bio"] = await upsert_kpi(f"GHG_{scope.upper()}_PLUS_BIOGENIC", label, f"{scope.replace('scope', 'Scope ')} Breakdown", now,
                                                    source_type="composite", source_config={"composite": {"operation": "sum", "source_kpi_ids": sources}},
                                                    formula_config={"formula_type": "sum", "dependencies": sources})
    return ids


def mapping_specs(ids):
    """(scope, sub_part_suffix or '', [(kpi_key, label)]) -> GRI question_key/answer_path."""
    specs = []
    for scope in ("scope1", "scope2", "scope3"):
        total, plus, bio = TOTALS[scope], f"{scope}_plus_bio", "biogenic_direct" if scope == "scope1" else "biogenic_indirect"
        gases = [(f"{scope}_{g}", label) for g, label in GASES]
        if scope == "scope3":
            by_cat = [(f"s3_c{n}", f"C{n} {name}") for n, name in enumerate(CATEGORY_NAMES, 1)]
            bio_cat = [(f"bio_c{n}", f"C{n} {name}") for n, name in enumerate(CATEGORY_NAMES, 1)]
            parts = {"a|i": by_cat, "a|ii": gases, "a|iii": [(plus, "Scope 3 + biogenic (indirect)")], "a|iv": [(total, "Scope 3")],
                     "a|v": [(total, "Scope 3")], "b|": by_cat, "c|": bio_cat}
        else:
            parts = {"a|i": gases, "a|ii": [(plus, f"{scope.replace('scope', 'Scope ')} + biogenic")], "a|iii": [(total, scope.replace("scope", "Scope "))],
                     "a|iv": [(total, scope.replace("scope", "Scope "))], "b|": [(total, "CO2e")] + gases, "c|": [(bio, "Biogenic")]}
        for key, kpis in parts.items():
            letter, roman = key.split("|")
            specs.append((scope, letter, roman, kpis))
    return specs


async def build_mappings(ids, now):
    docs = {k["metric_code"]: k async for k in db.esg_kpi_definitions.find({"category_name": "GHG Emissions"}, {"_id": 0})}
    by_id = {k["id"]: k for k in docs.values()}
    removed = (await db.kpi_framework_mappings.delete_many({"framework": "GRI", "review_source": "gri_ghg_sync"})).deleted_count
    created = 0
    for scope, letter, roman, kpis in mapping_specs(ids):
        reference = f"{DISCLOSURE[scope]}-{letter}" + (f"-{roman}" if roman else "")
        question_key = f"gri_{DISCLOSURE[scope].replace('-', '_')}_{letter}"
        for order, (kpi_key, label) in enumerate(kpis):
            kpi = by_id[ids[kpi_key]] if kpi_key in ids else by_id[ids[kpi_key]]
            await db.kpi_framework_mappings.insert_one({
                "id": str(uuid.uuid4()), "created_at": now, "kpi_id": kpi["id"], "source_kpi_ids": [kpi["id"]], "source_metric_code": kpi["metric_code"],
                "source_metric_name": kpi["metric_name"], "source_category": "GHG Emissions", "source_subcategory": kpi["subcategory"],
                "source_tag": f"GHG → {kpi['metric_name']}", "framework": "GRI", "reference": reference, "question_key": question_key,
                "answer_path": roman or None, "display_label": label, "display_order": order, "aggregation_rule": "sum",
                "destination_unit": (kpi.get("unit_config") or {}).get("default_unit", "tCO2e"), "include_unit": True,
                "mapping_status": "exact_destination", "mapping_role": "direct_destination", "is_active": True,
                "period_column_strategy": "reporting_year_filter", "reporting_period_source": "runtime_filter", "review_source": "gri_ghg_sync",
                "reviewed_at": now, "updated_at": now})
            created += 1
            refs = [r for r in kpi.get("framework_references") or [] if not (r.get("framework") == "GRI" and r.get("reference") == reference)]
            refs.append({"framework": "GRI", "reference": reference, "question_key": question_key, "answer_path": roman or None,
                         "reference_type": "exact", "mapping_status": "exact_destination"})
            kpi["framework_references"] = refs
            await db.esg_kpi_definitions.update_one({"id": kpi["id"]}, {"$set": {
                "framework_references": refs, "gri_disclosure": "; ".join(dict.fromkeys(r["reference"] for r in refs if r["framework"] == "GRI"))}})
    return removed, created


async def main():
    now = datetime.now(timezone.utc).isoformat()
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    totals = await db.esg_kpi_definitions.find({"metric_code": {"$in": list(TOTALS.values())}}, {"_id": 0}).to_list(None)
    with open(f"{BACKUP_DIR}/gri_ghg_{stamp}.json", "w") as file:
        json.dump(totals, file, default=str)
    ids = await build_kpis(now)
    removed, created = await build_mappings(ids, now)
    print(f"kpis={len(ids)} mappings removed={removed} created={created}")


if __name__ == "__main__":
    asyncio.run(main())
