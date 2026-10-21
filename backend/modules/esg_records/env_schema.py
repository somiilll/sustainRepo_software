"""Biodiversity / Climate Change / Material: field specs (tables, summaries, tree) and entry rules."""
from typing import Any, Dict, List, Optional

WATER_UNITS = ["Litres", "KiloLitres", "MegaLitres"]
ENERGY_UNITS = ["J", "kJ", "MJ", "GJ", "TJ", "kWh", "MWh", "GWh"]
UNIT_FACTORS = {"litres": 1.0, "kilolitres": 1000.0, "megalitres": 1_000_000.0,
                "j": 1.0, "kj": 1e3, "mj": 1e6, "gj": 1e9, "tj": 1e12, "kwh": 3.6e6, "mwh": 3.6e9, "gwh": 3.6e12}


def F(key, label, type="number", units=None, default_unit=None, group="", level=0, parent=None, brsr=None, gri=None,
      kpi=None, old=None, agg="sum", cols=None, summary=None, sum_of=None, percent=False, le=None, eq_parts=None,
      options=None, option_refs=None, ratio=None, sum_le=None, legacy_only=False, hide_if_table_has_rows=None,
      show_with_legacy_ui=False):
    return {"key": key, "label": label, "type": type, "units": units, "default_unit": default_unit or (units or [None])[0],
            "group": group, "level": level, "parent": parent, "brsr": brsr, "gri": gri, "kpi": kpi, "old": old,
            "agg": agg, "cols": cols, "summary": summary, "sum_of": sum_of, "percent": percent,
            "le": le, "eq_parts": eq_parts, "options": options, "option_refs": option_refs, "ratio": ratio, "sum_le": sum_le,
            "legacy_only": legacy_only, "hide_if_table_has_rows": hide_if_table_has_rows,
            "show_with_legacy_ui": show_with_legacy_ui}


