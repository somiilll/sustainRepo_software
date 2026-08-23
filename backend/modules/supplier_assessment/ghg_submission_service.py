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


async def get_supplier_ghg_state(relationship: Dict[str, Any]) -> Dict[str, Any]:
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": relationship["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    submitted_entries = [entry for entry in entries if entry.get("submitted_to_parent_org")]
    drafts = [entry for entry in entries if not entry.get("submitted_to_parent_org")]
    submission = None
    if submitted_entries:
        first_submission = min(submitted_entries, key=lambda entry: entry.get("submitted_to_parent_org", ""))
        submission = {"id": first_submission.get("submission_id"), "status": "submitted", "submitted_at": first_submission.get("submitted_to_parent_org"), "entry_count": len(submitted_entries)}
    return {"entries": entries, "draft_aggregation": aggregate_entries(drafts), "submission": submission, "can_submit": submission is None and bool(drafts)}


async def submit_supplier_ghg(relationship: Dict[str, Any], submitted_by: str) -> Dict[str, Any]:
    existing = await db.emission_records.find_one({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}}, {"_id": 0, "id": 1})
    if existing:
        raise ValueError("This supplier GHG submission is locked")
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": relationship["id"], "$or": [{"submitted_to_parent_org": {"$exists": False}}, {"submitted_to_parent_org": None}]}, {"_id": 0}).to_list(5000)
    if not entries:
        raise ValueError("Add at least one GHG entry before submitting")
    now = _now()
    submission = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "status": "submitted", "submitted_by": submitted_by, "submitted_at": now, "entry_count": len(entries), "aggregation": aggregate_entries(entries)}
    await db.emission_records.update_many({"id": {"$in": [entry["id"] for entry in entries]}}, {"$set": {"submitted_to_parent_org": now, "submission_id": submission["id"], "submitted_by": submitted_by}})
    return submission


async def get_parent_submitted_ghg(customer_org_id: str) -> Dict[str, Any]:
    relationships = await db.supplier_relationships.find({"customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1, "company_name": 1}).to_list(1000)
    relationship_names = {relationship["id"]: relationship.get("company_name", "Unknown") for relationship in relationships}
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": {"$in": list(relationship_names)}, "submitted_to_parent_org": {"$exists": True, "$ne": None}}, {"_id": 0}).to_list(10000)
    emissions = []
    supplier_totals: Dict[str, Dict[str, Any]] = {}
    aggregation_rows: Dict[tuple, Dict[str, Any]] = {}
    for entry in entries:
        supplier_id = entry["supplier_relationship_id"]
        supplier_name = relationship_names.get(supplier_id, "Unknown")
        emissions.append({**entry, "supplier_name": supplier_name, "submitted_at": entry["submitted_to_parent_org"]})
        total = supplier_totals.setdefault(supplier_id, {"supplier_name": supplier_name, "scope1": 0.0, "scope2": 0.0, "total": 0.0})
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