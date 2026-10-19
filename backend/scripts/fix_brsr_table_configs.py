"""Fix all missing table configs for P6, P7, P8, P9 BRSR questions."""
import asyncio
from shared.database.mongo import db

UPDATES = [
    # ── P6: Energy consumption ──
    ("p6_energy_consumption", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "renew_electricity", "label": "Total electricity consumption (A) - From renewable sources"},
                {"key": "renew_fuel", "label": "Total fuel consumption (B) - From renewable sources"},
                {"key": "renew_other", "label": "Energy consumption through other sources (C) - From renewable sources"},
                {"key": "renew_total", "label": "Total energy consumed from renewable sources (A+B+C)"},
                {"key": "nonrenew_electricity", "label": "Total electricity consumption (D) - From non-renewable sources"},
                {"key": "nonrenew_fuel", "label": "Total fuel consumption (E) - From non-renewable sources"},
                {"key": "nonrenew_other", "label": "Energy consumption through other sources (F) - From non-renewable sources"},
                {"key": "nonrenew_total", "label": "Total energy consumed from non-renewable sources (D+E+F)"},
                {"key": "total_energy", "label": "Total energy consumed (A+B+C+D+E+F)"},
                {"key": "intensity_turnover", "label": "Energy intensity per rupee of turnover (Total energy consumed / Revenue from operations)"},
                {"key": "intensity_turnover_ppp", "label": "Energy intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP)"},
                {"key": "intensity_physical", "label": "Energy intensity in terms of physical output"},
                {"key": "intensity_optional", "label": "Energy intensity (optional) – the relevant metric may be selected by the entity"},
            ],
            "columns": [
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P6: Water disclosures ──
    ("p6_water_disclosures", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "surface_water", "label": "(i) Surface water"},
                {"key": "groundwater", "label": "(ii) Groundwater"},
                {"key": "third_party", "label": "(iii) Third party water"},
                {"key": "seawater", "label": "(iv) Seawater / desalinated water"},
                {"key": "others", "label": "(v) Others"},
                {"key": "total_withdrawal", "label": "Total volume of water withdrawal (in kilolitres) (i+ii+iii+iv+v)"},
                {"key": "total_consumption", "label": "Total volume of water consumption (in kilolitres)"},
                {"key": "intensity_turnover", "label": "Water intensity per rupee of turnover (Water consumed / Revenue from operations)"},
                {"key": "intensity_turnover_ppp", "label": "Water intensity per rupee of turnover adjusted for Purchasing Power Parity (PPP)"},
                {"key": "intensity_physical", "label": "Water intensity in terms of physical output"},
                {"key": "intensity_optional", "label": "Water intensity (optional) – the relevant metric may be selected by the entity"},
            ],
            "columns": [
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P6: Water discharged ──
    ("p6_water_discharged", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "surface_no_treatment", "label": "(i) To Surface water - No treatment"},
                {"key": "surface_with_treatment", "label": "(i) To Surface water - With treatment (please specify level)"},
                {"key": "ground_no_treatment", "label": "(ii) To Groundwater - No treatment"},
                {"key": "ground_with_treatment", "label": "(ii) To Groundwater - With treatment (please specify level)"},
                {"key": "sea_no_treatment", "label": "(iii) To Seawater - No treatment"},
                {"key": "sea_with_treatment", "label": "(iii) To Seawater - With treatment (please specify level)"},
                {"key": "third_party_no_treatment", "label": "(iv) Sent to third-parties - No treatment"},
                {"key": "third_party_with_treatment", "label": "(iv) Sent to third-parties - With treatment (please specify level)"},
                {"key": "others_no_treatment", "label": "(v) Others - No treatment"},
                {"key": "others_with_treatment", "label": "(v) Others - With treatment (please specify level)"},
                {"key": "total_discharged", "label": "Total water discharged (in kilolitres)"},
            ],
            "columns": [
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P6: Air emissions ──
    ("p6_air_emissions", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "nox", "label": "NOx"},
                {"key": "sox", "label": "SOx"},
                {"key": "pm", "label": "Particulate matter (PM)"},
                {"key": "pop", "label": "Persistent organic pollutants (POP)"},
                {"key": "voc", "label": "Volatile organic compounds (VOC)"},
                {"key": "hap", "label": "Hazardous air pollutants (HAP)"},
                {"key": "others", "label": "Others – please specify"},
            ],
            "columns": [
                {"key": "unit", "label": "Please specify unit", "type": "text"},
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P6: GHG Scope 1 & 2 ──
    ("p6_ghg_scope12", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "scope1", "label": "Total Scope 1 emissions (Break-up of GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)"},
                {"key": "scope2", "label": "Total Scope 2 emissions (Break-up of GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)"},
                {"key": "intensity_turnover", "label": "Total Scope 1 and Scope 2 emission intensity per rupee of turnover"},
                {"key": "intensity_turnover_ppp", "label": "Total Scope 1 and Scope 2 emission intensity per rupee of turnover adjusted for PPP"},
                {"key": "intensity_physical", "label": "Total Scope 1 and Scope 2 emission intensity in terms of physical output"},
                {"key": "intensity_optional", "label": "Total Scope 1 and Scope 2 emission intensity (optional)"},
            ],
            "columns": [
                {"key": "unit", "label": "Unit", "type": "text"},
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P6: Waste management ──
    ("p6_waste_management_details", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "plastic_waste", "label": "Plastic waste (A)"},
                {"key": "e_waste", "label": "E-waste (B)"},
                {"key": "bio_medical", "label": "Bio-medical waste (C)"},
                {"key": "construction", "label": "Construction and demolition waste (D)"},
                {"key": "battery", "label": "Battery waste (E)"},
                {"key": "radioactive", "label": "Radioactive waste (F)"},
                {"key": "other_hazardous", "label": "Other Hazardous waste (G)"},
                {"key": "other_non_hazardous", "label": "Other Non-hazardous waste generated (H)"},
                {"key": "total_generated", "label": "Total (A+B+C+D+E+F+G+H)"},
                {"key": "intensity_turnover", "label": "Waste intensity per rupee of turnover"},
                {"key": "intensity_turnover_ppp", "label": "Waste intensity per rupee of turnover adjusted for PPP"},
                {"key": "intensity_physical", "label": "Waste intensity in terms of physical output"},
                {"key": "intensity_optional", "label": "Waste intensity (optional)"},
                {"key": "recovered_recycled", "label": "Waste recovered - (i) Recycled"},
                {"key": "recovered_reused", "label": "Waste recovered - (ii) Re-used"},
                {"key": "recovered_other", "label": "Waste recovered - (iii) Other recovery operations"},
                {"key": "recovered_total", "label": "Waste recovered - Total"},
                {"key": "disposed_incineration", "label": "Waste disposed - (i) Incineration"},
                {"key": "disposed_landfilling", "label": "Waste disposed - (ii) Landfilling"},
                {"key": "disposed_other", "label": "Waste disposed - (iii) Other disposal operations"},
                {"key": "disposed_total", "label": "Waste disposed - Total"},
            ],
            "columns": [
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P6: Water stress areas ──
    ("p6_water_stress_areas", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "surface_water", "label": "Water withdrawal - (i) Surface water"},
                {"key": "groundwater", "label": "Water withdrawal - (ii) Groundwater"},
                {"key": "third_party", "label": "Water withdrawal - (iii) Third party water"},
                {"key": "seawater", "label": "Water withdrawal - (iv) Seawater / desalinated water"},
                {"key": "others_withdrawal", "label": "Water withdrawal - (v) Others"},
                {"key": "total_withdrawal", "label": "Total volume of water withdrawal (in kilolitres)"},
                {"key": "total_consumption", "label": "Total volume of water consumption (in kilolitres)"},
                {"key": "intensity_turnover", "label": "Water intensity per rupee of turnover"},
                {"key": "intensity_optional", "label": "Water intensity (optional)"},
                {"key": "discharge_surface_no", "label": "Water discharge - (i) Into Surface water - No treatment"},
                {"key": "discharge_surface_with", "label": "Water discharge - (i) Into Surface water - With treatment"},
                {"key": "discharge_ground_no", "label": "Water discharge - (ii) Into Groundwater - No treatment"},
                {"key": "discharge_ground_with", "label": "Water discharge - (ii) Into Groundwater - With treatment"},
                {"key": "discharge_sea_no", "label": "Water discharge - (iii) Into Seawater - No treatment"},
                {"key": "discharge_sea_with", "label": "Water discharge - (iii) Into Seawater - With treatment"},
                {"key": "discharge_third_no", "label": "Water discharge - (iv) Sent to third-parties - No treatment"},
                {"key": "discharge_third_with", "label": "Water discharge - (iv) Sent to third-parties - With treatment"},
                {"key": "discharge_others_no", "label": "Water discharge - (v) Others - No treatment"},
                {"key": "discharge_others_with", "label": "Water discharge - (v) Others - With treatment"},
                {"key": "total_discharged", "label": "Total water discharged (in kilolitres)"},
            ],
            "columns": [
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P6: Scope 3 emissions ──
    ("p6_scope3_emissions", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "scope3_total", "label": "Total Scope 3 emissions (Break-up of GHG into CO2, CH4, N2O, HFCs, PFCs, SF6, NF3, if available)"},
                {"key": "scope3_intensity_turnover", "label": "Total Scope 3 emissions per rupee of turnover"},
                {"key": "scope3_intensity_optional", "label": "Total Scope 3 emission intensity (optional)"},
            ],
            "columns": [
                {"key": "unit", "label": "Unit", "type": "text"},
                {"key": "current_fy", "label": "FY _____ (Current Financial Year)", "type": "text"},
                {"key": "previous_fy", "label": "FY _____ (Previous Financial Year)", "type": "text"},
            ],
        },
    }),
    # ── P5: Training - add column_groups for Current/Previous FY ──
    ("p5_hr_training", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "emp_permanent", "label": "Employees - Permanent"},
                {"key": "emp_other", "label": "Employees - Other than permanent"},
                {"key": "emp_total", "label": "Total Employees"},
                {"key": "workers_permanent", "label": "Workers - Permanent"},
                {"key": "workers_other", "label": "Workers - Other than permanent"},
                {"key": "workers_total", "label": "Total Workers"},
            ],
            "column_groups": [
                {"label": "FY _____ (Current Financial Year)", "columns": [
                    {"key": "cur_total", "label": "Total (A)", "type": "number"},
                    {"key": "cur_covered", "label": "No. covered (B)", "type": "number"},
                    {"key": "cur_pct", "label": "% (B/A)", "type": "number"},
                ]},
                {"label": "FY _____ (Previous Financial Year)", "columns": [
                    {"key": "prev_total", "label": "Total (C)", "type": "number"},
                    {"key": "prev_covered", "label": "No. covered (D)", "type": "number"},
                    {"key": "prev_pct", "label": "% (D/C)", "type": "number"},
                ]},
            ],
            "columns": [
                {"key": "cur_total", "label": "Total (A)", "type": "number"},
                {"key": "cur_covered", "label": "No. covered (B)", "type": "number"},
                {"key": "cur_pct", "label": "% (B/A)", "type": "number"},
                {"key": "prev_total", "label": "Total (C)", "type": "number"},
                {"key": "prev_covered", "label": "No. covered (D)", "type": "number"},
                {"key": "prev_pct", "label": "% (D/C)", "type": "number"},
            ],
        },
    }),
    # ── P5: Minimum wages - add column_groups ──
    ("p5_minimum_wages", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "emp_perm_male", "label": "Employees - Permanent - Male"},
                {"key": "emp_perm_female", "label": "Employees - Permanent - Female"},
                {"key": "emp_other_male", "label": "Employees - Other than Permanent - Male"},
                {"key": "emp_other_female", "label": "Employees - Other than Permanent - Female"},
                {"key": "workers_perm_male", "label": "Workers - Permanent - Male"},
                {"key": "workers_perm_female", "label": "Workers - Permanent - Female"},
                {"key": "workers_other_male", "label": "Workers - Other than Permanent - Male"},
                {"key": "workers_other_female", "label": "Workers - Other than Permanent - Female"},
            ],
            "column_groups": [
                {"label": "FY _____ (Current Financial Year)", "columns": [
                    {"key": "cur_total", "label": "Total (A)", "type": "number"},
                    {"key": "cur_equal_no", "label": "Equal to Minimum Wage - No. (B)", "type": "number"},
                    {"key": "cur_equal_pct", "label": "% (B/A)", "type": "number"},
                    {"key": "cur_more_no", "label": "More than Minimum Wage - No. (C)", "type": "number"},
                    {"key": "cur_more_pct", "label": "% (C/A)", "type": "number"},
                ]},
                {"label": "FY _____ (Previous Financial Year)", "columns": [
                    {"key": "prev_total", "label": "Total (D)", "type": "number"},
                    {"key": "prev_equal_no", "label": "Equal to Minimum Wage - No. (E)", "type": "number"},
                    {"key": "prev_equal_pct", "label": "% (E/D)", "type": "number"},
                    {"key": "prev_more_no", "label": "More than Minimum Wage - No. (F)", "type": "number"},
                    {"key": "prev_more_pct", "label": "% (F/D)", "type": "number"},
                ]},
            ],
            "columns": [
                {"key": "cur_total", "label": "Total (A)", "type": "number"},
                {"key": "cur_equal_no", "label": "Equal to Minimum Wage - No. (B)", "type": "number"},
                {"key": "cur_equal_pct", "label": "% (B/A)", "type": "number"},
                {"key": "cur_more_no", "label": "More than Minimum Wage - No. (C)", "type": "number"},
                {"key": "cur_more_pct", "label": "% (C/A)", "type": "number"},
                {"key": "prev_total", "label": "Total (D)", "type": "number"},
                {"key": "prev_equal_no", "label": "Equal to Minimum Wage - No. (E)", "type": "number"},
                {"key": "prev_equal_pct", "label": "% (E/D)", "type": "number"},
                {"key": "prev_more_no", "label": "More than Minimum Wage - No. (F)", "type": "number"},
                {"key": "prev_more_pct", "label": "% (F/D)", "type": "number"},
            ],
        },
    }),
    # ── P5: HR Complaints - add column_groups ──
    ("p5_hr_complaints", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "sexual_harassment", "label": "Sexual Harassment"},
                {"key": "discrimination", "label": "Discrimination at workplace"},
                {"key": "child_labour", "label": "Child Labour"},
                {"key": "forced_labour", "label": "Forced Labour/Involuntary Labour"},
                {"key": "wages", "label": "Wages"},
                {"key": "other_hr", "label": "Other human rights related issues"},
            ],
            "column_groups": [
                {"label": "FY _____ (Current Financial Year)", "columns": [
                    {"key": "cur_filed", "label": "Filed during the year", "type": "number"},
                    {"key": "cur_pending", "label": "Pending resolution at end of year", "type": "number"},
                    {"key": "cur_remarks", "label": "Remarks", "type": "text"},
                ]},
                {"label": "FY _____ (Previous Financial Year)", "columns": [
                    {"key": "prev_filed", "label": "Filed during the year", "type": "number"},
                    {"key": "prev_pending", "label": "Pending resolution at end of year", "type": "number"},
                    {"key": "prev_remarks", "label": "Remarks", "type": "text"},
                ]},
            ],
            "columns": [
                {"key": "cur_filed", "label": "Filed during the year", "type": "number"},
                {"key": "cur_pending", "label": "Pending resolution at end of year", "type": "number"},
                {"key": "cur_remarks", "label": "Remarks", "type": "text"},
                {"key": "prev_filed", "label": "Filed during the year", "type": "number"},
                {"key": "prev_pending", "label": "Pending resolution at end of year", "type": "number"},
                {"key": "prev_remarks", "label": "Remarks", "type": "text"},
            ],
        },
    }),
    # ── P3: Training - add column_groups ──
    ("p3_training_details", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "emp_male", "label": "Employees - Male"},
                {"key": "emp_female", "label": "Employees - Female"},
                {"key": "emp_total", "label": "Employees - Total"},
                {"key": "workers_male", "label": "Workers - Male"},
                {"key": "workers_female", "label": "Workers - Female"},
                {"key": "workers_total", "label": "Workers - Total"},
            ],
            "column_groups": [
                {"label": "FY _____ (Current Financial Year)", "columns": [
                    {"key": "cur_total", "label": "Total (A)", "type": "number"},
                    {"key": "cur_hs_no", "label": "On Health and safety measures - No. (B)", "type": "number"},
                    {"key": "cur_hs_pct", "label": "% (B/A)", "type": "number"},
                    {"key": "cur_skill_no", "label": "On Skill upgradation - No. (C)", "type": "number"},
                    {"key": "cur_skill_pct", "label": "% (C/A)", "type": "number"},
                ]},
                {"label": "FY _____ (Previous Financial Year)", "columns": [
                    {"key": "prev_total", "label": "Total (D)", "type": "number"},
                    {"key": "prev_hs_no", "label": "On Health and safety measures - No. (E)", "type": "number"},
                    {"key": "prev_hs_pct", "label": "% (E/D)", "type": "number"},
                    {"key": "prev_skill_no", "label": "On Skill upgradation - No. (F)", "type": "number"},
                    {"key": "prev_skill_pct", "label": "% (F/D)", "type": "number"},
                ]},
            ],
            "columns": [
                {"key": "cur_total", "label": "Total (A)", "type": "number"},
                {"key": "cur_hs_no", "label": "On Health and safety measures - No. (B)", "type": "number"},
                {"key": "cur_hs_pct", "label": "% (B/A)", "type": "number"},
                {"key": "cur_skill_no", "label": "On Skill upgradation - No. (C)", "type": "number"},
                {"key": "cur_skill_pct", "label": "% (C/A)", "type": "number"},
                {"key": "prev_total", "label": "Total (D)", "type": "number"},
                {"key": "prev_hs_no", "label": "On Health and safety measures - No. (E)", "type": "number"},
                {"key": "prev_hs_pct", "label": "% (E/D)", "type": "number"},
                {"key": "prev_skill_no", "label": "On Skill upgradation - No. (F)", "type": "number"},
                {"key": "prev_skill_pct", "label": "% (F/D)", "type": "number"},
            ],
        },
    }),
    # ── P3: Complaints - add column_groups ──
    ("p3_complaints_employees_workers", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "working_conditions", "label": "Working Conditions"},
                {"key": "health_safety", "label": "Health & Safety"},
            ],
            "column_groups": [
                {"label": "FY _____ (Current Financial Year)", "columns": [
                    {"key": "cur_filed", "label": "Filed during the year", "type": "number"},
                    {"key": "cur_pending", "label": "Pending resolution at end of year", "type": "number"},
                    {"key": "cur_remarks", "label": "Remarks", "type": "text"},
                ]},
                {"label": "FY _____ (Previous Financial Year)", "columns": [
                    {"key": "prev_filed", "label": "Filed during the year", "type": "number"},
                    {"key": "prev_pending", "label": "Pending resolution at end of year", "type": "number"},
                    {"key": "prev_remarks", "label": "Remarks", "type": "text"},
                ]},
            ],
            "columns": [
                {"key": "cur_filed", "label": "Filed during the year", "type": "number"},
                {"key": "cur_pending", "label": "Pending resolution at end of year", "type": "number"},
                {"key": "cur_remarks", "label": "Remarks", "type": "text"},
                {"key": "prev_filed", "label": "Filed during the year", "type": "number"},
                {"key": "prev_pending", "label": "Pending resolution at end of year", "type": "number"},
                {"key": "prev_remarks", "label": "Remarks", "type": "text"},
            ],
        },
    }),
    # ── P3: Performance reviews - add column_groups ──
    ("performance_career_reviews", {
        "type": "fy_comparison_table",
        "table_config": {
            "fixed_rows": [
                {"key": "emp_male", "label": "Employees - Male"},
                {"key": "emp_female", "label": "Employees - Female"},
                {"key": "emp_total", "label": "Employees - Total"},
                {"key": "workers_male", "label": "Workers - Male"},
                {"key": "workers_female", "label": "Workers - Female"},
                {"key": "workers_total", "label": "Workers - Total"},
            ],
            "column_groups": [
                {"label": "FY _____ (Current Financial Year)", "columns": [
                    {"key": "cur_total", "label": "Total (A)", "type": "number"},
                    {"key": "cur_no", "label": "No. (B)", "type": "number"},
                    {"key": "cur_pct", "label": "% (B/A)", "type": "number"},
                ]},
                {"label": "FY _____ (Previous Financial Year)", "columns": [
                    {"key": "prev_total", "label": "Total (C)", "type": "number"},
                    {"key": "prev_no", "label": "No. (D)", "type": "number"},
                    {"key": "prev_pct", "label": "% (D/C)", "type": "number"},
                ]},
            ],
            "columns": [
                {"key": "cur_total", "label": "Total (A)", "type": "number"},
                {"key": "cur_no", "label": "No. (B)", "type": "number"},
                {"key": "cur_pct", "label": "% (B/A)", "type": "number"},
                {"key": "prev_total", "label": "Total (C)", "type": "number"},
                {"key": "prev_no", "label": "No. (D)", "type": "number"},
                {"key": "prev_pct", "label": "% (D/C)", "type": "number"},
            ],
        },
    }),
]

async def run():
    for key, fields in UPDATES:
        r = await db.esg_question_configs.update_one(
            {"question_key": key},
            {"$set": fields}
        )
        status = "UPDATED" if r.modified_count else "NO CHANGE"
        print(f"  {status}: {key}")

asyncio.run(run())
