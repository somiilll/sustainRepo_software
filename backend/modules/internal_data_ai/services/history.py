"""History, Audit, Approval, Assignment services for Internal Data AI."""
from shared.database.mongo import db


async def get_changes(org_id: str, **kwargs) -> dict:
    """Version history across modules."""
    entity_name = kwargs.get("entity_name") or ""
    record_type = kwargs.get("record_type") or ""

    results = []

    # Emission history
    if not record_type or "emission" in record_type.lower():
        docs = await db.emission_history.find({}, {"_id": 0}).sort("changed_at", -1).to_list(20)
        for d in docs:
            results.append({
                "module": "GHG Emissions",
                "record_id": d.get("emission_id"),
                "changed_by": d.get("changed_by"),
                "changed_at": d.get("changed_at"),
                "changes": d.get("changes"),
            })

    # Environment record versions
    if not record_type or "environment" in record_type.lower():
        docs = await db.environment_record_versions.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
        for d in docs:
            results.append({
                "module": "Environment",
                "record_id": d.get("record_id"),
                "version": d.get("version"),
                "changed_by": d.get("created_by"),
                "changed_at": d.get("created_at"),
                "changed_fields": d.get("changed_fields"),
            })

    # ESG target versions
    if not record_type or "target" in record_type.lower():
        docs = await db.esg_target_versions.find({}, {"_id": 0}).sort("created_at", -1).to_list(10)
        for d in docs:
            results.append({
                "module": "Targets",
                "target_id": d.get("target_id"),
                "version": d.get("version"),
                "changed_by": d.get("created_by_name") or d.get("created_by"),
                "changed_at": d.get("created_at"),
                "changed_fields": d.get("changed_fields"),
            })

    return {"total": len(results), "history": results[:30]}


# ── Audit logs ──
async def get_logs(org_id: str, **kwargs) -> dict:
    entity_name = kwargs.get("entity_name") or ""
    q = {}
    if entity_name:
        q["$or"] = [
            {"module": {"$regex": entity_name, "$options": "i"}},
            {"description": {"$regex": entity_name, "$options": "i"}},
            {"resource": {"$regex": entity_name, "$options": "i"}},
        ]

    docs = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(30)
    return {
        "total": len(docs),
        "logs": [
            {
                "action": d.get("action"),
                "module": d.get("module"),
                "user": d.get("user"),
                "description": d.get("description"),
                "timestamp": d.get("timestamp"),
                "changes": d.get("changes"),
            }
            for d in docs
        ],
    }


# ── Approval history ──
async def get_approval_history(org_id: str, **kwargs) -> dict:
    q = {"organization_id": org_id}
    entity_name = kwargs.get("entity_name") or ""
    if entity_name:
        q["$or"] = [
            {"entity_type": {"$regex": entity_name, "$options": "i"}},
        ]

    history = await db.approval_history.find(q, {"_id": 0}).sort("created_at", -1).to_list(30)
    requests = await db.approval_requests.find(q, {"_id": 0}).sort("submitted_at", -1).to_list(20)

    return {
        "approval_events": [
            {
                "action": h.get("action"),
                "actor": h.get("actor_email"),
                "entity_type": h.get("entity_type"),
                "entity_id": h.get("entity_id"),
                "remarks": h.get("remarks"),
                "timestamp": h.get("created_at"),
            }
            for h in history
        ],
        "pending_requests": [
            {
                "type": r.get("request_type"),
                "entity_type": r.get("entity_type"),
                "submitted_by": r.get("submitted_by_name") or r.get("submitted_by_email"),
                "submitted_at": r.get("submitted_at"),
                "status": r.get("status"),
            }
            for r in requests if r.get("status") == "pending"
        ],
    }


# ── Assignment history ──
async def get_assignment_history(org_id: str, **kwargs) -> dict:
    q = {"organization_id": org_id}
    assignments = await db.esg_assignments.find(q, {"_id": 0}).to_list(30)
    tasks = await db.esg_reporting_tasks.find(q, {"_id": 0}).to_list(30)
    history = await db.esg_record_assignment_history.find({}, {"_id": 0}).sort("created_at", -1).to_list(30)

    return {
        "active_assignments": [
            {
                "entity_type": a.get("entity_type"),
                "entity_id": a.get("entity_id"),
                "assigned_to": a.get("assigned_to_name") or a.get("assigned_to_user_id"),
                "category": a.get("category"),
                "due_date": a.get("due_at"),
                "status": a.get("status"),
            }
            for a in assignments
        ],
        "tasks": [
            {
                "category": t.get("category"),
                "period": t.get("period_label"),
                "status": t.get("status"),
                "facility_id": t.get("facility_id"),
            }
            for t in tasks
        ],
        "change_history": [
            {
                "action": h.get("action"),
                "previous": h.get("previous_value"),
                "new": h.get("new_value"),
                "changed_by": h.get("changed_by_user_id"),
                "timestamp": h.get("created_at"),
            }
            for h in history
        ],
    }
