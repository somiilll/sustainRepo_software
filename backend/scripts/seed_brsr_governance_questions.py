"""
Seed Script: BRSR Governance Questions (Section C)

Seeds the initial BRSR governance questions for the ESG questionnaire system.
Run this once to populate the esg_question_configs collection.

Usage:
    cd /app/backend && python scripts/seed_brsr_governance_questions.py
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

BRSR_GOVERNANCE_QUESTIONS = [
    {
        "question_key": "policy_cover_principles",
        "section": "governance",
        "frameworks": ["BRSR"],
        "question": "Whether your entity's policies cover each principle and its core elements of the NGRBCs",
        "type": "principle_toggle_with_description",
        "required": True,
        "description": "Indicate whether your organization has formal policies that address each of the nine NGRBC principles (P1-P9).",
        "group": "Policy & Governance",
        "order": 1,
    },
    {
        "question_key": "policy_board_approved",
        "section": "governance",
        "frameworks": ["BRSR"],
        "question": "Has the policy been approved by the Board?",
        "type": "principle_toggle_with_description",
        "required": True,
        "description": "Indicate whether the Board of Directors has formally approved the policies for each principle.",
        "group": "Policy & Governance",
        "order": 2,
    },
    {
        "question_key": "policy_translated_to_procedures",
        "section": "governance",
        "frameworks": ["BRSR"],
        "question": "Whether the entity has translated the policy into procedures.",
        "type": "principle_toggle_with_description",
        "required": True,
        "description": "Indicate whether your organization has translated high-level policies into actionable operational procedures for each principle.",
        "group": "Policy & Governance",
        "order": 3,
    },
]


async def seed_questions():
    """Seed BRSR governance questions into the database."""
    print("Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    collection = db["esg_question_configs"]
    
    now = datetime.now(timezone.utc).isoformat()
    
    inserted_count = 0
    updated_count = 0
    
    for question in BRSR_GOVERNANCE_QUESTIONS:
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
    
    print(f"\nDone! Inserted: {inserted_count}, Updated: {updated_count}")
    
    # Verify
    total = await collection.count_documents({"section": "governance", "frameworks": "BRSR"})
    print(f"Total BRSR governance questions in DB: {total}")
    
    client.close()


if __name__ == "__main__":
    print("=== BRSR Governance Questions Seed Script ===\n")
    asyncio.run(seed_questions())
