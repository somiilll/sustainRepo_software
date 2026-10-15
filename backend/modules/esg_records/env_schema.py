"""Biodiversity / Climate Change / Material: field specs (tables, summaries, tree) and entry rules."""
from typing import Any, Dict, List, Optional

WATER_UNITS = ["Litres", "KiloLitres", "MegaLitres"]
UNIT_FACTORS = {"litres": 1.0, "kilolitres": 1000.0, "megalitres": 1_000_000.0}


def F(key, label, type="number", units=None, default_unit=None, group="", level=0, parent=None, brsr=None, gri=None,
      kpi=None, old=None, agg="sum", cols=None, summary=None, sum_of=None, percent=False, le=None, eq_parts=None):
    return {"key": key, "label": label, "type": type, "units": units, "default_unit": default_unit or (units or [None])[0],
            "group": group, "level": level, "parent": parent, "brsr": brsr, "gri": gri, "kpi": kpi, "old": old,
            "agg": agg, "cols": cols, "summary": summary, "sum_of": sum_of, "percent": percent,
            "le": le, "eq_parts": eq_parts}


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

INTERNAL = (COMPLAINT_CATEGORY := "Complaints", "Internal Complaints")
CONSUMER = ("Complaints", "Consumer Complaints")
EXTERNAL = ("Complaints", "External Complaints")
GRI_TOTAL = "2-25 (related), 2-26 (related)"
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
    _cnt(_I + "bribery", "Bribery", "Ethics & Integrity", 1, gri="205-3 (related)", kpi="Internal Complaints - Bribery", old="SOC_NO_OF_COMPLAINTS_ON_BRIBERY"),
    _cnt(_I + "corruption", "Corruption", "Ethics & Integrity", 1, gri="205-3 (related)", kpi="Internal Complaints - Corruption", old="SOC_NO_OF_COMPLAINTS_ON_CORRUPTION"),
    _cnt(_I + "conflict_of_interest", "Conflict of interest", "Ethics & Integrity", 1, brsr="P1-E6", gri="2-15 (related)",
         kpi="Internal Complaints - Conflict of Interest", old="SOC_NO_OF_COMPLAINTS_ON_CONFLICT_OF_INTEREST"),
    _cnt("conflict_of_interest_directors", "of which: Directors", "Ethics & Integrity", 2, _I + "conflict_of_interest", brsr="P1-E6",
         gri="2-15 (related)", kpi="Internal Complaints - Conflict of Interest - Directors", le=_I + "conflict_of_interest"),
    _cnt("conflict_of_interest_kmps", "of which: KMPs", "Ethics & Integrity", 2, _I + "conflict_of_interest", brsr="P1-E6",
         gri="2-15 (related)", kpi="Internal Complaints - Conflict of Interest - KMPs", le=_I + "conflict_of_interest"),
    _cnt(_I + "working_conditions", "Working conditions", "Workplace", 1, brsr="P3-E13", kpi="Internal Complaints - Working Conditions",
         old="SOC_NO_OF_COMPLAINTS_ON_WORKING_CONDITIONS"),
    _cnt(_I + "health_safety", "Health & safety", "Workplace", 1, brsr="P3-E13", gri="403-2 (related)",
         kpi="Internal Complaints - Health & Safety", old="SOC_NO_OF_COMPLAINTS_ON_HEALTH"),
    _cnt(_I + "sexual_harassment", "Sexual harassment", "Human Rights", 1, brsr="P5-E6", gri="406-1-a",
         kpi="Internal Complaints - Sexual Harassment", old="SOC_NO_OF_COMPLAINTS_ON_SEXUAL_HARASSMENT"),
    _cnt("no_of_posh_complaints", "of which: POSH complaints", "Human Rights", 2, _I + "sexual_harassment", brsr="P5-E7", gri="406-1-a",
         kpi="Internal Complaints - POSH Complaints", old="SOC_NO_OF_POSH_COMPLAINTS", le=_I + "sexual_harassment"),
    _cnt("no_of_posh_complaints_upheld", "of which: POSH complaints upheld", "Human Rights", 3, "no_of_posh_complaints", brsr="P5-E7",
         gri="406-1-b (related)", kpi="Internal Complaints - POSH Complaints Upheld", le="no_of_posh_complaints"),
    _cnt(_I + "discrimination_at_workplace", "Discrimination", "Human Rights", 1, brsr="P5-E6", gri="406-1-a",
         kpi="Internal Complaints - Discrimination", old="SOC_NO_OF_COMPLAINTS_ON_DISCRIMINATION_AT_WO"),
    _cnt(_I + "child_labour", "Child labour", "Human Rights", 1, brsr="P5-E6", gri="408-1 (related)",
         kpi="Internal Complaints - Child Labour", old="SOC_NO_OF_COMPLAINTS_ON_CHILD_LABOUR"),
    _cnt(_I + "forced_labour_involuntary_labour", "Forced labour", "Human Rights", 1, brsr="P5-E6", gri="409-1 (related)",
         kpi="Internal Complaints - Forced Labour", old="SOC_NO_OF_COMPLAINTS_ON_FORCED_LABOURINVOLUN"),
    _cnt(_I + "wages", "Wages", "Human Rights", 1, brsr="P5-E6", kpi="Internal Complaints - Wages", old="SOC_NO_OF_COMPLAINTS_ON_WAGES"),
    _cnt(_I + "other_human_rights_related_issues", "Other human-rights issues", "Human Rights", 1, brsr="P5-E6", gri="2-25 (related)",
         kpi="Internal Complaints - Other Human Rights Issues", old="SOC_NO_OF_COMPLAINTS_ON_OTHER_HUMAN_RIGHTS_R"),
    _cnt("no_of_complaints_where_incident_was_reviewed_by_the_organization", "of which: Complaints reviewed", "By Status", 1,
         gri="406-1-b", kpi="Internal Complaints - Reviewed", le="total_no_of_complaints_recieved"),
    _cnt("no_of_complaints_resolved", "Resolved complaints", "By Status", 1, brsr="A-25", gri="406-1-b",
         kpi="Internal Complaints - Resolved", old="SOC_NO_OF_COMPLAINTS_RESOLVED"),
    _cnt("no_of_pending_complaints", "Pending complaints (at year end)", "By Status", 1, brsr="A-25; P3-E13; P5-E6",
         kpi="Internal Complaints - Pending", old="SOC_NO_OF_PENDING_COMPLAINTS"),
    _cnt("no_of_complaints_where_law_enforcement_agency_involved", "of which: Law-enforcement involvement / action", "Law Enforcement", 0,
         brsr="P1-E5 (partial)", gri="205-3-b (related)", kpi="Internal Complaints - Law-enforcement Involvement",
         old="SOC_NO_OF_COMPLAINTS_IN_WHICH_LAW_ENFORCEMEN", le="total_no_of_complaints_recieved"),
    _cnt("no_of_complaints_where_law_enforcement_agency_took_a_disciplinary_action", "of which: Disciplinary action taken", "Law Enforcement", 1,
         "no_of_complaints_where_law_enforcement_agency_involved", brsr="P1-E5 (partial)", gri="205-3-b (related)",
         kpi="Internal Complaints - Law-enforcement Disciplinary Action", old="SOC_NO_OF_COMPLAINTS_WHERE_LAW_ENFORCEMENT_A",
         le="no_of_complaints_where_law_enforcement_agency_involved"),
    F("complaint_records", "Complaint records (one row per complaint)", type="table", group="Complaint Record Attributes", cols=[
        C("complainant", "Complainant", "dropdown", COMPLAINANTS, brsr="P1-E5; P1-E6"),
        C("person_complained_against", "Person complained against", "dropdown", ["Director", "KMP", "Employee", "Worker"], brsr="P1-E5; P1-E6"),
    ]),
]
SPECS[INTERNAL][0]["eq_parts"] = ["no_of_complaints_resolved", "no_of_pending_complaints"]

