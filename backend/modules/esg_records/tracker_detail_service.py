"""Data for the tracker's expanded panel: periods, assignment, activity, linked disclosures."""
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from shared.database.mongo import db
from shared.utils.period_keys import period_query_clause

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


def fy_label(start: Optional[str], end: Optional[str], fallback: Optional[str]) -> str:
    match = re.search(r"(\d{4})\D+(\d{2,4})", str(fallback or ""))
    if match:
        return f"FY {match.group(1)}–{match.group(2)[-2:]}"
    if start and end:
        return f"FY {str(start)[:4]}–{str(end)[2:4]}"
    return ""


async def _user_names(user_ids: List[str]) -> Dict[str, Dict[str, str]]:
    ids = [uid for uid in set(user_ids) if uid]
    users = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}).to_list(200)
    return {u["id"]: {"name": u.get("name") or u.get("email") or "User", "email": u.get("email", ""), "role": u.get("role", "")} for u in users}


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
         "entity_snapshot.subcategory": subcategory}, {"_id": 0}).sort("submitted_at", -1).to_list(30)
    names = await _user_names([r["user_id"] for r in assignee_rows] + approver_ids + [p.get("submitted_by") for p in periods]
                              + [h.get("changed_by_user_id") for h in history] + [a.get("created_by_user_id") for a in assignments])

    for p in periods:
        p["submitted_by_name"] = names.get(p.get("submitted_by"), {}).get("name")

    facility_ids = {a.get("facility_id") for a in assignments if a.get("facility_id")}
    facilities = await db.facilities.find({"id": {"$in": list(facility_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(200) if facility_ids else []

    activity: List[Dict[str, Any]] = []
    for r in requests:
        activity.append({"at": _iso(r.get("submitted_at")), "title": "Submitted for approval", "actor": r.get("submitted_by_name") or ""})
        if r.get("status") in ("approved", "rejected") and r.get("resolved_at"):
            activity.append({"at": _iso(r.get("resolved_at")), "title": "Approved" if r["status"] == "approved" else "Sent back",
                             "actor": r.get("resolved_by_name") or ""})
    for h in history:
        activity.append({"at": _iso(h.get("created_at")), "title": f"Assignment {h.get('action', 'updated')}",
                         "actor": names.get(h.get("changed_by_user_id"), {}).get("name", "")})
    activity.sort(key=lambda e: e["at"] or "", reverse=True)

    mappings = await db.kpi_framework_mappings.find(
        {"is_active": True, "source_category": category, "source_subcategory": subcategory},
        {"_id": 0, "framework": 1, "question_key": 1, "reference": 1, "destination_label": 1}).to_list(500)
    linked: Dict[tuple, Dict[str, Any]] = {}
    for m in mappings:
        linked.setdefault((m["framework"], m["question_key"]), {
            "framework": m["framework"], "question_key": m["question_key"], "reference": m.get("reference"),
            "title": (m.get("destination_label") or "")[:140], "kpi_count": 0})["kpi_count"] += 1

    return {
        "has_assignment": True, "category": category, "subcategory": subcategory,
        "level": "Facility level" if any(a.get("assignment_level") == "facility" for a in assignments) else "Organization level",
        "frequency": frequency, "due_rule": due_rule_text(frequency, ref.get("due_config")),
        "fy_label": fy_label(ref.get("start_date"), ref.get("end_date"), ref.get("reporting_period")),
        "periods": periods,
        "assignment": {
            "start_date": ref.get("start_date"), "end_date": ref.get("end_date"),
            "requires_approval": bool(ref.get("requires_approval")),
            "assignees": [{**names.get(r["user_id"], {"name": "User", "email": ""}), "id": r["user_id"]} for r in assignee_rows],
            "approvers": [{**names.get(i, {"name": "User", "email": ""}), "id": i} for i in dict.fromkeys(approver_ids)],
            "facilities": facilities, "reminder_enabled": bool(ref.get("reminder_enabled")),
        },
        "activity": activity[:30],
        "linked_disclosures": sorted(linked.values(), key=lambda x: (x["framework"], x["question_key"])),
    }
