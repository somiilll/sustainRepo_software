"""Create derived BRSR KPIs and exact mappings for energy, water, parental leave, complaints, and training."""
import asyncio
import json
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.database.mongo import db


BACKUP_DIR = Path("/app/backups")


def metric_code(name: str) -> str:
    return "BRSR_" + re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")


async def upsert_definition(name: str, fields: Dict[str, Any], now: str) -> Dict[str, Any]:
    code = fields.pop("metric_code", metric_code(name))
    existing = await db.esg_kpi_definitions.find_one({"metric_code": code}, {"_id": 0})
    definition_id = existing["id"] if existing else str(uuid.uuid4())
    common = {
        "metric_name": name, "short_name": name, "metric_code": code, "status": "active",
        "display_config": {"display_name": None, "short_name": None, "display_order": 0,
                           "category_order": 0, "icon": None, "color": None, "decimal_places": 2},
        "visibility": {"show_in_kpi_library": True, "show_in_dashboards": True,
                       "show_in_targets": True, "show_in_reports": True, "allow_manual_entry": False},
        "version": (existing or {}).get("version", 1), "updated_at": now, **fields,
    }
    if existing:
        await db.esg_kpi_definitions.update_one({"id": definition_id}, {"$set": common})
    else:
        await db.esg_kpi_definitions.insert_one({
            "id": definition_id, "description": fields.get("description") or name,
            "validation_rules": [], "created_by": None, "created_by_name": "BRSR derived KPI sync",
            "created_at": now, "updated_by": None, "updated_by_name": None, **common,
        })
    return {"id": definition_id, **common}


async def upsert_mapping(
    kpi: Dict[str, Any], question_key: str, answer_path: str, reference: str,
    now: str, strategy: str = "reporting_year_filter",
) -> None:
    existing = await db.kpi_framework_mappings.find_one({
        "framework": "BRSR", "kpi_id": kpi["id"], "question_key": question_key, "answer_path": answer_path,
    }, {"_id": 0})
    fields = {
        "kpi_id": kpi["id"], "source_kpi_ids": [kpi["id"]], "source_metric_code": kpi.get("metric_code"),
        "source_metric_name": kpi.get("metric_name"), "framework": "BRSR", "reference": reference,
        "question_key": question_key, "answer_path": answer_path, "aggregation_rule": "sum",
        "formula_definition": (kpi.get("formula_config") or {}).get("formula_definition"),
        "destination_unit": (kpi.get("unit_config") or {}).get("default_unit"),
        "unit_conversion_rule": "use_kpi_unit_config", "mapping_status": "exact_destination",
        "is_active": True, "period_column_strategy": strategy, "reporting_period_source": "runtime_filter",
        "source_category": kpi.get("category_name"), "source_subcategory": kpi.get("subcategory"),
        "source_sub_subcategory": kpi.get("sub_subcategory"),
        "source_tag": " → ".join(filter(None, [kpi.get("category_name"), kpi.get("subcategory")])),
        "review_source": "derived_reporting_kpi_sync", "reviewed_at": now, "updated_at": now,
    }
    if existing:
        await db.kpi_framework_mappings.update_one({"id": existing["id"]}, {"$set": fields, "$unset": {"period_columns": ""}})
    else:
        await db.kpi_framework_mappings.insert_one({"id": str(uuid.uuid4()), "created_at": now, **fields})


async def remove_brsr_reference(definition: Dict[str, Any], reference_code: str, now: str) -> None:
    references = []
    for reference in definition.get("framework_references") or []:
        if str(reference.get("framework", "")).upper() != "BRSR":
            references.append(reference)
            continue
        codes = [code.strip() for code in re.split(r"[;,]", str(reference.get("reference") or "")) if code.strip()]
        remaining = [code for code in codes if code != reference_code]
        if remaining:
            references.append({**reference, "reference": "; ".join(remaining)})
    current_codes = [code.strip() for code in re.split(r"[;,]", str(definition.get("brsr_reference") or "")) if code.strip()]
    remaining_current = [code for code in current_codes if code != reference_code]
    await db.esg_kpi_definitions.update_one(
        {"id": definition["id"]},
        {"$set": {"brsr_reference": "; ".join(remaining_current) or None,
                  "framework_references": references, "updated_at": now}},
    )
    await db.kpi_framework_mappings.update_many(
        {"framework": "BRSR", "kpi_id": definition["id"], "reference": {"$regex": re.escape(reference_code)}},
        {"$set": {"is_active": False, "mapping_status": "supporting_kpi_not_direct_destination", "updated_at": now}},
    )


