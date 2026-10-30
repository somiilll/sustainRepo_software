"""GRI 305 mappings, base-year KPIs and intensity KPIs (idempotent, backs up first). Run from /app/backend: python -m scripts.sync_gri_305_kpis_and_mappings"""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone

from scripts.sync_gri_ghg_kpis_and_mappings import BACKUP_DIR, CATEGORY_NAMES, GASES, _visibility
from shared.database.mongo import db

REVIEW_SOURCE = "gri_305_sync"
DENOMINATORS = [
    ("ORG_REVENUE", "Revenue (Organization Details)", "turnover", "INR", "revenue", "INR"),
    ("ORG_PRODUCTION_QUANTITY", "Production quantity (Organization Details)", "production_quantity", "production unit", "production", "production unit"),
]
INTENSITIES = [
    ("GHG", "GHG emissions intensity (Scope 1 + 2)", "GHG_SCOPE1_SCOPE2_TOTAL"),
    ("ENERGY", "Energy intensity", "ENERGY_TOTAL_WITHIN_ORGANIZATION"),
    ("WATER_WITHDRAWAL", "Water withdrawal intensity", "ENV_QUANTITY_LITRES_WITHDRAWN"),
    ("WATER_CONSUMPTION", "Water consumption intensity", "ENV_WATER_CONSUPTION"),
    ("WATER_DISCHARGE", "Water discharge intensity", "ENV_QUANTITY_LITRES_DISCHARGED"),
    ("WASTE_GENERATED", "Waste generated intensity", "ENV_WASTE_GENERATED_IN_METRIC_TONNES"),
    ("WASTE_DISPOSED", "Waste disposed intensity", "ENV_WASTE_DISPOSED_IN_METRIC_TONNES"),
    ("WASTE_RECOVERED", "Waste recovered intensity", "ENV_WASTE_RECOVERED_IN_METRIC_TONNES"),
    ("FUEL", "Fuel consumption intensity", "ENV_TOTAL_ENERGY_CONSUMPTION_FUEL"),
    ("ELECTRICITY", "Electricity consumption intensity", "ENV_TOTAL_ENERGY_CONSUMPTION_ELECTRICITY"),
]


async def upsert(code, name, category, sub, now, unit, **extra):
    existing = await db.esg_kpi_definitions.find_one({"metric_code": code}, {"_id": 0, "id": 1})
    kpi_id = existing["id"] if existing else str(uuid.uuid4())
    doc = {"id": kpi_id, "metric_code": code, "metric_name": name, "short_name": name, "section": "environment", "category_name": category,
           "subcategory": sub, "aggregation_type": "sum", "status": "active", "output_type": "number",
           "unit_config": {"default_unit": unit, "allowed_units": [unit], "allow_unit_conversion": False},
           "visibility": _visibility(), "updated_at": now, **extra}
    if existing:
        await db.esg_kpi_definitions.update_one({"id": kpi_id}, {"$set": doc})
    else:
        await db.esg_kpi_definitions.insert_one({"created_at": now, "created_by": None, "created_by_name": "GRI 305 sync", "validation_rules": [],
                                                 "version": 1, **doc})
    return kpi_id


async def kpi_id_by_code(code):
    kpi = await db.esg_kpi_definitions.find_one({"metric_code": code}, {"_id": 0, "id": 1})
    return kpi["id"] if kpi else None


