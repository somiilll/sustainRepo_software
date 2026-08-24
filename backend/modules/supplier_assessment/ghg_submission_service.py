"""One-time Supplier Assessment GHG submission state on existing emission records."""
import uuid
from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional

from shared.database.mongo import db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def reporting_period_values(parent_period: str | None) -> list[str]:
    """Return valid supplier month periods for a parent FY, including the FY label for legacy rows."""
    if not parent_period:
        return []
    match = re.fullmatch(r"FY\s+(\d{4})-(\d{2}|\d{4})", parent_period.strip())
    if not match:
        return [parent_period]
    start_year = int(match.group(1))
    return [parent_period, *[f"{year}-{month:02d}" for year, month in [(start_year, month) for month in range(4, 13)] + [(start_year + 1, month) for month in range(1, 4)]]]


def period_belongs_to_parent(submission_period: str | None, parent_period: str | None) -> bool:
    return bool(submission_period and submission_period in reporting_period_values(parent_period))


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
    current_lineage_ids = {
        entry["revision_lineage_id"]
        for entry in entries
        if entry.get("source") == "supplier"
        and entry.get("revision_lineage_id")
        and entry.get("is_current_revision") is True
    }
    reopened_submission_ids = {
        entry["resubmission_of"]
        for entry in entries
        if entry.get("source") == "supplier"
        and not entry.get("submitted_to_parent_org")
        and entry.get("resubmission_of")
    }
    if not current_lineage_ids and not reopened_submission_ids:
        return entries
    return [
        entry
        for entry in entries
        if not (
            entry.get("source") == "supplier"
            and (
                (
                    entry.get("revision_lineage_id") in current_lineage_ids
                    and entry.get("is_current_revision") is False
                )
                or (
                    entry.get("submitted_to_parent_org")
                    and entry.get("submission_id") in reopened_submission_ids
                )
            )
        )
    ]


def _revision_number(entry: Dict[str, Any]) -> int:
    try:
        return max(1, int(entry.get("revision_number") or 1))
    except (TypeError, ValueError):
        return 1


def _revision_response(entry: Dict[str, Any], lineage_id: str) -> Dict[str, Any]:
    return {
        "id": entry["id"],
        "lineage_id": lineage_id,
        "revision_number": _revision_number(entry),
        "is_current_revision": entry.get("is_current_revision", True),
        "status": entry.get("status") or "draft",
        "reporting_period": entry.get("reporting_period") or "",
        "scope": entry.get("scope") or "",
        "category": entry.get("category") or "",
        "total_emissions": float(entry.get("total_emissions") or entry.get("co2e_emissions") or 0),
        "submitted_at": entry.get("submitted_to_parent_org"),
        "reopened_at": entry.get("reopened_at"),
        "revised_from_record_id": entry.get("revised_from_record_id"),
        "created_at": entry.get("created_at"),
    }


async def get_supplier_ghg_revision_history(relationship: Dict[str, Any], emission_id: str) -> Dict[str, Any] | None:
    entry = await db.emission_records.find_one(
        {"id": emission_id, "source": "supplier", "supplier_relationship_id": relationship["id"]},
        {"_id": 0},
    )
    if not entry:
        return None

    lineage_id = entry.get("revision_lineage_id") or entry["id"]
    revisions = await db.emission_records.find(
        {
            "source": "supplier",
            "supplier_relationship_id": relationship["id"],
            "$or": [{"revision_lineage_id": lineage_id}, {"id": lineage_id}],
        },
        {"_id": 0},
    ).sort([("revision_number", -1), ("created_at", -1)]).to_list(100)
    serialized_revisions = [_revision_response(revision, lineage_id) for revision in revisions]
    current_revision = next(
        (revision for revision in serialized_revisions if revision["is_current_revision"]),
        serialized_revisions[0] if serialized_revisions else None,
    )
    return {
        "lineage_id": lineage_id,
        "current_revision_id": current_revision["id"] if current_revision else None,
        "revisions": serialized_revisions,
    }


async def get_supplier_ghg_state(relationship: Dict[str, Any]) -> Dict[str, Any]:
    query = {"source": "supplier", "supplier_relationship_id": relationship["id"]}
    if relationship.get("reporting_period"):
        query["reporting_period"] = {"$in": reporting_period_values(relationship["reporting_period"])}
    entries = await db.emission_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    submitted_entries = [entry for entry in entries if entry.get("submitted_to_parent_org") and entry.get("parent_visible", True)]
    drafts = [entry for entry in entries if not entry.get("submitted_to_parent_org")]
    submission = None
    if submitted_entries:
        first_submission = min(submitted_entries, key=lambda entry: entry.get("submitted_to_parent_org", ""))
        resubmission_open = any(entry.get("resubmission_of") for entry in drafts)
        submission = {"id": first_submission.get("submission_id"), "status": "reopened" if resubmission_open else "submitted", "submitted_at": first_submission.get("submitted_to_parent_org"), "entry_count": len(submitted_entries)}
    return {
        "entries": drafts if submission and submission["status"] == "reopened" else entries,
        "draft_aggregation": aggregate_entries(drafts),
        "last_submitted_aggregation": aggregate_entries(submitted_entries),
        "submission": submission,
        "can_submit": bool(drafts) and (submission is None or submission["status"] == "reopened"),
    }


