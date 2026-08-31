"""One-time Supplier Assessment GHG submission state on existing emission records."""
import uuid
from datetime import date, datetime, timedelta, timezone
import re
from typing import Any, Dict, List, Optional

from shared.database.mongo import db
from modules.supplier_assessment.programs import resolve_program_context


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _evidence_file_ids(value: object) -> List[str]:
    return list(dict.fromkeys(re.findall(r"/api/files/([A-Za-z0-9-]+)", str(value or ""))))


def resolve_supplier_ghg_scopes(relationship: Dict[str, Any]) -> List[str]:
    """Return only the parent-assigned supplier scopes, preserving legacy defaults."""
    configured_scopes = relationship.get("ghg_scopes_enabled")
    if configured_scopes is None:
        configured_scopes = ["scope1", "scope2"]
    return [scope for scope in ("scope1", "scope2") if scope in configured_scopes]


async def resolve_effective_supplier_ghg_scopes(relationship: Dict[str, Any]) -> List[str]:
    """Resolve supplier scopes from the bound immutable assessment program."""
    context = await resolve_program_context(relationship)
    ghg_module = ((context.get("config") or {}).get("modules") or {}).get("ghg") or {}
    if not ghg_module.get("enabled", False):
        return []
    return resolve_supplier_ghg_scopes({"ghg_scopes_enabled": ghg_module.get("scopes")})


async def supplier_ghg_is_enabled(relationship: Dict[str, Any]) -> bool:
    context = await resolve_program_context(relationship)
    return bool((((context.get("config") or {}).get("modules") or {}).get("ghg") or {}).get("enabled", False))


async def assert_supplier_emission_capability(
    relationship: Dict[str, Any],
    category: str | None,
    category_id: str | None = None,
    is_custom_fuel: bool = False,
) -> None:
    """Apply the immutable parent-program restrictions to supplier GHG payloads."""
    context = await resolve_program_context(relationship)
    ghg_module = ((context.get("config") or {}).get("modules") or {}).get("ghg") or {}
    if not ghg_module.get("enabled", False):
        raise ValueError("GHG is not assigned to this supplier assessment")
    normalized_category = " ".join(
        str(value or "").strip().casefold()
        for value in (category, category_id)
    )
    if is_custom_fuel and not ghg_module.get("allow_custom_fuels", False):
        raise ValueError("Custom fuels are not permitted for this supplier assessment")
    if "process" in normalized_category and not ghg_module.get("allow_process_emissions", False):
        raise ValueError("Process Emissions are not permitted for this supplier assessment")
    if "flaring" in normalized_category and not ghg_module.get("allow_flaring", False):
        raise ValueError("Flaring is not permitted for this supplier assessment")


def reporting_period_values(parent_period: str | None) -> list[str]:
    """Return the assigned annual label and its twelve valid supplier months."""
    assignment = describe_reporting_period(parent_period)
    if not assignment:
        return []
    return list(dict.fromkeys([
        parent_period.strip(),
        assignment["reporting_period"],
        *assignment["allowed_months"],
    ]))


def describe_reporting_period(parent_period: str | None, financial_year_start_month: int = 4) -> Dict[str, Any] | None:
    """Normalize a supplier assignment into frontend and validation constraints."""
    if not parent_period or not parent_period.strip():
        return None
    period = parent_period.strip()
    financial_match = re.fullmatch(r"FY\s*(\d{4})\s*-\s*(\d{2}|\d{4})", period, re.IGNORECASE)
    if financial_match:
        start_year = int(financial_match.group(1))
        end_year = start_year + 1
        canonical_period = f"FY {start_year}-{str(end_year)[-2:]}"
        start_month = max(1, min(12, int(financial_year_start_month or 4)))
        allowed_months = [
            f"{year}-{month:02d}"
            for year, month in (
                [(start_year, month) for month in range(start_month, 13)]
                + [(end_year, month) for month in range(1, start_month)]
            )
        ]
        return {
            "reporting_period": canonical_period,
            "reporting_year_type": "financial",
            "reporting_year": str(start_year),
            "allowed_months": allowed_months,
        }

    calendar_match = re.fullmatch(r"CY\s*(\d{4})", period, re.IGNORECASE)
    if calendar_match:
        year = int(calendar_match.group(1))
        return {
            "reporting_period": f"CY{year}",
            "reporting_year_type": "calendar",
            "reporting_year": str(year),
            "allowed_months": [f"{year}-{month:02d}" for month in range(1, 13)],
        }

    return {
        "reporting_period": period,
        "reporting_year_type": None,
        "reporting_year": None,
        "allowed_months": [],
    }


