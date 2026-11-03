"""Data for the tracker's expanded panel: periods, assignment, activity, linked entries."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from shared.database.mongo import db
from shared.utils.period_keys import MONTH_NAMES, period_key_from_reporting_period, period_query_clause

FINAL_OK = ("completed",)


def _iso(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value else None


def due_rule_text(frequency: str, due_config: Optional[Dict[str, Any]]) -> str:
    cfg = due_config or {}
    day = cfg.get("day_of_month")
    time = cfg.get("time")
    unit = {"daily": "day", "weekly": "week", "monthly": "month", "quarterly": "quarter",
            "half_yearly": "half-year", "yearly": "year"}.get(frequency, "period")
    when = "on the last day" if (day or 31) >= 28 else f"on day {day}"
    text = f"Data due {when} of each {unit}"
    return f"{text} at {time}" if time else text


def _key_label(key: Optional[str]) -> str:
    parts = str(key or "").split("-")
    if len(parts) == 2 and parts[1].isdigit() and len(parts[0]) == 4 and 1 <= int(parts[1]) <= 12:
        return f"{MONTH_NAMES[int(parts[1]) - 1][:3]} {parts[0]}"
    if len(parts) == 2:
        return f"{parts[1]} {parts[0]}"
    return str(key or "")


async def _user_names(user_ids: List[str]) -> Dict[str, Dict[str, str]]:
    ids = [uid for uid in set(user_ids) if uid]
    users = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "full_name": 1, "name": 1, "email": 1, "role": 1}).to_list(200)
    return {u["id"]: {"name": u.get("full_name") or u.get("name") or u.get("email") or "User", "email": u.get("email", ""), "role": u.get("role", "")} for u in users}


def _period_status(tasks: List[Dict[str, Any]]) -> str:
    statuses = [t.get("status") or "pending" for t in tasks]
    if all(s == "completed" for s in statuses):
        return "completed"
    if "pending_approval" in statuses:
        return "pending_approval"
    if "overdue" in statuses:
        return "overdue"
    if "rejected" in statuses:
        return "rejected"
    return "pending"


async def _period_context(org_id: str, section: str, category: str, subcategory: str, period_key: str) -> Dict[str, Any]:
    clause = period_query_clause(period_key)
    query: Dict[str, Any] = {"org_id": org_id, "category": category, "subcategory": subcategory,
                             "is_current": True, "status": {"$ne": "draft"}}
    if clause:
        query = {"$and": [query, clause]}
    record = await db[f"{section}_records"].find_one(query, {"_id": 0, "id": 1, "created_by": 1, "created_at": 1,
                                                              "updated_by": 1, "updated_at": 1, "approval_status": 1},
                                                    sort=[("updated_at", -1)])
    if not record:
        return {}
    context = {"record_id": record["id"], "submitted_by": record.get("updated_by") or record.get("created_by"),
               "submitted_at": _iso(record.get("updated_at") or record.get("created_at")),
               "approval_status": record.get("approval_status")}
    request = await db.approval_requests.find_one(
        {"entity_id": record["id"], "status": "approved"}, {"_id": 0, "resolved_by_name": 1, "resolved_at": 1},
        sort=[("resolved_at", -1)])
    if request:
        context["approved_by_name"] = request.get("resolved_by_name")
        context["approved_at"] = _iso(request.get("resolved_at"))
    return context


async def get_tracker_detail(org_id: str, section: str, category: str, subcategory: str) -> Dict[str, Any]:
    assignments = await db.esg_assignments.find(
        {"organization_id": org_id, "category": category, "subcategory": subcategory}, {"_id": 0}).to_list(200)
    if not assignments:
        return {"has_assignment": False, "category": category, "subcategory": subcategory}
    ref = next((a for a in assignments if a.get("assignment_level") == "facility"), assignments[0])
    frequency = ref.get("filling_frequency", "monthly")

    tasks = await db.esg_reporting_tasks.find(
        {"organization_id": org_id, "category": category, "subcategory": subcategory}, {"_id": 0}
    ).sort("period_key", 1).to_list(2000)
    by_period: Dict[str, List[Dict[str, Any]]] = {}
    for task in tasks:
        by_period.setdefault(task["period_key"], []).append(task)

    periods: List[Dict[str, Any]] = []
    for key, group in by_period.items():
        status = _period_status(group)
        context = await _period_context(org_id, section, category, subcategory, key) if status != "pending" else {}
        periods.append({
            "period_key": key, "label": group[0].get("period_label") or key, "status": status,
            "period_start": _iso(group[0].get("period_start")), "period_end": _iso(group[0].get("period_end")),
            "due_at": _iso(group[0].get("due_at")), "opens_at": _iso(group[0].get("period_start")), **context,
        })

    assignee_rows = await db.esg_assignment_assignees.find(
        {"assignment_id": {"$in": [a["id"] for a in assignments]}, "$or": [{"removed_at": None}, {"removed_at": {"$exists": False}}]},
        {"_id": 0, "user_id": 1, "assignment_id": 1}).to_list(200)
    approver_ids = [i for a in assignments for i in ([a.get("approver_id")] + [c if isinstance(c, str) else (c or {}).get("approver_id") for c in (a.get("approval_chain") or [])]) if i]
    history = await db.esg_assignment_history.find(
        {"assignment_id": {"$in": [a["id"] for a in assignments]}}, {"_id": 0}).sort("created_at", -1).to_list(30)
    requests = await db.approval_requests.find(
        {"organization_id": org_id, "entity_type": "esg_record", "entity_snapshot.category": category,
         "entity_snapshot.subcategory": subcategory}, {"_id": 0}).sort("submitted_at", -1).to_list(100)
    names = await _user_names([r["user_id"] for r in assignee_rows] + approver_ids + [p.get("submitted_by") for p in periods]
                              + [h.get("changed_by_user_id") for h in history] + [a.get("created_by_user_id") for a in assignments])

    for p in periods:
        p["submitted_by_name"] = names.get(p.get("submitted_by"), {}).get("name")

    facility_ids = {a.get("facility_id") for a in assignments if a.get("facility_id")}
    facilities = await db.facilities.find({"id": {"$in": list(facility_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(200) if facility_ids else []

    labels = {k: g[0].get("period_label") or k for k, g in by_period.items()}
    section_records = await db[f"{section}_records"].find(
        {"org_id": org_id, "category": category, "subcategory": subcategory, "status": {"$ne": "draft"}},
        {"_id": 0, "id": 1, "reporting_period": 1, "facility_id": 1, "status": 1, "approval_status": 1, "is_current": 1,
         "created_by": 1, "created_at": 1, "updated_by": 1, "updated_at": 1}).sort("updated_at", -1).to_list(200)
    record_label: Dict[str, str] = {}
    for rec in section_records:
        key = period_key_from_reporting_period(rec.get("reporting_period") or {}, default_to_year=True)
        record_label[rec["id"]] = labels.get(key) or _key_label(key)
    rec_names = await _user_names([r.get("updated_by") or r.get("created_by") for r in section_records])

    def actor_of(r: Dict[str, Any], key: str) -> str:
        return r.get(key) or "Someone"

    activity: List[Dict[str, Any]] = []
    for r in requests:
        label = record_label.get(r.get("entity_id"), "")
        suffix = f" {label}" if label else " record"
        activity.append({"at": _iso(r.get("submitted_at")), "kind": "submit", "actor": actor_of(r, "submitted_by_name"),
                         "title": f"{actor_of(r, 'submitted_by_name')} submitted{suffix} for approval"})
        if r.get("status") in ("approved", "rejected") and r.get("resolved_at"):
            verb = "approved" if r["status"] == "approved" else "sent back"
            activity.append({"at": _iso(r.get("resolved_at")), "kind": "approve" if r["status"] == "approved" else "reject",
                             "actor": actor_of(r, "resolved_by_name"), "title": f"{actor_of(r, 'resolved_by_name')} {verb}{suffix}"})
    for a in assignments:
        creator = names.get(a.get("created_by_user_id"), {}).get("name", "Someone")
        people = [names.get(r["user_id"], {}).get("name") for r in assignee_rows if r["assignment_id"] == a["id"]]
        text = f"{creator} assigned {subcategory}"
        if people:
            text += f" to {', '.join(p for p in people if p)}"
        text += f", {a.get('filling_frequency', 'monthly').replace('_', '-')}"
        approver = names.get(a.get("approver_id"), {}).get("name")
        if a.get("requires_approval") and approver:
            text += f", with {approver} as approver"
        activity.append({"at": _iso(a.get("created_at")), "kind": "assign", "actor": creator, "title": text})
    for h in history:
        if h.get("action") == "created":
            continue
        who = names.get(h.get("changed_by_user_id"), {}).get("name", "Someone")
        activity.append({"at": _iso(h.get("created_at")), "kind": "update", "actor": who,
                         "title": f"{who} updated the assignment ({h.get('action', 'updated').replace('_', ' ')})"})
    activity.sort(key=lambda e: e["at"] or "", reverse=True)

    entries = [{
        "record_id": rec["id"], "period_label": record_label.get(rec["id"], ""), "is_current": bool(rec.get("is_current")),
        "status": rec.get("approval_status") if rec.get("approval_status") not in (None, "not_required") else rec.get("status"),
        "submitted_by_name": rec_names.get(rec.get("updated_by") or rec.get("created_by"), {}).get("name"),
        "submitted_at": _iso(rec.get("updated_at") or rec.get("created_at")),
    } for rec in section_records if rec.get("is_current")]

    return {
        "has_assignment": True, "category": category, "subcategory": subcategory,
        "level": "Facility level" if any(a.get("assignment_level") == "facility" for a in assignments) else "Organization level",
        "frequency": frequency, "due_rule": due_rule_text(frequency, ref.get("due_config")),
        "periods": periods,
        "assignment": {
            "start_date": ref.get("start_date"), "end_date": ref.get("end_date"),
            "requires_approval": bool(ref.get("requires_approval")),
            "assignees": [{**names.get(r["user_id"], {"name": "User", "email": ""}), "id": r["user_id"]} for r in assignee_rows],
            "approvers": [{**names.get(i, {"name": "User", "email": ""}), "id": i} for i in dict.fromkeys(approver_ids)],
            "facilities": facilities,
            "reminder_rules": ref.get("reminder_rules") or [], "escalation": ref.get("escalation") or "none",
        },
        "activity": activity[:100],
        "linked_entries": entries,
    }


REMINDER_RULES = ("before_7d", "on_deadline", "overdue_every_3d")
ESCALATIONS = ("overdue_5d", "overdue_10d", "none")


async def save_notification_settings(org_id: str, category: str, subcategory: str, reminder_rules: List[str], escalation: str) -> int:
    rules = [r for r in REMINDER_RULES if r in reminder_rules]
    result = await db.esg_assignments.update_many(
        {"organization_id": org_id, "category": category, "subcategory": subcategory},
        {"$set": {"reminder_rules": rules, "escalation": escalation, "updated_at": datetime.now(timezone.utc)}})
    return result.matched_count
