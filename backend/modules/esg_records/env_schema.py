"""Biodiversity / Climate Change / Material: field specs (tables, summaries, tree) and entry rules."""
from typing import Any, Dict, List, Optional

WATER_UNITS = ["Litres", "KiloLitres", "MegaLitres"]
UNIT_FACTORS = {"litres": 1.0, "kilolitres": 1000.0, "megalitres": 1_000_000.0}


def F(key, label, type="number", units=None, default_unit=None, group="", level=0, parent=None, brsr=None, gri=None,
      kpi=None, old=None, agg="sum", cols=None, summary=None, sum_of=None, percent=False):
    return {"key": key, "label": label, "type": type, "units": units, "default_unit": default_unit or (units or [None])[0],
            "group": group, "level": level, "parent": parent, "brsr": brsr, "gri": gri, "kpi": kpi, "old": old,
            "agg": agg, "cols": cols, "summary": summary, "sum_of": sum_of, "percent": percent}


def C(key, label, type="text", options=None, required=False, gri=None, brsr=None, max=None):
    return {"key": key, "label": label, "type": type, "options": options, "required": required,
            "gri_disclosure": gri, "brsr_reference": brsr, "max": max}


YN = ["Yes", "No"]
ECO = ("Biodiversity", "Ecological Sensitivity")
IMPACTS = ("Biodiversity", "Biodiversity Impacts")
TRANSITION = ("Climate Change", "Transition Plan for climate change mitigation")
ADAPTATION = ("Climate Change", "Climate Change Adaptation Plan & Implementation")
MCONS = ("Material", "Material Consumption")
MRECYCLED = ("Material", "Recycled Input Materials")
MRECLAIMED = ("Material", "Reclaimed Products & Packaging")