def supplier_emission_period_allowed(
    submission_period: str | None,
    frequency_type: str | None,
    parent_period: str | None,
    financial_year_start_month: int = 4,
) -> bool:
    """Require monthly rows inside the assignment and yearly rows on its exact year."""
    assignment = describe_reporting_period(parent_period, financial_year_start_month)
    if not assignment or not submission_period:
        return False
    if (frequency_type or "monthly") == "yearly":
        return submission_period.strip().replace(" ", "").upper() == assignment["reporting_period"].replace(" ", "").upper()
    return submission_period.strip() in assignment["allowed_months"]


def supplier_period_error(parent_period: str | None, frequency_type: str | None) -> str:
    assignment = describe_reporting_period(parent_period)
    assigned_label = assignment["reporting_period"] if assignment else parent_period or "the assigned reporting period"
    if (frequency_type or "monthly") == "yearly":
        return f"Yearly GHG data must use the assigned reporting period {assigned_label}"
    return f"Monthly GHG data must use a month within the assigned reporting period {assigned_label}"


async def _hydrate_reporting_year_start(relationship: Dict[str, Any]) -> None:
    if relationship.get("financial_year_start_month"):
        return
    organization = await db.organizations.find_one(
        {"id": relationship.get("customer_org_id")}, {"_id": 0, "financial_year_start_month": 1},
    ) or {}
    relationship["financial_year_start_month"] = int(organization.get("financial_year_start_month") or 4)


def period_belongs_to_parent(submission_period: str | None, parent_period: str | None) -> bool:
    return bool(submission_period and submission_period in reporting_period_values(parent_period))


def supplier_submission_frequency(relationship: Dict[str, Any]) -> str:
    value = relationship.get("ghg_submission_frequency")
    return value if value in {"monthly", "quarterly", "yearly"} else "yearly"


def _month_start(month_key: str) -> date:
    return datetime.strptime(month_key, "%Y-%m").date().replace(day=1)


def _month_end(month_key: str) -> date:
    start = _month_start(month_key)
    next_month = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return next_month - timedelta(days=1)


def resolve_supplier_submission_period(
    relationship: Dict[str, Any],
    reporting_period: str,
    frequency_type: str | None = "monthly",
) -> Dict[str, Any]:
    """Resolve one emission record to the relationship's independent submission period."""
    assignment = describe_reporting_period(
        relationship.get("reporting_period"),
        relationship.get("financial_year_start_month") or 4,
    )
    if not assignment or not reporting_period:
        raise ValueError("A valid supplier reporting assignment is required")
    data_frequency = frequency_type or "monthly"
    cadence = supplier_submission_frequency(relationship)
    if data_frequency not in {"monthly", "yearly"}:
        raise ValueError("GHG data frequency must be monthly or yearly")
    if data_frequency == "yearly":
        is_allowed = reporting_period.strip().replace(" ", "").upper() == assignment["reporting_period"].replace(" ", "").upper()
    else:
        is_allowed = reporting_period.strip() in assignment["allowed_months"]
    if not is_allowed:
        raise ValueError(supplier_period_error(relationship.get("reporting_period"), data_frequency))
    if data_frequency == "yearly" and cadence != "yearly":
        raise ValueError("Yearly GHG data can only be used with yearly submission frequency")

    months = assignment["allowed_months"]
    if data_frequency == "yearly":
        start_key, end_key = months[0], months[-1]
        period_key = assignment["reporting_period"]
        label = assignment["reporting_period"]
    elif cadence == "monthly":
        start_key = end_key = reporting_period
        period_key = reporting_period
        label = datetime.strptime(reporting_period, "%Y-%m").strftime("%B %Y")
    elif cadence == "quarterly":
        month_index = months.index(reporting_period)
        quarter_number = month_index // 3 + 1
        start_key, end_key = months[(quarter_number - 1) * 3], months[quarter_number * 3 - 1]
        period_key = f"{assignment['reporting_period']}-Q{quarter_number}"
        label = f"Q{quarter_number} · {datetime.strptime(start_key, '%Y-%m').strftime('%b')}–{datetime.strptime(end_key, '%Y-%m').strftime('%b %Y')}"
    else:
        start_key, end_key = months[0], months[-1]
        period_key = assignment["reporting_period"]
        label = assignment["reporting_period"]

    end_date = _month_end(end_key)
    return {
        "period_key": period_key,
        "frequency": cadence,
        "label": label,
        "period_start": _month_start(start_key).isoformat(),
        "period_end": end_date.isoformat(),
        "due_date": (end_date + timedelta(days=15)).isoformat(),
        "month_keys": months if cadence == "yearly" else (months[(quarter_number - 1) * 3:quarter_number * 3] if cadence == "quarterly" else [start_key]),
        "reporting_year": assignment["reporting_period"],
    }