async def build_kpis(now):
    ids = {}
    for scope in ("scope1", "scope2", "scope3"):
        label = scope.replace("scope", "Scope ")
        ids[f"base_{scope}"] = await upsert(
            f"GHG_BASE_YEAR_{scope.upper()}", f"{label} emissions in base year", "GHG Emissions", "Base Year Emissions", now, "tCO2e",
            source_type="base_year", source_config={"base_year": {"scope": scope}}, description=f"{label} emissions in the organization's configured GHG base year.",
            metadata={"source_module": "ghg_base_year"})
    s1, s2 = await kpi_id_by_code("GHG_SCOPE1_TOTAL"), await kpi_id_by_code("GHG_SCOPE2_TOTAL")
    ids["base_biogenic_direct"] = await upsert(
        "GHG_BASE_YEAR_BIOGENIC_DIRECT", "Biogenic (direct) emissions in base year", "GHG Emissions", "Base Year Emissions", now, "tCO2e",
        source_type="base_year", source_config={"base_year": {"scope": "biogenic"}},
        description="Biogenic (direct) emissions in the organization's configured GHG base year.", metadata={"source_module": "ghg_base_year"})
    ids["scope12"] = await upsert(
        "GHG_SCOPE1_SCOPE2_TOTAL", "Total Scope 1 + Scope 2 emissions", "GHG Emissions", "Total Scope 1 + Scope 2 emissions", now, "tCO2e",
        source_type="composite", source_config={"composite": {"operation": "sum", "source_kpi_ids": [s1, s2]}},
        formula_config={"formula_type": "sum", "dependencies": [s1, s2]}, description="Sum of total Scope 1 and Scope 2 emissions.")
    energy_parts = [await kpi_id_by_code(f"ENV_TOTAL_ENERGY_CONSUMPTION_{part}") for part in ("FUEL", "ELECTRICITY", "HEATING", "COOLING", "STEAM")]
    ids["energy_total"] = await upsert(
        "ENERGY_TOTAL_WITHIN_ORGANIZATION", "Total energy consumption (Fuel + Electricity + Heating + Cooling + Steam)", "Energy", "Energy Totals", now, "J",
        source_type="composite", source_config={"composite": {"operation": "sum", "source_kpi_ids": energy_parts}},
        formula_config={"formula_type": "sum", "dependencies": energy_parts}, description="Sum of fuel, electricity, heating, cooling and steam energy consumption.")
    denominators = {}
    for code, name, field, unit, _key, _label in DENOMINATORS:
        denominators[code] = await upsert(
            code, name, "Organization Details", "Yearly data", now, unit, source_type="org_profile", source_config={"org_profile": {"field": field}},
            description=f"Yearly {field.replace('_', ' ')} entered under Organization Details for the reporting period.", metadata={"source_module": "organization_details"})
    created = 0
    for key, name, numerator_code in INTENSITIES:
        numerator = ids["scope12"] if numerator_code == "GHG_SCOPE1_SCOPE2_TOTAL" else ids["energy_total"] if numerator_code == "ENERGY_TOTAL_WITHIN_ORGANIZATION" else await kpi_id_by_code(numerator_code)
        if not numerator:
            print("missing numerator KPI", numerator_code)
            continue
        base_unit = ((await db.esg_kpi_definitions.find_one({"id": numerator}, {"unit_config": 1})) or {}).get("unit_config", {}).get("default_unit") or ""
        for code, _name, _field, _unit, suffix, unit_label in DENOMINATORS:
            ids[f"int_{key}_{suffix}"] = await upsert(
                f"INTENSITY_{key}_PER_{suffix.upper()}", f"{name} per {suffix}", "Intensity Metrics", name, now, f"{base_unit}/{unit_label}".strip("/"),
                source_type="composite", source_config={"composite": {"operation": "ratio_scaled", "source_kpi_ids": [numerator, denominators[code]], "scale": 1}},
                formula_config={"formula_type": "ratio", "dependencies": [numerator, denominators[code]], "formula_definition": f"{numerator_code} / {code}"},
                description=f"{name} per unit of {suffix} (organization details).", tags=["derived", "intensity"], metadata={"scale": 1})
            created += 1
    return ids, created


