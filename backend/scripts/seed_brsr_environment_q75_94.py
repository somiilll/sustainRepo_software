"""
Seed Script: BRSR Environment Questions 75-94 (Resource Management, Emissions & Compliance)

Seeds BRSR environment questions for Energy, Water, Emissions, Waste, and Compliance.
These are part of Principle 6 (Environment) disclosures in BRSR format.

Usage:
    cd /app/backend && python scripts/seed_brsr_environment_q75_94.py
"""

import asyncio
import sys
sys.path.insert(0, '/app/backend')

from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
import uuid

load_dotenv('/app/backend/.env')

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME', 'esg_platform')

BRSR_ENVIRONMENT_Q75_94 = [
    # Q75 - Energy Consumption & Energy Intensity
    {
        "question_key": "env_energy_consumption_intensity",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Provide total energy consumption by source (renewable/non-renewable), energy intensity, and state if an independent assurance was conducted.",
        "type": "historical_environmental_metrics_matrix",
        "required": True,
        "description": "Report energy consumption from renewable and non-renewable sources with intensity metrics.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 75,
        "table_config": {
            "sections": [
                {
                    "title": "From Renewable Sources",
                    "rows": [
                        {"key": "renewable_electricity", "label": "Total electricity consumption"},
                        {"key": "renewable_fuel", "label": "Total fuel consumption"},
                        {"key": "renewable_other", "label": "Energy consumption through other sources"},
                        {"key": "renewable_total", "label": "Total energy consumed from renewable sources", "is_total": True}
                    ]
                },
                {
                    "title": "From Non-Renewable Sources",
                    "rows": [
                        {"key": "nonrenewable_electricity", "label": "Total electricity consumption"},
                        {"key": "nonrenewable_fuel", "label": "Total fuel consumption"},
                        {"key": "nonrenewable_other", "label": "Energy consumption through other sources"},
                        {"key": "nonrenewable_total", "label": "Total energy consumed from non-renewable sources", "is_total": True}
                    ]
                },
                {
                    "title": "Totals & Intensity",
                    "rows": [
                        {"key": "total_energy", "label": "Total energy consumed", "is_total": True},
                        {"key": "intensity_turnover", "label": "Energy intensity per rupee of turnover"},
                        {"key": "intensity_ppp", "label": "Energy intensity per rupee of turnover adjusted for PPP"},
                        {"key": "intensity_physical", "label": "Energy intensity in terms of physical output"},
                        {"key": "intensity_optional", "label": "Energy intensity (optional) – relevant metric selected by entity"}
                    ]
                }
            ],
            "columns": [
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number", "historical_autofill": True}
            ],
            "validation": {"min": 0},
            "has_assurance_field": True,
            "assurance_config": {
                "question": "Independent assurance conducted?",
                "conditional_fields": [
                    {"key": "assurance_details", "label": "Assurance Details", "type": "textarea"},
                    {"key": "assurance_weblink", "label": "Web Link (optional)", "type": "url"}
                ]
            },
            "historical_autofill_config": {
                "enabled": True,
                "source_column": "current_fy",
                "target_column": "previous_fy"
            }
        }
    },
    
    # Q76 - PAT Scheme Compliance
    {
        "question_key": "env_pat_scheme_compliance",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Does the entity have any sites/facilities identified as designated consumers (DCs) under the PAT Scheme of the Government of India?",
        "type": "yes_no_with_nested_details",
        "required": True,
        "description": "Report on Perform, Achieve and Trade (PAT) scheme compliance status.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 76,
        "nested_config": {
            "show_when": "yes",
            "sub_questions": [
                {
                    "key": "pat_targets_achieved",
                    "question": "Were PAT targets achieved?",
                    "type": "yes_no",
                    "required": True
                },
                {
                    "key": "remedial_actions",
                    "question": "Provide remedial actions taken.",
                    "type": "textarea",
                    "visible_when": {"field": "pat_targets_achieved", "value": "no"},
                    "required": True
                }
            ]
        }
    },
    
    # Q77 - Water Withdrawal & Consumption
    {
        "question_key": "env_water_withdrawal_consumption",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Disclosures related to water.",
        "type": "historical_water_metrics_matrix",
        "required": True,
        "description": "Report water withdrawal by source and consumption intensity.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 77,
        "table_config": {
            "sections": [
                {
                    "title": "Water Withdrawal by Source",
                    "rows": [
                        {"key": "surface_water", "label": "Surface water"},
                        {"key": "ground_water", "label": "Ground water"},
                        {"key": "third_party_water", "label": "Third party water"},
                        {"key": "seawater_desalinated", "label": "Seawater / Desalinated water"},
                        {"key": "others_withdrawal", "label": "Others"},
                        {"key": "total_withdrawal", "label": "Total water withdrawal", "is_total": True}
                    ]
                },
                {
                    "title": "Consumption & Intensity",
                    "rows": [
                        {"key": "total_consumption", "label": "Total water consumption (in Kilo Litres)"},
                        {"key": "intensity_turnover", "label": "Water intensity per rupee of turnover"},
                        {"key": "intensity_ppp", "label": "Water intensity per rupee of turnover adjusted for PPP"},
                        {"key": "intensity_physical", "label": "Water intensity in terms of physical output"},
                        {"key": "intensity_optional", "label": "Water intensity (optional)"}
                    ]
                }
            ],
            "columns": [
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number", "historical_autofill": True}
            ],
            "validation": {"min": 0},
            "historical_autofill_config": {"enabled": True, "source_column": "current_fy", "target_column": "previous_fy"}
        }
    },
    
    # Q78 - Water Discharge & Treatment
    {
        "question_key": "env_water_discharge_treatment",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Details related to water discharged.",
        "type": "historical_water_discharge_matrix",
        "required": True,
        "description": "Report water discharge by destination with treatment details.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 78,
        "table_config": {
            "destinations": [
                {"key": "surface_water", "label": "Surface water"},
                {"key": "ground_water", "label": "Ground water"},
                {"key": "third_party", "label": "Third party water"},
                {"key": "seawater", "label": "Seawater / Desalinated water"},
                {"key": "others", "label": "Others"}
            ],
            "treatment_types": [
                {"key": "no_treatment", "label": "No treatment"},
                {"key": "with_treatment", "label": "With treatment - specify level of treatment", "has_text_input": True}
            ],
            "total_row": {"key": "total_discharge", "label": "Total water discharged"},
            "columns": [
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number", "historical_autofill": True}
            ],
            "validation": {"min": 0},
            "historical_autofill_config": {"enabled": True}
        }
    },
    
    # Q79 - Zero Liquid Discharge (ZLD)
    {
        "question_key": "env_zero_liquid_discharge",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Is a Zero Liquid Discharge mechanism implemented?",
        "type": "yes_no_with_description",
        "required": True,
        "description": "Report on Zero Liquid Discharge implementation status.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 79,
        "conditional_config": {
            "show_when": "yes",
            "fields": [
                {"key": "zld_description", "label": "Describe coverage and implementation", "type": "textarea", "required": True}
            ]
        }
    },
    
    # Q80 - Air Emissions (Excluding GHGs)
    {
        "question_key": "env_air_emissions_non_ghg",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Provide details of air emissions excluding GHGs.",
        "type": "historical_emissions_table",
        "required": True,
        "description": "Report air emissions parameters excluding greenhouse gases.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 80,
        "table_config": {
            "rows": [
                {"key": "nox", "label": "NOx", "unit": ""},
                {"key": "sox", "label": "SOx", "unit": ""},
                {"key": "pm", "label": "PM", "unit": ""},
                {"key": "pop", "label": "POP", "unit": ""},
                {"key": "voc", "label": "VOC", "unit": ""},
                {"key": "hap", "label": "HAP", "unit": ""},
                {"key": "others", "label": "Others", "unit": "", "has_specify_field": True}
            ],
            "columns": [
                {"key": "unit", "label": "Unit", "type": "text"},
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number", "historical_autofill": True}
            ],
            "validation": {"min": 0},
            "historical_autofill_config": {"enabled": True}
        }
    },
    
    # Q81 - Scope 1 & Scope 2 Emissions (LINKED TO GHG MODULE)
    {
        "question_key": "env_scope12_ghg_emissions",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Provide Scope 1 and Scope 2 Greenhouse Gas (GHG) emissions and intensity.",
        "type": "linked_ghg_metrics_matrix",
        "required": True,
        "description": "This section links to the GHG Emissions module. Data is auto-fetched from existing calculations.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 81,
        "linked_config": {
            "data_source": "ghg_module",
            "scopes": ["scope1", "scope2"],
            "read_only": True,
            "rows": [
                {"key": "total_scope1", "label": "Total Scope 1 emissions", "source": "scope1_total"},
                {"key": "total_scope2", "label": "Total Scope 2 emissions", "source": "scope2_total"},
                {"key": "intensity_turnover", "label": "Total Scope 1,2 emission intensity per rupee of turnover", "source": "calculated"},
                {"key": "intensity_ppp", "label": "Total Scope 1,2 emission intensity per rupee of turnover adjusted to PPP", "source": "calculated"},
                {"key": "intensity_physical", "label": "Total Scope 1,2 emission intensity in terms of physical output", "source": "calculated"},
                {"key": "intensity_optional", "label": "Total Scope 1,2 emission intensity (optional)", "source": "manual"}
            ],
            "columns": [
                {"key": "unit", "label": "Unit", "type": "text"},
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number"}
            ]
        }
    },
    
    # Q82 - GHG Reduction Initiatives
    {
        "question_key": "env_ghg_reduction_initiatives",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Does the entity have any project related to reducing Green House Gas emission?",
        "type": "yes_no_with_description",
        "required": True,
        "description": "Report on GHG reduction projects and initiatives.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 82,
        "conditional_config": {
            "show_when": "yes",
            "fields": [
                {"key": "ghg_project_details", "label": "Project Details", "type": "textarea", "required": True}
            ]
        }
    },
    
    # Q83 - Waste Generation & Waste Management
    {
        "question_key": "env_waste_generation_management",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Provide details of total waste generated by the organization.",
        "type": "historical_waste_management_master_matrix",
        "required": True,
        "description": "Comprehensive waste generation, recovery, and disposal reporting.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 83,
        "table_config": {
            "sections": [
                {
                    "key": "waste_generated",
                    "title": "A. Total Waste Generated",
                    "rows": [
                        {"key": "plastic_waste", "label": "Plastic waste"},
                        {"key": "e_waste", "label": "E-waste"},
                        {"key": "biomedical_waste", "label": "Bio-medical waste"},
                        {"key": "construction_demolition", "label": "Construction and demolition waste"},
                        {"key": "battery_waste", "label": "Battery waste"},
                        {"key": "radioactive_waste", "label": "Radioactive waste"},
                        {"key": "other_hazardous", "label": "Other Hazardous waste"},
                        {"key": "other_nonhazardous", "label": "Other non-Hazardous waste"},
                        {"key": "total_generated", "label": "Total waste generated", "is_total": True},
                        {"key": "intensity_turnover", "label": "Waste intensity per rupee of turnover"},
                        {"key": "intensity_ppp", "label": "Waste intensity adjusted for PPP"},
                        {"key": "intensity_physical", "label": "Waste intensity in terms of physical output"},
                        {"key": "intensity_optional", "label": "Waste intensity (optional)"}
                    ]
                },
                {
                    "key": "waste_recovered",
                    "title": "B. Waste Recovered",
                    "rows": [
                        {"key": "recycled", "label": "Recycled", "has_category": True},
                        {"key": "reused", "label": "Re-used", "has_category": True},
                        {"key": "other_recovery", "label": "Other recovery operations", "has_category": True},
                        {"key": "total_recovered", "label": "Total", "is_total": True}
                    ]
                },
                {
                    "key": "waste_disposed",
                    "title": "C. Waste Disposal",
                    "rows": [
                        {"key": "incineration", "label": "Incineration", "has_category": True},
                        {"key": "landfilling", "label": "Landfilling", "has_category": True},
                        {"key": "other_disposal", "label": "Other disposal operations", "has_category": True},
                        {"key": "total_disposed", "label": "Total", "is_total": True}
                    ]
                }
            ],
            "columns": [
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number", "historical_autofill": True}
            ],
            "validation": {"min": 0},
            "historical_autofill_config": {"enabled": True}
        }
    },
    
    # Q84 - Waste Management Practices
    {
        "question_key": "env_waste_management_practices_desc",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Briefly describe waste management practices and hazardous chemical reduction strategy.",
        "type": "long_text_response",
        "required": True,
        "description": "Describe organizational waste management practices.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 84,
        "text_config": {
            "min_length": 50,
            "placeholder": "Describe your waste management practices and strategies for reducing hazardous chemicals..."
        }
    },
    
    # Q85 - Ecologically Sensitive Areas
    {
        "question_key": "env_ecologically_sensitive_areas",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "If the entity has operations/offices in or around ecologically sensitive areas where environmental approvals/clearances are required.",
        "type": "dynamic_table",
        "required": False,
        "description": "List operations in ecologically sensitive areas.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 85,
        "table_config": {
            "columns": [
                {"key": "sno", "label": "S.No.", "type": "auto_increment", "width": "60px"},
                {"key": "location", "label": "Location", "type": "text", "width": "200px"},
                {"key": "operation_type", "label": "Type of Operation", "type": "text", "width": "200px"},
                {"key": "conditions_complied", "label": "Conditions complied (Y/N)", "type": "yes_no", "width": "120px"},
                {"key": "remarks", "label": "Remarks", "type": "text", "width": "200px", "conditional_required": {"field": "conditions_complied", "value": "no"}}
            ],
            "allow_add_row": True,
            "allow_remove_row": True,
            "min_rows": 0
        }
    },
    
    # Q86 - Environmental Impact Assessments (EIA)
    {
        "question_key": "env_eia_details",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Details of environmental impact assessments of projects undertaken.",
        "type": "dynamic_table",
        "required": False,
        "description": "Report EIA conducted for projects.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 86,
        "table_config": {
            "columns": [
                {"key": "project_name", "label": "Project Name & Brief Details", "type": "text", "width": "250px"},
                {"key": "eia_notification_no", "label": "EIA Notification No.", "type": "text", "width": "150px"},
                {"key": "date", "label": "Date", "type": "date", "width": "120px"},
                {"key": "external_agency", "label": "Independent External Agency (Y/N)", "type": "yes_no", "width": "120px"},
                {"key": "publicly_communicated", "label": "Publicly Communicated (Y/N)", "type": "yes_no", "width": "120px"},
                {"key": "web_link", "label": "Relevant Web Link", "type": "url", "width": "200px"}
            ],
            "allow_add_row": True,
            "allow_remove_row": True,
            "min_rows": 0,
            "validation": {"date": True, "url": True}
        }
    },
    
    # Q87 - Environmental Compliance
    {
        "question_key": "env_environmental_compliance",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Is the entity compliant with applicable environmental laws/regulations/guidelines in India?",
        "type": "yes_no_with_dynamic_table",
        "required": True,
        "description": "Report compliance status with environmental regulations.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 87,
        "table_config": {
            "conditional_field": "is_compliant",
            "show_table_when": "no",
            "columns": [
                {"key": "sno", "label": "S.No.", "type": "auto_increment", "width": "60px"},
                {"key": "law_regulation", "label": "Law/Regulation Not Complied With", "type": "text", "width": "200px"},
                {"key": "non_compliance_details", "label": "Details of Non-Compliance", "type": "text", "width": "200px"},
                {"key": "fines_penalties", "label": "Fines/Penalties/Actions", "type": "text", "width": "150px"},
                {"key": "corrective_action", "label": "Corrective Action Taken", "type": "text", "width": "200px"}
            ],
            "allow_add_row": True,
            "allow_remove_row": True,
            "min_rows": 1
        }
    },
    
    # Q88 - Water Stress Area Disclosures
    {
        "question_key": "env_water_stress_areas",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Water withdrawal, consumption and discharge in areas of water stress.",
        "type": "historical_water_stress_matrix",
        "required": True,
        "description": "Report water metrics specifically for water stress areas.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 88,
        "table_config": {
            "scope_label": "Water Stress Areas Only",
            "sections": [
                {
                    "title": "Water Withdrawal (Stress Areas)",
                    "rows": [
                        {"key": "surface_water", "label": "Surface water"},
                        {"key": "ground_water", "label": "Ground water"},
                        {"key": "third_party", "label": "Third party water"},
                        {"key": "seawater", "label": "Seawater / Desalinated water"},
                        {"key": "others", "label": "Others"},
                        {"key": "total_withdrawal", "label": "Total", "is_total": True}
                    ]
                },
                {
                    "title": "Water Consumption (Stress Areas)",
                    "rows": [
                        {"key": "total_consumption", "label": "Total water consumption"}
                    ]
                },
                {
                    "title": "Water Discharge (Stress Areas)",
                    "rows": [
                        {"key": "total_discharge", "label": "Total water discharged"}
                    ]
                }
            ],
            "columns": [
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number", "historical_autofill": True}
            ],
            "validation": {"min": 0},
            "historical_autofill_config": {"enabled": True}
        }
    },
    
    # Q89 - Scope 3 Emissions (LINKED TO GHG MODULE)
    {
        "question_key": "env_scope3_emissions",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Please provide details of total Scope 3 emissions & its intensity.",
        "type": "linked_scope3_metrics_matrix",
        "required": True,
        "description": "This section links to the GHG Scope 3 module. Data is auto-fetched from existing calculations.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 89,
        "linked_config": {
            "data_source": "ghg_module",
            "scopes": ["scope3"],
            "read_only": True,
            "rows": [
                {"key": "total_scope3", "label": "Total Scope 3 emissions", "source": "scope3_total"},
                {"key": "intensity_turnover", "label": "Total Scope 3 emissions per rupee of turnover", "source": "calculated"},
                {"key": "intensity_optional", "label": "Total Scope 3 emission intensity (optional)", "source": "manual"}
            ],
            "columns": [
                {"key": "unit", "label": "Unit", "type": "text"},
                {"key": "current_fy", "label": "Current FY", "type": "number"},
                {"key": "previous_fy", "label": "Previous FY", "type": "number"}
            ]
        }
    },
    
    # Q90 - Biodiversity Impact
    {
        "question_key": "env_biodiversity_impact",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Provide details of significant direct & indirect biodiversity impacts and remediation activities.",
        "type": "long_text_response",
        "required": True,
        "description": "Describe biodiversity impacts and remediation measures.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 90,
        "text_config": {
            "min_length": 50,
            "placeholder": "Describe significant biodiversity impacts and remediation activities undertaken..."
        }
    },
    
    # Q91 - Resource Efficiency Initiatives
    {
        "question_key": "env_resource_efficiency_initiatives",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "If the entity has undertaken initiatives or used innovative technology to improve resource efficiency or reduce environmental impact.",
        "type": "dynamic_table",
        "required": False,
        "description": "Report resource efficiency and innovation initiatives.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 91,
        "table_config": {
            "columns": [
                {"key": "sno", "label": "S.No.", "type": "auto_increment", "width": "60px"},
                {"key": "initiative", "label": "Initiative Undertaken", "type": "text", "width": "200px"},
                {"key": "details", "label": "Details of Initiative", "type": "expandable_text", "width": "300px"},
                {"key": "outcome", "label": "Outcome", "type": "expandable_text", "width": "200px"}
            ],
            "allow_add_row": True,
            "allow_remove_row": True,
            "min_rows": 0,
            "support_weblinks": True
        }
    },
    
    # Q92 - Business Continuity & Disaster Management
    {
        "question_key": "env_business_continuity_disaster",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Does the entity have a business continuity and disaster management plan?",
        "type": "text_with_optional_weblink",
        "required": True,
        "description": "Describe business continuity and disaster management planning.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 92,
        "text_config": {
            "max_words": 100,
            "placeholder": "Describe your business continuity and disaster management plan (up to 100 words)...",
            "weblink_optional": True,
            "weblink_label": "Web Link (if policy document is publicly available)"
        }
    },
    
    # Q93 - Value Chain Environmental Impacts
    {
        "question_key": "env_value_chain_impacts",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Disclose significant adverse environmental impacts arising from the value chain and mitigation measures taken.",
        "type": "long_text_response",
        "required": True,
        "description": "Report environmental impacts from value chain activities.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 93,
        "text_config": {
            "min_length": 50,
            "placeholder": "Describe significant environmental impacts from your value chain and mitigation measures..."
        }
    },
    
    # Q94 - Environmental Assessment of Value Chain Partners
    {
        "question_key": "env_value_chain_assessment",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Percentage of value chain partners assessed for environmental impacts.",
        "type": "percentage_with_description",
        "required": True,
        "description": "Report on environmental assessment coverage of value chain partners.",
        "group": "Resource Management, Emissions & Compliance",
        "order": 94,
        "percentage_config": {
            "min": 0,
            "max": 100,
            "suffix": "%",
            "description_field": {
                "key": "assessment_details",
                "label": "Describe the assessment process and criteria used",
                "type": "textarea",
                "required": False
            }
        }
    }
]


async def seed_questions():
    """Seed BRSR environment questions 75-94 into the database."""
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["esg_question_configs"]
    
    now = datetime.now(timezone.utc).isoformat()
    
    inserted_count = 0
    updated_count = 0
    
    for question in BRSR_ENVIRONMENT_Q75_94:
        existing = await collection.find_one({"question_key": question["question_key"]})
        
        if existing:
            await collection.update_one(
                {"question_key": question["question_key"]},
                {"$set": {**question, "updated_at": now}}
            )
            print(f"  Updated: {question['question_key']}")
            updated_count += 1
        else:
            doc = {
                "id": str(uuid.uuid4()),
                **question,
                "created_at": now,
                "updated_at": None,
            }
            await collection.insert_one(doc)
            print(f"  Inserted: {question['question_key']}")
            inserted_count += 1
    
    print(f"\nSeed complete: {inserted_count} inserted, {updated_count} updated")
    
    total = await collection.count_documents({"section": "environment", "frameworks": "BRSR"})
    print(f"Total BRSR Environment questions now: {total}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_questions())