def _submission_period_definitions(relationship: Dict[str, Any]) -> List[Dict[str, Any]]:
    assignment = describe_reporting_period(
        relationship.get("reporting_period"), relationship.get("financial_year_start_month") or 4,
    )
    if not assignment:
        return []
    cadence = supplier_submission_frequency(relationship)
    months = assignment["allowed_months"]
    keys = months if cadence == "monthly" else ([months[index] for index in range(0, len(months), 3)] if cadence == "quarterly" else [months[0]])
    return [resolve_supplier_submission_period(relationship, key, "monthly") for key in keys]


def _period_entries_query(relationship: Dict[str, Any], period: Dict[str, Any]) -> Dict[str, Any]:
    query = {
        "source": "supplier",
        "supplier_relationship_id": relationship["id"],
        "scope": {"$in": ["scope1", "scope2"]},
    }
    if period["frequency"] == "yearly":
        query["reporting_period"] = {"$in": reporting_period_values(relationship.get("reporting_period"))}
    else:
        query["reporting_period"] = {"$in": period["month_keys"]}
    return query


async def ensure_ghg_submission_indexes() -> None:
    await db.supplier_ghg_submissions.create_index(
        [("relationship_id", 1), ("period_key", 1)], unique=True, name="unique_supplier_ghg_submission_period",
    )


async def get_supplier_ghg_submission_periods(relationship: Dict[str, Any]) -> List[Dict[str, Any]]:
    await ensure_ghg_submission_indexes()
    await _hydrate_reporting_year_start(relationship)
    definitions = _submission_period_definitions(relationship)
    stored = await db.supplier_ghg_submissions.find(
        {"relationship_id": relationship["id"]}, {"_id": 0}
    ).to_list(100)
    stored_by_key = {item.get("period_key"): item for item in stored}
    today = datetime.now(timezone.utc).date()
    periods = []
    for definition in definitions:
        record = stored_by_key.get(definition["period_key"]) or {}
        status = record.get("status") or "in_progress"
        periods.append({
            "id": record.get("id") or definition["period_key"],
            **definition,
            "status": status,
            "revision": int(record.get("revision") or 0),
            "submitted_at": record.get("submitted_at"),
            "submitted_by": record.get("submitted_by"),
            "unlocked_at": record.get("unlocked_at"),
            "unlocked_by": record.get("unlocked_by"),
            "unlock_reason": record.get("unlock_reason"),
            "supplier_instructions": record.get("supplier_instructions") if status == "unlocked" else None,
            "unlock_requested_at": record.get("unlock_requested_at"),
            "unlock_requested_by": record.get("unlock_requested_by"),
            "is_overdue": status != "submitted" and date.fromisoformat(definition["due_date"]) < today,
        })
    return periods


async def can_modify_supplier_ghg_record(
    relationship: Dict[str, Any], reporting_period: str, frequency_type: str | None = "monthly",
) -> Dict[str, Any]:
    """Single lock guard used before a supplier GHG record is created, edited, or deleted."""
    await _hydrate_reporting_year_start(relationship)
    period = resolve_supplier_submission_period(relationship, reporting_period, frequency_type)
    submitted = await db.supplier_ghg_submissions.find_one(
        {"relationship_id": relationship["id"], "period_key": period["period_key"], "status": "submitted"},
        {"_id": 0, "id": 1},
    )
    if submitted:
        raise ValueError(f"{period['label']} GHG data is submitted and locked. Ask your customer to unlock it.")
    return period