async def mapping_specs():
    ids = {k: await kpi_id_by_code(c) for k, c in {
        "s1": "GHG_SCOPE1_TOTAL", "s2": "GHG_SCOPE2_TOTAL", "s3": "GHG_SCOPE3_TOTAL", "bio_d": "GHG_BIOGENIC_DIRECT", "bio_i": "GHG_BIOGENIC_INDIRECT",
        "b1": "GHG_BASE_YEAR_SCOPE1", "b2": "GHG_BASE_YEAR_SCOPE2", "b3": "GHG_BASE_YEAR_SCOPE3", "bb": "GHG_BASE_YEAR_BIOGENIC_DIRECT"}.items()}
    gases = [(await kpi_id_by_code(f"GHG_SCOPE1_{g.upper()}"), label) for g, label in GASES]
    intensity = {k: await kpi_id_by_code(f"INTENSITY_{k}") for k in ("ENERGY_PER_REVENUE", "ENERGY_PER_PRODUCTION", "GHG_PER_REVENUE", "GHG_PER_PRODUCTION")}
    energy = [(intensity["ENERGY_PER_REVENUE"], "Energy intensity per revenue")]
    ghg_int = [(intensity["GHG_PER_REVENUE"], "GHG intensity per revenue")]
    cats = [(await kpi_id_by_code(f"GHG_SCOPE3_C{n}"), f"C{n} {name}") for n, name in enumerate(CATEGORY_NAMES, 1)]
    return [
        ("102-5", "d", "ii", [(ids["b1"], "Scope 1 in base year"), (ids["bb"], "Biogenic (direct) in base year")]),
        ("102-6", "d", "ii", [(ids["b2"], "Scope 2 in base year")]),
        ("102-7", "d", "ii", [(ids["b3"], "Scope 3 in base year")]),
        ("302-3", "a", None, energy),
        ("103-4", "a", None, energy),
        ("305-4", "a", None, ghg_int),
        ("102-8", "a", None, ghg_int),
        ("305-1", "a", None, [(ids["s1"], "Scope 1")]),
        ("305-1", "b", None, [(ids["s1"], "CO2e")] + gases),
        ("305-1", "c", None, [(ids["bio_d"], "Biogenic (direct)")]),
        ("305-1", "d", "ii", [(ids["b1"], "Scope 1 in base year")]),
        ("305-2", "a", None, [(ids["s2"], "Scope 2")]),
        ("305-2", "d", "ii", [(ids["b2"], "Scope 2 in base year")]),
        ("305-3", "a", None, [(ids["s3"], "Scope 3")]),
        ("305-3", "c", None, [(ids["bio_i"], "Biogenic (indirect)")]),
        ("305-3", "d", None, cats),
        ("305-3", "e", "ii", [(ids["b3"], "Scope 3 in base year")]),
    ]


async def build_mappings(now):
    removed = (await db.kpi_framework_mappings.delete_many({"framework": "GRI", "review_source": REVIEW_SOURCE})).deleted_count
    created = 0
    for disclosure, letter, roman, kpis in await mapping_specs():
        reference = f"{disclosure}-{letter}" + (f"-{roman}" if roman else "")
        question_key = f"gri_{disclosure.replace('-', '_')}_{letter}"
        for order, (kpi_id, label) in enumerate(kpis):
            kpi = await db.esg_kpi_definitions.find_one({"id": kpi_id}, {"_id": 0})
            await db.kpi_framework_mappings.insert_one({
                "id": str(uuid.uuid4()), "created_at": now, "kpi_id": kpi_id, "source_kpi_ids": [kpi_id], "source_metric_code": kpi["metric_code"],
                "source_metric_name": kpi["metric_name"], "source_category": kpi["category_name"], "source_subcategory": kpi.get("subcategory"),
                "source_tag": f"GHG → {kpi['metric_name']}", "framework": "GRI", "reference": reference, "question_key": question_key,
                "answer_path": roman, "display_label": label, "display_order": order, "aggregation_rule": "sum",
                "destination_unit": (kpi.get("unit_config") or {}).get("default_unit", "tCO2e"), "include_unit": True,
                "mapping_status": "exact_destination", "mapping_role": "direct_destination", "is_active": True,
                "period_column_strategy": "reporting_year_filter", "reporting_period_source": "runtime_filter", "review_source": REVIEW_SOURCE,
                "reviewed_at": now, "updated_at": now})
            created += 1
            refs = [r for r in kpi.get("framework_references") or [] if not (r.get("framework") == "GRI" and r.get("reference") == reference)]
            refs.append({"framework": "GRI", "reference": reference, "question_key": question_key, "answer_path": roman,
                         "reference_type": "exact", "mapping_status": "exact_destination"})
            await db.esg_kpi_definitions.update_one({"id": kpi_id}, {"$set": {
                "framework_references": refs, "gri_disclosure": "; ".join(dict.fromkeys(r["reference"] for r in refs if r["framework"] == "GRI"))}})
    return removed, created


async def main():
    now = datetime.now(timezone.utc).isoformat()
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
    mappings = await db.kpi_framework_mappings.find({"framework": "GRI", "review_source": REVIEW_SOURCE}, {"_id": 0}).to_list(None)
    with open(f"{BACKUP_DIR}/gri_305_{stamp}.json", "w") as file:
        json.dump(mappings, file, default=str)
    ids, intensities = await build_kpis(now)
    removed, created = await build_mappings(now)
    print(f"kpis={len(ids)} intensity={intensities} mappings removed={removed} created={created}")


if __name__ == "__main__":
    asyncio.run(main())