async def submit_supplier_ghg(relationship: Dict[str, Any], submitted_by: str) -> Dict[str, Any]:
    period_filter = {"reporting_period": {"$in": reporting_period_values(relationship["reporting_period"])}} if relationship.get("reporting_period") else {}
    existing = await db.emission_records.find_one({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}, **period_filter}, {"_id": 0, "id": 1})
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": relationship["id"], "$or": [{"submitted_to_parent_org": {"$exists": False}}, {"submitted_to_parent_org": None}], **period_filter}, {"_id": 0}).to_list(5000)
    is_reopened = any(entry.get("resubmission_of") for entry in entries)
    if existing and not is_reopened:
        raise ValueError("This supplier GHG submission is locked")
    if not entries:
        raise ValueError("Add at least one GHG entry before submitting")
    now = _now()
    for entry in entries:
        lineage_id = entry.get("revision_lineage_id") or entry["id"]
        revision_number = _revision_number(entry)
        await db.emission_records.update_one(
            {"id": entry["id"]},
            {"$set": {
                "revision_lineage_id": lineage_id,
                "revision_number": revision_number,
                "is_current_revision": True,
            }},
        )
    submission = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "status": "submitted", "submitted_by": submitted_by, "submitted_at": now, "entry_count": len(entries), "aggregation": aggregate_entries(entries)}
    if existing:
        await db.emission_records.update_many({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}, {"$set": {"parent_visible": False, "replaced_at": now, "replaced_by_submission_id": submission["id"]}})
    await db.emission_records.update_many({"id": {"$in": [entry["id"] for entry in entries]}}, {"$set": {"submitted_to_parent_org": now, "submission_id": submission["id"], "submitted_by": submitted_by, "parent_visible": True, "status": "submitted", "approval_status": "submitted"}})
    from modules.supplier_assessment.service import supplier_service
    submission["canonical_score"] = await supplier_service.refresh_supplier_canonical_score(relationship["id"])
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
        lineage_id = entry.get("revision_lineage_id") or entry["id"]
        revision_number = _revision_number(entry) + 1
        draft = {key: value for key, value in entry.items() if key not in {"_id", "id", "submitted_to_parent_org", "submission_id", "submitted_by", "parent_visible", "replaced_at", "replaced_by_submission_id"}}
        draft.update({
            "id": str(uuid.uuid4()), "status": "draft", "approval_status": "draft",
            "submitted_to_parent_org": None, "submission_id": None, "submitted_by": None,
            "resubmission_of": source_submission_id, "reopened_at": now,
            "reopened_by": reopened_by, "created_at": now, "updated_at": now,
            "revision_lineage_id": lineage_id, "revision_number": revision_number,
            "is_current_revision": True, "revised_from_record_id": entry["id"],
        })
        copies.append(draft)
    await db.emission_records.insert_many(copies)
    for entry in visible_entries:
        await db.emission_records.update_one(
            {"id": entry["id"]},
            {"$set": {
                "revision_lineage_id": entry.get("revision_lineage_id") or entry["id"],
                "revision_number": _revision_number(entry),
                "is_current_revision": False,
            }},
        )
    return {"status": "reopened", "source_submission_id": source_submission_id, "entry_count": len(copies), "reopened_at": now}


async def get_parent_submitted_ghg(customer_org_id: str, reporting_period: Optional[str] = None) -> Dict[str, Any]:
    relationship_query = {"customer_org_id": customer_org_id, "is_active": True}
    if reporting_period:
        relationship_query["reporting_period"] = reporting_period
    relationships = await db.supplier_relationships.find(relationship_query, {"_id": 0, "id": 1, "company_name": 1, "reporting_period": 1}).to_list(1000)
    relationship_names = {relationship["id"]: relationship.get("company_name", "Unknown") for relationship in relationships}
    relationship_periods = {relationship["id"]: relationship.get("reporting_period") for relationship in relationships}
    entry_query = {"source": "supplier", "supplier_relationship_id": {"$in": list(relationship_names)}, "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}
    entries = await db.emission_records.find(entry_query, {"_id": 0}).to_list(10000)
    emissions = []
    supplier_totals: Dict[str, Dict[str, Any]] = {}
    aggregation_rows: Dict[tuple, Dict[str, Any]] = {}
    for entry in entries:
        supplier_id = entry["supplier_relationship_id"]
        if not period_belongs_to_parent(entry.get("reporting_period"), relationship_periods.get(supplier_id)):
            continue
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