async def submit_supplier_ghg_period(
    relationship: Dict[str, Any], period_key: str, submitted_by: str, data_verified: bool,
) -> Dict[str, Any]:
    await ensure_ghg_submission_indexes()
    await _hydrate_reporting_year_start(relationship)
    if not data_verified:
        raise ValueError("Confirm that the submitted data has been reviewed and verified")
    period = next((item for item in _submission_period_definitions(relationship) if item["period_key"] == period_key), None)
    if not period:
        raise ValueError("GHG submission period is not part of this supplier assignment")
    existing = await db.supplier_ghg_submissions.find_one(
        {"relationship_id": relationship["id"], "period_key": period_key}, {"_id": 0},
    )
    if existing and existing.get("status") == "submitted":
        raise ValueError("This GHG submission period is already locked")
    entries = await db.emission_records.find(
        {
            **_period_entries_query(relationship, period),
            "$or": [{"submitted_to_parent_org": {"$exists": False}}, {"submitted_to_parent_org": None}],
        }, {"_id": 0},
    ).to_list(5000)
    if not entries:
        raise ValueError("Add at least one GHG entry in this period before submitting")
    now = _now()
    submission_id = existing.get("id") if existing else str(uuid.uuid4())
    revision = int(existing.get("revision") or 0) + 1 if existing else 1
    event = {"event": "submitted", "at": now, "by": submitted_by, "revision": revision}
    document = {
        "id": submission_id,
        "relationship_id": relationship["id"],
        "parent_organization_id": relationship["customer_org_id"],
        "supplier_organization_id": relationship["supplier_org_id"],
        "reporting_year": period["reporting_year"],
        "frequency": period["frequency"],
        "period_key": period_key,
        "period_start": period["period_start"],
        "period_end": period["period_end"],
        "due_date": period["due_date"],
        "status": "submitted",
        "submitted_at": now,
        "submitted_by": submitted_by,
        "unlocked_at": None,
        "unlocked_by": None,
        "unlock_reason": None,
        "supplier_instructions": None,
        "unlock_requested_at": None,
        "unlock_requested_by": None,
        "revision": revision,
        "history": [*(existing.get("history") or []), event],
    }
    await db.emission_records.update_many(
        {"id": {"$in": [entry["id"] for entry in entries]}},
        {"$set": {"submitted_to_parent_org": now, "submission_id": submission_id, "submitted_by": submitted_by, "parent_visible": True, "status": "submitted", "approval_status": "submitted", "data_verified": True, "data_verified_at": now, "data_verified_by": submitted_by}},
    )
    await db.supplier_ghg_submissions.update_one(
        {"relationship_id": relationship["id"], "period_key": period_key}, {"$set": document}, upsert=True,
    )
    return {key: value for key, value in document.items() if key != "history"}


