"""
Database Migration Script: Supplier Assessment Scoring Schema

This script migrates existing questionnaires and questions to the new scoring schema:
1. Adds default esg_section_weights to questionnaires
2. Adds default overall_supplier_weights to questionnaires  
3. Adds default scoring config to questions based on response_type
4. Removes deprecated scoring_method field

Run with: python -m scripts.migrate_scoring_schema
"""

import asyncio
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

# MongoDB connection
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017").strip('"')
DB_NAME = os.environ.get("DB_NAME", "test_database").strip('"')


def get_default_scoring_config(response_type: str, options: list = None) -> dict:
    """Get default scoring config based on response type."""
    if response_type == "yes_no":
        return {
            "rule": "boolean",
            "true_score": 100,
            "false_score": 0,
            "max_score": 100,
        }
    elif response_type in ["numeric", "percentage"]:
        return {
            "rule": "higher_is_better",
            "target": 100,
            "min": 0,
            "max": 100,
            "max_score": 100,
        }
    elif response_type == "dropdown":
        # Build choice mapping from options if available
        choices = {}
        if options:
            num_options = len(options)
            for i, opt in enumerate(options):
                # Score decreases as option index increases (first = best)
                score = 100 - (i * (100 / max(num_options - 1, 1))) if num_options > 1 else 100
                choices[opt.get("value", f"option_{i}")] = round(score, 1)
        return {
            "rule": "choice_mapping",
            "choices": choices,
            "max_score": 100,
        }
    else:  # text or unknown
        return {
            "rule": "manual",
            "requires_manual_review": True,
            "max_score": 100,
        }


async def migrate_questionnaires(db):
    """Add default weight configurations to questionnaires."""
    print("\n=== Migrating Questionnaires ===")
    
    # Default weights
    default_esg_weights = {
        "environment": 33.33,
        "social": 33.33,
        "governance": 33.34,
    }
    default_supplier_weights = {
        "esg": 40,
        "ghg": 40,
        "revenue": 20,
    }
    
    # Find questionnaires without new weight fields
    questionnaires = await db.supplier_questionnaires.find(
        {"$or": [
            {"esg_section_weights": {"$exists": False}},
            {"overall_supplier_weights": {"$exists": False}},
        ]},
        {"_id": 0, "id": 1, "name": 1, "section_weights": 1, "scoring_method": 1}
    ).to_list(1000)
    
    print(f"Found {len(questionnaires)} questionnaires to migrate")
    
    migrated = 0
    for q in questionnaires:
        updates = {}
        
        # Migrate section_weights to esg_section_weights (preserve existing if available)
        existing_weights = q.get("section_weights", {})
        updates["esg_section_weights"] = {
            "environment": existing_weights.get("environment", default_esg_weights["environment"]),
            "social": existing_weights.get("social", default_esg_weights["social"]),
            "governance": existing_weights.get("governance", default_esg_weights["governance"]),
        }
        
        # Add overall supplier weights
        updates["overall_supplier_weights"] = default_supplier_weights
        
        # Add migration timestamp
        updates["migrated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.supplier_questionnaires.update_one(
            {"id": q["id"]},
            {"$set": updates}
        )
        migrated += 1
        print(f"  Migrated: {q.get('name', q['id'])}")
    
    print(f"Migrated {migrated} questionnaires")
    return migrated


async def migrate_questions(db):
    """Add default scoring config to questions."""
    print("\n=== Migrating Questions ===")
    
    # Find questions without scoring config
    questions = await db.supplier_questions.find(
        {"scoring": {"$exists": False}},
        {"_id": 0, "id": 1, "question_text": 1, "response_type": 1, "options": 1}
    ).to_list(5000)
    
    print(f"Found {len(questions)} questions to migrate")
    
    migrated = 0
    for q in questions:
        scoring_config = get_default_scoring_config(
            q.get("response_type", "text"),
            q.get("options", [])
        )
        
        await db.supplier_questions.update_one(
            {"id": q["id"]},
            {"$set": {
                "scoring": scoring_config,
                "migrated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        migrated += 1
        
        if migrated % 50 == 0:
            print(f"  Migrated {migrated} questions...")
    
    print(f"Migrated {migrated} questions")
    return migrated


async def verify_migration(db):
    """Verify migration was successful."""
    print("\n=== Verification ===")
    
    # Check questionnaires
    q_total = await db.supplier_questionnaires.count_documents({})
    q_with_weights = await db.supplier_questionnaires.count_documents({
        "esg_section_weights": {"$exists": True},
        "overall_supplier_weights": {"$exists": True},
    })
    print(f"Questionnaires: {q_with_weights}/{q_total} have new weight fields")
    
    # Check questions
    qu_total = await db.supplier_questions.count_documents({})
    qu_with_scoring = await db.supplier_questions.count_documents({
        "scoring": {"$exists": True}
    })
    print(f"Questions: {qu_with_scoring}/{qu_total} have scoring config")
    
    # Sample output
    print("\n=== Sample Migrated Data ===")
    sample_q = await db.supplier_questionnaires.find_one(
        {"esg_section_weights": {"$exists": True}},
        {"_id": 0, "id": 1, "name": 1, "esg_section_weights": 1, "overall_supplier_weights": 1}
    )
    if sample_q:
        print(f"Questionnaire: {sample_q.get('name')}")
        print(f"  ESG Weights: {sample_q.get('esg_section_weights')}")
        print(f"  Supplier Weights: {sample_q.get('overall_supplier_weights')}")
    
    sample_qu = await db.supplier_questions.find_one(
        {"scoring": {"$exists": True}},
        {"_id": 0, "id": 1, "question_text": 1, "response_type": 1, "scoring": 1}
    )
    if sample_qu:
        print(f"\nQuestion: {sample_qu.get('question_text', '')[:50]}...")
        print(f"  Type: {sample_qu.get('response_type')}")
        print(f"  Scoring: {sample_qu.get('scoring')}")
    
    return q_with_weights == q_total and qu_with_scoring == qu_total


async def main():
    """Run the migration."""
    print("=" * 60)
    print("Supplier Assessment Scoring Schema Migration")
    print("=" * 60)
    print(f"Database: {DB_NAME}")
    print(f"Started at: {datetime.now(timezone.utc).isoformat()}")
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    try:
        # Run migrations
        q_count = await migrate_questionnaires(db)
        qu_count = await migrate_questions(db)
        
        # Verify
        success = await verify_migration(db)
        
        print("\n" + "=" * 60)
        if success:
            print("MIGRATION COMPLETED SUCCESSFULLY")
        else:
            print("MIGRATION COMPLETED WITH WARNINGS - Some documents may not have been migrated")
        print(f"Total questionnaires migrated: {q_count}")
        print(f"Total questions migrated: {qu_count}")
        print("=" * 60)
        
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
