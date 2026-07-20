"""Analytics service for Internal Data AI — aggregations, rankings, summaries."""
from shared.database.mongo import db


async def query(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Handle analytical questions — top emitters, comparisons, trends."""
    metric = kwargs.get("metric") or kwargs.get("entity_name") or ""
    scope = kwargs.get("scope")
    category = kwargs.get("category")

    match_stage = {"organization_id": org_id}
    if facility_ids:
        match_stage["facility_id"] = {"$in": facility_ids}
    if scope:
        match_stage["scope"] = {"$regex": scope.replace("scope ", "").strip()}

    # Facility-wise emissions
    pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": "$facility_id",
            "total_emissions": {"$sum": {"$toDouble": {"$ifNull": ["$co2e_emissions", "$total_emissions"]}}},
            "record_count": {"$sum": 1},
        }},
        {"$sort": {"total_emissions": -1}},
        {"$limit": 10},
    ]
    facility_emissions = await db.emission_records.aggregate(pipeline).to_list(10)

    # Map facility names
    fac_ids = [r["_id"] for r in facility_emissions if r["_id"]]
    fac_map = {}
    if fac_ids:
        facs = await db.facilities.find({"id": {"$in": fac_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        fac_map = {f["id"]: f["name"] for f in facs}

    # Category-wise emissions
    cat_pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": "$category",
            "total_emissions": {"$sum": {"$toDouble": {"$ifNull": ["$co2e_emissions", "$total_emissions"]}}},
            "record_count": {"$sum": 1},
        }},
        {"$sort": {"total_emissions": -1}},
        {"$limit": 10},
    ]
    category_emissions = await db.emission_records.aggregate(cat_pipeline).to_list(10)

    # Scope-wise breakdown
    scope_pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": "$scope",
            "total_emissions": {"$sum": {"$toDouble": {"$ifNull": ["$co2e_emissions", "$total_emissions"]}}},
            "record_count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    scope_breakdown = await db.emission_records.aggregate(scope_pipeline).to_list(5)

    total_records = await db.emission_records.count_documents(match_stage)

    return {
        "total_records": total_records,
        "facility_rankings": [
            {"facility": fac_map.get(r["_id"], r["_id"]), "total_emissions": round(r["total_emissions"], 2), "records": r["record_count"]}
            for r in facility_emissions
        ],
        "category_breakdown": [
            {"category": r["_id"], "total_emissions": round(r["total_emissions"], 2), "records": r["record_count"]}
            for r in category_emissions
        ],
        "scope_breakdown": [
            {"scope": r["_id"], "total_emissions": round(r["total_emissions"], 2), "records": r["record_count"]}
            for r in scope_breakdown
        ],
    }


async def summary(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """General overview summary."""
    match = {"organization_id": org_id}
    if facility_ids:
        match["facility_id"] = {"$in": facility_ids}

    emission_count = await db.emission_records.count_documents(match)
    env_count = await db.environment_records.count_documents({"org_id": org_id})
    social_count = await db.social_records.count_documents({"org_id": org_id})
    gov_count = await db.governance_records.count_documents({"org_id": org_id})
    facility_count = await db.facilities.count_documents({"organization_id": org_id})
    target_count = await db.esg_targets.count_documents({"organization_id": org_id})
    pending_approvals = await db.approval_requests.count_documents({"organization_id": org_id, "status": "pending"})
    file_count = await db.uploaded_files.count_documents({})

    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1})

    return {
        "organization": org.get("name") if org else org_id,
        "emission_records": emission_count,
        "environment_records": env_count,
        "social_records": social_count,
        "governance_records": gov_count,
        "facilities": facility_count,
        "targets": target_count,
        "pending_approvals": pending_approvals,
        "uploaded_evidence": file_count,
    }


async def list_items(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """List items based on entity type."""
    entity = kwargs.get("entity_name") or kwargs.get("record_type") or "facilities"

    if "facilit" in entity.lower():
        q = {"organization_id": org_id}
        if facility_ids:
            q["id"] = {"$in": facility_ids}
        items = await db.facilities.find(q, {"_id": 0, "id": 1, "name": 1, "address": 1, "sector": 1}).to_list(50)
        return {"type": "facilities", "items": items}

    elif "target" in entity.lower():
        items = await db.esg_targets.find({"organization_id": org_id}, {"_id": 0, "target_name": 1, "section": 1, "status": 1, "target_year": 1}).to_list(50)
        return {"type": "targets", "items": items}

    elif "user" in entity.lower():
        items = await db.users.find({}, {"_id": 0, "id": 1, "email": 1, "full_name": 1, "role": 1}).to_list(50)
        return {"type": "users", "items": items}

    return {"type": entity, "items": []}


async def count_items(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Count items."""
    entity = kwargs.get("entity_name") or kwargs.get("record_type") or ""
    match = {"organization_id": org_id}
    if facility_ids:
        match["facility_id"] = {"$in": facility_ids}

    counts = {}
    if not entity or "emission" in entity.lower():
        counts["emission_records"] = await db.emission_records.count_documents(match)
    if not entity or "environment" in entity.lower():
        counts["environment_records"] = await db.environment_records.count_documents({"org_id": org_id})
    if not entity or "target" in entity.lower():
        counts["targets"] = await db.esg_targets.count_documents({"organization_id": org_id})
    if not entity or "facilit" in entity.lower():
        counts["facilities"] = await db.facilities.count_documents({"organization_id": org_id})
    if not entity or "approval" in entity.lower():
        counts["pending_approvals"] = await db.approval_requests.count_documents({"organization_id": org_id, "status": "pending"})

    return counts
