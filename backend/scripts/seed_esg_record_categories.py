"""
Seed Script: ESG Record Categories

Seeds initial categories for Environment, Social, and Governance records.
Categories are config-driven and can be extended by Super Admin later.

Usage:
    cd /app/backend && python scripts/seed_esg_record_categories.py
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

# =============================================================================
# Environment Categories
# =============================================================================

ENVIRONMENT_CATEGORIES = [
    # Water
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Water",
        "subcategory": "Consumption",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["daily", "monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["KL", "Litres", "m³"]},
            {"field_key": "source_type", "type": "dropdown", "label": "Source Type", "options": ["Municipal", "Ground Water", "Surface Water", "Third Party", "Rainwater"]}
        ],
        "is_active": True,
        "order": 1
    },
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Water",
        "subcategory": "Withdrawal",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["daily", "monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["KL", "Litres", "m³"]},
            {"field_key": "source", "type": "dropdown", "label": "Source", "options": ["Surface Water", "Ground Water", "Seawater", "Third Party", "Rainwater"]}
        ],
        "is_active": True,
        "order": 2
    },
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Water",
        "subcategory": "Discharge",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["daily", "monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["KL", "Litres", "m³"]},
            {"field_key": "destination", "type": "dropdown", "label": "Destination", "options": ["Surface Water", "Ground Water", "Third Party", "Seawater"]},
            {"field_key": "treatment_level", "type": "dropdown", "label": "Treatment Level", "options": ["No Treatment", "Primary", "Secondary", "Tertiary"]}
        ],
        "is_active": True,
        "order": 3
    },
    
    # Energy
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Energy",
        "subcategory": "Electricity",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["daily", "monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["kWh", "MWh", "GJ"]},
            {"field_key": "source_type", "type": "dropdown", "label": "Source Type", "options": ["Grid", "Captive", "Renewable", "DG Set"]},
            {"field_key": "is_renewable", "type": "yes_no", "label": "Is Renewable?"}
        ],
        "is_active": True,
        "order": 10
    },
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Energy",
        "subcategory": "Fuel",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["daily", "monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["Litres", "kg", "Tonnes", "m³"]},
            {"field_key": "fuel_type", "type": "dropdown", "label": "Fuel Type", "options": ["Diesel", "Petrol", "LPG", "Natural Gas", "Coal", "Biomass", "Other"]}
        ],
        "is_active": True,
        "order": 11
    },
    
    # Emissions
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Emissions",
        "subcategory": "Air Emissions",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "parameter", "type": "dropdown", "label": "Parameter", "required": True, "options": ["NOx", "SOx", "PM", "VOC", "HAP", "Other"]},
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["kg", "Tonnes", "mg/Nm³"]}
        ],
        "is_active": True,
        "order": 20
    },
    
    # Waste
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Waste",
        "subcategory": "Hazardous Waste",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "waste_type", "type": "dropdown", "label": "Waste Type", "options": ["E-Waste", "Battery Waste", "Biomedical", "Chemical", "Other"]},
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["kg", "Tonnes", "Litres"]},
            {"field_key": "disposal_method", "type": "dropdown", "label": "Disposal Method", "options": ["Recycled", "Incineration", "Landfill", "Co-processing", "Authorized Vendor"]}
        ],
        "is_active": True,
        "order": 30
    },
    {
        "id": str(uuid.uuid4()),
        "section": "environment",
        "category": "Waste",
        "subcategory": "Non-Hazardous Waste",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "waste_type", "type": "dropdown", "label": "Waste Type", "options": ["Plastic", "Paper", "Metal", "Food", "Construction", "Other"]},
            {"field_key": "quantity", "type": "number", "label": "Quantity", "required": True, "validation": {"min": 0}},
            {"field_key": "unit", "type": "unit_selector", "label": "Unit", "required": True, "options": ["kg", "Tonnes"]},
            {"field_key": "disposal_method", "type": "dropdown", "label": "Disposal Method", "options": ["Recycled", "Composted", "Landfill", "Reused", "Sold"]}
        ],
        "is_active": True,
        "order": 31
    }
]

# =============================================================================
# Social Categories (minimal for now, can be expanded)
# =============================================================================

SOCIAL_CATEGORIES = [
    {
        "id": str(uuid.uuid4()),
        "section": "social",
        "category": "Workforce",
        "subcategory": "Employee Count",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "employee_type", "type": "dropdown", "label": "Employee Type", "options": ["Permanent", "Contractual", "Temporary"]},
            {"field_key": "gender", "type": "dropdown", "label": "Gender", "options": ["Male", "Female", "Other"]},
            {"field_key": "count", "type": "number", "label": "Count", "required": True, "validation": {"min": 0}}
        ],
        "is_active": True,
        "order": 1
    },
    {
        "id": str(uuid.uuid4()),
        "section": "social",
        "category": "Training",
        "subcategory": "Training Hours",
        "sub_subcategory": None,
        "frameworks": ["BRSR", "GRI"],
        "allowed_reporting_types": ["monthly", "quarterly", "yearly"],
        "fields": [
            {"field_key": "training_type", "type": "dropdown", "label": "Training Type", "options": ["Health & Safety", "Skill Development", "Compliance", "Leadership", "Other"]},
            {"field_key": "hours", "type": "number", "label": "Total Hours", "required": True, "validation": {"min": 0}},
            {"field_key": "participants", "type": "number", "label": "Participants", "validation": {"min": 0}}
        ],
        "is_active": True,
        "order": 10
    }
]

# =============================================================================
# Governance Categories (minimal for now)
# =============================================================================

GOVERNANCE_CATEGORIES = [
    {
        "id": str(uuid.uuid4()),
        "section": "governance",
        "category": "Compliance",
        "subcategory": "Regulatory Filings",
        "sub_subcategory": None,
        "frameworks": ["BRSR"],
        "allowed_reporting_types": ["quarterly", "yearly"],
        "fields": [
            {"field_key": "filing_type", "type": "dropdown", "label": "Filing Type", "options": ["Annual Return", "Quarterly Report", "Statutory Filing", "Other"]},
            {"field_key": "filing_date", "type": "date", "label": "Filing Date", "required": True},
            {"field_key": "status", "type": "dropdown", "label": "Status", "options": ["Filed", "Pending", "Overdue"]}
        ],
        "is_active": True,
        "order": 1
    }
]


async def seed_categories():
    """Seed ESG record categories into the database."""
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["esg_record_categories"]
    
    now = datetime.now(timezone.utc).isoformat()
    
    all_categories = ENVIRONMENT_CATEGORIES + SOCIAL_CATEGORIES + GOVERNANCE_CATEGORIES
    
    inserted_count = 0
    updated_count = 0
    
    for category in all_categories:
        # Check by section + category + subcategory
        existing = await collection.find_one({
            "section": category["section"],
            "category": category["category"],
            "subcategory": category.get("subcategory")
        })
        
        if existing:
            await collection.update_one(
                {"_id": existing["_id"]},
                {"$set": {**category, "updated_at": now}}
            )
            print(f"  Updated: {category['section']}/{category['category']}/{category.get('subcategory', '-')}")
            updated_count += 1
        else:
            category["created_at"] = now
            category["updated_at"] = None
            await collection.insert_one(category)
            print(f"  Inserted: {category['section']}/{category['category']}/{category.get('subcategory', '-')}")
            inserted_count += 1
    
    print(f"\nSeed complete: {inserted_count} inserted, {updated_count} updated")
    
    # Print summary
    for section in ["environment", "social", "governance"]:
        count = await collection.count_documents({"section": section})
        print(f"  {section.capitalize()} categories: {count}")
    
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_categories())
