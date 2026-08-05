"""Inspect DB state for Facility E Scope 2 assignment."""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
import json

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

FACILITY_ID = "39ecd9be-9417-4df6-93c4-e583abf49260"
USER_ID = "e3e7ec7e-5b3d-4011-a752-40cd67be84c0"


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print("=" * 60)
    print("FACILITY E")
    print("=" * 60)
    fac = await db.facilities.find_one({"id": FACILITY_ID}, {"_id": 0})
    print(json.dumps(fac, default=str, indent=2) if fac else "NOT FOUND")

    org_id = (fac or {}).get("organization_id")

    print("=" * 60)
    print(f"USER {USER_ID}")
    print("=" * 60)
    user = await db.users.find_one({"id": USER_ID}, {"_id": 0})
    print(json.dumps(user, default=str, indent=2) if user else "NOT FOUND")

    print("=" * 60)
    print("esg_assignment_assignees for user (all)")
    print("=" * 60)
    assignee_docs = await db.esg_assignment_assignees.find(
        {"user_id": USER_ID}, {"_id": 0}
    ).to_list(500)
    print(f"count={len(assignee_docs)}")
    for d in assignee_docs[:20]:
        print(json.dumps(d, default=str, indent=2))

    print("=" * 60)
    print("esg_assignment_assignees for user WHERE removed_at IS None")
    print("=" * 60)
    active = await db.esg_assignment_assignees.find(
        {"user_id": USER_ID, "removed_at": None}, {"_id": 0}
    ).to_list(500)
    print(f"count={len(active)}")

    assignment_ids = [d["assignment_id"] for d in active]
    print(f"assignment_ids: {assignment_ids}")

    print("=" * 60)
    print("esg_assignments matching those IDs")
    print("=" * 60)
    if assignment_ids:
        assignments = await db.esg_assignments.find(
            {"id": {"$in": assignment_ids}}, {"_id": 0}
        ).to_list(500)
        for a in assignments:
            print(json.dumps({
                "id": a.get("id"),
                "entity_type": a.get("entity_type"),
                "kpi_identifier": a.get("kpi_identifier"),
                "category": a.get("category"),
                "subcategory": a.get("subcategory"),
                "facility_id": a.get("facility_id"),
                "assignment_level": a.get("assignment_level"),
                "requires_approval": a.get("requires_approval"),
                "approver_id": a.get("approver_id"),
                "status": a.get("status"),
                "organization_id": a.get("organization_id"),
            }, default=str, indent=2))

    print("=" * 60)
    print("Scope 2 Facility E assignments (any user, via junction)")
    print("=" * 60)
    scope2_assign = await db.esg_assignments.find(
        {
            "organization_id": org_id,
            "$or": [
                {"kpi_identifier": "scope2"},
                {"category": "GHG Emissions", "subcategory": "GHG Emissions - Scope 2"},
            ],
        },
        {"_id": 0},
    ).to_list(500)
    print(f"count={len(scope2_assign)}")
    for a in scope2_assign:
        print(json.dumps({
            "id": a.get("id"),
            "entity_type": a.get("entity_type"),
            "kpi_identifier": a.get("kpi_identifier"),
            "category": a.get("category"),
            "subcategory": a.get("subcategory"),
            "facility_id": a.get("facility_id"),
            "assignment_level": a.get("assignment_level"),
            "requires_approval": a.get("requires_approval"),
            "approver_id": a.get("approver_id"),
            "assigned_to_user_id": a.get("assigned_to_user_id"),
            "status": a.get("status"),
        }, default=str, indent=2))


asyncio.run(main())