async def unlock_supplier_ghg_period(
    relationship: Dict[str, Any], period_key: str, unlocked_by: str, reason: str, supplier_instructions: Optional[str] = None,
) -> Dict[str, Any]:
    await ensure_ghg_submission_indexes()
    await _hydrate_reporting_year_start(relationship)
    reason = reason.strip()
    if not reason:
        raise ValueError("An unlock reason is required")
    submission = await db.supplier_ghg_submissions.find_one(
        {"relationship_id": relationship["id"], "period_key": period_key}, {"_id": 0},
    )
    if not submission or submission.get("status") != "submitted":
        raise ValueError("No submitted GHG period is available to unlock")
    period = next((item for item in _submission_period_definitions(relationship) if item["period_key"] == period_key), None)
    if not period:
        raise ValueError("GHG submission period is not part of this supplier assignment")
    visible_entries = await db.emission_records.find(
        {**_period_entries_query(relationship, period), "submission_id": submission["id"], "parent_visible": {"$ne": False}}, {"_id": 0},
    ).to_list(5000)
    if not visible_entries:
        raise ValueError("No submitted GHG entries are available to unlock")
    now = _now()
    copies = []
    for entry in visible_entries:
        lineage_id = entry.get("revision_lineage_id") or entry["id"]
        draft = {key: value for key, value in entry.items() if key not in {"_id", "id", "submitted_to_parent_org", "submission_id", "submitted_by", "parent_visible", "replaced_at", "replaced_by_submission_id"}}
        draft.update({
            "id": str(uuid.uuid4()), "status": "draft", "approval_status": "draft", "submitted_to_parent_org": None,
            "submission_id": None, "submitted_by": None, "resubmission_of": submission["id"], "reopened_at": now,
            "reopened_by": unlocked_by, "unlock_reason": reason, "supplier_instructions": supplier_instructions or None,
            "created_at": now, "updated_at": now, "revision_lineage_id": lineage_id,
            "revision_number": _revision_number(entry) + 1, "is_current_revision": True, "revised_from_record_id": entry["id"],
        })
        copies.append(draft)
    await db.emission_records.insert_many(copies)
    await db.emission_records.update_many(
        {"id": {"$in": [entry["id"] for entry in visible_entries]}}, {"$set": {"is_current_revision": False, "parent_visible": False}},
    )
    event = {"event": "unlocked", "at": now, "by": unlocked_by, "reason": reason, "supplier_instructions": supplier_instructions or None}
    await db.supplier_ghg_submissions.update_one(
        {"id": submission["id"]}, {"$set": {"status": "unlocked", "unlocked_at": now, "unlocked_by": unlocked_by, "unlock_reason": reason, "supplier_instructions": supplier_instructions or None, "unlock_requested_at": None, "unlock_requested_by": None}, "$push": {"history": event}},
    )
    return {"id": submission["id"], "period_key": period_key, "status": "unlocked", "entry_count": len(copies), "unlocked_at": now, "unlock_reason": reason, "supplier_instructions": supplier_instructions or None}


