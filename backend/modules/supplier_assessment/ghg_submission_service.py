"""One-time Supplier Assessment GHG submission state on existing emission records."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from shared.database.mongo import db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def aggregate_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    totals: Dict[tuple, Dict[str, Any]] = {}
    for entry in entries:
        key = (entry.get("scope"), entry.get("category") or "Uncategorized")
        row = totals.setdefault(key, {"scope": key[0], "category": key[1], "entry_count": 0, "total_emissions": 0.0})
        row["entry_count"] += 1
        row["total_emissions"] += float(entry.get("total_emissions") or entry.get("co2e_emissions") or 0)
    return sorted(totals.values(), key=lambda row: (row["scope"] or "", row["category"]))


def exclude_reopened_supplier_submission_revisions(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Keep the editable draft visible in GHG Logs while retaining its submitted source in storage."""
    reopened_submission_ids = {
        entry["resubmission_of"]
        for entry in entries
        if entry.get("source") == "supplier"
        and not entry.get("submitted_to_parent_org")
        and entry.get("resubmission_of")
    }
    if not reopened_submission_ids:
        return entries
    return [
        entry
        for entry in entries
        if not (
            entry.get("source") == "supplier"
            and entry.get("submitted_to_parent_org")
            and entry.get("submission_id") in reopened_submission_ids
        )
    ]


async def get_supplier_ghg_state(relationship: Dict[str, Any]) -> Dict[str, Any]:
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": relationship["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    submitted_entries = [entry for entry in entries if entry.get("submitted_to_parent_org") and entry.get("parent_visible", True)]
    drafts = [entry for entry in entries if not entry.get("submitted_to_parent_org")]
    submission = None
    if submitted_entries:
        first_submission = min(submitted_entries, key=lambda entry: entry.get("submitted_to_parent_org", ""))
        resubmission_open = any(entry.get("resubmission_of") for entry in drafts)
        submission = {"id": first_submission.get("submission_id"), "status": "reopened" if resubmission_open else "submitted", "submitted_at": first_submission.get("submitted_to_parent_org"), "entry_count": len(submitted_entries)}
    return {"entries": drafts if submission and submission["status"] == "reopened" else entries, "draft_aggregation": aggregate_entries(drafts), "submission": submission, "can_submit": bool(drafts) and (submission is None or submission["status"] == "reopened")}


async def submit_supplier_ghg(relationship: Dict[str, Any], submitted_by: str) -> Dict[str, Any]:
    existing = await db.emission_records.find_one({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}, {"_id": 0, "id": 1})
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": relationship["id"], "$or": [{"submitted_to_parent_org": {"$exists": False}}, {"submitted_to_parent_org": None}]}, {"_id": 0}).to_list(5000)
    is_reopened = any(entry.get("resubmission_of") for entry in entries)
    if existing and not is_reopened:
        raise ValueError("This supplier GHG submission is locked")
    if not entries:
        raise ValueError("Add at least one GHG entry before submitting")
    now = _now()
    submission = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "status": "submitted", "submitted_by": submitted_by, "submitted_at": now, "entry_count": len(entries), "aggregation": aggregate_entries(entries)}
    if existing:
        await db.emission_records.update_many({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}, {"$set": {"parent_visible": False, "replaced_at": now, "replaced_by_submission_id": submission["id"]}})
    await db.emission_records.update_many({"id": {"$in": [entry["id"] for entry in entries]}}, {"$set": {"submitted_to_parent_org": now, "submission_id": submission["id"], "submitted_by": submitted_by, "parent_visible": True, "status": "submitted", "approval_status": "submitted"}})
    return submission


async def reopen_supplier_ghg(relationship: Dict[str, Any], reopened_by: str) -> Dict[str, Any]:
    visible_entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}, {"_id": 0}).to_list(5000)
    if not visible_entries:
        raise ValueError("No submitted GHG data is available to unlock")
    existing_draft = await db.emission_records.find_one({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": None, "resubmission_of": {"$exists": True}}, {"_id": 0, "id": 1})
    if existing_draft:
        raise ValueError("GHG data is already unlocked for resubmission")
    now = _now()
    source_submission_id = visible_entries[0].get("submission_id")
    copies = []
    for entry in visible_entries:
        draft = {key: value for key, value in entry.items() if key not in {"_id", "id", "submitted_to_parent_org", "submission_id", "submitted_by", "parent_visible", "replaced_at", "replaced_by_submission_id"}}
        draft.update({
            "id": str(uuid.uuid4()), "status": "draft", "approval_status": "draft",
            "submitted_to_parent_org": None, "submission_id": None, "submitted_by": None,
            "resubmission_of": source_submission_id, "reopened_at": now,
            "reopened_by": reopened_by, "created_at": now, "updated_at": now,
        })
        copies.append(draft)
    await db.emission_records.insert_many(copies)
    return {"status": "reopened", "source_submission_id": source_submission_id, "entry_count": len(copies), "reopened_at": now}


async def get_parent_submitted_ghg(customer_org_id: str) -> Dict[str, Any]:
    relationships = await db.supplier_relationships.find({"customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1, "company_name": 1}).to_list(1000)
    relationship_names = {relationship["id"]: relationship.get("company_name", "Unknown") for relationship in relationships}
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": {"$in": list(relationship_names)}, "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}, {"_id": 0}).to_list(10000)
    emissions = []
    supplier_totals: Dict[str, Dict[str, Any]] = {}
    aggregation_rows: Dict[tuple, Dict[str, Any]] = {}
    for entry in entries:
        supplier_id = entry["supplier_relationship_id"]
        supplier_name = relationship_names.get(supplier_id, "Unknown")
        emissions.append({**entry, "supplier_name": supplier_name, "submitted_at": entry["submitted_to_parent_org"]})
        total = supplier_totals.setdefault(supplier_id, {"supplier_relationship_id": supplier_id, "supplier_name": supplier_name, "scope1": 0.0, "scope2": 0.0, "total": 0.0})
        value = float(entry.get("total_emissions") or entry.get("co2e_emissions") or 0)
        scope = entry.get("scope")
        if scope == "scope1": total["scope1"] += value
        if scope == "scope2": total["scope2"] += value
        total["total"] += value
        aggregate_key = (scope, entry.get("category") or "Uncategorized")
        aggregate = aggregation_rows.setdefault(aggregate_key, {"scope": scope, "category": aggregate_key[1], "entry_count": 0, "total_emissions": 0.0})
        aggregate["entry_count"] += 1
        aggregate["total_emissions"] += value
    return {"emissions": emissions, "supplier_totals": list(supplier_totals.values()), "grand_total": sum(row["total"] for row in supplier_totals.values()), "aggregations": sorted(aggregation_rows.values(), key=lambda row: (row["scope"] or "", row["category"]))}