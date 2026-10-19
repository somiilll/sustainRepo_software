"""Data Status service for Internal Data AI — record-level status aggregation."""
from shared.database.mongo import db
from modules.internal_data_ai.query_scope import and_filters, organization_scope


async def get_status(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Aggregate approval/submission status across all record types."""
    record_type = kwargs.get("record_type") or ""
    results = {}

    # GHG Emission Records status
    if not record_type or "emission" in record_type.lower():
        em_match = organization_scope(org_id, facility_ids)
        pipeline = [
            {"$match": em_match},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        em_stats = await db.emission_records.aggregate(pipeline).to_list(10)
        results["emission_records"] = {s["_id"] or "no_status": s["count"] for s in em_stats}

    # Environment Records
    if not record_type or "environment" in record_type.lower():
        pipeline = [
            {"$match": and_filters({"$or": [{"organization_id": org_id}, {"org_id": org_id}]}, organization_scope(org_id, facility_ids, organization_field="org_id"))},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        env_stats = await db.environment_records.aggregate(pipeline).to_list(10)
        results["environment_records"] = {s["_id"] or "no_status": s["count"] for s in env_stats}

    # Social Records
    if not record_type or "social" in record_type.lower():
        pipeline = [
            {"$match": and_filters({"$or": [{"organization_id": org_id}, {"org_id": org_id}]}, organization_scope(org_id, facility_ids, organization_field="org_id"))},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        soc_stats = await db.social_records.aggregate(pipeline).to_list(10)
        results["social_records"] = {s["_id"] or "no_status": s["count"] for s in soc_stats}

    # Governance Records
    if not record_type or "governance" in record_type.lower():
        pipeline = [
            {"$match": and_filters({"$or": [{"organization_id": org_id}, {"org_id": org_id}]}, organization_scope(org_id, facility_ids, organization_field="org_id"))},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        gov_stats = await db.governance_records.aggregate(pipeline).to_list(10)
        results["governance_records"] = {s["_id"] or "no_status": s["count"] for s in gov_stats}

    # BRSR/GRI Submissions status
    if not record_type or "brsr" in record_type.lower() or "gri" in record_type.lower():
        pipeline = [
            {"$match": {"organization_id": org_id}},
            {"$group": {
                "_id": {"framework": "$framework", "status": "$status"},
                "count": {"$sum": 1},
            }},
        ]
        fw_stats = await db.esg_response_submissions.aggregate(pipeline).to_list(20)
        fw_result = {}
        for s in fw_stats:
            fw = s["_id"].get("framework", "unknown")
            st = s["_id"].get("status", "no_status")
            fw_result.setdefault(fw, {})[st] = s["count"]
        results["framework_submissions"] = fw_result

    # Approval requests summary
    approval_match = {"organization_id": org_id}
    if facility_ids is not None:
        approval_match["entity_snapshot.facility_id"] = {"$in": facility_ids}
    approval_pipeline = [
        {"$match": approval_match},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    approval_stats = await db.approval_requests.aggregate(approval_pipeline).to_list(10)
    results["approval_requests"] = {s["_id"] or "no_status": s["count"] for s in approval_stats}

    return results