async def find_definition(name: str) -> Dict[str, Any]:
    definition = await db.esg_kpi_definitions.find_one({"metric_name": name, "status": {"$ne": "archived"}}, {"_id": 0})
    if not definition:
        raise RuntimeError(f"Missing source KPI Definition: {name}")
    return definition


def derived_common(category: str, subcategory: str, reference: str, unit_config: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "section": "environment" if category in {"Energy", "Water"} else "social",
        "category_name": category, "subcategory": subcategory, "sub_subcategory": "",
        "supported_scopes": ["organization", "facility"], "output_type": "number",
        "unit_config": unit_config, "brsr_reference": reference, "gri_disclosure": None,
        "framework_references": [{"framework": "BRSR", "reference": reference, "reference_type": "exact"}],
        "tags": ["derived", "brsr-reporting"],
    }


async def sync_energy(now: str) -> List[Dict[str, Any]]:
    unit = {"default_unit": "J", "supported_units": ["J", "kJ", "MJ", "GJ", "TJ", "kWh", "MWh", "GWh"],
            "allow_unit_conversion": True, "unit_type": "energy"}
    common = derived_common("Energy", "Energy Totals", "P6-E1", unit)
    renewable_fuel = await upsert_definition("Renewable Fuel Consumption (Total)", {
        **common, "source_type": "constant", "source_config": {"constant": {"value": 0}},
        "value_field": "", "aggregation_type": "sum", "formula_config": None,
        "metadata": {"assumption": "All fuel is classified as non-renewable by organization policy"},
    }, now)
    renewable_other_sources = [await find_definition(f"Renewable Energy Consumption - {source}") for source in ("Cooling", "Heating", "Steam")]
    nonrenewable_other_sources = [await find_definition(f"Non-Renewable Energy Consumption - {source}") for source in ("Cooling", "Heating", "Steam")]
    renewable_other = await upsert_definition("Renewable Other-source Energy Consumption (Total)", {
        **common, "source_type": "composite", "source_config": {"composite": {
            "operation": "sum", "source_kpi_ids": [source["id"] for source in renewable_other_sources]}},
        "value_field": "", "aggregation_type": "sum", "formula_config": None,
        "metadata": {"components": [source["metric_name"] for source in renewable_other_sources]},
    }, now)
    nonrenewable_other = await upsert_definition("Non-Renewable Other-source Energy Consumption (Total)", {
        **common, "source_type": "composite", "source_config": {"composite": {
            "operation": "sum", "source_kpi_ids": [source["id"] for source in nonrenewable_other_sources]}},
        "value_field": "", "aggregation_type": "sum", "formula_config": None,
        "metadata": {"components": [source["metric_name"] for source in nonrenewable_other_sources]},
    }, now)
    renewable_electricity = await find_definition("Renewable Electricity Consumption")
    grid_electricity = await find_definition("Grid Electricity Consumption")
    fuel_total = await find_definition("Total Energy Consumption - Fuel")
    renewable_total = await upsert_definition("Renewable Energy Consumption (Total)", {
        **common, "source_type": "composite", "source_config": {"composite": {
            "operation": "sum", "source_kpi_ids": [renewable_electricity["id"], renewable_fuel["id"], renewable_other["id"]]}},
        "value_field": "", "aggregation_type": "sum", "formula_config": None,
        "metadata": {"fuel_policy": "all_fuel_non_renewable"},
    }, now)
    nonrenewable_total = await upsert_definition("Non-Renewable Energy Consumption (Total)", {
        **common, "source_type": "composite", "source_config": {"composite": {
            "operation": "sum", "source_kpi_ids": [grid_electricity["id"], fuel_total["id"], nonrenewable_other["id"]]}},
        "value_field": "", "aggregation_type": "sum", "formula_config": None,
        "metadata": {"fuel_policy": "all_fuel_non_renewable"},
    }, now)
    total_energy = await upsert_definition("Total Energy Consumption (Renewable + Non-Renewable)", {
        **common, "source_type": "composite", "source_config": {"composite": {
            "operation": "sum", "source_kpi_ids": [renewable_total["id"], nonrenewable_total["id"]]}},
        "value_field": "", "aggregation_type": "sum", "formula_config": None,
        "metadata": {"formula": "renewable_total + nonrenewable_total"},
    }, now)
    mappings = [
        (renewable_electricity, "rows.renew_electricity", "P6-E1 (A)"),
        (renewable_fuel, "rows.renew_fuel", "P6-E1 (B)"),
        (renewable_other, "rows.renew_other", "P6-E1 (C)"),
        (renewable_total, "rows.renew_total", "P6-E1 (D)"),
        (grid_electricity, "rows.nonrenew_electricity", "P6-E1 (E)"),
        (fuel_total, "rows.nonrenew_fuel", "P6-E1 (F)"),
        (nonrenewable_other, "rows.nonrenew_other", "P6-E1 (G)"),
        (nonrenewable_total, "rows.nonrenew_total", "P6-E1 (H)"),
        (total_energy, "rows.total_energy", "P6-E1 (I)"),
    ]
    for kpi, path, reference in mappings:
        await upsert_mapping(kpi, "p6_energy_consumption", path, reference, now)
    supporting = renewable_other_sources + nonrenewable_other_sources + [
        await find_definition(f"Total Energy Consumption - {source}") for source in ("Cooling", "Electricity", "Heating", "Steam")
    ]
    for definition in supporting:
        for code in [part.strip() for part in str(definition.get("brsr_reference") or "").split(";") if part.strip()]:
            await remove_brsr_reference(definition, code, now)
    await db.kpi_framework_mappings.update_many(
        {"framework": "BRSR", "source_metric_code": {"$regex": "^GROUP_(RENEWABLE|NONRENEWABLE)_OTHER_ENERGY$"}},
        {"$set": {"is_active": False, "mapping_status": "superseded_by_derived_kpi", "updated_at": now}},
    )
    return [kpi for kpi, _path, _reference in mappings]