SPECS: Dict[tuple, List[Dict[str, Any]]] = {
    ECO: [
        F("number_of_sites", "Number of sites/facilities with significant biodiversity impacts", group="Summary",
          brsr="P6-E11 (partial)", gri="101-5-a", kpi="Number of Sites with Significant Biodiversity Impacts",
          summary={"source": "site_records", "op": "count"}),
        F("total_area_under_restoration", "Total area under restoration/rehabilitation (ha)", group="Summary",
          gri="101-2-b-i", kpi="Total Area Under Restoration / Rehabilitation (ha)",
          summary={"source": "site_records", "op": "sum", "column": "area_under_restoration_ha"}),
        F("total_area_restored", "Total area restored/rehabilitated (ha)", group="Summary",
          gri="101-2-b-ii", kpi="Total Area Restored / Rehabilitated (ha)",
          summary={"source": "site_records", "op": "sum", "column": "area_restored_ha"}),
        F("site_records", "Site records (one row per site/facility)", type="table", group="Site Records", cols=[
            C("site_name", "Site/facility name", required=True, gri="101-5-a", brsr="P6-E11"),
            C("location", "Location", gri="101-5-a", brsr="P6-E11"),
            C("size_ha", "Size (ha)", "number", gri="101-5-a"),
            C("in_or_near_sensitive_area", "In / near ecologically sensitive area", "dropdown", YN, gri="101-5-b", brsr="P6-E11"),
            C("distance_km", "Distance to the area (km)", "number", gri="101-5-b"),
            C("area_of_biodiversity_importance", "Area of biodiversity importance", "dropdown", YN, gri="101-5-b-i"),
            C("area_of_high_ecosystem_integrity", "Area of high ecosystem integrity", "dropdown", YN, gri="101-5-b-ii"),
            C("area_of_rapid_decline_in_ecosystem_integrity", "Area of rapidly declining ecosystem integrity", "dropdown", YN, gri="101-5-b-iii"),
            C("area_of_high_physical_water_risk", "Area of high physical water risk", "dropdown", YN, gri="101-5-b-iv; 303-1-a (related)"),
            C("area_important_for_ecosystem_services", "Area important for ecosystem services to Indigenous Peoples / local communities / stakeholders", "dropdown", YN, gri="101-5-b-v, 101-8-a (related)"),
            C("area_under_restoration_ha", "Area under restoration/rehabilitation (ha)", "number", gri="101-2-b-i"),
            C("area_restored_ha", "Area restored/rehabilitated (ha)", "number", gri="101-2-b-ii"),
        ]),
    ],
    IMPACTS: [
        F("total_water_withdrawal", "Total water withdrawal (sites)", units=WATER_UNITS, default_unit="MegaLitres", group="Summary",
          gri="101-6-b-ii, 303-3-a (related)", kpi="Water Withdrawal in Sites with Significant Biodiversity Impacts",
          old="ENV_WATER_WITHDRAWAL_IN_MEGALITRES_IN_SITES_",
          summary={"source": "site_water_records", "op": "sum", "column": "water_withdrawal", "unit_column": "water_unit"}),
        F("total_water_consumption", "Total water consumption (sites)", units=WATER_UNITS, default_unit="MegaLitres", group="Summary",
          gri="101-6-b-ii, 303-5-a (related)", kpi="Water Consumption in Sites with Significant Biodiversity Impacts",
          old="ENV_WATER_CONSUMPTION_IN_MEGALITRES_IN_SITES",
          summary={"source": "site_water_records", "op": "sum", "column": "water_consumption", "unit_column": "water_unit"}),
        F("total_quantity_of_pollutant", "Total quantity of pollutant", group="Summary", gri="101-6-c, 305-7-a (related)",
          kpi="Total Quantity of Pollutant", old="ENV_TOTAL_QUANTITY_OF_POLLUTANT",
          summary={"source": "pollutant_entries", "op": "sum", "column": "quantity"}),
        F("site_water_records", "Exploitation of natural resources - water (one row per site)", type="table",
          group="Exploitation of Natural Resources - Water", cols=[
            C("site_name", "Site/facility name", required=True, gri="101-6"),
            C("water_withdrawal", "Water withdrawal (site)", "number", gri="101-6-b-ii, 303-3-a (related)"),
            C("water_consumption", "Water consumption (site)", "number", gri="101-6-b-ii, 303-5-a (related)"),
            C("water_unit", "Unit", "dropdown", WATER_UNITS),
        ]),
        F("pollutant_entries", "Pollution - pollutant entries", type="table", group="Pollution", cols=[
            C("site_name", "Site/facility name", required=True, gri="101-6"),
            C("pollutant_type", "Type of pollutant", required=True, gri="101-6-c"),
            C("quantity", "Quantity of pollutant", "number", required=True, gri="101-6-c, 305-7-a (related)"),
        ]),
    ],
    TRANSITION: [
        F("transition_plan_expenditure", "Transition plan expenditure", units=["INR", "Dollars"], group="Expenditure",
          brsr="P2-E1 (partial)", gri="102-1-c", kpi="Transition Plan Expenditure",
          old="ENV_TRANSITION_PLAN_EXPENDITURE_MONETARY_VAL"),
        F("transition_plan_expenditure_percentage", "As % of total expenditure", group="Expenditure", level=1,
          parent="transition_plan_expenditure", brsr="P2-E1 (partial)", gri="102-1-c", percent=True,
          kpi="Transition Plan Expenditure (% of Total Expenditure)", old="ENV_TRANSITION_PLAN_EXPENDITURE_OF_TOTAL_EXP", agg="avg"),
    ],
    ADAPTATION: [
        F("adaptation_plan_expenditure", "Adaptation plan expenditure", units=["INR", "Dollars"], group="Expenditure",
          gri="102-2-b-iii", kpi="Adaptation Plan Expenditure", old="ENV_ADAPTATION_PLAN_EXPENDITURE_MONETARY_VAL"),
        F("adaptation_plan_expenditure_percentage", "As % of total expenditure", group="Expenditure", level=1,
          parent="adaptation_plan_expenditure", gri="102-2-b-iii", percent=True,
          kpi="Adaptation Plan Expenditure (% of Total Expenditure)", old="ENV_ADAPTATION_PLAN_EXPENDITURE_OF_TOTAL_EXP", agg="avg"),
    ],
    MCONS: [
        F("total_weight_of_materials", "Total weight of materials", units=["MT", "kg"], group="Total", gri="301-1-a",
          kpi="Total Weight of Materials", sum_of=["renewable_weight_of_materials", "non_renewable_weight_of_materials"]),
        F("total_volume_of_materials", "Total volume of materials", units=WATER_UNITS, default_unit="Litres", group="Total",
          gri="301-1-a", kpi="Total Volume of Materials", sum_of=["renewable_volume_of_materials", "non_renewable_volume_of_materials"]),
        F("renewable_weight_of_materials", "Renewable materials - weight", units=["MT", "kg"], group="Renewable Materials", level=1,
          gri="301-1-a-ii", kpi="Weight of Renewable Materials", old="ENV_WEIGHT_OF_RENEWABLE_MATERIALS"),
        F("renewable_volume_of_materials", "Renewable materials - volume", units=WATER_UNITS, default_unit="Litres",
          group="Renewable Materials", level=1, gri="301-1-a-ii", kpi="Volume of Renewable Materials", old="ENV_VOLUME_OF_RENEWABLE_MATERIALS"),
        F("non_renewable_weight_of_materials", "Non-renewable materials - weight", units=["MT", "kg"], group="Non-renewable Materials",
          level=1, gri="301-1-a-i", kpi="Weight of Non-renewable Materials", old="ENV_WEIGHT_OF_NONRENEWABLE_MATERIALS"),
        F("non_renewable_volume_of_materials", "Non-renewable materials - volume", units=WATER_UNITS, default_unit="Litres",
          group="Non-renewable Materials", level=1, gri="301-1-a-i", kpi="Volume of Non-renewable Materials", old="ENV_VOLUME_OF_NONRENEWABLE_MATERIALS"),
    ],
    MRECYCLED: [
        F("percentage_recycled_input_materials_basis_total_weight_used", "% recycled input materials by total weight",
          group="Overall", brsr="P2-L3 (partial)", gri="301-2-a", percent=True, agg="avg",
          kpi="% Recycled Input Materials (by Weight)", old="ENV_OF_RECYCLED_INPUT_MATERIALS_BASIS_TOTAL_"),
        F("percentage_recycled_input_materials_basis_total_volume_used", "% recycled input materials by total volume",
          group="Overall", brsr="P2-L3 (partial)", gri="301-2-a", percent=True, agg="avg",
          kpi="% Recycled Input Materials (by Volume)", old="ENV_OF_RECYCLED_INPUT_MATERIALS_BASIS_TOTAL__1"),
        F("input_materials_by_value", "By input material (by value)", type="table", group="By Input Material (by value)", cols=[
            C("input_material_name", "Input material name", required=True, brsr="P2-L3"),
            C("percent_recycled_or_reused", "% recycled or re-used input to total material (by value)", "number",
              required=True, gri="301-2-a (related)", brsr="P2-L3", max=100),
        ]),
    ],
    MRECLAIMED: [
        F("average_percentage_reclaimed_products", "Average % reclaimed products and packaging", group="Summary",
          brsr="P2-L5", gri="301-3-a", percent=True, agg="avg", kpi="% Reclaimed Products and Packaging (Average)",
          old="ENV_OF_RECLAIMED_PRODUCTS",
          summary={"source": "reclaimed_products_by_category", "op": "avg", "column": "percent_reclaimed"}),
        F("reclaimed_products_by_category", "By product category", type="table", group="By Product Category", cols=[
            C("product_category", "Product category", required=True, gri="301-3-a", brsr="P2-L5"),
            C("percent_reclaimed", "% reclaimed products and packaging of products sold", "number", required=True,
              gri="301-3-a", brsr="P2-L5", max=100),
        ]),
    ],
}