async def request_supplier_ghg_period_unlock(
    relationship: Dict[str, Any], period_key: str, requested_by: str, note: Optional[str] = None,
) -> Dict[str, Any]:
    await ensure_ghg_submission_indexes()
    submission = await db.supplier_ghg_submissions.find_one(
        {"relationship_id": relationship["id"], "period_key": period_key}, {"_id": 0},
    )
    if not submission or submission.get("status") != "submitted":
        raise ValueError("Only submitted and locked GHG periods can be reopened")
    now = _now()
    event = {"event": "unlock_requested", "at": now, "by": requested_by, "note": (note or "").strip() or None}
    await db.supplier_ghg_submissions.update_one(
        {"id": submission["id"]}, {"$set": {"unlock_requested_at": now, "unlock_requested_by": requested_by, "unlock_request_note": event["note"]}, "$push": {"history": event}},
    )
    return {"id": submission["id"], "period_key": period_key, "status": "submitted", "unlock_requested_at": now}


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
    allowed_scopes = await resolve_effective_supplier_ghg_scopes(relationship)
    entry = await db.emission_records.find_one(
        {
            "id": emission_id,
            "source": "supplier",
            "supplier_relationship_id": relationship["id"],
            "scope": {"$in": allowed_scopes},
        },
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
    allowed_scopes = await resolve_effective_supplier_ghg_scopes(relationship)
    query = {
        "source": "supplier",
        "supplier_relationship_id": relationship["id"],
        "scope": {"$in": allowed_scopes},
    }
    if relationship.get("reporting_period"):
        query["reporting_period"] = {"$in": reporting_period_values(relationship["reporting_period"])}
    entries = await db.emission_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(5000)
    submitted_entries = [entry for entry in entries if entry.get("submitted_to_parent_org") and entry.get("parent_visible", True)]
    drafts = [entry for entry in entries if not entry.get("submitted_to_parent_org")]
    submission = None
    if relationship.get("ghg_submission_frequency") in {"monthly", "quarterly", "yearly"}:
        periods = await get_supplier_ghg_submission_periods(relationship)
        submitted_periods = [period for period in periods if period["status"] == "submitted"]
        unlocked_periods = [period for period in periods if period["status"] == "unlocked"]
        submission = {
            "status": "submitted" if periods and len(submitted_periods) == len(periods) else "reopened" if unlocked_periods else "in_progress",
            "entry_count": len(submitted_entries),
            "submitted_period_count": len(submitted_periods),
            "period_count": len(periods),
        }
    elif submitted_entries:
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


async def submit_supplier_ghg(
    relationship: Dict[str, Any],
    submitted_by: str,
    data_verified: bool = False,
) -> Dict[str, Any]:
    if not data_verified:
        raise ValueError("Confirm that the submitted data has been reviewed and verified")
    period_filter = {"reporting_period": {"$in": reporting_period_values(relationship["reporting_period"])}} if relationship.get("reporting_period") else {}
    scope_filter = {"scope": {"$in": await resolve_effective_supplier_ghg_scopes(relationship)}}
    existing = await db.emission_records.find_one({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}, **scope_filter, **period_filter}, {"_id": 0, "id": 1})
    entries = await db.emission_records.find({"source": "supplier", "supplier_relationship_id": relationship["id"], "$or": [{"submitted_to_parent_org": {"$exists": False}}, {"submitted_to_parent_org": None}], **scope_filter, **period_filter}, {"_id": 0}).to_list(5000)
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
    submission = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "status": "submitted", "submitted_by": submitted_by, "submitted_at": now, "entry_count": len(entries), "aggregation": aggregate_entries(entries), "data_verified": True, "data_verified_at": now, "data_verified_by": submitted_by}
    if existing:
        await db.emission_records.update_many({"source": "supplier", "supplier_relationship_id": relationship["id"], "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}, {"$set": {"parent_visible": False, "replaced_at": now, "replaced_by_submission_id": submission["id"]}})
    await db.emission_records.update_many({"id": {"$in": [entry["id"] for entry in entries]}}, {"$set": {"submitted_to_parent_org": now, "submission_id": submission["id"], "submitted_by": submitted_by, "parent_visible": True, "status": "submitted", "approval_status": "submitted", "data_verified": True, "data_verified_at": now, "data_verified_by": submitted_by}})
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
    relationships = await db.supplier_relationships.find(relationship_query, {"_id": 0, "id": 1, "company_name": 1, "reporting_period": 1, "revenue_percentage": 1, "revenue_amount": 1, "revenue_currency": 1, "revenue_submission_status": 1}).to_list(1000)
    relationship_names = {relationship["id"]: relationship.get("company_name", "Unknown") for relationship in relationships}
    relationship_periods = {relationship["id"]: relationship.get("reporting_period") for relationship in relationships}
    relationship_revenue = {relationship["id"]: relationship for relationship in relationships}
    entry_query = {"source": "supplier", "supplier_relationship_id": {"$in": list(relationship_names)}, "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False}}
    entries = await db.emission_records.find(entry_query, {"_id": 0}).to_list(10000)
    evidence_ids = list({file_id for entry in entries for file_id in _evidence_file_ids(entry.get("evidence_url"))})
    evidence_records = await db.uploaded_files.find(
        {"id": {"$in": evidence_ids}}, {"_id": 0, "id": 1, "original_filename": 1, "content_type": 1, "file_size": 1}
    ).to_list(len(evidence_ids) or 1)
    evidence_by_id = {record["id"]: record for record in evidence_records}
    emissions = []
    supplier_totals: Dict[str, Dict[str, Any]] = {}
    aggregation_rows: Dict[tuple, Dict[str, Any]] = {}
    for entry in entries:
        supplier_id = entry["supplier_relationship_id"]
        if not period_belongs_to_parent(entry.get("reporting_period"), relationship_periods.get(supplier_id)):
            continue
        supplier_name = relationship_names.get(supplier_id, "Unknown")
        revenue = relationship_revenue.get(supplier_id, {})
        revenue_percentage = revenue.get("revenue_percentage")
        revenue_submitted = revenue.get("revenue_submission_status") == "submitted"
        factor = float(revenue_percentage) / 100 if revenue_submitted and revenue_percentage is not None else None
        value = float(entry.get("total_emissions") or entry.get("co2e_emissions") or 0)
        attributed_value = value * factor if factor is not None else None
        evidence_files = [evidence_by_id[file_id] for file_id in _evidence_file_ids(entry.get("evidence_url")) if file_id in evidence_by_id]
        visible_entry = {key: value for key, value in entry.items() if key not in {"evidence_url", "evidence_file_name"}}
        emissions.append({**visible_entry, "supplier_name": supplier_name, "submitted_at": entry["submitted_to_parent_org"], "attributed_emissions": attributed_value, "revenue_percentage": revenue_percentage if revenue_submitted else None, "revenue_submitted": revenue_submitted, "evidence_files": evidence_files})
        total = supplier_totals.setdefault(supplier_id, {
            "supplier_relationship_id": supplier_id,
            "supplier_name": supplier_name,
            "raw_scope1": 0.0,
            "raw_scope2": 0.0,
            "raw_total": 0.0,
            "scope1": 0.0,
            "scope2": 0.0,
            "total": 0.0,
            "revenue_percentage": revenue_percentage if revenue_submitted else None,
            "annual_revenue_amount": revenue.get("revenue_amount"),
            "revenue_currency": revenue.get("revenue_currency"),
            "revenue_submitted": revenue_submitted,
            "attribution_available": factor is not None,
        })
        scope = entry.get("scope")
        if scope == "scope1":
            total["raw_scope1"] += value
        if scope == "scope2":
            total["raw_scope2"] += value
        total["raw_total"] += value
        if attributed_value is not None:
            if scope == "scope1": total["scope1"] += attributed_value
            if scope == "scope2": total["scope2"] += attributed_value
            total["total"] += attributed_value
        aggregate_key = (scope, entry.get("category") or "Uncategorized")
        aggregate = aggregation_rows.setdefault(aggregate_key, {"scope": scope, "category": aggregate_key[1], "entry_count": 0, "total_emissions": 0.0, "available_count": 0})
        aggregate["entry_count"] += 1
        if attributed_value is not None:
            aggregate["total_emissions"] += attributed_value
            aggregate["available_count"] += 1
    for total in supplier_totals.values():
        if not total["attribution_available"]:
            total["scope1"] = total["scope2"] = total["total"] = None
            total["scope1_intensity"] = total["scope2_intensity"] = total["total_intensity"] = None
        elif total.get("annual_revenue_amount") and float(total["annual_revenue_amount"]) > 0:
            denominator = float(total["annual_revenue_amount"])
            total["scope1_intensity"] = total["scope1"] / denominator
            total["scope2_intensity"] = total["scope2"] / denominator
            total["total_intensity"] = total["total"] / denominator
        else:
            total["scope1_intensity"] = total["scope2_intensity"] = total["total_intensity"] = None
    for aggregate in aggregation_rows.values():
        if not aggregate.pop("available_count"):
            aggregate["total_emissions"] = None
    totals = list(supplier_totals.values())
    return {"emissions": emissions, "supplier_totals": totals, "grand_total": sum(row["total"] or 0 for row in totals), "aggregations": sorted(aggregation_rows.values(), key=lambda row: (row["scope"] or "", row["category"]))}


async def get_parent_submitted_emission_detail(customer_org_id: str, emission_id: str) -> Optional[Dict[str, Any]]:
    """Return one parent-visible supplier emission, without exposing a raw file URL."""
    entry = await db.emission_records.find_one(
        {
            "id": emission_id,
            "source": "supplier",
            "submitted_to_parent_org": {"$exists": True, "$ne": None},
            "parent_visible": {"$ne": False},
        },
        {"_id": 0},
    )
    if not entry:
        return None
    relationship = await db.supplier_relationships.find_one(
        {
            "id": entry.get("supplier_relationship_id"),
            "customer_org_id": customer_org_id,
            "is_active": True,
        },
        {"_id": 0, "company_name": 1, "reporting_period": 1},
    )
    if not relationship or not period_belongs_to_parent(entry.get("reporting_period"), relationship.get("reporting_period")):
        return None
    facility = await db.facilities.find_one(
        {"id": entry.get("facility_id")}, {"_id": 0, "name": 1}
    ) if entry.get("facility_id") else None
    fuel = await db.fuel_database.find_one(
        {"id": entry.get("fuel_database_id")},
        {"_id": 0, "calorific_value": 1, "calorific_value_unit": 1, "density": 1, "density_unit": 1,
         "emission_factor_co2": 1, "emission_factor_co2_unit": 1, "emission_factor_basis_quantity": 1,
         "emission_factor_basis_unit": 1, "gwp_fugitives": 1, "source": 1,
         "source_of_information": 1},
    ) if entry.get("fuel_database_id") else None
    evidence_ids = _evidence_file_ids(entry.get("evidence_url"))
    evidence_records = await db.uploaded_files.find(
        {"id": {"$in": evidence_ids}}, {"_id": 0, "id": 1, "original_filename": 1, "content_type": 1, "file_size": 1}
    ).to_list(len(evidence_ids) or 1)
    evidence_by_id = {record["id"]: record for record in evidence_records}
    dynamic_field_keys = list((entry.get("dynamic_field_values") or {}).keys())
    mappings = await db.ce_input_field_mappings.find(
        {
            "is_active": {"$ne": False},
            "$or": [
                {"maps_to_variable": {"$in": dynamic_field_keys}},
                {"field_key": {"$in": dynamic_field_keys}},
            ],
        },
        {"_id": 0, "field_key": 1, "maps_to_variable": 1, "field_label": 1, "label": 1, "field_type": 1,
         "required": 1, "allowed_units": 1, "default_unit": 1, "unit_source": 1, "display_order": 1,
         "applies_to_categories": 1, "formula_id": 1, "default_value": 1, "source_type": 1},
    ).to_list(500)
    category_id = entry.get("category_id")
    formula_id = entry.get("formula_id")
    mapping_by_variable: Dict[str, Dict[str, Any]] = {}
    for mapping in mappings:
        variable = mapping.get("maps_to_variable") or mapping.get("field_key")
        if variable not in dynamic_field_keys:
            continue
        categories = mapping.get("applies_to_categories") or []
        if isinstance(categories, str):
            categories = [categories]
        score = (4 if mapping.get("formula_id") == formula_id else 0) + (2 if category_id and category_id in categories else 0)
        existing = mapping_by_variable.get(variable)
        existing_score = existing.get("_match_score", -1) if existing else -1
        if score >= existing_score:
            mapping_by_variable[variable] = {**mapping, "_match_score": score}
    input_field_mappings = []
    for variable in dynamic_field_keys:
        mapping = mapping_by_variable.get(variable)
        if mapping:
            input_field_mappings.append({key: value for key, value in mapping.items() if key != "_match_score"})
    fuel_default_fields = {
        "cv": ("calorific_value", "calorific_value_unit", "MJ/kg"),
        "density": ("density", "density_unit", "kg/m3"),
        "ef_quantity": ("emission_factor_basis_quantity", "emission_factor_basis_unit", "kgCO2/kg"),
        "ef_quantity_electricity_co2": ("emission_factor_basis_quantity", "emission_factor_basis_unit", "tCO2/MWh"),
        "co2_gwp_fugitives": ("gwp_fugitives", None, "kgCO2e/kg"),
    }
    resolved_default_inputs = {}
    fuel_source = (fuel or {}).get("source") or (fuel or {}).get("source_of_information") or "Fuel database"
    for variable in dynamic_field_keys:
        value = (entry.get("dynamic_field_values") or {}).get(variable)
        mapping = mapping_by_variable.get(variable) or {}
        is_unset = isinstance(value, dict) and value.get("value") is None and not value.get("is_override", False)
        if not is_unset:
            continue
        if mapping.get("default_value") is not None:
            resolved_default_inputs[variable] = {
                "value": mapping["default_value"], "unit": value.get("unit") or mapping.get("default_unit") or "",
                "source": "Configured default",
            }
            continue
        fuel_field = fuel_default_fields.get(variable)
        if fuel and fuel_field and fuel.get(fuel_field[0]) is not None:
            resolved_default_inputs[variable] = {
                "value": fuel[fuel_field[0]], "unit": value.get("unit") or fuel.get(fuel_field[1]) if fuel_field[1] else value.get("unit") or fuel_field[2],
                "source": fuel_source,
            }
    visible_entry = {key: value for key, value in entry.items() if key not in {"evidence_url", "evidence_file_name"}}
    return {
        **visible_entry,
        "facility_name": entry.get("facility_name") or (facility or {}).get("name") or "Supplier facility",
        "supplier_name": relationship.get("company_name", "Unknown"),
        "submitted_at": entry["submitted_to_parent_org"],
        "input_field_mappings": input_field_mappings,
        "resolved_default_inputs": resolved_default_inputs,
        "evidence_files": [evidence_by_id[file_id] for file_id in evidence_ids if file_id in evidence_by_id],
    }