_C = "no_of_complaints_on_"
SPECS[CONSUMER] = [
    _cnt("total_no_of_complaints", "Total number of consumer complaints", "Total", brsr="A-25; P9-E3", gri="2-25 (related)",
         kpi="Consumer Complaints (Total)", old="SOC_NO_OF_COMPLAINTS_FROM_CUSTOMERS",
         sum_of=[_C + k for k in ("data_privacy", "advertising", "cyber_security", "delivery_of_essential_services",
                                  "restrictive_unfair_trade_practices")] + ["no_of_other_consumer_complaints"]),
    _cnt(_C + "data_privacy", "Data privacy", "By Category", 1, brsr="P9-E3", gri="418-1-a", kpi="Consumer Complaints - Data Privacy", old="SOC_NO_OF_DATA_PRIVACY_COMPLAINTS"),
    _cnt(_C + "advertising", "Advertising", "By Category", 1, brsr="P9-E3", gri="417-3 (related)", kpi="Consumer Complaints - Advertising", old="SOC_NO_OF_ADVERTISING_COMPLAINTS"),
    _cnt(_C + "cyber_security", "Cyber-security", "By Category", 1, brsr="P9-E3", gri="418-1 (related)", kpi="Consumer Complaints - Cyber-security", old="SOC_NO_OF_CYBERSECURITY_COMPLAINTS"),
    _cnt(_C + "delivery_of_essential_services", "Delivery of essential services", "By Category", 1, brsr="P9-E3",
         kpi="Consumer Complaints - Delivery of Essential Services", old="SOC_NO_OF_DELIVERY_OF_ESSENTIAL_SERVICES_COM"),
    _cnt(_C + "restrictive_unfair_trade_practices", "Restrictive / unfair trade practices", "By Category", 1, brsr="P9-E3", gri="206-1 (related)",
         kpi="Consumer Complaints - Restrictive / Unfair Trade Practices", old="SOC_NO_OF_RESTRICTIVEUNFAIR_TRADE_PRACTICES_"),
    _cnt("no_of_other_consumer_complaints", "Other", "By Category", 1, brsr="P9-E3", kpi="Consumer Complaints - Other"),
    _cnt("no_of_complaints_involving_sensitive_customer_data", "of which: Complaints involving sensitive customer data (across categories)",
         "Of Which", 1, brsr="P9-E3 (partial)", gri="418-1-a", kpi="Consumer Complaints - Sensitive Customer Data",
         old="SOC_NO_OF_COMPLAINTS_FROM_CUSTOMERS_WHERE_SE", le="total_no_of_complaints"),
]