async def sync_water_discharge(now: str) -> List[Dict[str, Any]]:
    definitions = await db.esg_kpi_definitions.find(
        {"value_field": {"$regex": "^discharge_"}, "status": {"$ne": "archived"}}, {"_id": 0}
    ).to_list(200)
    by_field = {definition.get("value_field"): definition for definition in definitions}
    destination_keys = {"surface": "surface", "groundwater": "ground", "seawater": "sea",
                        "third_party": "thirdparty", "other": "other"}
    mapped = []
    for source_key, row_key in destination_keys.items():
        for treatment in ("no_treatment", "with_treatment"):
            definition = by_field.get(f"discharge_{source_key}_{treatment}")
            if definition:
                await upsert_mapping(definition, "p6_water_discharged", f"rows.{row_key}_{treatment}", "P6-E4", now)
                mapped.append(definition)
    total = by_field.get("discharge_total")
    if total:
        await upsert_mapping(total, "p6_water_discharged", "rows.total_discharged", "P6-E4", now)
        mapped.append(total)
    for definition in definitions:
        field = definition.get("value_field") or ""
        if any(token in field for token in ("_primary", "_secondary", "_tertiary")) or field.endswith("_total") and field != "discharge_total":
            await remove_brsr_reference(definition, "P6-E4", now)
    return mapped


async def sync_internal_complaints(now: str) -> List[Dict[str, Any]]:
    mapped = []
    for role, row in (("Directors", "rows.directors_coi"), ("KMPs", "rows.kmps_coi")):
        direct = await db.esg_kpi_definitions.find_one({
            "metric_name": {"$regex": f"^Internal Complaints - {role}$", "$options": "i"}}, {"_id": 0}
        )
        if direct:
            await upsert_mapping(direct, "p1_conflict_of_interest_complaints", row, "P1-E2", now)
            mapped.append(direct)
        pending = await db.esg_kpi_definitions.find_one({
            "metric_name": {"$regex": f"Internal Complaints.*Pending.*{role}|Internal Complaints.*{role}.*Pending", "$options": "i"}}, {"_id": 0}
        )
        if pending:
            await remove_brsr_reference(pending, "P1-E2", now)
    return mapped