# Existing Restoration / Rehabilitation fields keep their data; only references are added.
RESTORATION_REFS = {
    "no_of_sites_facility_with_the_most_significant_impacts_on_biodiversity": ("P6-E11 (partial)", "101-5-a"),
    "area_under_restoration_or_rehabilitation": (None, "101-2-b-i"),
    "area_restored_or_rehabilitated": (None, "101-2-b-ii"),
}


def env_tree_meta(cat: str, sub: str) -> Dict[str, Dict[str, Any]]:
    specs = SPECS.get((cat, sub), [])
    sum_parents: Dict[str, List[str]] = {}
    for s in specs:
        for child in s["sum_of"] or []:
            sum_parents.setdefault(child, []).append(s["key"])
    return {s["key"]: {"group": s["group"], "level": s["level"], "parent_key": s["parent"],
                       "sum_parents": sum_parents.get(s["key"], []), "order": i} for i, s in enumerate(specs)}


def _sum_rules(cat: str, sub: str) -> Optional[Dict[str, Any]]:
    sums = [(s["key"], s["sum_of"]) for s in SPECS.get((cat, sub), []) if s["sum_of"]]
    if not sums:
        return None
    return {"root": [p for p, _c in sums], "sums": sums, "le": [], "quality": [], "other": []}


