"""Scoped history, audit, approval, and assignment retrieval services."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from shared.database.mongo import db
from modules.esg_records.version_utils import compare_versions, format_field_display_name
from modules.internal_data_ai.query_scope import and_filters, organization_scope, resolve_authorized_facilities, scoped_record_ids
from modules.internal_data_ai.reporting_periods import esg_period_filter, period_from_payload


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
        {"_id": 0, "emission_id": 1, "changed_at": 1, "changes": 1, "changed_by_name": 1},
    ).sort("changed_at", -1).to_list(100)
    return {
        "total": len(docs),
        "history": [
            {
                "changed_at": item.get("changed_at"),
                "changes": item.get("changes"),
                "changed_by_name": item.get("changed_by_name"),
            }
            for item in docs
        ],
    }


def _history_field_label(field: object) -> str:
    return str(field or "").replace(".", " → ").replace("_", " ").strip().title()


def _previous_applied_snapshot(versions: list[dict], index: int) -> dict | None:
    """Return the prior applied snapshot from versions sorted newest first."""
    for candidate in versions[index + 1:]:
        if candidate.get("record_was_changed") is False:
            continue
        snapshot = candidate.get("snapshot")
        if isinstance(snapshot, dict):
            return snapshot
    return None


def _value_at_path(snapshot: dict, field_path: str):
    value = snapshot
    for part in str(field_path or "").split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _unit_for_field(snapshot: dict, field_path: str):
    parts = str(field_path or "").split(".")
    if not parts:
        return None
    parent = _value_at_path(snapshot, ".".join(parts[:-1])) if len(parts) > 1 else snapshot
    if not isinstance(parent, dict):
        return None
    field_key = parts[-1]
    value = parent.get(field_key)
    if isinstance(value, dict):
        return value.get("unit")
    return parent.get(f"{field_key}_unit") or parent.get("unit")


def _is_unit_field(field_path: object) -> bool:
    """Identify unit metadata that should support a value diff, not become one."""
    field_key = str(field_path or "").split(".")[-1].lower()
    return field_key == "unit" or field_key.endswith("_unit")


def _localized_history_timestamp(value, organization_timezone: str | None):
    """Convert stored UTC history timestamps to the organization's IANA timezone."""
    if not value or not organization_timezone:
        return value
    try:
        target_timezone = ZoneInfo(organization_timezone)
    except ZoneInfoNotFoundError:
        return value

    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str):
        try:
            timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    else:
        return value

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(target_timezone).isoformat()


def _history_diff(field: str, old_value, new_value, old_snapshot: dict, new_snapshot: dict, display_name: str = None) -> dict:
    return {
        "field": display_name or format_field_display_name(field),
        "old_value": old_value,
        "new_value": new_value,
        "old_unit": _unit_for_field(old_snapshot, field),
        "new_unit": _unit_for_field(new_snapshot, field),
    }


def _version_field_diffs(version: dict, previous_snapshot: dict | None) -> list[dict]:
    """Normalize stored diffs or derive them from consecutive applied snapshots."""
    current_snapshot = version.get("snapshot") if isinstance(version.get("snapshot"), dict) else {}
    stored_diffs = version.get("field_diffs")
    if isinstance(stored_diffs, list):
        return [
            _history_diff(
                diff.get("field") or "",
                diff.get("old_value", diff.get("old")),
                diff.get("new_value", diff.get("new")),
                previous_snapshot or {},
                current_snapshot,
                diff.get("display_name"),
            )
            for diff in stored_diffs
            if isinstance(diff, dict) and diff.get("field") and not _is_unit_field(diff.get("field"))
        ]
    if not previous_snapshot or not current_snapshot:
        return []
    return [
        _history_diff(change["field"], change["old"], change["new"], previous_snapshot, current_snapshot)
        for change in compare_versions(previous_snapshot, current_snapshot)
        if not _is_unit_field(change.get("field"))
    ]


