"""
Seed Script: BRSR Environment Questions 70-74 (Life Cycle Assessment & Circular Economy)

Seeds BRSR environment questions for Life Cycle Assessment and Circular Economy.
These are part of Principle 6 (Environment) disclosures in BRSR format.

Usage:
    cd /app/backend && python scripts/seed_brsr_environment_q70_74.py
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

BRSR_ENVIRONMENT_Q70_74 = [
    # Q70 - Life Cycle Assessment (LCA) - Yes/No with conditional table
    {
        "question_key": "env_life_cycle_assessment",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Has the entity conducted Life Cycle Perspective / Assessments (LCA) for any of its products (for manufacturing industry) or for its services (for service industry)?",
        "type": "yes_no_with_dynamic_table",
        "required": True,
        "description": "Provide details of Life Cycle Assessments conducted for products/services including NIC Code, % turnover, boundary, agency, and public disclosure.",
        "group": "Life Cycle Assessment",
        "order": 70,
        "table_config": {
            "conditional_field": "has_lca",
            "show_table_when": "yes",
            "columns": [
                {"key": "nic_code", "label": "NIC Code", "type": "text", "width": "100px"},
                {"key": "product_service", "label": "Name of Product/Service", "type": "text", "width": "200px"},
                {"key": "turnover_percentage", "label": "% of total Turnover contributed", "type": "number", "width": "120px"},
                {"key": "boundary", "label": "Boundary for which LCA was conducted", "type": "select", "options": ["Cradle to Gate", "Cradle to Grave", "Cradle to Cradle", "Gate to Gate"], "width": "150px"},
                {"key": "external_agency", "label": "Whether conducted by independent external agency", "type": "yes_no", "width": "120px"},
                {"key": "results_public", "label": "Results communicated in public domain", "type": "yes_no", "width": "120px"},
                {"key": "web_link", "label": "Web Link (if available)", "type": "text", "width": "200px"}
            ],
            "allow_add_row": True,
            "allow_remove_row": True,
            "min_rows": 1
        }
    },
    
    # Q71 - LCA Environmental Concerns
    {
        "question_key": "env_lca_concerns_actions",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "If there are any significant social or environmental concerns and/or risks arising from production or disposal of your products/services, as identified in the Life Cycle Perspective/Assessments (LCA) or through any other means, briefly describe the same along-with action taken to mitigate the same.",
        "type": "textarea",
        "required": False,
        "description": "Describe significant environmental/social concerns identified through LCA and mitigation actions taken.",
        "placeholder": "Describe the significant concerns identified and the mitigation actions taken...",
        "group": "Life Cycle Assessment",
        "order": 71,
        "visible_if": {
            "question_key": "env_life_cycle_assessment",
            "condition": "equals",
            "value": {"has_lca": "yes"}
        }
    },
    
    # Q72 - Recycled/Reused Input Material - Historical Percentage Table
    {
        "question_key": "env_recycled_input_material",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Percentage of recycled or reused input material to total material (by value) used in production (for manufacturing industry) or providing services (for service industry).",
        "type": "historical_material_percentage_table",
        "required": True,
        "description": "Provide recycled/reused input material percentage for current and previous reporting periods.",
        "group": "Circular Economy",
        "order": 72,
        "table_config": {
            "columns": [
                {"key": "indicate_input_material", "label": "Indicate input material", "type": "text", "width": "200px"},
                {"key": "recycled_reused_percentage_current_fy", "label": "Recycled or re-used input material to total material (Current FY)", "type": "number", "suffix": "%", "width": "180px"},
                {"key": "recycled_reused_percentage_previous_fy", "label": "Recycled or re-used input material to total material (Previous FY)", "type": "number", "suffix": "%", "width": "180px", "historical_autofill": True}
            ],
            "allow_add_row": True,
            "allow_remove_row": True,
            "min_rows": 1,
            "historical_autofill_config": {
                "enabled": True,
                "source_column": "recycled_reused_percentage_current_fy",
                "target_column": "recycled_reused_percentage_previous_fy"
            }
        }
    },
    
    # Q73 - Reclaimed Products/Packaging Percentage
    {
        "question_key": "env_reclaimed_products_packaging",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Of the products and packaging reclaimed at end of life of products, amount (in metric tonnes) reused, recycled, and safely disposed, as a percentage of products sold.",
        "type": "historical_reclaim_percentage_table",
        "required": True,
        "description": "Provide details of reclaimed products and packaging showing re-use, recycling and safe disposal percentages.",
        "group": "Circular Economy",
        "order": 73,
        "table_config": {
            "row_categories": [
                {"key": "plastics_including_packaging", "label": "Plastics (including packaging)"},
                {"key": "e_waste", "label": "E-waste"},
                {"key": "hazardous_waste", "label": "Hazardous waste"},
                {"key": "other_waste", "label": "Other waste"}
            ],
            "column_groups": [
                {
                    "label": "Current Financial Year",
                    "columns": [
                        {"key": "reused_current_fy", "label": "Re-Used", "type": "number", "suffix": "%"},
                        {"key": "recycled_current_fy", "label": "Recycled", "type": "number", "suffix": "%"},
                        {"key": "safely_disposed_current_fy", "label": "Safely Disposed", "type": "number", "suffix": "%"}
                    ]
                },
                {
                    "label": "Previous Financial Year",
                    "columns": [
                        {"key": "reused_previous_fy", "label": "Re-Used", "type": "number", "suffix": "%", "historical_autofill": True},
                        {"key": "recycled_previous_fy", "label": "Recycled", "type": "number", "suffix": "%", "historical_autofill": True},
                        {"key": "safely_disposed_previous_fy", "label": "Safely Disposed", "type": "number", "suffix": "%", "historical_autofill": True}
                    ]
                }
            ],
            "historical_autofill_config": {
                "enabled": True,
                "mappings": [
                    {"source": "reused_current_fy", "target": "reused_previous_fy"},
                    {"source": "recycled_current_fy", "target": "recycled_previous_fy"},
                    {"source": "safely_disposed_current_fy", "target": "safely_disposed_previous_fy"}
                ]
            }
        }
    },
    
    # Q74 - Waste Management Practices
    {
        "question_key": "env_waste_management_practices",
        "section": "environment",
        "frameworks": ["BRSR"],
        "question": "Reclaimed products and their packaging materials (as percentage of products sold) for each product category.",
        "type": "historical_waste_management_matrix",
        "required": True,
        "description": "Provide waste management details showing reclaimed products and packaging for current and previous FY.",
        "group": "Circular Economy",
        "order": 74,
        "table_config": {
            "columns": [
                {"key": "product_category", "label": "Indicate product category", "type": "text", "width": "200px"},
                {"key": "reclaimed_percentage_current_fy", "label": "Reclaimed products and their packaging materials as % of products sold (Current FY)", "type": "number", "suffix": "%", "width": "180px"},
                {"key": "reclaimed_percentage_previous_fy", "label": "Reclaimed products and their packaging materials as % of products sold (Previous FY)", "type": "number", "suffix": "%", "width": "180px", "historical_autofill": True}
            ],
            "allow_add_row": True,
            "allow_remove_row": True,
            "min_rows": 1,
            "historical_autofill_config": {
                "enabled": True,
                "source_column": "reclaimed_percentage_current_fy",
                "target_column": "reclaimed_percentage_previous_fy"
            }
        }
    }
]


async def seed_questions():
    """Seed BRSR environment questions 70-74 into the database."""
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["esg_question_configs"]
    
    now = datetime.now(timezone.utc).isoformat()
    
    inserted_count = 0
    updated_count = 0
    
    for question in BRSR_ENVIRONMENT_Q70_74:
        existing = await collection.find_one({"question_key": question["question_key"]})
        
        if existing:
            # Update existing question
            await collection.update_one(
                {"question_key": question["question_key"]},
                {"$set": {**question, "updated_at": now}}
            )
            print(f"  Updated: {question['question_key']}")
            updated_count += 1
        else:
            # Insert new question
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
    
    # Verify
    total = await collection.count_documents({"section": "environment", "frameworks": "BRSR"})
    print(f"Total BRSR Environment questions now: {total}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_questions())