ENV_SUM_RULES = {sub.lower(): r for (cat, sub) in SPECS if cat == "Material" and (r := _sum_rules(cat, sub))}
ENV_LABELS = {s["key"]: s["label"] for specs in SPECS.values() for s in specs}


def _number(value: Any, label: str) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{label}: invalid number '{value}'")


def apply_table_rules(category: str, subcategory: str, field_values: Dict[str, Any], is_draft: bool = False) -> Dict[str, Any]:
    """Validate repeatable tables and derive their count / sum / average summary fields."""
    key = next((k for k in SPECS if k[0].lower() == (category or "").lower() and k[1].lower() == (subcategory or "").lower()), None)
    specs = SPECS.get(key) if key else None
    if not specs or not any(s["type"] == "table" for s in specs):
        return field_values
    out = dict(field_values)
    for spec in (s for s in specs if s["type"] == "table"):
        rows = out.get(spec["key"]) or []
        if not isinstance(rows, list):
            raise ValueError(f"{spec['label']} must be a list")
        rows = [r for r in rows if isinstance(r, dict) and any(v not in (None, "") for k, v in r.items() if not k.endswith("_unit"))]
        for i, row in enumerate(rows, start=1):
            for col in spec["cols"]:
                value = row.get(col["key"])
                if col["type"] == "number":
                    num = _number(value, f"{spec['label']} row {i}: {col['label']}")
                    if num is not None and num < 0:
                        raise ValueError(f"Row {i}: {col['label']} cannot be negative")
                    if num is not None and col["max"] is not None and num > col["max"]:
                        raise ValueError(f"Row {i}: {col['label']} cannot exceed {col['max']}")
                if col["required"] and not is_draft and value in (None, ""):
                    raise ValueError(f"{spec['label']} row {i}: {col['label']} is required")
        out[spec["key"]] = rows
    for spec in (s for s in specs if s["summary"]):
        sm = spec["summary"]
        rows = out.get(sm["source"]) or []
        if sm["op"] == "count":
            out[spec["key"]] = len(rows)
            continue
        unit = out.get(f"{spec['key']}_unit") or spec["default_unit"]
        target = UNIT_FACTORS.get(str(unit).lower(), 1.0)
        values = []
        for row in rows:
            num = _number(row.get(sm["column"]), sm["column"])
            if num is None:
                continue
            if sm.get("unit_column"):
                num = num * UNIT_FACTORS.get(str(row.get(sm["unit_column"]) or unit).lower(), 1.0) / target
            values.append(num)
        total = sum(values)
        if sm["op"] == "avg":
            out[spec["key"]] = round(total / len(values), 6) if values else 0
        else:
            out[spec["key"]] = round(total, 6)
        if spec["units"]:
            out[f"{spec['key']}_unit"] = unit
    return out