async def get_esg_record_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Return safe, scoped version history for Environment, Social, or Governance records."""
    section = (kwargs.get("record_type") or "").lower()
    organization_timezone = kwargs.get("organization_timezone")
    collection_map = {
        "environment": ("environment_records", "environment_record_versions"),
        "social": ("social_records", "social_record_versions"),
        "governance": ("governance_records", "governance_record_versions"),
    }
    if section not in collection_map:
        return {"section": section, "total": 0, "history": []}

    records_collection, versions_collection = collection_map[section]
    resolved_facilities = await resolve_authorized_facilities(db, org_id, facility_ids, kwargs.get("facility"))
    record_query = and_filters(
        {"$or": [{"organization_id": org_id}, {"org_id": org_id}]},
        {"is_current": {"$ne": False}},
        {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]},
        {"facility_id": {"$in": resolved_facilities}} if resolved_facilities is not None else None,
    )
    category, subcategory = kwargs.get("category"), kwargs.get("subcategory")
    if category:
        record_query = and_filters(record_query, {"category": {"$regex": f"^{category}$", "$options": "i"}})
    if subcategory:
        record_query = and_filters(record_query, {"subcategory": {"$regex": f"^{subcategory}$", "$options": "i"}})
    period = period_from_payload(kwargs.get("period"))
    if period is not None:
        record_query = and_filters(record_query, esg_period_filter(period))

    records = await db[records_collection].find(
        record_query,
        {"_id": 0, "id": 1, "category": 1, "subcategory": 1, "reporting_period": 1},
    ).to_list(200)
    record_by_id = {record["id"]: record for record in records if record.get("id")}
    if not record_by_id:
        return {"section": section, "category": category, "subcategory": subcategory, "period": period.label if period else "All reporting periods", "total": 0, "history": []}

    versions = await db[versions_collection].find(
        _id_filter("record_id", list(record_by_id)),
        {"_id": 0, "record_id": 1, "version": 1, "created_by": 1, "created_by_name": 1, "created_at": 1, "changed_fields": 1, "field_diffs": 1, "snapshot": 1, "record_was_changed": 1, "change_type": 1, "change_reason": 1},
    ).sort("created_at", -1).to_list(100)
    user_ids = list({item.get("created_by") for item in versions if item.get("created_by") and not item.get("created_by_name")})
    users = await db.users.find(
        {"id": {"$in": user_ids}, "$or": [{"organization_id": org_id}, {"organization_id": {"$exists": False}}]},
        {"_id": 0, "id": 1, "full_name": 1, "name": 1, "email": 1},
    ).to_list(100) if user_ids else []
    names = {user["id"]: user.get("full_name") or user.get("name") or user.get("email") for user in users if user.get("id")}
    history = []
    for index, version in enumerate(versions):
        record = record_by_id.get(version.get("record_id"), {})
        previous_snapshot = _previous_applied_snapshot(versions, index)
        field_diffs = _version_field_diffs(version, previous_snapshot)
        history.append({
            "category": record.get("category"),
            "subcategory": record.get("subcategory"),
            "version": version.get("version"),
            "changed_by_name": version.get("created_by_name") or names.get(version.get("created_by")) or "Unknown user",
            "changed_at": _localized_history_timestamp(version.get("created_at"), organization_timezone),
            "changed_fields": [
                _history_field_label(field)
                for field in version.get("changed_fields") or []
                if not _is_unit_field(field)
            ],
            "field_diffs": field_diffs,
            "change_type": version.get("change_type") or ("Created" if version.get("version") == 1 else "Updated"),
            "change_reason": version.get("change_reason"),
        })
    return {
        "section": section,
        "category": category,
        "subcategory": subcategory,
        "period": period.label if period else "All reporting periods",
        "total": len(history),
        "history": history,
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


async def get_pending_status(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Count pending approvals for an authorized ESG record type/category."""
    record_type = (kwargs.get("record_type") or "environment").lower()
    collection = {"environment": "environment_records", "social": "social_records", "governance": "governance_records"}.get(record_type)
    if not collection:
        return {"record_type": record_type, "category": kwargs.get("category"), "records_found": 0, "awaiting_approval": 0, "entries": []}
    category = kwargs.get("category") or ""
    record_query = and_filters(
        {"$or": [{"organization_id": org_id}, {"org_id": org_id}]},
        organization_scope(org_id, facility_ids, organization_field="org_id"),
    )
    if category:
        record_query = and_filters(record_query, {"$or": [
            {"category": {"$regex": category, "$options": "i"}},
            {"subcategory": {"$regex": category, "$options": "i"}},
        ]})
    records = await db[collection].find(record_query, {"_id": 0, "id": 1, "category": 1, "subcategory": 1, "facility_id": 1}).to_list(500)
    record_ids = [record["id"] for record in records if record.get("id")]
    pending = await db.approval_requests.find(
        {"organization_id": org_id, "entity_id": {"$in": record_ids}, "status": "pending"},
        {"_id": 0, "entity_id": 1, "status": 1},
    ).to_list(500) if record_ids else []
    pending_ids = {item.get("entity_id") for item in pending}
    return {
        "record_type": record_type,
        "category": category or None,
        "records_found": len(records),
        "awaiting_approval": len(pending),
        "entries": [
            {"category": record.get("category"), "subcategory": record.get("subcategory"), "facility_id": record.get("facility_id"), "status": "pending"}
            for record in records if record.get("id") in pending_ids
        ],
    }


async def get_assignment_history(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    query = organization_scope(org_id, facility_ids)
    assignments = await db.esg_assignments.find(query, {"_id": 0}).to_list(30)
    tasks = await db.esg_reporting_tasks.find(query, {"_id": 0}).to_list(30)
    assignment_ids = [item["id"] for item in assignments if item.get("id")]
    history = await db.esg_record_assignment_history.find(_id_filter("assignment_id", assignment_ids), {"_id": 0}).sort("created_at", -1).to_list(30)
    return {"active_assignments": [{"entity_type": a.get("entity_type"), "entity_id": a.get("entity_id"), "assigned_to": a.get("assigned_to_name") or a.get("assigned_to_user_id"), "category": a.get("category"), "due_date": a.get("due_at"), "status": a.get("status")} for a in assignments], "tasks": [{"category": t.get("category"), "period": t.get("period_label"), "status": t.get("status"), "facility_id": t.get("facility_id")} for t in tasks], "change_history": [{"action": h.get("action"), "previous": h.get("previous_value"), "new": h.get("new_value"), "changed_by": h.get("changed_by_user_id"), "timestamp": h.get("created_at")} for h in history]}