def C(key, label, type="text", options=None, required=False, gri=None, brsr=None, max=None, derived=None, options_source=None):
    return {"key": key, "label": label, "type": type, "options": options, "required": required,
            "gri_disclosure": gri, "brsr_reference": brsr, "max": max, "derived": derived,
            "options_source": options_source}


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
          brsr="P6-E11", gri="101-5-a", kpi="Number of Sites with Significant Biodiversity Impacts",
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
            C("area_of_high_physical_water_risk", "Area of high physical water risk", "dropdown", YN, gri="101-5-b-iv; 303-1-a"),
            C("area_important_for_ecosystem_services", "Area important for ecosystem services to Indigenous Peoples / local communities / stakeholders", "dropdown", YN, gri="101-5-b-v, 101-8-a"),
            C("area_under_restoration_ha", "Area under restoration/rehabilitation (ha)", "number", gri="101-2-b-i"),
            C("area_restored_ha", "Area restored/rehabilitated (ha)", "number", gri="101-2-b-ii"),
        ]),
    ],
    IMPACTS: [
        F("total_water_withdrawal", "Total water withdrawal (sites)", units=WATER_UNITS, default_unit="MegaLitres", group="Summary",
          gri="101-6-b-ii, 303-3-a", kpi="Water Withdrawal in Sites with Significant Biodiversity Impacts",
          old="ENV_WATER_WITHDRAWAL_IN_MEGALITRES_IN_SITES_",
          summary={"source": "site_water_records", "op": "sum", "column": "water_withdrawal", "unit_column": "water_unit"}),
        F("total_water_consumption", "Total water consumption (sites)", units=WATER_UNITS, default_unit="MegaLitres", group="Summary",
          gri="101-6-b-ii, 303-5-a", kpi="Water Consumption in Sites with Significant Biodiversity Impacts",
          old="ENV_WATER_CONSUMPTION_IN_MEGALITRES_IN_SITES",
          summary={"source": "site_water_records", "op": "sum", "column": "water_consumption", "unit_column": "water_unit"}),
        F("total_quantity_of_pollutant", "Total quantity of pollutant", group="Summary", gri="101-6-c, 305-7-a",
          kpi="Total Quantity of Pollutant", old="ENV_TOTAL_QUANTITY_OF_POLLUTANT",
          summary={"source": "pollutant_entries", "op": "sum", "column": "quantity"}),
        F("site_water_records", "Exploitation of natural resources - water (one row per site)", type="table",
          group="Exploitation of Natural Resources - Water", cols=[
            C("site_name", "Site/facility name", required=True, gri="101-6"),
            C("water_withdrawal", "Water withdrawal (site)", "number", gri="101-6-b-ii, 303-3-a"),
            C("water_consumption", "Water consumption (site)", "number", gri="101-6-b-ii, 303-5-a"),
            C("water_unit", "Unit", "dropdown", WATER_UNITS),
        ]),
        F("pollutant_entries", "Pollution - pollutant entries", type="table", group="Pollution", cols=[
            C("site_name", "Site/facility name", required=True, gri="101-6"),
            C("pollutant_type", "Type of pollutant", required=True, gri="101-6-c"),
            C("quantity", "Quantity of pollutant", "number", required=True, gri="101-6-c, 305-7-a"),
        ]),
    ],
    TRANSITION: [
        F("transition_plan_expenditure", "Transition plan expenditure", units=["INR", "Dollars"], group="Expenditure",
          brsr="P2-E1", gri="102-1-c", kpi="Transition Plan Expenditure",
          old="ENV_TRANSITION_PLAN_EXPENDITURE_MONETARY_VAL"),
        F("transition_plan_expenditure_percentage", "As % of total expenditure", group="Expenditure", level=1,
          parent="transition_plan_expenditure", brsr="P2-E1", gri="102-1-c", percent=True,
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
          group="Overall", brsr="P2-L3", gri="301-2-a", percent=True, agg="avg",
          kpi="% Recycled Input Materials (by Weight)", old="ENV_OF_RECYCLED_INPUT_MATERIALS_BASIS_TOTAL_"),
        F("percentage_recycled_input_materials_basis_total_volume_used", "% recycled input materials by total volume",
          group="Overall", brsr="P2-L3", gri="301-2-a", percent=True, agg="avg",
          kpi="% Recycled Input Materials (by Volume)", old="ENV_OF_RECYCLED_INPUT_MATERIALS_BASIS_TOTAL__1"),
        F("input_materials_by_value", "By input material (by value)", type="table", group="By Input Material (by value)", cols=[
            C("input_material_name", "Input material name", required=True, brsr="P2-L3"),
            C("percent_recycled_or_reused", "% recycled or re-used input to total material (by value)", "number",
              required=True, gri="301-2-a", brsr="P2-L3", max=100),
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

INTERNAL = (COMPLAINT_CATEGORY := "Complaints", "Internal Complaints")
CONSUMER = ("Complaints", "Consumer Complaints")
EXTERNAL = ("Complaints", "External Complaints")
GRI_TOTAL = "2-25, 2-26"
COMPLAINANTS = ["Board of Directors", "Key Management Personnel", "Employee", "Workers", "Contractors",
                "Investors (other than shareholders)", "Shareholders"]
EXT_GROUPS = [("communities", "Communities"), ("investors", "Investors (other than shareholders)"),
              ("shareholders", "Shareholders"), ("value_chain", "Value chain partners"), ("other", "Other")]


def _cnt(key, label, group, level=0, parent=None, brsr=None, gri=None, kpi=None, old=None, **kw):
    return F(key, label, group=group, level=level, parent=parent, brsr=brsr, gri=gri, kpi=kpi, old=old, **kw)


_I = "no_of_complaints_regarding_"
_INTERNAL_PARTS = [_I + k for k in ("bribery", "corruption", "conflict_of_interest", "working_conditions", "health_safety",
                                    "sexual_harassment", "discrimination_at_workplace", "child_labour",
                                    "forced_labour_involuntary_labour", "wages", "other_human_rights_related_issues")]
SPECS[INTERNAL] = [
    _cnt("total_no_of_complaints_recieved", "Total number of complaints", "Total", brsr="A-25", gri=GRI_TOTAL,
         kpi="Internal Complaints (Total)", old="SOC_NO_OF_COMPLAINTS", sum_of=_INTERNAL_PARTS),
    _cnt(_I + "bribery", "Bribery", "Ethics & Integrity", 1, gri="205-3", kpi="Internal Complaints - Bribery", old="SOC_NO_OF_COMPLAINTS_ON_BRIBERY"),
    _cnt(_I + "corruption", "Corruption", "Ethics & Integrity", 1, gri="205-3", kpi="Internal Complaints - Corruption", old="SOC_NO_OF_COMPLAINTS_ON_CORRUPTION"),
    _cnt(_I + "conflict_of_interest", "Conflict of interest", "Ethics & Integrity", 1, brsr="P1-E6", gri="2-15",
         kpi="Internal Complaints - Conflict of Interest", old="SOC_NO_OF_COMPLAINTS_ON_CONFLICT_OF_INTEREST"),
    _cnt("conflict_of_interest_directors", "of which: Directors", "Ethics & Integrity", 2, _I + "conflict_of_interest", brsr="P1-E6",
         gri="2-15", kpi="Internal Complaints - Conflict of Interest - Directors", le=_I + "conflict_of_interest"),
    _cnt("conflict_of_interest_kmps", "of which: KMPs", "Ethics & Integrity", 2, _I + "conflict_of_interest", brsr="P1-E6",
         gri="2-15", kpi="Internal Complaints - Conflict of Interest - KMPs", le=_I + "conflict_of_interest"),
    _cnt(_I + "working_conditions", "Working conditions", "Workplace", 1, brsr="P3-E13", kpi="Internal Complaints - Working Conditions",
         old="SOC_NO_OF_COMPLAINTS_ON_WORKING_CONDITIONS"),
    _cnt(_I + "health_safety", "Health & safety", "Workplace", 1, brsr="P3-E13", gri="403-2",
         kpi="Internal Complaints - Health & Safety", old="SOC_NO_OF_COMPLAINTS_ON_HEALTH"),
    _cnt(_I + "sexual_harassment", "Sexual harassment", "Human Rights", 1, brsr="P5-E6", gri="406-1-a",
         kpi="Internal Complaints - Sexual Harassment", old="SOC_NO_OF_COMPLAINTS_ON_SEXUAL_HARASSMENT"),
    _cnt("no_of_posh_complaints", "of which: POSH complaints", "Human Rights", 2, _I + "sexual_harassment", brsr="P5-E7", gri="406-1-a",
         kpi="Internal Complaints - POSH Complaints", old="SOC_NO_OF_POSH_COMPLAINTS", le=_I + "sexual_harassment"),
    _cnt("no_of_posh_complaints_upheld", "of which: POSH complaints upheld", "Human Rights", 3, "no_of_posh_complaints", brsr="P5-E7",
         gri="406-1-b", kpi="Internal Complaints - POSH Complaints Upheld", le="no_of_posh_complaints"),
    _cnt(_I + "discrimination_at_workplace", "Discrimination", "Human Rights", 1, brsr="P5-E6", gri="406-1-a",
         kpi="Internal Complaints - Discrimination", old="SOC_NO_OF_COMPLAINTS_ON_DISCRIMINATION_AT_WO"),
    _cnt(_I + "child_labour", "Child labour", "Human Rights", 1, brsr="P5-E6", gri="408-1",
         kpi="Internal Complaints - Child Labour", old="SOC_NO_OF_COMPLAINTS_ON_CHILD_LABOUR"),
    _cnt(_I + "forced_labour_involuntary_labour", "Forced labour", "Human Rights", 1, brsr="P5-E6", gri="409-1",
         kpi="Internal Complaints - Forced Labour", old="SOC_NO_OF_COMPLAINTS_ON_FORCED_LABOURINVOLUN"),
    _cnt(_I + "wages", "Wages", "Human Rights", 1, brsr="P5-E6", kpi="Internal Complaints - Wages", old="SOC_NO_OF_COMPLAINTS_ON_WAGES"),
    _cnt(_I + "other_human_rights_related_issues", "Other human-rights issues", "Human Rights", 1, brsr="P5-E6", gri="2-25",
         kpi="Internal Complaints - Other Human Rights Issues", old="SOC_NO_OF_COMPLAINTS_ON_OTHER_HUMAN_RIGHTS_R"),
    _cnt("no_of_complaints_where_incident_was_reviewed_by_the_organization", "of which: Complaints reviewed", "By Status", 1,
         gri="406-1-b", kpi="Internal Complaints - Reviewed", le="total_no_of_complaints_recieved"),
    _cnt("no_of_complaints_resolved", "Resolved complaints", "By Status", 1, brsr="A-25", gri="406-1-b",
         kpi="Internal Complaints - Resolved", old="SOC_NO_OF_COMPLAINTS_RESOLVED"),
    _cnt("no_of_pending_complaints", "Pending complaints (at year end)", "By Status", 1, brsr="A-25; P3-E13; P5-E6",
         kpi="Internal Complaints - Pending", old="SOC_NO_OF_PENDING_COMPLAINTS"),
    _cnt("no_of_complaints_where_law_enforcement_agency_involved", "of which: Law-enforcement involvement / action", "Law Enforcement", 0,
         brsr="P1-E5", gri="205-3-b", kpi="Internal Complaints - Law-enforcement Involvement",
         old="SOC_NO_OF_COMPLAINTS_IN_WHICH_LAW_ENFORCEMEN", le="total_no_of_complaints_recieved"),
    _cnt("no_of_complaints_where_law_enforcement_agency_took_a_disciplinary_action", "of which: Disciplinary action taken", "Law Enforcement", 1,
         "no_of_complaints_where_law_enforcement_agency_involved", brsr="P1-E5", gri="205-3-b",
         kpi="Internal Complaints - Law-enforcement Disciplinary Action", old="SOC_NO_OF_COMPLAINTS_WHERE_LAW_ENFORCEMENT_A",
         le="no_of_complaints_where_law_enforcement_agency_involved"),
    F("complaint_records", "Complaint records (one row per complaint)", type="table", group="Complaint Record Attributes", cols=[
        C("complainant", "Complainant", "dropdown", COMPLAINANTS, brsr="P1-E5; P1-E6"),
        C("person_complained_against", "Person complained against", "dropdown", ["Director", "KMP", "Employee", "Worker"], brsr="P1-E5; P1-E6"),
    ]),
]
SPECS[INTERNAL][0]["eq_parts"] = ["no_of_complaints_resolved", "no_of_pending_complaints"]

_C = "no_of_complaints_on_"
_CP = "pending_resolution_"
_CONSUMER_ROWS = [
    ("data_privacy", "Data privacy", "P9-E3", "418-1-a", "SOC_NO_OF_DATA_PRIVACY_COMPLAINTS"),
    ("advertising", "Advertising", "P9-E3", "417-3", "SOC_NO_OF_ADVERTISING_COMPLAINTS"),
    ("cyber_security", "Cyber-security", "P9-E3", "418-1", "SOC_NO_OF_CYBERSECURITY_COMPLAINTS"),
    ("delivery_of_essential_services", "Delivery of essential services", "P9-E3", None, "SOC_NO_OF_DELIVERY_OF_ESSENTIAL_SERVICES_COM"),
    ("restrictive_unfair_trade_practices", "Restrictive / unfair trade practices", "P9-E3", "206-1", "SOC_NO_OF_RESTRICTIVEUNFAIR_TRADE_PRACTICES_"),
    ("other", "Other", "P9-E3", None, None),
]
SPECS[CONSUMER] = [
    _cnt("total_no_of_complaints", "Total number of consumer complaints", "Consumer Complaints", brsr="A-25; P9-E3", gri="2-25",
         kpi="Consumer Complaints (Total)", old="SOC_NO_OF_COMPLAINTS_FROM_CUSTOMERS",
         sum_of=[_C + key if key != "other" else "no_of_other_consumer_complaints" for key, *_ in _CONSUMER_ROWS]),
    _cnt("total_consumer_complaints_pending_resolution", "Total number pending resolution at year end", "Consumer Complaints", brsr="A-25; P9-E3", gri="2-25",
         kpi="Consumer Complaints Pending Resolution (Total)", sum_of=[_CP + key for key, *_ in _CONSUMER_ROWS]),
]
for _key, _label, _brsr, _gri, _old in _CONSUMER_ROWS:
    _received_key = _C + _key if _key != "other" else "no_of_other_consumer_complaints"
    SPECS[CONSUMER].append(_cnt(_received_key, _label, "Consumer Complaints", 1, "total_no_of_complaints", brsr=_brsr, gri=_gri,
                                kpi=f"Consumer Complaints - {_label}", old=_old))
    SPECS[CONSUMER].append(_cnt(_CP + _key, _label, "Consumer Complaints", 1, "total_consumer_complaints_pending_resolution", brsr=_brsr, gri=_gri,
                                kpi=f"Consumer Complaints Pending Resolution - {_label}"))

_ext_filed = [f"ext_{g}_filed" for g, _l in EXT_GROUPS]
_ext_pending = [f"ext_{g}_pending" for g, _l in EXT_GROUPS]
_ext_resolved = [f"ext_{g}_resolved" for g, _l in EXT_GROUPS]
SPECS[EXTERNAL] = [
    _cnt("total_external_complaints", "Total external complaints (filed)", "Total", brsr="A-25", gri="2-25",
         kpi="External Complaints (Total)", summary={"source": "complaint_records", "op": "sum", "column": "filed", "optional": True}),
    _cnt("pending_complaints_total", "Pending (Total)", "By Status", 0, brsr="A-25", kpi="External Complaints - Pending (Total)",
         summary={"source": "complaint_records", "op": "sum", "column": "pending", "optional": True}),
    _cnt("resolved_complaints_total", "Resolved (Total)", "By Status", 0, brsr="A-25", kpi="External Complaints - Resolved (Total)",
         summary={"source": "complaint_records", "op": "sum", "column": "resolved", "optional": True}),
]
for _g, _label in EXT_GROUPS:
    for _suffix, _text, _brsr in (("filed", "Filed during the year", "A-25"), ("pending", "Pending at year end", "A-25"),
                                  ("resolved", "Resolved", "A-25")):
        SPECS[EXTERNAL].append(_cnt(f"ext_{_g}_{_suffix}", f"{_label} - {_text}", _label, 1, brsr=_brsr,
                                    kpi=f"External Complaints - {_label} - {_text}", legacy_only=True,
                                    hide_if_table_has_rows="complaint_records"))
SPECS[EXTERNAL] += [
    F("complaint_records", "External complaints by stakeholder", type="table", group="External Complaints by Stakeholder", cols=[
        C("complainant", "Complainant", "dropdown", [label for _g, label in EXT_GROUPS], required=True),
        C("filed", "Filed during the year", "number", required=True),
        C("pending", "Pending at year end", "number", required=True),
        C("resolved", "Resolved", "number", required=True),
    ]),
]

WF = "Employees/Worker"
HS = "Health & Safety"
NEW_HIRES = (WF, "New Employees/Worker")
TERM_EMP = (WF, "Terminated Employees")
TERM_WRK = (WF, "Terminated Workers")
OHS_EMP = (HS, "Occupational Health & Safety Management System for Employees")
OHS_WRK = (HS, "Occupational Health & Safety Management System for Workers")
PRODUCT_HS = (HS, "Product & Service Health and Safety Assessment")
INCIDENTS = (HS, "Health & Safety Incidents")
REHAB = (HS, "Rehabilitation after Serious Injury/Fatality")
_NH = "no_of_employees_worker_"
_T = "G102-3"


def _n(key, label, group, level=0, parent=None, **kw):
    return F(key, label, group=group, level=level, parent=parent, **kw)


SPECS[NEW_HIRES] = [
    _n("total_no_of_people_hired", "New hires (Total)", "Total", gri="401-1-a; 102-3-a, 102-3-e", kpi="New Hires (Total)",
       sum_of=["new_hires_employees", "new_hires_workers"], eq_parts=[["female", "male"], [_NH + "under_30", _NH + "30_50", _NH + "over_50"]]),
    _n("new_hires_employees", "Employees", "By Type", 1, gri="401-1-a; 102-3-a", kpi="New Hires - Employees",
       sum_of=["new_hires_employees_permanent", "new_hires_employees_other_than_permanent"]),
    _n("new_hires_employees_permanent", "Employees - Permanent", "By Type", 2, "new_hires_employees", gri="102-3-a-ii", kpi="New Hires - Employees - Permanent"),
    _n("new_hires_employees_other_than_permanent", "Employees - Other than permanent", "By Type", 2, "new_hires_employees",
       gri="102-3-a-ii", kpi="New Hires - Employees - Other Than Permanent"),
    _n("new_hires_workers", "Workers", "By Type", 1, gri="102-3-e", kpi="New Hires - Workers",
       sum_of=["new_hires_workers_permanent", "new_hires_workers_other_than_permanent"]),
    _n("new_hires_workers_permanent", "Workers - Permanent", "By Type", 2, "new_hires_workers", gri="102-3-e", kpi="New Hires - Workers - Permanent"),
    _n("new_hires_workers_other_than_permanent", "Workers - Other than permanent", "By Type", 2, "new_hires_workers",
       gri="102-3-e", kpi="New Hires - Workers - Other Than Permanent"),
    _n("female", "Female", "By Gender", 1, gri="401-1-a; 102-3-a-i, 102-3-e", kpi="New Hires - Female"),
    _n("male", "Male", "By Gender", 1, gri="401-1-a; 102-3-a-i, 102-3-e", kpi="New Hires - Male"),
    _n(_NH + "under_30", "Under 30", "By Age Group", 1, gri="401-1-a", kpi="New Hires - Under 30"),
    _n(_NH + "30_50", "30-50", "By Age Group", 1, gri="401-1-a", kpi="New Hires - 30-50"),
    _n(_NH + "over_50", "Over 50", "By Age Group", 1, gri="401-1-a", kpi="New Hires - Over 50"),
]
SPECS[TERM_EMP] = [
    _n("no_of_people_terminated", "Employees terminated (Total)", "Total", brsr="A-22", gri="102-3-b; 401-1-b",
       kpi="Employees Terminated (Total)", sum_of=["no_of_permanent_employee_terminated", "no_of_temporary_employee_terminated",
       "no_of_contract_employee_terminated", "no_of_part_time_employee_terminated", "no_of_intern_trainee_terminated"],
       eq_parts=["female", "male"]),
    _n("female", "Female", "By Gender", 1, gri="102-3-b-i; 401-1-b", kpi="Employees Terminated - Female"),
    _n("male", "Male", "By Gender", 1, gri="102-3-b-i; 401-1-b", kpi="Employees Terminated - Male"),
    _n("no_of_permanent_employee_terminated", "Permanent", "By Type", 1, brsr="A-22", gri="102-3-b-ii", kpi="Employees Terminated - Permanent"),
    _n("no_of_temporary_employee_terminated", "Temporary", "By Type", 1, gri="102-3-b-ii", kpi="Employees Terminated - Temporary"),
    _n("no_of_contract_employee_terminated", "Contract", "By Type", 1, gri="102-3-b-ii", kpi="Employees Terminated - Contract"),
    _n("no_of_part_time_employee_terminated", "Part-time", "By Type", 1, gri="102-3-b-ii", kpi="Employees Terminated - Part-time"),
    _n("no_of_intern_trainee_terminated", "Intern / trainee", "By Type", 1, gri="102-3-b-ii", kpi="Employees Terminated - Intern / Trainee"),
]
SPECS[TERM_WRK] = [
    _n("no_of_workers_terminated", "Workers terminated (Total)", "Total", brsr="A-22", gri="102-3-f; 401-1-b", kpi="Workers Terminated (Total)",
       sum_of=["no_of_female_terminated", "no_of_male_terminated"]),
    _n("no_of_female_terminated", "Female", "By Gender", 1, brsr="A-22", gri="102-3-f; 401-1-b", kpi="Workers Terminated - Female"),
    _n("no_of_male_terminated", "Male", "By Gender", 1, brsr="A-22", gri="102-3-f; 401-1-b", kpi="Workers Terminated - Male"),
]


def _ohs(who, total, internal, external):
    return [
        _n(total, f"{who} covered by OHS management system", "Coverage", brsr="P3-E10", gri="403-8-a-i", kpi=f"{who} Covered by OHS Management System"),
        _n(internal, "of which: Covered by internally audited system", "Coverage", 1, total, gri="403-8-a-ii",
           kpi=f"{who} Covered by Internally Audited OHS System", le=total),
        _n(external, "of which: Covered by externally audited / certified system", "Coverage", 1, total, gri="403-8-a-iii",
           kpi=f"{who} Covered by Externally Audited OHS System", le=total),
    ]


SPECS[OHS_EMP] = _ohs("Employees", "employees_covered", "employees_covered_that_has_been_internally_audited",
                      "employees_covered_under_an_occupational_health_safety_management_system_that_has_been_externally_audited_or_certified")
SPECS[OHS_WRK] = _ohs("Workers", "number_of_workers_covered",
                      "number_of_workers_covered_under_an_occupational_health_safety_management_system_that_has_been_internally_audited",
                      "number_of_workers_covered_under_an_occupational_health_safety_management_system_that_has_been_externally_audited_or_certified")
SPECS[PRODUCT_HS] = [
    _n("no_of_products_service_that_were_assessed_for_health_and_safety_impacts", "Products/services assessed for H&S impacts", "Assessment",
       gri="416-1-a", kpi="Products/Services Assessed for H&S Impacts"),
    _n("percentage_significant_product_and_service_categories_for_which_assessment_is_done",
       "% significant product/service categories assessed", "Assessment", gri="416-1-a", percent=True, agg="avg",
       kpi="% Significant Product/Service Categories Assessed"),
]
# stem, label, level, parent stem, brsr, gri(emp), gri(wrk), gri(all), le stem
_INC = [
    ("incidents", "Incidents", 0, None, "P3-E11", "403-9-a", "403-9-b", "403-9, 403-10", None),
    ("work_related", "of which: Work-related incidents", 1, "incidents", None, "403-2-d", "403-2-d", "403-2-d", "incidents"),
    ("persons", "Persons affected", 0, None, "P3-E11", "403-9-a", "403-9-b", "403-9-a, 403-9-b", None),
    ("injuries", "Recordable work-related injuries", 0, None, "P3-E11", "403-9-a-iii", "403-9-b-iii", "403-9-a-iii, 403-9-b-iii", None),
    ("high_consequence", "of which: High-consequence injuries (excl. fatalities)", 1, "injuries", "P3-E11", "403-9-a-ii", "403-9-b-ii", "403-9-a-ii, 403-9-b-ii", "injuries"),
    ("lost_time", "of which: Lost-time injuries", 1, "injuries", "P3-E11", "403-9", "403-9", "403-9", "injuries"),
    ("ill_health", "Recordable work-related ill-health cases", 0, None, "P3-E11", "403-10-a-ii", "403-10-b-ii", "403-10-a-ii, 403-10-b-ii", None),
    ("fatalities", "Fatalities", 0, None, "P3-E11", "403-9-a-i, 403-10-a-i", "403-9-b-i, 403-10-b-i", "403-9-a-i, 403-9-b-i, 403-10-a-i, 403-10-b-i", None),
    ("fatal_injury", "From work-related injury", 1, "fatalities", None, "403-9-a-i", "403-9-b-i", "403-9-a-i, 403-9-b-i", None),
    ("fatal_ill_health", "From work-related ill health", 1, "fatalities", None, "403-10-a-i", "403-10-b-i", "403-10-a-i, 403-10-b-i", None),
    ("hours", "Hours worked", 0, None, "P3-E11", "403-9-a-v", "403-9-b-v", "403-9-a-v, 403-9-b-v", None),
]
SPECS[INCIDENTS] = []
for _blk, _title, _idx in (("all", "All Persons (Employees + Workers)", 7), ("emp", "Employees", 5), ("wrk", "Workers (incl. contract workforce)", 6)):
    for _st, _lb, _lv, _par, _br, *_gr, _le in _INC:
        _gri = {"all": _gr[2], "emp": _gr[0], "wrk": _gr[1]}[_blk]
        _sum = [f"emp_{_st}", f"wrk_{_st}"] if _blk == "all" else None
        if _st == "fatalities" and _blk != "all":
            _sum = [f"{_blk}_fatal_injury", f"{_blk}_fatal_ill_health"]
        SPECS[INCIDENTS].append(_n(f"{_blk}_{_st}", _lb, _title, _lv, f"{_blk}_{_par}" if _par else None, brsr=_br, gri=_gri,
                                   kpi=f"H&S - {_title.split(' (')[0]} - {_lb.replace('of which: ', '')}",
                                   sum_of=_sum, le=f"{_blk}_{_le}" if _le else None, legacy_only=True,
                                   hide_if_table_has_rows="incident_records_by_person_type"))
SPECS[INCIDENTS].append(F(
    "incident_records_by_person_type", "Health & safety incidents by person type", type="table", group="Incidents by Employee / Worker", cols=[
        C("person_type", "Person type", "dropdown", ["Employee", "Worker"], required=True),
        *[C(stem, label.replace("of which: ", ""), "number") for stem, label, *_rest in _INC if stem != "fatalities"],
    ],
))
SPECS[REHAB] = [
    _n("rehabilitated_total", "Rehabilitated or family member placed in suitable employment (Total)", "Total", brsr="P3-L3",
       kpi="Rehabilitated / Placed in Suitable Employment (Total)", sum_of=["rehabilitated_employees", "rehabilitated_workers"]),
    _n("rehabilitated_employees", "Employees", "By Group", 1, brsr="P3-L3", kpi="Rehabilitated / Placed - Employees"),
    _n("rehabilitated_workers", "Workers", "By Group", 1, brsr="P3-L3", kpi="Rehabilitated / Placed - Workers"),
]
# Rehabilitation is collected in the Health & Safety Incidents form, not as a
# separate entry choice. Keep its field keys/KPI references intact for record history.
SPECS[INCIDENTS] += [
    _n("rehabilitated_total", "Rehabilitated or family member placed in suitable employment (Total)", "", brsr="P3-L3",
       kpi="Rehabilitated / Placed in Suitable Employment (Total)", sum_of=["rehabilitated_employees", "rehabilitated_workers"]),
    _n("rehabilitated_employees", "Employees", "", 1, "rehabilitated_total", brsr="P3-L3", kpi="Rehabilitated / Placed - Employees"),
    _n("rehabilitated_workers", "Workers", "", 1, "rehabilitated_total", brsr="P3-L3", kpi="Rehabilitated / Placed - Workers"),
]
SPECS.pop(REHAB)


GEN_TRAINING = ("Training", "General Training")
SEC_TRAINING = ("Training", "Security Training")
ACPC = ("Anti-corruption", "Anti-Corruption Policy Communication")
ACCI = ("Anti-corruption", "Confirmed Corruption Incidents")
COMPETITIVE = ("Competitive Behaviour ", "Anti-Competitive Behaviour & Anti-Trust Cases")
AP_DAYS = ("Financial & Procurement Metrics", "Accounts Payable Days")
LOCAL_PROCUREMENT = ("Financial & Procurement Metrics", "Local Procurement")
VIOLATIONS = ("Incidents", "Incidents of Violations")
BREACH = ("Incidents", "Data Breach")
NONCOMPLIANCE = ("Incidents", "Non-compliance")
ANY_ENTRY = {GEN_TRAINING, BREACH}

# slug, label, trainings key, female key, male key, brsr, gri
_TOPICS = [
    ("health_safety", "Health & Safety", "no_of_trainings_on_health_safety", "no_of_female_attendees_for_training_on_health_safety",
     "no_of_male_attendees_for_training_on_health_safety", "P3-E8", "403-5-a"),
    ("environment", "Environment", "no_of_trainings_on_environment", "no_of_female_attendees_for_training_on_environment",
     "no_of_male_attendees_for_training_on_environment", "P1-E1", None),
    ("human_rights", "Human Rights", "no_of_trainings_on_human_right_issues", "no_of_female_attendees_for_trainings_on_human_right_issues",
     "no_of_male_attendees_trainings_on_human_right_issues", "P5-E1", None),
    ("org_policies", "Organisation Policies", "no_of_trainings_on_organization_policy_ies",
     "no_of_female_attendees_for_trainings_on_organization_policy_ies", "no_of_male_attendees_for_trainings_on_organization_policy_ies",
     "P1-E1", None),
    ("skill_upgrading", "Skill Upgrading", "no_of_trainings_on_skill_upgrade_up_skilling",
     "no_of_female_attendees_for_trainings_on_skill_upgrade_up_skilling", "no_of_male_attendees_for_trainings_on_skill_upgrade_up_skilling",
     "P3-E8", "404-2-a"),
    ("re_skilling", "Re-skilling", "no_of_trainings_on_re_skilling", "no_of_female_attendees_for_trainings_on_re_skilling",
     "no_of_male_attendees_for_trainings_on_re_skilling", "P3-E8", "404-2-a; 102-3-d"),
    ("anti_corruption", "Anti-corruption", "no_of_trainings_on_anti_corruption", "no_of_female_attendees_for_trainings_on_anti_corruption",
     "no_of_male_attendees_for_trainings_on_anti_corruption", "P1-E1", "205-2-d, 205-2-e"),
    ("ethical_principles", "Ethical Principles", "no_of_trainings_on_ethical_principles",
     "no_of_female_attendees_for_trainings_on_ethical_principles", "no_of_male_attendees_for_trainings_on_ethical_principles",
     "P1-E1", "205-2"),
]
_AUD_BRSR = "P1-E1; P3-E8; P5-E1"
SPECS[GEN_TRAINING] = [
    F("no_of_trainings_done", "Trainings completed (Total)", group="Totals", brsr="P1-E1", gri="404-1",
      kpi="Trainings Completed (Total)", old="SOC_NO_OF_TRAININGS_DONE", sum_of=[t[2] for t in _TOPICS]),
    F("no_of_female_attendees", "Attendees (Total) - Female", group="Totals", brsr="P3-E8", gri="404-1-a",
      kpi="Training Attendees (Total) - Female", sum_of=[t[3] for t in _TOPICS]),
    F("no_of_male_attendees", "Attendees (Total) - Male", group="Totals", brsr="P3-E8", gri="404-1-a",
      kpi="Training Attendees (Total) - Male", sum_of=[t[4] for t in _TOPICS]),
    F("total_training_hours_by_topic", "Training hours (Total)", units=["Hours"], group="Totals", gri="404-1",
      kpi="Training Hours (Total)", sum_of=[f"training_hours_{topic[0]}" for topic in _TOPICS]),
    F("training_attendes_type", "Training audience (per training)", type="dropdown", group="Training Audience",
      brsr=_AUD_BRSR, gri="404-1-a",
      options=["Board of Directors", "Key Managerial Personnel", "Employees (permanent / other than permanent)",
               "Workers (permanent / other than permanent)"],
      option_refs={"Board of Directors": {"brsr": "P1-E1"}, "Key Managerial Personnel": {"brsr": "P1-E1"},
                   "Employees (permanent / other than permanent)": {"brsr": "P1-E1; P3-E8; P5-E1"},
                   "Workers (permanent / other than permanent)": {"brsr": "P1-E1; P3-E8; P5-E1"}}),
    F("employee_worker_type", "Employee / worker type (per training)", type="dropdown", group="Training Audience", level=1,
      parent="training_attendes_type", brsr=_AUD_BRSR, gri="404-1-a", options=["Permanent", "Other than Permanent"]),
]
for _slug, _label, _tk, _fk, _mk, _br, _gr in _TOPICS:
    _g = f"By Topic - {_label}"
    SPECS[GEN_TRAINING] += [
        F(_tk, "Number of trainings", group=_g, brsr=_br, gri=_gr, kpi=f"Trainings - {_label} - Number of Trainings"),
        F(_fk, "Attendees - Female", group=_g, brsr=_br, gri=_gr, kpi=f"Trainings - {_label} - Female Attendees"),
        F(_mk, "Attendees - Male", group=_g, brsr=_br, gri=_gr, kpi=f"Trainings - {_label} - Male Attendees"),
        F(f"training_hours_{_slug}", "Training hours", units=["Hours"], group=_g, level=1,
          parent="total_training_hours_by_topic", brsr=_br, gri=_gr, kpi=f"Training Hours - {_label}"),
    ]
SPECS[GEN_TRAINING] += [
    F("total_training_hours_female", "Total training hours - Female", units=["Hours"], group="Training Hours", gri="404-1-a",
      kpi="Total Training Hours - Female", show_with_legacy_ui=True),
    F("total_training_hours_male", "Total training hours - Male", units=["Hours"], group="Training Hours", gri="404-1-a",
      kpi="Total Training Hours - Male", show_with_legacy_ui=True),
    F("average_training_hours_female", "Average hours per employee - Female", units=["Hours"], group="Training Hours", gri="404-1-a",
      kpi="Average Training Hours per Employee - Female", agg="avg", show_with_legacy_ui=True),
    F("average_training_hours_male", "Average hours per employee - Male", units=["Hours"], group="Training Hours", gri="404-1-a",
      kpi="Average Training Hours per Employee - Male", agg="avg", show_with_legacy_ui=True),
]

SPECS[SEC_TRAINING] = [
    F("no_of_trainings_done", "Security trainings completed", group="Totals", gri="410-1",
      kpi="Security Trainings Completed", old="SOC_NO_OF_SECURITY_TRAININGS_DONE"),
    F("security_personnel_who_received_training", "% security personnel trained", group="Totals", gri="410-1-a", percent=True,
      agg="avg", kpi="% Security Personnel Trained", old="SOC_OF_SECURITY_PERSONNEL_WHO_RECEIVED_TRAIN"),
    F("no_of_trainings_on_human_rights_policies", "Training on human-rights policies", group="By Content", gri="410-1-a",
      kpi="Security Trainings - Human-rights Policies", old="SOC_NO_OF_HUMAN_RIGHTS_POLICIES_TRAININGS_DO"),
    F("no_of_trainings_on_specific_procedures_their_application_to_security", "Training on security procedures and their application",
      group="By Content", gri="410-1-a", kpi="Security Trainings - Procedures and Their Application",
      old="SOC_NO_OF_SPECIFIC_PROCEDURES_THEIR_APPLICAT"),
]

# These entry flows have been retired. Their existing data is handled by the
# one-time removal migration; keeping them out of SPECS prevents seed syncs
# from recreating them.
for _retired_entry in (EXTERNAL, OHS_EMP, OHS_WRK, PRODUCT_HS, SEC_TRAINING):
    SPECS.pop(_retired_entry, None)

SPECS[ACPC] = [
    F("number_communicated", "People communicated (Total)", group="Total", gri="205-2", kpi="Anti-corruption Policy - People Communicated (Total)",
      old="GOV_NO_OF_PEOPLE_COMMUNICATED_ABOUT_ANTICORR",
      sum_of=["no_of_board_of_directors_communicated", "no_of_key_management_personnel_communicated", "no_of_employee_communicated",
              "no_of_business_partner_communicated"]),
    F("no_of_board_of_directors_communicated", "Board members", group="By Group", level=1, parent="number_communicated", gri="205-2-a",
      kpi="Anti-corruption Policy - Board Members Communicated", old="GOV_NO_OF_GOVERNANCE_BODY_MEMBERS_COMMUNICAT"),
    F("no_of_key_management_personnel_communicated", "Key management personnel", group="By Group", level=1, parent="number_communicated",
      gri="205-2-b", kpi="Anti-corruption Policy - Key Management Personnel Communicated"),
    F("no_of_employee_communicated", "Employees (excluding KMP)", group="By Group", level=1, parent="number_communicated", gri="205-2-b",
      kpi="Anti-corruption Policy - Employees Communicated", old="GOV_NO_OF_EMPLOYEES_COMMUNICATED_ABOUT_ANTIC"),
    F("no_of_business_partner_communicated", "Business partners", group="By Group", level=1, parent="number_communicated", gri="205-2-c",
      kpi="Anti-corruption Policy - Business Partners Communicated", old="GOV_NO_OF_BUSINESS_PARTNERS_COMMUNICATED_ABO"),
]

_CT = "no_of_confirmed_corruption_incidents"
SPECS[ACCI] = [
    F(_CT, "Confirmed corruption incidents (Total)", group="Total", brsr="P1-E5", gri="205-3-a",
      kpi="Confirmed Corruption Incidents (Total)"),
    F("no_of_employees_dismissed", "Employees dismissed", group="Actions - Employees", level=1, parent=_CT, gri="205-3-b",
      kpi="Corruption - Employees Dismissed"),
    F("no_of_employees_disciplined", "Employees disciplined", group="Actions - Employees", level=1, parent=_CT,
      brsr="P1-E5", gri="205-3-b", kpi="Corruption - Employees Disciplined"),
    F("no_of_business_partner_contracts_terminated", "Contracts terminated", group="Actions - Business Partners", level=1, parent=_CT,
      gri="205-3-c", kpi="Corruption - Business Partner Contracts Terminated"),
    F("no_of_business_partner_contracts_not_renewed", "Contracts not renewed", group="Actions - Business Partners", level=1, parent=_CT,
      gri="205-3-c", kpi="Corruption - Business Partner Contracts Not Renewed"),
    F("no_of_public_legal_cases_regarding_corruption_against_org_employee", "Public legal cases regarding corruption",
      group="Legal Cases", level=1, parent=_CT, gri="205-3-d", kpi="Corruption - Public Legal Cases"),
]

_AC = "total_no_of_cases"
SPECS[COMPETITIVE] = [
    F(_AC, "Anti-competitive behaviour cases (Total)", group="Total", brsr="P7-E2", gri="206-1-a",
      kpi="Anti-competitive Behaviour Cases (Total)"),
    F("no_of_public_legal_cases_regarding_anti_competitive_and_violations_of_anti_trust_and_monopoly_legislation",
      "of which: Public legal cases - anti-competitive behaviour, anti-trust, monopoly", group="Total", level=1, parent=_AC,
      gri="206-1-a", kpi="Anti-competitive Behaviour - Public Legal Cases", le=_AC),
]

SPECS[AP_DAYS] = [
    F("accounts_payable", "Accounts payable", group="Accounts Payable",
      brsr="P1-E8", kpi="Accounts Payable"),
    F("cost_of_goods_services_procured", "Cost of goods/services procured", group="Accounts Payable",
      brsr="P1-E8", kpi="Cost of Goods/Services Procured"),
]

SPECS[LOCAL_PROCUREMENT] = [
    F("percentage_procurement_budget_spent_on_local_suppliers", "% of procurement budget spent on local suppliers",
      group="Local Procurement", percent=True, agg="avg", kpi="Procurement Budget Spent on Local Suppliers (%)"),
]

_VT = "no_of_incidents_of_violations"
SPECS[VIOLATIONS] = [
    F(_VT, "Violation incidents (Total)", group="Total", gri="411-1-a; 406-1-a", kpi="Violation Incidents (Total)"),
    F("no_of_incidents_of_violations_related_to_indigenous_peoples_rights", "of which: Related to Indigenous Peoples' rights",
      group="Total", level=1, parent=_VT, gri="411-1-a", kpi="Violation Incidents - Indigenous Peoples' Rights", le=_VT),
    F("no_of_incidents_reviewed_by_the_organization", "of which: Reviewed by the organisation", group="Total", level=1, parent=_VT,
      gri="411-1-b-i; 406-1-b-i", kpi="Violation Incidents - Reviewed by the Organisation", le=_VT),
]
SPECS.pop(VIOLATIONS, None)

_BT = "no_of_incidents_of_data_breach"
_BP = "no_of_data_breach_which_involved_personally_identifiable_information_of_customers"
_PC = "total_substantiated_privacy_complaints"
SPECS[BREACH] = [
    F(_BT, "Data-breach incidents (Total)", group="Data Breaches", brsr="P9-E7 (a)", gri="418-1-b",
      kpi="Data-breach Incidents (Total)", old="GOV_NO_OF_DATA_BREACH_INCIDENTS"),
    F(_BP, "of which: Involving customer PII", group="Data Breaches", level=1, parent=_BT, brsr="P9-E7 (b)", gri="418-1-b",
      kpi="Data-breach Incidents - Involving Customer PII", old="GOV_NO_OF_DATA_BREACH_INCIDENTS_WITH_PERSONA", le=_BT),
    F("percentage_data_breach_involving_customer_pii", "% of breaches involving customer PII", group="Data Breaches", level=1,
      parent=_BT, brsr="P9-E7 (b)", percent=True, agg="avg", kpi="% Data Breaches Involving Customer PII", ratio=(_BP, _BT, 100)),
    F("no_of_data_breach_where_there_was_leaks_thefts_or_losses_of_customer_data", "of which: Leaks / thefts / losses of customer data",
      group="Data Breaches", level=1, parent=_BT, gri="418-1-b", kpi="Data-breach Incidents - Leaks / Thefts / Losses of Customer Data",
      old="GOV_NO_OF_DATA_BREACH_INCIDENTS_WITH_LEAKS_T", le=_BT),
    F(_PC, "Substantiated privacy complaints (Total)", group="Privacy Complaints", gri="418-1-a", kpi="Substantiated Privacy Complaints (Total)",
      sum_of=["no_of_complaints_substantiated_by_the_organization", "no_of_complaints_received_from_regulatory_bodies"]),
    F("no_of_complaints_substantiated_by_the_organization", "From outside parties (substantiated by the organisation)",
      group="Privacy Complaints", level=1, parent=_PC, gri="418-1-a-i", kpi="Privacy Complaints - From Outside Parties",
      old="GOV_NO_OF_DATA_BREACH_INCIDENTS_SUBSTANTIATE"),
    F("no_of_complaints_received_from_regulatory_bodies", "From regulatory bodies", group="Privacy Complaints", level=1, parent=_PC,
      gri="418-1-a-ii", kpi="Privacy Complaints - From Regulatory Bodies", old="GOV_NO_OF_DATA_BREACH_INCIDENTS_RECEIVED_FRO"),
]

_NC = "no_of_cases"
_NC_OUT = ["non_compliance_result_in_a_fine_or_penalty", "non_compliance_result_in_a_warning", "non_compliance_with_voluntary_codes"]
_NC_TYPES = {
    "Laws & regulations - general": {"gri": "2-27-a", "brsr": "P1-E2"},
    "Environmental laws": {"gri": "2-27-a", "brsr": "P6-E13"},
    "Product & service health and safety": {"gri": "416-2-a"},
    "Product & service information and labelling": {"gri": "417-2-a"},
    "Marketing communications": {"gri": "417-3-a"},
}
SPECS[NONCOMPLIANCE] = [
    F(_NC, "Non-compliance cases (Total)", group="Total", brsr="P1-E2; P6-E13",
      gri="2-27-a; 416-2-a; 417-2-a, 417-3-a", kpi="Non-compliance Cases (Total)", old="GOV_NO_OF_NONCOMPLIANCE_INCIDENTS", sum_le=_NC_OUT),
    F("non_compliance_type", "Non-compliance type", type="dropdown", group="Total", level=1, parent=_NC,
      brsr="P1-E2; P6-E13", gri="2-27-a; 416-2-a; 417-2-a, 417-3-a", options=list(_NC_TYPES), option_refs=_NC_TYPES),
    F("non_compliance_result_in_a_fine_or_penalty", "Resulting in fine / penalty", group="By Outcome", level=1, parent=_NC,
      brsr="P1-E2", gri="2-27-a-i; 416-2-a-i; 417-2-a-i, 417-3-a-i", kpi="Non-compliance - Resulting in Fine / Penalty",
      old="GOV_NO_OF_NONCOMPLIANCE_THAT_RESULTED_IN_A_F"),
    F("non_compliance_result_in_a_warning", "Resulting in warning", group="By Outcome", level=1, parent=_NC,
      gri="416-2-a-ii; 417-2-a-ii, 417-3-a-ii", kpi="Non-compliance - Resulting in Warning", old="GOV_NO_OF_NONCOMPLIANCE_THAT_RESULTED_IN_A_W"),
    F("non_compliance_with_voluntary_codes", "Non-compliance with voluntary codes", group="By Outcome", level=1, parent=_NC,
      gri="416-2-a-iii; 417-2-a-iii, 417-3-a-iii", kpi="Non-compliance - With Voluntary Codes", old="GOV_NO_OF_NONCOMPLIANCE_WITH_VOLUNTARY_CODE"),
    F("non_compliance_fine_amount", "Fine / penalty amount", units=["INR"], group="Monetary Amounts (INR)", brsr="P1-E2", gri="2-27-b",
      kpi="Non-compliance - Fine / Penalty Amount"),
    F("non_compliance_settlement_amount", "Settlement amount", units=["INR"], group="Monetary Amounts (INR)", brsr="P1-E2",
      gri="2-27-b", kpi="Non-compliance - Settlement Amount"),
    F("non_compliance_compounding_fee", "Compounding fee", units=["INR"], group="Monetary Amounts (INR)", brsr="P1-E2",
      gri="2-27-b", kpi="Non-compliance - Compounding Fee"),
]


FUEL = ("Energy", "Fuel Within Organization")
ELECTRICITY = ("Energy", "Electricity Within Organization")
HEATING = ("Energy", "Heating Within Organization")
COOLING = ("Energy", "Cooling Within Organization")
STEAM = ("Energy", "Steam Within Organization")
ENERGY_OUTSIDE = ("Energy", "Energy Outside the Organization")
ENERGY_REDUCTION = ("Energy", "Reduction")
FUEL_QTY_UNITS = ["kg", "tonnes", "Litres", "KiloLitres", "m3", "Nm3", "GJ"]
SCOPE1_FUELS = ["Coal", "Diesel", "Petrol / Gasoline", "Natural Gas", "LPG", "CNG", "LNG", "Fuel Oil", "Furnace Oil", "Kerosene", "Biomass", "Biogas", "Biodiesel", "Wood / Wood Waste", "Other"]


def _e(key, label, group, level=0, parent=None, **kw):
    return F(key, label, units=ENERGY_UNITS, default_unit="J", group=group, level=level, parent=parent, **kw)


def _fuel_table(key, label, gri):
    return F(key, label, type="table", group="By Fuel Type", level=2, cols=[
        C("fuel_type", "Fuel type", "dropdown", required=True, gri=gri, options_source="scope1_fuels"),
        C("quantity", "Quantity", "number", gri=gri),
        C("quantity_unit", "Quantity unit", "dropdown", FUEL_QTY_UNITS),
        C("energy", "Energy", "number", required=True, gri=gri),
        C("energy_unit", "Energy unit", "dropdown", ENERGY_UNITS),
    ])


def _fuel_summary(table):
    return {"source": table, "op": "sum", "column": "energy", "unit_column": "energy_unit", "optional": True}


SPECS[FUEL] = [
    _e("quantity", "Fuel consumption", "Fuel Consumption", brsr="P6-E1 (B+E)", gri="302-1-a, 302-1-b, 103-2-a",
       kpi="Total Energy Consumption - Fuel", old="ENV_TOTAL_ENERGY_CONSUMPTION_FUEL", summary=_fuel_summary("fuel_types")),
    F("fuel_types", "By Fuel Type", type="table", group="Fuel Consumption", level=1, parent="quantity", cols=[
        C("fuel_type", "Fuel Type", "dropdown", SCOPE1_FUELS, required=True, gri="302-1-a, 302-1-b"),
        C("energy", "Energy", "number", required=True, gri="302-1-a, 302-1-b"),
        C("energy_unit", "Energy unit", "dropdown", ENERGY_UNITS),
    ]),
]

_OLD_CODES = {
    "Electricity": ("ENV_TOTAL_ENERGY_CONSUMPTION_ELECTRICITY", "ENV_RENEWABLE_ENERGY_CONSUMPTION_ELECTRICITY",
                    "ENV_NONRENEWABLE_ENERGY_CONSUMPTION_ELECTRIC", "ENV_ENERGY_CONSUMPTION_THROUGH_PURCHASED_ELE",
                    "ENV_ENERGY_CONSUMPTION_THROUGH_SELFGENERATED", "ENV_SELFGENERATED_ELECTRICITY_SOLD"),
    "Heating": ("ENV_TOTAL_ENERGY_CONSUMPTION_HEATING", "ENV_RENEWABLE_ENERGY_CONSUMPTION_HEATING",
                "ENV_NONRENEWABLE_ENERGY_CONSUMPTION_HEATING", "ENV_ENERGY_CONSUMPTION_THROUGH_PURCHASED_HEA",
                "ENV_ENERGY_CONSUMPTION_THROUGH_SELFGENERATED_1", "ENV_SELFGENERATED_HEATING_SOLD"),
    "Cooling": ("ENV_TOTAL_ENERGY_CONSUMPTION_COOLING", "ENV_RENEWABLE_ENERGY_CONSUMPTION_COOLING",
                "ENV_NONRENEWABLE_ENERGY_CONSUMPTION_COOLING", "ENV_ENERGY_CONSUMPTION_THROUGH_PURCHASED_COO",
                "ENV_ENERGY_CONSUMPTION_THROUGH_SELFGENERATED_2", "ENV_SELFGENERATED_COOLING_SOLD"),
    "Steam": ("ENV_TOTAL_ENERGY_CONSUMPTION_STEAM", "ENV_RENEWABLE_ENERGY_CONSUMPTION_STEAM",
              "ENV_NONRENEWABLE_ENERGY_CONSUMPTION_STEAM", "ENV_ENERGY_CONSUMPTION_THROUGH_PURCHASED_STE",
              "ENV_ENERGY_CONSUMPTION_THROUGH_SELFGENERATED_3", "ENV_SELFGENERATED_STEAM_SOLD"),
}


def _carrier(noun, sub_gri, brsr_total, brsr_ren, brsr_non, keys, inp):
    """Within-organisation carrier: total = purchased + self-generated; renewable + non-renewable must equal total; sold."""
    purchased, own, sold, ren, non, rsold, nsold = keys
    t_old, r_old, n_old, p_old, o_old, s_old = _OLD_CODES[noun]
    suffix = "" if inp else ""
    low = noun.lower()
    return [
        _e("quantity", f"{noun} consumption (Total)", "Total", brsr=f"{brsr_total}", gri=f"302-1-c-{sub_gri}, 103-2-b",
           kpi=f"Total Energy Consumption - {noun}", old=t_old, sum_of=[purchased, own], eq_parts=[ren, non]),
        _e(purchased, f"Purchased {low}", "By Supply", 1, "quantity", brsr=f"{brsr_total}", gri=f"302-1-c-{sub_gri}, 103-2-b",
           kpi=f"Energy Consumption through purchased {noun}", old=p_old),
        _e(own, f"Self-generated {low}", "By Supply", 1, "quantity", brsr=f"{brsr_total}", gri=f"302-1-c-{sub_gri}, 103-2-c",
           kpi=f"Energy Consumption through self-generated {noun}", old=o_old),
        _e(ren, f"Renewable {low}", "By Source", 1, "quantity", brsr=f"{brsr_ren}{suffix}", gri="103-2-b-i, 103-2-c",
           kpi=f"Renewable Energy Consumption - {noun}", old=r_old),
        _e(non, f"Non-renewable {low}", "By Source", 1, "quantity", brsr=f"{brsr_non}{suffix}", gri="103-2-b-i",
           kpi=f"Non-Renewable Energy Consumption - {noun}", old=n_old),
        _e(sold, f"Self-generated {low} sold (Total)", "Sold", brsr=None, gri=f"302-1-d-{sub_gri}, 103-2-d",
           kpi=f"Self-generated {noun} sold", old=s_old, sum_of=[rsold, nsold]),
        _e(rsold, f"Renewable {low} sold", "Sold", 1, sold, gri="103-2-d-i", kpi=f"Renewable {noun} Sold", old="!new"),
        _e(nsold, f"Non-renewable {low} sold", "Sold", 1, sold, gri="103-2-d-i", kpi=f"Non-Renewable {noun} Sold", old="!new"),
    ]


_ER, _NR, _ERS, _NRS = "renewable_energy_consumption", "non_renewable_energy_consumption", "renewable_energy_sold", "non_renewable_energy_sold"
SPECS[ELECTRICITY] = [
    _e("quantity", "Electricity consumption (Total)", "Electricity Consumption", brsr="P6-E1 (A+D)", gri="302-1-c-i", kpi="Total Energy Consumption - Electricity", old="ENV_TOTAL_ENERGY_CONSUMPTION_ELECTRICITY", sum_of=["grid_electricity", "renewable_electricity"]),
    _e("grid_electricity", "Grid Electricity", "Electricity Consumption", 1, "quantity", brsr="P6-E1 (A+D)", gri="302-1-c-i", kpi="Grid Electricity Consumption"),
    _e("renewable_electricity", "Renewable Electricity", "Electricity Consumption", 1, "quantity", brsr="P6-E1 (A)", gri="302-1-c-i", kpi="Renewable Electricity Consumption", sum_of=["solar_electricity", "wind_electricity", "other_renewable_electricity"]),
    _e("solar_electricity", "Solar", "Electricity Consumption", 2, "renewable_electricity", gri="302-1-c-i", kpi="Solar Electricity Consumption"),
    _e("wind_electricity", "Wind", "Electricity Consumption", 2, "renewable_electricity", gri="302-1-c-i", kpi="Wind Electricity Consumption"),
    _e("other_renewable_electricity", "Other", "Electricity Consumption", 2, "renewable_electricity", gri="302-1-c-i", kpi="Other Renewable Electricity Consumption"),
]

def _simple_carrier(noun, sub_gri, brsr_total, brsr_ren, brsr_non, old_total):
    low = noun.lower()
    return [
        _e("quantity", f"{noun} consumption (Total)", f"{noun} Consumption", brsr=brsr_total, gri=f"302-1-c-{sub_gri}", kpi=f"Total Energy Consumption - {noun}", old=old_total, sum_of=[f"non_renewable_{low}", f"renewable_{low}"]),
        _e(f"non_renewable_{low}", f"Non-renewable {low}", f"{noun} Consumption", 1, "quantity", brsr=brsr_non, gri=f"302-1-c-{sub_gri}", kpi=f"Non-Renewable Energy Consumption - {noun}"),
        _e(f"renewable_{low}", f"Renewable {low}", f"{noun} Consumption", 1, "quantity", brsr=brsr_ren, gri=f"302-1-c-{sub_gri}", kpi=f"Renewable Energy Consumption - {noun}"),
    ]

SPECS[HEATING] = _simple_carrier("Heating", "ii", "P6-E1 (C+F)", "P6-E1 (C)", "P6-E1 (F)", "ENV_TOTAL_ENERGY_CONSUMPTION_HEATING")
SPECS[COOLING] = _simple_carrier("Cooling", "iii", "P6-E1 (C+F)", "P6-E1 (C)", "P6-E1 (F)", "ENV_TOTAL_ENERGY_CONSUMPTION_COOLING")
SPECS[STEAM] = _simple_carrier("Steam", "iv", "P6-E1 (C+F)", "P6-E1 (C)", "P6-E1 (F)", "ENV_TOTAL_ENERGY_CONSUMPTION_STEAM")

_UP = [("category_1_energy", "Cat 1 - Purchased goods and services"), ("category_2_energy", "Cat 2 - Capital goods"),
       ("category_3_energy_consumption", "Cat 3 - Fuel- and energy-related activities"),
       ("category_4_energy_consumption", "Cat 4 - Upstream transportation and distribution"),
       ("category_5_energy_consumption", "Cat 5 - Waste generated in operations"),
       ("category_6_energy_consumption", "Cat 6 - Business travel"), ("category_7_energy_consumption", "Cat 7 - Employee commuting"),
       ("category_8_energy_consumption", "Cat 8 - Upstream leased assets")]
_DOWN = [("category_9_energy_consumption", "Cat 9 - Downstream transportation and distribution"),
         ("category_10_energy_consumption", "Cat 10 - Processing of sold products"),
         ("category_11_energy_consumption", "Cat 11 - Use of sold products"),
         ("category_12_energy_consumption", "Cat 12 - End-of-life treatment of sold products"),
         ("category_13_energy_consumption", "Cat 13 - Downstream leased assets"), ("category_14_energy_consumption", "Cat 14 - Franchises"),
         ("category_15_energy_consumption", "Cat 15 - Investments")]
_UPK, _DOWNK = "total_upstream_energy_consumption", "total_downstream_energy_consumption"
SPECS[ENERGY_OUTSIDE] = [
    _e("quantity", "Energy consumption outside the organisation (Total)", "Total", gri="302-2-a, 103-3-a",
       kpi="Energy Consumption Outside the Organisation (Total)", old="!new", sum_of=[_UPK, _DOWNK]),
    _e(_UPK, "Upstream (Total)", "Upstream", 1, "quantity", gri="103-3-a", kpi="Total Energy Consumption - Upstream activities",
       old="ENV_TOTAL_ENERGY_CONSUMPTION_UPSTREAM_ACTIVI", sum_of=[k for k, _l in _UP]),
    *[_e(k, label, "Upstream", 2, _UPK, gri="302-2-a, 103-3-a", kpi=f"Energy Outside - {label}", old="!new") for k, label in _UP],
    _e(_DOWNK, "Downstream (Total)", "Downstream", 1, "quantity", gri="103-3-a", kpi="Total Energy Consumption - Downstream activities",
       old="ENV_TOTAL_ENERGY_CONSUMPTION_DOWNSTREAM_ACTI", sum_of=[k for k, _l in _DOWN]),
    *[_e(k, label, "Downstream", 2, _DOWNK, gri="302-2-a, 103-3-a", kpi=f"Energy Outside - {label}", old="!new") for k, label in _DOWN],
]

# Retired from ESG data entry; retained above only as a historical schema reference.
SPECS.pop(ENERGY_OUTSIDE)

SPECS[ENERGY_REDUCTION] = [
    _e("total_reduction", "Total reduction in energy consumption", "Reduction", gri="302-4-a, 103-5-a", kpi="Total Energy Reduction",
       old="ENV_TOTAL_ENERGY_REDUCTION"),
    F("energy_types_included", "Types of energy included in the reduction", type="checkbox_group", group="Reduction", level=1,
      parent="total_reduction", gri="302-4-b, 103-5-b", options=["Fuel", "Electricity", "Heating", "Cooling", "Steam"]),
    F("base_year_baseline", "Base year / baseline", type="text", group="Baseline", level=1, parent="total_reduction",
      gri="302-4-c, 103-5-e"),
    _e("base_year_energy_consumption", "Base-year energy consumption", "Baseline", 1, "total_reduction", gri="103-5-e",
       kpi="Base-year Energy Consumption", old="!new"),
    _e("reduction_in_energy_requirements_of_sold_products_and_services", "Reduction in energy requirements of sold products & services",
       "Sold Products & Services", gri="302-5-a", kpi="Total Reduction in energy requirements of sold products and services",
       old="ENV_TOTAL_REDUCTION_IN_ENERGY_REQUIREMENTS_O"),
]

# Retired from ESG data entry and KPI selection; historical records remain available.
SPECS.pop(ENERGY_REDUCTION)


REMOVALS = ("Other Emissions", "GHG Removals")
CARBON_CREDITS = ("Other Emissions", "GHG Emissions - Carbon Credits")
ODS = ("Other Emissions", "Ozone-depleting substances (ODS)")
AIR = ("Other Emissions", "Air Emissions")
TCO2E = ["tCO2e"]
AIR_UNITS = ["tonnes", "kg"]

SPECS[REMOVALS] = [
    F("total_scope1_ghg_removals", "Total Scope 1 GHG removals (tCO2e)", units=TCO2E, group="Total", gri="102-9-a",
      kpi="Total Scope 1 GHG Removals (tCO2e)", old="!new",
      summary={"source": "storage_pool_removals", "op": "sum", "column": "removals_tco2e", "optional": True}),
    F("storage_pool_removals", "Removals by storage pool (e.g. land-based, geological) - one row per pool", type="table",
      group="By Storage Pool", level=1, parent="total_scope1_ghg_removals", cols=[
          C("storage_pool", "Storage pool", required=True, gri="102-9-a"),
          C("removals_tco2e", "Removals (tCO2e)", "number", required=True, gri="102-9-a"),
      ]),
]

_CC = "total_carbon_credits_canceled"
SPECS[CARBON_CREDITS] = [
    F(_CC, "Carbon credits cancelled - Total (tCO2e)", units=TCO2E, group="Total", gri="102-10-a",
      kpi="Carbon Credits Cancelled - Total (tCO2e)", old="!new",
      sum_of=["carbon_credits_cancelled_due_to_removal_projects", "carbon_credits_cancelled_due_to_reduction_projects"]),
    F("carbon_credits_cancelled_due_to_removal_projects", "From removal projects", units=TCO2E, group="By Project Type", level=1,
      parent=_CC, gri="102-10-a", kpi="Carbon Credits Cancelled - Removal Projects (tCO2e)", old="!new"),
    F("carbon_credits_cancelled_due_to_reduction_projects", "From reduction projects", units=TCO2E, group="By Project Type", level=1,
      parent=_CC, gri="102-10-a", kpi="Carbon Credits Cancelled - Reduction Projects (tCO2e)", old="!new"),
]

_ODS_G = "Ozone-Depleting Substances (t CFC-11 eq)"
SPECS[ODS] = [
    F(key, label, units=["t CFC-11 eq"], group=_ODS_G, gri="305-6-a", kpi=f"{label} (t CFC-11 eq)", old="!new")
    for key, label in (("production_of_ods", "Production of ODS"), ("imports_of_ods", "Imports of ODS"), ("exports_of_ods", "Exports of ODS"))
]

_AIR_G = "Air Emissions (non-GHG)"
SPECS[AIR] = [
    F(key, label, units=AIR_UNITS, default_unit="tonnes", group=_AIR_G, brsr="P6-E6", gri=gri, kpi=f"Air Emissions - {label}", old="!new")
    for key, label, gri in (("air_nox", "NOx", "305-7-a-i"), ("air_sox", "SOx", "305-7-a-ii"),
                            ("air_particulate_matter", "Particulate matter (PM)", "305-7-a-vi"),
                            ("air_pop", "Persistent organic pollutants (POP)", "305-7-a-iii"),
                            ("air_voc", "Volatile organic compounds (VOC)", "305-7-a-iv"),
                            ("air_hap", "Hazardous air pollutants (HAP)", "305-7-a-v"))
] + [
    F("other_air_pollutants", "Others - pollutant name, quantity, unit (one row per pollutant)", type="table", group=_AIR_G, cols=[
        C("pollutant_name", "Other Pollutant name", required=True, gri="305-7-a-vii", brsr="P6-E6"),
        C("quantity", "Quantity", "number", required=True, gri="305-7-a-vii", brsr="P6-E6"),
        C("quantity_unit", "Unit", "dropdown", AIR_UNITS, gri="305-7-a-vii", brsr="P6-E6"),
    ]),
]

# Existing Restoration / Rehabilitation fields keep their data; only references are added.
RESTORATION_REFS = {
    "no_of_sites_facility_with_the_most_significant_impacts_on_biodiversity": ("P6-E11", "101-5-a"),
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
    specs = SPECS.get((cat, sub), [])
    sums = [(s["key"], s["sum_of"]) for s in specs if s["sum_of"]]
    le = [(s["key"], s["le"]) for s in specs if s["le"]]
    quality = []
    sum_le = [(s["sum_le"], s["key"]) for s in specs if s["sum_le"]]
    ratios = [(s["key"], *s["ratio"]) for s in specs if s["ratio"]]
    for s in specs:
        parts = s["eq_parts"]
        for group in ([parts] if parts and not isinstance(parts[0], list) else parts or []):
            quality.append((group, s["key"]))
    if not (sums or le or quality or sum_le or ratios):
        return None
    parents = dict(sums)

    def depth(k):
        return 1 + max((depth(c) for c in parents[k] if c in parents), default=-1) if k in parents else 0

    sums.sort(key=lambda x: depth(x[0]))
    numeric = [s["key"] for s in specs if s["type"] == "number"]
    root = numeric if (cat, sub) in ANY_ENTRY else [p for p, _c in sums] or numeric
    return {"root": root, "sums": sums, "le": le, "quality": quality, "other": [], "sum_le": sum_le, "ratios": ratios}


def _norm(value: Optional[str]) -> str:
    return (value or "").strip().lower()


ENV_SUM_RULES = {(_norm(cat), _norm(sub)): r for (cat, sub) in SPECS if (r := _sum_rules(cat, sub))}
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
    key = next((k for k in SPECS if _norm(k[0]) == _norm(category) and _norm(k[1]) == _norm(subcategory)), None)
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
            for col in (c for c in spec["cols"] if c["derived"]):
                num = _number(row.get(col["derived"]["num"]), col["label"])
                den = _number(row.get(col["derived"]["den"]), col["label"])
                row[col["key"]] = round(num / den, 6) if num is not None and den else None
        out[spec["key"]] = rows
    for spec in (s for s in specs if s["summary"]):
        sm = spec["summary"]
        rows = out.get(sm["source"]) or []
        if sm.get("optional") and not rows:
            continue
        if sm["op"] == "count":
            out[spec["key"]] = len(rows)
            continue
        if sm["op"] == "ratio":
            num = sum(_number(r.get(sm["num_column"]), sm["num_column"]) or 0 for r in rows)
            den = sum(_number(r.get(sm["den_column"]), sm["den_column"]) or 0 for r in rows)
            out[spec["key"]] = round(num / den, 6) if den else 0
            if spec["units"]:
                out[f"{spec['key']}_unit"] = out.get(f"{spec['key']}_unit") or spec["default_unit"]
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
    if key == EXTERNAL and out.get("complaint_records"):
        group_codes = {label: code for code, label in EXT_GROUPS}
        for code, _label in EXT_GROUPS:
            matching_rows = [row for row in out["complaint_records"] if group_codes.get(row.get("complainant")) == code]
            for status in ("filed", "pending", "resolved"):
                out[f"ext_{code}_{status}"] = sum(_number(row.get(status), status) or 0 for row in matching_rows)
    if key == INCIDENTS and out.get("incident_records_by_person_type"):
        rows = out["incident_records_by_person_type"]
        for prefix, person_type in (("emp", "Employee"), ("wrk", "Worker")):
            selected_rows = [row for row in rows if row.get("person_type") == person_type]
            for stem, _label, *_rest in _INC:
                if stem == "fatalities":
                    out[f"{prefix}_{stem}"] = sum(
                        (_number(row.get("fatal_injury"), "fatal_injury") or 0) +
                        (_number(row.get("fatal_ill_health"), "fatal_ill_health") or 0)
                        for row in selected_rows
                    )
                else:
                    out[f"{prefix}_{stem}"] = sum(_number(row.get(stem), stem) or 0 for row in selected_rows)
        for stem, _label, *_rest in _INC:
            out[f"all_{stem}"] = (out.get(f"emp_{stem}") or 0) + (out.get(f"wrk_{stem}") or 0)
    return out