async def sync_parental_leave(now: str) -> List[Dict[str, Any]]:
    definitions = await db.esg_kpi_definitions.find({
        "subcategory": {"$in": ["Employees Parental Leave", "Workers Parental Leave"]},
        "status": {"$ne": "archived"},
    }, {"_id": 0}).to_list(200)
    mapped = []
    for definition in definitions:
        name = definition.get("metric_name") or ""
        if "Rate" not in name:
            for code in [part.strip() for part in str(definition.get("brsr_reference") or "").split(";") if part.strip()]:
                await remove_brsr_reference(definition, code, now)
            continue
        gender = "female" if "Female" in name else "male" if "Male" in name else "total"
        is_worker = definition.get("subcategory") == "Workers Parental Leave"
        column = ("perm_workers_" if is_worker else "perm_emp_") + ("return" if "Return to Work" in name else "retention")
        await db.esg_kpi_definitions.update_one(
            {"id": definition["id"]},
            {"$set": {"metadata.calculation_scope": "per_record_then_period_aggregate",
                      "metadata.period_aggregation": "average", "brsr_reference": "P3-E5", "updated_at": now}},
        )
        refreshed = {**definition, "brsr_reference": "P3-E5"}
        await upsert_mapping(refreshed, "p3_parental_leave_return", f"rows.{gender}.{column}", "P3-E5", now, "response_period_document")
        mapped.append(refreshed)
    return mapped


async def create_training_source_kpi(
    group: str, topic: str, gender: str, recipient_types: List[str], now: str
) -> Dict[str, Any]:
    female_hs = "no_of_female_attendees_for_training_on_health_safety"
    male_hs = "no_of_male_attendees_for_training_on_health_safety"
    female_skill = ["no_of_female_attendees_for_trainings_on_skill_upgrade_up_skilling", "no_of_female_attendees_for_trainings_on_re_skilling"]
    male_skill = ["no_of_male_attendees_for_trainings_on_skill_upgrade_up_skilling", "no_of_male_attendees_for_trainings_on_re_skilling"]
    fields = ([female_hs] if gender == "Female" else [male_hs] if gender == "Male" else [female_hs, male_hs]) if topic == "Health & Safety" else (
        female_skill if gender == "Female" else male_skill if gender == "Male" else [*female_skill, *male_skill]
    )
    name = f"P3-E8 Training - {group} - {topic} - {gender}"
    if len(fields) == 1:
        source_type = "records"
        source_config = {"records": {"value_field": fields[0]}}
        formula_config = None
        value_field = fields[0]
        aggregation_type = "sum"
    else:
        source_type = "calculated"
        source_config = {"calculated": {"input_fields": fields}}
        formula_config = {"formula_type": "expression", "formula_definition": " + ".join(fields), "dependencies": fields}
        value_field = ""
        aggregation_type = "formula"
    return await upsert_definition(name, {
        **derived_common("Training", "General Training", "P3-E8", {
            "default_unit": "count", "supported_units": ["count"], "allow_unit_conversion": False}),
        "source_type": source_type, "source_config": source_config, "value_field": value_field,
        "aggregation_type": aggregation_type, "formula_config": formula_config,
        "filters": [{"field_key": "training_recipient_type", "operator": "in", "value": recipient_types}],
        "dimensions": ["organization", "training_recipient_type", "gender", "training_topic"],
        "metadata": {"calculation_scope": "per_record_then_period_aggregate", "period_aggregation": "sum",
                     "recipient_group": group, "recipient_types": recipient_types, "gender": gender, "topic": topic},
    }, now)


