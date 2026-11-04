"""Expanded-panel data for a BRSR/GRI section: questions, assignment and approvers, activity."""
from collections import Counter
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from shared.database.mongo import db
from .models import TrackingFilter
from .service import tracking_service


def _iso(value: Any) -> Optional[str]:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value or None
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()
    return None


def _question_status(item: Any) -> str:
    approval = item.approval_status
    if approval in ("pending_approval", "pending"):
        return "pending_approval"
    if approval in ("approved", "rejected"):
        return approval
    if item.is_completed:
        return "saved"
    return "overdue" if item.is_overdue else "pending"


def _chain(item: Any) -> List[str]:
    raw = item.approval_chain or ([item.approver_id] if item.approver_id else [])
    return [c if isinstance(c, str) else (c or {}).get("approver_id") for c in raw if c]


async def _names(user_ids: List[str]) -> Dict[str, Dict[str, str]]:
    ids = [i for i in set(user_ids) if i]
    users = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "full_name": 1, "name": 1, "email": 1}).to_list(300)
    return {u["id"]: {"id": u["id"], "name": u.get("full_name") or u.get("name") or u.get("email") or "User", "email": u.get("email", "")} for u in users}


async def get_section_detail(org_id: str, domain: str, framework_id: str, section_id: str, reporting_period: str) -> Dict[str, Any]:
    _, items = await tracking_service.get_section_disclosures(
        organization_id=org_id, domain=domain, framework_id=framework_id, section_id=section_id,
        reporting_period=reporting_period, filters=TrackingFilter())
    label = {i.question_key: i.disclosure_name for i in items}
    keys = list(label)
    assignment_ids = list({i.assignment_id for i in items if i.assignment_id})

    assignee_rows = await db.esg_assignment_assignees.find(
        {"assignment_id": {"$in": assignment_ids}, "$or": [{"removed_at": None}, {"removed_at": {"$exists": False}}]},
        {"_id": 0, "user_id": 1, "assignment_id": 1, "assigned_at": 1}).to_list(2000)
    assignments = await db.esg_assignments.find({"id": {"$in": assignment_ids}}, {"_id": 0}).to_list(2000)
    history = await db.esg_assignment_history.find({"assignment_id": {"$in": assignment_ids}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    requests = await db.approval_requests.find(
        {"organization_id": org_id, "entity_type": "esg_response", "entity_id": {"$in": keys},
         "entity_snapshot.reporting_year": reporting_period}, {"_id": 0}).sort("submitted_at", -1).to_list(300)
    responses = await db.organization_esg_responses.find(
        {"org_id": org_id, "reporting_year": reporting_period, "question_key": {"$in": keys}},
        {"_id": 0, "question_key": 1, "updated_by": 1, "updated_by_name": 1, "updated_at": 1, "approval_status": 1, "status": 1}).to_list(1000)

    chains = [_chain(i) for i in items if i.requires_approval]
    levels = max((len(c) for c in chains), default=0)
    level_ids = [[c[n] for c in chains if len(c) > n] for n in range(levels)]
    names = await _names([r["user_id"] for r in assignee_rows] + [u for lvl in level_ids for u in lvl]
                         + [r.get("submitted_by") for r in requests] + [r.get("resolved_by") for r in requests]
                         + [a.get("created_by_user_id") for a in assignments] + [h.get("changed_by_user_id") for h in history]
                         + [r.get("updated_by") for r in responses]
                         + [i for h in history for i in ((h.get("new_value") or {}).get("user_ids") or []) + ((h.get("previous_value") or {}).get("user_ids") or [])])
    person = lambda uid: names.get(uid, {"id": uid, "name": "User", "email": ""})
    who = lambda uid, fallback="Someone": names.get(uid, {}).get("name") or fallback

    questions = [{
        "question_key": i.question_key, "name": i.disclosure_name, "status": _question_status(i), "assigned": i.is_assigned,
        "due_date": _iso(i.due_date), "updated_at": _iso(i.last_response_updated_at),
    } for i in items]

    ref = next((a for a in assignments), {})
    assignment = {
        "requires_approval": any(i.requires_approval for i in items),
        "assignees": [person(uid) for uid in dict.fromkeys(r["user_id"] for r in assignee_rows)],
        "approver_levels": [{"level": n + 1, "users": [person(uid) for uid in dict.fromkeys(ids)]} for n, ids in enumerate(level_ids)],
        "frequency": ref.get("filling_frequency"), "due_date": _iso(ref.get("due_date")),
        "assigned_questions": sum(1 for i in items if i.is_assigned), "total_questions": len(items),
        "form": {
            "assigned_user_ids": list(dict.fromkeys(r["user_id"] for r in assignee_rows)),
            "due_date": (_iso(ref.get("due_date")) or "")[:10],
            "filling_frequency": ref.get("filling_frequency") or "",
            "reminder_enabled": bool(ref.get("reminder_enabled")),
            "reminder_frequency": ref.get("reminder_frequency") or "",
            "requires_approval": any(i.requires_approval for i in items),
            "approval_chain": [uid for ids in [max(chains, key=len, default=[])] for uid in ids],
        },
    }

    activity: List[Dict[str, Any]] = []
    for r in requests:
        q = label.get(r.get("entity_id"), r.get("entity_id"))
        submitter = r.get("submitted_by_name") or who(r.get("submitted_by"))
        activity.append({"at": _iso(r.get("submitted_at")), "kind": "submit", "actor": submitter, "title": f"{submitter} submitted \"{q}\" for approval"})
        if r.get("status") in ("approved", "rejected") and r.get("resolved_at"):
            actor = r.get("resolved_by_name") or who(r.get("resolved_by"))
            verb = "approved" if r["status"] == "approved" else "sent back"
            activity.append({"at": _iso(r.get("resolved_at")), "kind": "approve" if r["status"] == "approved" else "reject",
                             "actor": actor, "title": f"{actor} {verb} \"{q}\""})
    requested = {r.get("entity_id") for r in requests}
    for r in responses:
        if r["question_key"] in requested or r.get("approval_status") in ("approved", "rejected", "pending_approval"):
            continue
        actor = r.get("updated_by_name") or who(r.get("updated_by"))
        activity.append({"at": _iso(r.get("updated_at")), "kind": "update", "actor": actor, "title": f"{actor} saved \"{label.get(r['question_key'], r['question_key'])}\""})
    by_group: Counter = Counter()
    for a in assignments:
        by_group[(a.get("created_by_user_id"), str(a.get("created_at"))[:16])] += 1
    seen = set()
    for a in sorted(assignments, key=lambda x: str(x.get("created_at"))):
        group = (a.get("created_by_user_id"), str(a.get("created_at"))[:16])
        if group in seen:
            continue
        seen.add(group)
        creator = who(a.get("created_by_user_id"))
        people = [who(r["user_id"]) for r in assignee_rows if r["assignment_id"] == a["id"]]
        chain = [who(c if isinstance(c, str) else (c or {}).get("approver_id")) for c in (a.get("approval_chain") or [])]
        text = f"{creator} assigned {by_group[group]} question{'s' if by_group[group] != 1 else ''}"
        if people:
            text += f" to {', '.join(people)}"
        if a.get("requires_approval") and chain:
            text += ", approvers: " + " → ".join(chain)
        activity.append({"at": _iso(a.get("created_at")), "kind": "assign", "actor": creator, "title": text})
    for h in history:
        actor, new_value = who(h.get("changed_by_user_id")), h.get("new_value") or {}
        if h.get("action") == "assignees_added" and new_value.get("user_ids"):
            text = f"{actor} added {', '.join(who(i) for i in new_value['user_ids'])} for data entry"
        elif h.get("action") == "assignees_removed" and (h.get("previous_value") or {}).get("user_ids"):
            text = f"{actor} removed {', '.join(who(i) for i in h['previous_value']['user_ids'])} from data entry"
        else:
            continue
        activity.append({"at": _iso(h.get("created_at")), "kind": "update", "actor": actor, "title": text})
    unique = {(e["title"], (e["at"] or "")[:19]): e for e in activity}
    activity = sorted(unique.values(), key=lambda e: e["at"] or "", reverse=True)
    return {"questions": questions, "assignment": assignment, "activity": activity[:100]}
