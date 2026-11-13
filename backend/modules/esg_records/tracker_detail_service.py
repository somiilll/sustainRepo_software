"""Data for the tracker's expanded panel: periods, assignment, activity, linked entries."""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from modules.esg_assignments.completion_service import completion_service
from shared.database.mongo import db
from shared.utils.period_keys import MONTH_NAMES, period_key_from_reporting_period, period_query_clause

FINAL_OK = ("completed",)


def _iso(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value else None


def _plus_seconds(iso: str, seconds: int) -> str:
    try:
        return (datetime.fromisoformat(iso) + timedelta(seconds=seconds)).isoformat()
    except ValueError:
        return iso


def _iso_utc(value: Any) -> Optional[str]:
    """ISO string for a stored timestamp; naive values are UTC."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return value or None
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()
    return None


FIELD_LABELS = {"filling_frequency": "frequency", "start_date": "start date", "end_date": "end date",
                "requires_approval": "approval requirement"}


def _chain_ids(value: Dict[str, Any]) -> List[str]:
    chain = [c if isinstance(c, str) else (c or {}).get("approver_id") for c in value.get("approval_chain") or []]
    return [c for c in chain if c] or ([value["approver_id"]] if value.get("approver_id") else [])


def _assignment_changes(previous: Dict[str, Any], new: Dict[str, Any], names: Dict[str, Dict[str, str]]) -> List[str]:
    def show(key: str, value: Any) -> str:
        if key == "requires_approval":
            return "required" if value else "not required"
        return str(value).replace("_", "-") if value else "none"
    out = []
    if ("approver_id" in new or "approval_chain" in new) and _chain_ids(previous) != _chain_ids(new):
        names_of = lambda value: " → ".join(names.get(i, {}).get("name", "User") for i in _chain_ids(value)) or "none"
        out.append(f"approvers to {names_of(new)}")
    for key, label in FIELD_LABELS.items():
        if key in new and key in previous and new[key] != previous[key]:
            out.append(f"{label} from {show(key, previous[key])} to {show(key, new[key])}")
    if new.get("due_config") != previous.get("due_config") and "due_config" in previous and "due_config" in new:
        out.append("due date rule")
    return out


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
    if "overdue" in statuses:
        return "overdue"
    if "pending_approval" in statuses:
        return "pending_approval"
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
               "submitted_at": _iso_utc(record.get("updated_at") or record.get("created_at")),
               "approval_status": record.get("approval_status")}
    request = await db.approval_requests.find_one(
        {"entity_id": record["id"], "status": "approved"}, {"_id": 0, "resolved_by_name": 1, "resolved_at": 1},
        sort=[("resolved_at", -1)])
    if request:
        context["approved_by_name"] = request.get("resolved_by_name")
        context["approved_at"] = _iso_utc(request.get("resolved_at"))
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
    facility_ids = {a.get("facility_id") for a in assignments if a.get("facility_id")} | {t.get("facility_id") for t in tasks if t.get("facility_id")}
    facilities = await db.facilities.find({"id": {"$in": list(facility_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(200) if facility_ids else []
    facility_name = {f["id"]: f.get("name") or "Facility" for f in facilities}
    by_period: Dict[str, List[Dict[str, Any]]] = {}
    for task in tasks:
        task["status"] = (await completion_service.get_task_status(task)).value
        due = _iso_utc(task.get("due_at"))
        if task["status"] in ("pending", "backfill_pending") and due and due < datetime.now(timezone.utc).isoformat():
            task["status"] = "overdue"
        by_period.setdefault(task["period_key"], []).append(task)

    periods: List[Dict[str, Any]] = []
    for key, group in by_period.items():
        status = _period_status(group)
        by_facility = []
        for fid in facility_ids:
            task = next((t for t in group if t.get("facility_id") == fid), None)
            if not task:
                task = {**group[0], "facility_id": fid}
                task["status"] = (await completion_service.get_task_status(task)).value
                if task["status"] in ("pending", "backfill_pending") and _iso_utc(task.get("due_at")) < datetime.now(timezone.utc).isoformat():
                    task["status"] = "overdue"
            by_facility.append({"name": facility_name.get(fid, "Facility"), "status": _period_status([task])})
        by_facility.sort(key=lambda f: f["name"])
        context = await _period_context(org_id, section, category, subcategory, key) if status != "pending" else {}
        periods.append({
            "period_key": key, "label": group[0].get("period_label") or key, "status": status,
            "period_start": _iso(group[0].get("period_start")), "period_end": _iso(group[0].get("period_end")),
            "due_at": _iso(group[0].get("due_at")), "opens_at": _iso(group[0].get("period_start")),
            "facilities": by_facility,
            "in_progress": status == "overdue" and any(f["status"] in ("completed", "pending_approval") for f in by_facility), **context,
        })

    assignee_rows = await db.esg_assignment_assignees.find(
        {"assignment_id": {"$in": [a["id"] for a in assignments]}, "$or": [{"removed_at": None}, {"removed_at": {"$exists": False}}]},
        {"_id": 0, "user_id": 1, "assignment_id": 1, "assigned_at": 1}).to_list(200)
    approver_ids = [i for a in assignments for i in ([a.get("approver_id")] + [c if isinstance(c, str) else (c or {}).get("approver_id") for c in (a.get("approval_chain") or [])]) if i]
    history = await db.esg_assignment_history.find(
        {"assignment_id": {"$in": [a["id"] for a in assignments]}}, {"_id": 0}).sort("created_at", -1).to_list(30)
    names = await _user_names([r["user_id"] for r in assignee_rows] + approver_ids + [p.get("submitted_by") for p in periods]
                              + [h.get("changed_by_user_id") for h in history] + [a.get("created_by_user_id") for a in assignments]
                              + [i for h in history for i in (h.get("new_value") or {}).get("user_ids", [])]
                              + [i for h in history for i in (h.get("previous_value") or {}).get("user_ids", [])]
                              + [i for h in history for v in (h.get("previous_value"), h.get("new_value")) if isinstance(v, dict) for i in _chain_ids(v)])

    for p in periods:
        p["submitted_by_name"] = names.get(p.get("submitted_by"), {}).get("name")

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

    activity: List[Dict[str, Any]] = []
    for a in assignments:
        creator = names.get(a.get("created_by_user_id"), {}).get("name", "Someone")
        created = _iso_utc(a.get("created_at")) or ""
        first_update = next((h for h in sorted(history, key=lambda x: str(x.get("created_at"))) if h.get("action") == "version_updated" and h.get("assignment_id") == a["id"]), None)
        original = (first_update or {}).get("previous_value") or {}
        approver_ids_at_creation = _chain_ids({**a, **{k: v for k, v in original.items() if k in ("approver_id", "approval_chain")}})
        frequency_at_creation = original.get("filling_frequency", a.get("filling_frequency", "monthly"))
        people = [names.get(r["user_id"], {}).get("name") for r in assignee_rows
                  if r["assignment_id"] == a["id"] and (_iso_utc(r.get("assigned_at")) or "") <= _plus_seconds(created, 10)]
        text = f"{creator} assigned {subcategory}"
        if people:
            text += f" to {', '.join(p for p in people if p)}"
        text += f" for Facility {facility_name.get(a.get('facility_id'), '')}".rstrip() if a.get("facility_id") else " at org level"
        text += f", {frequency_at_creation.replace('_', '-')}"
        approvers = " → ".join(names.get(i, {}).get("name", "User") for i in approver_ids_at_creation)
        if a.get("requires_approval") and approvers:
            text += f", with {approvers} as approver{'s' if len(approver_ids_at_creation) > 1 else ''}"
        activity.append({"at": created, "kind": "assign", "actor": creator, "title": text})
    facility_of = {a["id"]: a.get("facility_id") for a in assignments}
    first_created = next((_iso_utc(a.get("created_at")) for a in assignments), "")
    groups: Dict[Any, List[Dict[str, Any]]] = {}
    for h in sorted(history, key=lambda x: str(x.get("created_at"))):
        at = _iso_utc(h.get("created_at")) or ""
        bucket = next((k for k in groups if k[0] == h.get("assignment_id") and k[1] == h.get("changed_by_user_id") and _plus_seconds(k[2], 10) >= at), None)
        groups.setdefault(bucket or (h.get("assignment_id"), h.get("changed_by_user_id"), at), []).append(h)
    for (assignment_id, changed_by, first_at), rows in groups.items():
        who = names.get(changed_by, {}).get("name", "Someone")
        facility_id = facility_of.get(assignment_id)
        fac = facility_name.get(facility_id, "") if facility_id else ""
        parts: List[str] = []
        if any(h.get("action") in ("assignees_added", "assignees_removed") and not (
                h.get("action") == "assignees_added" and (_iso_utc(h.get("created_at")) or "") <= _plus_seconds(next((_iso_utc(a.get("created_at")) for a in assignments if a["id"] == assignment_id), first_created), 10))
                for h in rows):
            current = [names.get(r["user_id"], {}).get("name", "User") for r in assignee_rows if r["assignment_id"] == assignment_id]
            parts.append(f"data entry{f' for {fac}' if fac else ''} to {', '.join(dict.fromkeys(current)) or 'nobody'}")
        for h in rows:
            if h.get("action") == "version_updated":
                parts.extend(_assignment_changes(h.get("previous_value") or {}, h.get("new_value") or {}, names))
        if parts:
            has_entry = parts[0].startswith("data entry")
            head = " and ".join(parts[:2]) if has_entry and len(parts) > 1 and parts[1].startswith("approvers") else parts[0]
            rest = parts[len(head.split(" and ")):] if has_entry else parts[1:]
            text = "; ".join([head, *rest])
            if fac and not has_entry:
                text += f" for {fac}"
            activity.append({"at": first_at, "kind": "update", "actor": who, "title": f"{who} changed {text}"})
    activity.sort(key=lambda e: e["at"] or "", reverse=True)

    entries = [{
        "record_id": rec["id"], "period_label": record_label.get(rec["id"], ""), "is_current": bool(rec.get("is_current")),
        "status": rec.get("approval_status") if rec.get("approval_status") not in (None, "not_required") else rec.get("status"),
        "submitted_by_name": rec_names.get(rec.get("updated_by") or rec.get("created_by"), {}).get("name"),
        "submitted_at": _iso_utc(rec.get("updated_at") or rec.get("created_at")),
    } for rec in section_records if rec.get("is_current")]

    return {
        "has_assignment": True, "category": category, "subcategory": subcategory,
        "level": "Facility level" if any(a.get("assignment_level") == "facility" for a in assignments) else "Organization level",
        "frequency": frequency, "due_rule": due_rule_text(frequency, ref.get("due_config")),
        "periods": periods,
        "assignment": {
            "start_date": ref.get("start_date"), "end_date": ref.get("end_date"),
            "requires_approval": bool(ref.get("requires_approval")),
            "assignees": [{**names.get(r["user_id"], {"name": "User", "email": ""}), "id": r["user_id"]} for r in {r["user_id"]: r for r in assignee_rows}.values()],
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
