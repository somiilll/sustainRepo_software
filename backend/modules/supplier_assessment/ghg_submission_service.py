"""Staged, one-time GHG submission snapshots for Supplier Assessment."""
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
    entries = await db.supplier_ghg_entries.find({"supplier_relationship_id": relationship["id"]}, {"_id": 0}).sort("created_at", -1).to_list(5000)
    submission = await db.supplier_ghg_submissions.find_one({"supplier_relationship_id": relationship["id"]}, {"_id": 0})
    drafts = [entry for entry in entries if not entry.get("is_submitted")]
    return {"entries": entries, "draft_aggregation": aggregate_entries(drafts), "submission": submission, "can_submit": submission is None and bool(drafts)}


async def submit_supplier_ghg(relationship: Dict[str, Any], submitted_by: str) -> Dict[str, Any]:
    existing = await db.supplier_ghg_submissions.find_one({"supplier_relationship_id": relationship["id"]}, {"_id": 0})
    if existing:
        raise ValueError("This supplier GHG submission is locked")
    entries = await db.supplier_ghg_entries.find({"supplier_relationship_id": relationship["id"], "is_submitted": {"$ne": True}}, {"_id": 0}).to_list(5000)
    if not entries:
        raise ValueError("Add at least one GHG entry before submitting")
    now = _now()
    submission = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": relationship["customer_org_id"], "entries": entries, "aggregation": aggregate_entries(entries), "status": "submitted", "submitted_by": submitted_by, "submitted_at": now}
    await db.supplier_ghg_submissions.insert_one(submission)
    await db.supplier_ghg_entries.update_many({"id": {"$in": [entry["id"] for entry in entries]}}, {"$set": {"is_submitted": True, "submitted_at": now, "submission_id": submission["id"]}})
    submission.pop("_id", None)
    return submission


async def get_parent_submitted_ghg(customer_org_id: str) -> Dict[str, Any]:
    submissions = await db.supplier_ghg_submissions.find({"customer_org_id": customer_org_id, "status": "submitted"}, {"_id": 0}).to_list(1000)
    emissions = []
    supplier_totals: Dict[str, Dict[str, Any]] = {}
    aggregation_rows: Dict[tuple, Dict[str, Any]] = {}
    for submission in submissions:
        supplier = await db.supplier_relationships.find_one({"id": submission["supplier_relationship_id"], "customer_org_id": customer_org_id}, {"_id": 0, "company_name": 1})
        supplier_name = (supplier or {}).get("company_name", "Unknown")
        total = supplier_totals.setdefault(submission["supplier_relationship_id"], {"supplier_name": supplier_name, "scope1": 0.0, "scope2": 0.0, "total": 0.0})
        for entry in submission.get("entries", []):
            row = {**entry, "supplier_name": supplier_name, "submitted_at": submission["submitted_at"]}
            emissions.append(row)
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