_ext_filed = [f"ext_{g}_filed" for g, _l in EXT_GROUPS]
_ext_pending = [f"ext_{g}_pending" for g, _l in EXT_GROUPS]
_ext_resolved = [f"ext_{g}_resolved" for g, _l in EXT_GROUPS]
SPECS[EXTERNAL] = [
    _cnt("total_external_complaints", "Total external complaints (filed)", "Total", brsr="A-25", gri="2-25 (related)",
         kpi="External Complaints (Total)", sum_of=_ext_filed),
]
for _g, _label in EXT_GROUPS:
    for _suffix, _text, _brsr in (("filed", "Filed during the year", "A-25"), ("pending", "Pending at year end", "A-25"),
                                  ("resolved", "Resolved", "A-25")):
        SPECS[EXTERNAL].append(_cnt(f"ext_{_g}_{_suffix}", f"{_label} - {_text}", _label, 1, brsr=_brsr,
                                    kpi=f"External Complaints - {_label} - {_text}"))
SPECS[EXTERNAL] += [
    _cnt("pending_complaints_total", "Pending (Total)", "By Status", 0, brsr="A-25", kpi="External Complaints - Pending (Total)", sum_of=_ext_pending),
    _cnt("resolved_complaints_total", "Resolved (Total)", "By Status", 0, brsr="A-25", kpi="External Complaints - Resolved (Total)", sum_of=_ext_resolved),
    F("complaint_records", "Complaint records (one row per complaint)", type="table", group="Complaint Record Attributes", cols=[
        C("complainant", "Complainant", "dropdown", [label for _g, label in EXT_GROUPS]),
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
    ("incidents", "Incidents", 0, None, "P3-E11 (input)", "403-9-a (related)", "403-9-b (related)", "403-9 (related), 403-10 (related)", None),
    ("work_related", "of which: Work-related incidents", 1, "incidents", None, "403-2-d (related)", "403-2-d (related)", "403-2-d (related)", "incidents"),
    ("persons", "Persons affected", 0, None, "P3-E11 (input)", "403-9-a", "403-9-b", "403-9-a, 403-9-b", None),
    ("injuries", "Recordable work-related injuries", 0, None, "P3-E11", "403-9-a-iii", "403-9-b-iii", "403-9-a-iii, 403-9-b-iii", None),
    ("high_consequence", "of which: High-consequence injuries (excl. fatalities)", 1, "injuries", "P3-E11", "403-9-a-ii", "403-9-b-ii", "403-9-a-ii, 403-9-b-ii", "injuries"),
    ("lost_time", "of which: Lost-time injuries", 1, "injuries", "P3-E11 (input)", "403-9 (related)", "403-9 (related)", "403-9 (related)", "injuries"),
    ("ill_health", "Recordable work-related ill-health cases", 0, None, "P3-E11 (partial)", "403-10-a-ii", "403-10-b-ii", "403-10-a-ii, 403-10-b-ii", None),
    ("fatalities", "Fatalities", 0, None, "P3-E11", "403-9-a-i, 403-10-a-i", "403-9-b-i, 403-10-b-i", "403-9-a-i, 403-9-b-i, 403-10-a-i, 403-10-b-i", None),
    ("fatal_injury", "From work-related injury", 1, "fatalities", None, "403-9-a-i", "403-9-b-i", "403-9-a-i, 403-9-b-i", None),
    ("fatal_ill_health", "From work-related ill health", 1, "fatalities", None, "403-10-a-i", "403-10-b-i", "403-10-a-i, 403-10-b-i", None),
    ("hours", "Hours worked", 0, None, "P3-E11 (input)", "403-9-a-v", "403-9-b-v", "403-9-a-v, 403-9-b-v", None),
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
                                   sum_of=_sum, le=f"{_blk}_{_le}" if _le else None))
SPECS[REHAB] = [
    _n("rehabilitated_total", "Rehabilitated or family member placed in suitable employment (Total)", "Total", brsr="P3-L3",
       kpi="Rehabilitated / Placed in Suitable Employment (Total)", sum_of=["rehabilitated_employees", "rehabilitated_workers"]),
    _n("rehabilitated_employees", "Employees", "By Group", 1, brsr="P3-L3", kpi="Rehabilitated / Placed - Employees"),
    _n("rehabilitated_workers", "Workers", "By Group", 1, brsr="P3-L3", kpi="Rehabilitated / Placed - Workers"),
]

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
    specs = SPECS.get((cat, sub), [])
    sums = [(s["key"], s["sum_of"]) for s in specs if s["sum_of"]]
    le = [(s["key"], s["le"]) for s in specs if s["le"]]
    quality = []
    for s in specs:
        parts = s["eq_parts"]
        for group in ([parts] if parts and not isinstance(parts[0], list) else parts or []):
            quality.append((group, s["key"]))
    if not (sums or le or quality):
        return None
    parents = dict(sums)

    def depth(k):
        return 1 + max((depth(c) for c in parents[k] if c in parents), default=-1) if k in parents else 0

    sums.sort(key=lambda x: depth(x[0]))
    numeric = [s["key"] for s in specs if s["type"] == "number"]
    return {"root": [p for p, _c in sums] or numeric, "sums": sums, "le": le, "quality": quality, "other": []}


ENV_SUM_RULES = {(cat.lower(), sub.lower()): r for (cat, sub) in SPECS if (r := _sum_rules(cat, sub))}
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
