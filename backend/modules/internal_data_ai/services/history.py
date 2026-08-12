"""Scoped history, audit, approval, and assignment retrieval services."""
from shared.database.mongo import db
from modules.internal_data_ai.query_scope import and_filters, organization_scope, scoped_record_ids


def _id_filter(field: str, values: list) -> dict:
    return {field: {"$in": values}} if values else {field: {"$in": []}}


async def _resource_ids(collection: str, org_id: str, facility_ids: list = None) -> list:
    scope = and_filters(
        {"$or": [{"organization_id": org_id}, {"org_id": org_id}]},
        organization_scope(org_id, facility_ids, organization_field="org_id"),
    )
    records = await db[collection].find(scope, {"_id": 0, "id": 1}).to_list(1000)
    return [record["id"] for record in records if record.get("id")]


async def _authorized_facility_entity_ids(org_id: str, facility_ids: list) -> list:
    """Build a fail-closed entity allowlist for workflows without facility_id."""
    entity_ids = set(await scoped_record_ids(db, "emission_records", org_id, facility_ids))
    for collection in ("environment_records", "social_records", "governance_records"):
        entity_ids.update(await _resource_ids(collection, org_id, facility_ids))
    assignment_scope = organization_scope(org_id, facility_ids)
    for collection in ("esg_assignments", "esg_reporting_tasks"):
        docs = await db[collection].find(assignment_scope, {"_id": 0, "id": 1, "entity_id": 1}).to_list(1000)
        for doc in docs:
            if doc.get("id"):
                entity_ids.add(doc["id"])
            if doc.get("entity_id"):
                entity_ids.add(doc["entity_id"])
    return list(entity_ids)