async def sync_training(now: str) -> List[Dict[str, Any]]:
    groups = {
        "Employees": ["Permanent Employee", "Other than Permanent Employee"],
        "Workers": ["Permanent Worker", "Other than Permanent Worker"],
    }
    headcount_sources = {
        ("Employees", "Female"): ["Employee Diversity - Permanent employees (Female)", "Employee Diversity - Other-than-permanent employees (Female)"],
        ("Employees", "Male"): ["Employee Diversity - Permanent employees (Male)", "Employee Diversity - Other-than-permanent employees (Male)"],
        ("Employees", "Total"): ["Employee Diversity - Permanent employees", "Employee Diversity - Other-than-permanent employees"],
        ("Workers", "Female"): ["Workers Diversity - Permanent workers (Female)", "Workers Diversity - Other-than-permanent workers (Female)"],
        ("Workers", "Male"): ["Workers Diversity - Permanent workers (Male)", "Workers Diversity - Other-than-permanent workers (Male)"],
        ("Workers", "Total"): ["Workers Diversity - Permanent workers", "Workers Diversity - Other-than-permanent workers"],
    }
    row_keys = {("Employees", "Female"): "emp_female", ("Employees", "Male"): "emp_male", ("Employees", "Total"): "emp_total",
                ("Workers", "Female"): "wrk_female", ("Workers", "Male"): "wrk_male", ("Workers", "Total"): "wrk_total"}
    headcounts = {}
    for key, names in headcount_sources.items():
        sources = [await find_definition(name) for name in names]
        group, gender = key
        headcounts[key] = await upsert_definition(f"P3-E8 Eligible {group} - {gender}", {
            **derived_common("Training", "P3-E8 Reporting", "P3-E8", {
                "default_unit": "count", "supported_units": ["count"], "allow_unit_conversion": False}),
            "source_type": "composite", "source_config": {"composite": {
                "operation": "sum", "source_kpi_ids": [source["id"] for source in sources]}},
            "value_field": "", "aggregation_type": "sum", "formula_config": None,
            "dimensions": ["organization", "recipient_group", "gender"],
            "metadata": {"recipient_group": group, "gender": gender, "components": names},
        }, now)
        await upsert_mapping(headcounts[key], "p3_training_details", f"rows.{row_keys[key]}.total", "P3-E8", now)

    mapped = list(headcounts.values())
    for group, recipient_types in groups.items():
        for topic, field_prefix in (("Health & Safety", "hs"), ("Skill Upgradation", "skill")):
            for gender in ("Female", "Male", "Total"):
                source = await create_training_source_kpi(group, topic, gender, recipient_types, now)
                row = row_keys[(group, gender)]
                await upsert_mapping(source, "p3_training_details", f"rows.{row}.{field_prefix}_no", "P3-E8", now)
                coverage = await upsert_definition(f"P3-E8 Training Coverage - {group} - {topic} - {gender}", {
                    **derived_common("Training", "P3-E8 Reporting", "P3-E8", {
                        "default_unit": "%", "supported_units": ["%"], "allow_unit_conversion": False}),
                    "source_type": "composite", "source_config": {"composite": {
                        "operation": "ratio_percent", "source_kpi_ids": [source["id"], headcounts[(group, gender)]["id"]]}},
                    "value_field": "", "aggregation_type": "formula",
                    "formula_config": {"formula_type": "ratio", "formula_definition": "trained / eligible * 100",
                                       "dependencies": [source["id"], headcounts[(group, gender)]["id"]]},
                    "dimensions": ["organization", "recipient_group", "gender", "training_topic"],
                    "metadata": {"recipient_group": group, "gender": gender, "topic": topic},
                }, now)
                await upsert_mapping(coverage, "p3_training_details", f"rows.{row}.{field_prefix}_pct", "P3-E8", now)
                mapped.extend([source, coverage])

    raw_training = await db.esg_kpi_definitions.find(
        {"category_name": "Training", "subcategory": "General Training", "metric_code": {"$not": {"$regex": "^BRSR_"}}}, {"_id": 0}
    ).to_list(500)
    for definition in raw_training:
        await remove_brsr_reference(definition, "P3-E8", now)
    return mapped


async def run() -> Dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    definitions = await db.esg_kpi_definitions.find({}, {"_id": 0}).to_list(20000)
    mappings = await db.kpi_framework_mappings.find({"framework": "BRSR"}, {"_id": 0}).to_list(20000)
    stamp = now.replace(":", "").replace("+", "_")
    backup = BACKUP_DIR / f"brsr_derived_kpi_sync_{stamp}.json"
    backup.write_text(json.dumps({"definitions": definitions, "mappings": mappings}, default=str, indent=2), encoding="utf-8")
    result = {
        "energy": len(await sync_energy(now)),
        "water_discharge": len(await sync_water_discharge(now)),
        "internal_complaints": len(await sync_internal_complaints(now)),
        "parental_leave": len(await sync_parental_leave(now)),
        "training": len(await sync_training(now)),
        "backup": str(backup),
    }
    return result


if __name__ == "__main__":
    print(asyncio.run(run()))