async def get_changes(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Return only history linked to records that are authorized for this user."""
    record_type = (kwargs.get("record_type") or "").lower()
    results = []

    if not record_type or "emission" in record_type:
        emission_ids = await scoped_record_ids(db, "emission_records", org_id, facility_ids)
        docs = await db.emission_history.find(_id_filter("emission_id", emission_ids), {"_id": 0}).sort("changed_at", -1).to_list(20)
        results.extend({"module": "GHG Emissions", "record_id": d.get("emission_id"), "changed_by": d.get("changed_by"), "changed_at": d.get("changed_at"), "changes": d.get("changes")} for d in docs)

    for record_name, version_collection, module_name in (
        ("environment", "environment_record_versions", "Environment"),
        ("social", "social_record_versions", "Social"),
        ("governance", "governance_record_versions", "Governance"),
    ):
        if record_type and record_name not in record_type:
            continue
        ids = await _resource_ids(f"{record_name}_records", org_id, facility_ids)
        docs = await db[version_collection].find(_id_filter("record_id", ids), {"_id": 0}).sort("created_at", -1).to_list(10)
        results.extend({"module": module_name, "record_id": d.get("record_id"), "version": d.get("version"), "changed_by": d.get("created_by"), "changed_at": d.get("created_at"), "changed_fields": d.get("changed_fields")} for d in docs)

    if not record_type or "target" in record_type:
        target_ids = await scoped_record_ids(db, "esg_targets", org_id)
        docs = await db.esg_target_versions.find(_id_filter("target_id", target_ids), {"_id": 0}).sort("created_at", -1).to_list(10)
        results.extend({"module": "Targets", "target_id": d.get("target_id"), "version": d.get("version"), "changed_by": d.get("created_by_name") or d.get("created_by"), "changed_at": d.get("created_at"), "changed_fields": d.get("changed_fields")} for d in docs)

    return {"total": len(results), "history": results[:30]}


async def get_emission_record_history(
    org_id: str,
    facility_ids: list = None,
    emission_records: list = None,
    **_kwargs,
) -> dict:
    """Return history only for emission records already authorized by the retrieval pipeline."""
    emission_records = list(emission_records or [])
    record_ids = [record.get("id") for record in emission_records if record.get("id")]
    if not record_ids:
        return {"total": 0, "history": []}
    docs = await db.emission_history.find(
        _id_filter("emission_id", record_ids),
        {"_id": 0, "emission_id": 1, "changed_at": 1, "changes": 1, "changed_by": 1},
    ).sort("changed_at", -1).to_list(100)
    return {
        "total": len(docs),
        "history": [
            {
                "changed_at": item.get("changed_at"),
                "changes": item.get("changes"),
                "changed_by": item.get("changed_by"),
            }
            for item in docs
        ],
    }


async def get_framework_version_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    framework = kwargs.get("entity_name") or ""
    source_query = {"organization_id": org_id}
    if framework:
        source_query["framework"] = {"$regex": framework, "$options": "i"}
    source = await db.esg_responses.find(source_query, {"_id": 0, "id": 1, "question_key": 1}).to_list(1000)
    record_ids = [item["id"] for item in source if item.get("id")]
    question_keys = [item["question_key"] for item in source if item.get("question_key")]
    version_query = {"organization_id": org_id, "$or": [_id_filter("record_id", record_ids), _id_filter("question_key", question_keys)]}
    versions = await db.esg_responses_versions.find(version_query, {"_id": 0}).sort("created_at", -1).to_list(30)
    return {"total": len(versions), "history": [{"module": (v.get("framework") or "ESG").upper(), "question_key": v.get("question_key"), "version": v.get("version"), "change_type": v.get("change_type"), "changed_fields": v.get("changed_fields"), "change_reason": v.get("change_reason"), "changed_by": v.get("created_by"), "changed_at": v.get("created_at")} for v in versions]}


async def get_logs(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    entity_name = kwargs.get("entity_name") or ""
    query = {"organization_id": org_id}
    if entity_name:
        query = and_filters(query, {"$or": [{"module": {"$regex": entity_name, "$options": "i"}}, {"description": {"$regex": entity_name, "$options": "i"}}, {"resource": {"$regex": entity_name, "$options": "i"}}]})
    if facility_ids is not None:
        query = and_filters(query, {"$or": [{"facility_id": {"$in": facility_ids}}, {"metadata.facility_id": {"$in": facility_ids}}]})
    docs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(30)
    return {"total": len(docs), "logs": [{"action": d.get("action"), "module": d.get("module"), "user": d.get("user"), "description": d.get("description"), "timestamp": d.get("timestamp"), "changes": d.get("changes")} for d in docs]}


async def get_approval_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    entity_name = kwargs.get("entity_name") or ""
    query = {"organization_id": org_id}
    if entity_name:
        query = and_filters(query, {"entity_type": {"$regex": entity_name, "$options": "i"}})
    if facility_ids is not None:
        entity_ids = await _authorized_facility_entity_ids(org_id, facility_ids)
        query = and_filters(query, _id_filter("entity_id", entity_ids))
    history = await db.approval_history.find(query, {"_id": 0}).sort("created_at", -1).to_list(30)
    requests = await db.approval_requests.find(query, {"_id": 0}).sort("submitted_at", -1).to_list(20)
    return {"approval_events": [{"action": h.get("action"), "actor": h.get("actor_email"), "entity_type": h.get("entity_type"), "entity_id": h.get("entity_id"), "remarks": h.get("remarks"), "timestamp": h.get("created_at")} for h in history], "pending_requests": [{"type": r.get("request_type"), "entity_type": r.get("entity_type"), "submitted_by": r.get("submitted_by_name") or r.get("submitted_by_email"), "submitted_at": r.get("submitted_at"), "status": r.get("status")} for r in requests if r.get("status") == "pending"]}


async def get_assignment_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    query = organization_scope(org_id, facility_ids)
    assignments = await db.esg_assignments.find(query, {"_id": 0}).to_list(30)
    tasks = await db.esg_reporting_tasks.find(query, {"_id": 0}).to_list(30)
    assignment_ids = [item["id"] for item in assignments if item.get("id")]
    history = await db.esg_record_assignment_history.find(_id_filter("assignment_id", assignment_ids), {"_id": 0}).sort("created_at", -1).to_list(30)
    return {"active_assignments": [{"entity_type": a.get("entity_type"), "entity_id": a.get("entity_id"), "assigned_to": a.get("assigned_to_name") or a.get("assigned_to_user_id"), "category": a.get("category"), "due_date": a.get("due_at"), "status": a.get("status")} for a in assignments], "tasks": [{"category": t.get("category"), "period": t.get("period_label"), "status": t.get("status"), "facility_id": t.get("facility_id")} for t in tasks], "change_history": [{"action": h.get("action"), "previous": h.get("previous_value"), "new": h.get("new_value"), "changed_by": h.get("changed_by_user_id"), "timestamp": h.get("created_at")} for h in history]}