"""Focused organization-agreement document flow for Supplier Assessment."""
import uuid
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from r2_storage import get_r2_storage
from shared.database.mongo import db
from modules.sustainability_config import service as sustainability_config_service
from modules.supplier_assessment.programs import get_or_create_program_revision, resolve_program_context


DOCUMENT_BUCKET_TYPE = "supplier_assessment"
DOCUMENT_FOLDER = "documents"
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024
RESPONSE_MODES = {"ACCEPTANCE", "STATUS"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _document_key(title: Optional[str], filename: str) -> str:
    """Stable, organization-local lineage key for focused agreement replacement."""
    source = (title or filename).strip().casefold()
    return re.sub(r"[^a-z0-9]+", "-", source).strip("-") or "agreement"


def _is_requirement_available_to_relationship(requirement: Dict[str, Any], relationship: Dict[str, Any]) -> bool:
    """Keep a supplier's explicit document assignments stable across program revisions."""
    requirement_period = requirement.get("reporting_period")
    if requirement_period and requirement_period != relationship.get("reporting_period"):
        return False
    if relationship["id"] in (requirement.get("excluded_supplier_relationship_ids") or []):
        return False
    explicitly_assigned = relationship["id"] in (requirement.get("supplier_relationship_ids") or [])
    same_program = (
        requirement.get("assessment_program_id") == relationship.get("assessment_program_id")
        and requirement.get("assessment_program_version") == relationship.get("assessment_program_version")
    )
    return explicitly_assigned or (not requirement.get("supplier_relationship_ids") and same_program)


async def _current_document_submission(relationship_id: str, requirement_id: str, version_id: str) -> Optional[Dict[str, Any]]:
    return await db.supplier_document_submissions.find_one(
        {"supplier_relationship_id": relationship_id, "document_requirement_id": requirement_id, "document_version_id": version_id, "is_current": True},
        {"_id": 0}, sort=[("revision", -1)],
    )


async def _enable_documents_for_org(customer_org_id: str, _user_id: str) -> Dict[str, Any]:
    """Compatibility seam that now validates the Superadmin-selected Documents workflow.

    The historical helper enabled Documents as a side effect. The organization configuration
    is now authoritative, so publishing can only continue after Superadmin has enabled it.
    """
    config = await sustainability_config_service.resolve_supplier_assessment_config(customer_org_id)
    if not (config.get("modules", {}).get("documents") or {}).get("enabled"):
        raise ValueError("Enable the Documents module in Organization Config before publishing an agreement")
    return config


async def _next_document_version_number(customer_org_id: str, document_key: str) -> int:
    latest = await db.supplier_document_versions.find_one(
        {"customer_org_id": customer_org_id, "document_key": document_key},
        {"_id": 0, "version_number": 1}, sort=[("version_number", -1)],
    )
    return (latest.get("version_number", 0) + 1) if latest else 1


async def publish_agreement(
    customer_org_id: str,
    created_by: str,
    filename: str,
    content_type: str,
    content: bytes,
    title: Optional[str],
    response_mode: str = "ACCEPTANCE",
    response_options: Optional[List[str]] = None,
    relationship_ids: Optional[List[str]] = None,
    due_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Upload one organization agreement and bind it to immutable program revisions."""
    if not filename or content_type not in ALLOWED_DOCUMENT_TYPES:
        raise ValueError("Only PDF, DOC, and DOCX agreement files are supported")
    if not content or len(content) > MAX_DOCUMENT_SIZE:
        raise ValueError("Agreement files must be between 1 byte and 10MB")
    response_mode = response_mode.upper()
    if response_mode not in RESPONSE_MODES:
        raise ValueError("Document response mode must be ACCEPTANCE or STATUS")
    response_options = list(dict.fromkeys(option.strip() for option in (response_options or []) if option and option.strip()))
    if response_mode == "STATUS" and not response_options:
        raise ValueError("Add at least one status response option")
    if response_mode == "ACCEPTANCE":
        response_options = []

    organization_config = await _enable_documents_for_org(customer_org_id, created_by)
    relationship_filter = {"customer_org_id": customer_org_id, "is_active": True}
    if relationship_ids:
        relationship_filter["id"] = {"$in": list(set(relationship_ids))}
    relationships = await db.supplier_relationships.find(relationship_filter, {"_id": 0}).to_list(1000)
    if relationship_ids and len(relationships) != len(set(relationship_ids)):
        raise ValueError("One or more selected suppliers are not available to this organization")

    organization = await db.organizations.find_one({"id": customer_org_id}, {"_id": 0, "name": 1})
    upload = await get_r2_storage().upload_file(
        file_content=content,
        filename=filename,
        bucket_type=DOCUMENT_BUCKET_TYPE,
        content_type=content_type,
        folder=DOCUMENT_FOLDER,
        metadata={"uploaded_by": created_by, "document_type": "supplier_agreement"},
        org_name=(organization or {}).get("name"),
    )
    if upload.get("error"):
        raise ValueError(upload["error"])

    now = _now()
    document_key = _document_key(title, filename)
    version = {
        "id": str(uuid.uuid4()),
        "customer_org_id": customer_org_id,
        "document_key": document_key,
        "version_number": await _next_document_version_number(customer_org_id, document_key),
        "original_filename": filename,
        "content_type": content_type,
        "file_size": len(content),
        "bucket_type": DOCUMENT_BUCKET_TYPE,
        "r2_key": upload["key"],
        "created_by": created_by,
        "created_at": now,
    }
    await db.supplier_document_versions.insert_one(version)
    version.pop("_id", None)

    revisions: Dict[tuple, Dict[str, Any]] = {}
    revision_relationships: Dict[tuple, List[str]] = {}
    if not relationships:
        revision = await get_or_create_program_revision(customer_org_id, organization_config, created_by)
        revisions[(revision["program_id"], revision["version"])] = revision

    for relationship in relationships:
        context = await resolve_program_context(relationship)
        config = deepcopy(context["config"])
        configured_documents = organization_config["modules"]["documents"]
        config.setdefault("modules", {})["documents"] = deepcopy(configured_documents)
        revision = await get_or_create_program_revision(customer_org_id, config, created_by)
        revisions[(revision["program_id"], revision["version"])] = revision
        revision_relationships.setdefault((revision["program_id"], revision["version"], relationship.get("reporting_period")), []).append(relationship["id"])
        await db.supplier_relationships.update_one(
            {"id": relationship["id"]},
            {"$set": {
                "assessment_program_id": revision["program_id"],
                "assessment_program_version": revision["version"],
                "documents_completion_percent": 0.0,
                "updated_at": now,
            }},
        )

    requirements = []
    for revision in revisions.values():
        requirement = {
            "id": str(uuid.uuid4()),
            "customer_org_id": customer_org_id,
            "assessment_program_id": revision["program_id"],
            "assessment_program_version": revision["version"],
            "document_key": document_key,
            "title": (title or filename).strip(),
            "document_version_id": version["id"],
            "response_mode": response_mode,
            "response_options": response_options,
            "supplier_relationship_ids": revision_relationships.get((revision["program_id"], revision["version"], None), []),
            "is_active": True,
            "created_by": created_by,
            "created_at": now,
        }
        matching_assignments = [
            (period, ids) for (program_id, version, period), ids in revision_relationships.items()
            if program_id == revision["program_id"] and version == revision["version"]
        ] or [(None, [])]
        for period, assigned_ids in matching_assignments:
            period_requirement = {**requirement, "id": str(uuid.uuid4()), "supplier_relationship_ids": assigned_ids, "reporting_period": period, "due_date": due_date or None}
            await db.supplier_document_requirements.insert_one(period_requirement)
            period_requirement.pop("_id", None)
            requirements.append(period_requirement)

    return {
        "requirements": requirements,
        "version": version,
        "affected_relationship_ids": [relationship["id"] for relationship in relationships],
    }


async def assign_existing_documents_to_supplier(customer_org_id: str, relationship: Dict[str, Any], requirement_ids: List[str], created_by: str) -> List[str]:
    """Assign existing immutable document versions to a newly created supplier."""
    sources = await db.supplier_document_requirements.find(
        {"id": {"$in": list(set(requirement_ids))}, "customer_org_id": customer_org_id, "is_active": True}, {"_id": 0}
    ).to_list(1000)
    if len(sources) != len(set(requirement_ids)):
        raise ValueError("One or more selected documents are unavailable")
    now = _now()
    created_ids = []
    for source in sources:
        duplicate = await db.supplier_document_requirements.find_one(
            {"customer_org_id": customer_org_id, "assessment_program_id": relationship.get("assessment_program_id"), "assessment_program_version": relationship.get("assessment_program_version"), "document_version_id": source["document_version_id"], "reporting_period": relationship.get("reporting_period"), "supplier_relationship_ids": relationship["id"], "is_active": True}, {"_id": 0, "id": 1}
        )
        if duplicate:
            created_ids.append(duplicate["id"])
            continue
        requirement = {
            "id": str(uuid.uuid4()), "customer_org_id": customer_org_id,
            "assessment_program_id": relationship.get("assessment_program_id"), "assessment_program_version": relationship.get("assessment_program_version"),
            "document_key": source.get("document_key"), "title": source["title"], "document_version_id": source["document_version_id"],
            "response_mode": source.get("response_mode", "ACCEPTANCE"), "response_options": source.get("response_options", []),
            "due_date": source.get("due_date"), "reporting_period": relationship.get("reporting_period"),
            "supplier_relationship_ids": [relationship["id"]], "is_active": True, "created_by": created_by, "created_at": now,
        }
        await db.supplier_document_requirements.insert_one(requirement)
        created_ids.append(requirement["id"])
    return created_ids


async def list_supplier_documents(relationship: Dict[str, Any]) -> List[Dict[str, Any]]:
    requirements = await db.supplier_document_requirements.find(
        {
            "customer_org_id": relationship["customer_org_id"],
            "is_active": True,
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    requirements = [
        requirement for requirement in requirements
        if _is_requirement_available_to_relationship(requirement, relationship)
    ]
    documents = []
    for requirement in requirements:
        version = await db.supplier_document_versions.find_one(
            {"id": requirement["document_version_id"]}, {"_id": 0}
        )
        if not version:
            continue
        response_mode = requirement.get("response_mode", "ACCEPTANCE")
        response = await _current_document_submission(relationship["id"], requirement["id"], version["id"])
        if not response:
            if response_mode == "STATUS":
                response = await db.supplier_document_responses.find_one({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement["id"], "document_version_id": version["id"]}, {"_id": 0})
            else:
                response = await db.supplier_document_acceptances.find_one({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement["id"], "document_version_id": version["id"]}, {"_id": 0})
        is_reopened = bool(response and response.get("status") == "reopened")
        documents.append({
            "id": requirement["id"], "title": requirement["title"],
            "original_filename": version["original_filename"], "content_type": version["content_type"],
            "file_size": version["file_size"], "document_version_id": version["id"],
            "version_number": version["version_number"], "accepted": bool(response) and not is_reopened,
            "accepted_at": response.get("accepted_at") if response else None,
            "response_mode": response_mode, "response_options": requirement.get("response_options", []),
            "selected_response": response.get("response_value") if response_mode == "STATUS" and response and not is_reopened else None,
            "responded_at": (response.get("responded_at") or response.get("submitted_at")) if response_mode == "STATUS" and response and not is_reopened else None,
            "submission_status": "reopened" if is_reopened else ("submitted" if response else "not_started"),
            "created_at": requirement["created_at"], "due_date": requirement.get("due_date"), "reporting_period": requirement.get("reporting_period") or relationship.get("reporting_period"),
        })
    return documents


async def get_supplier_document(relationship: Dict[str, Any], requirement_id: str) -> Optional[Dict[str, Any]]:
    requirement = await db.supplier_document_requirements.find_one({
        "id": requirement_id, "customer_org_id": relationship["customer_org_id"],
        "is_active": True,
    }, {"_id": 0})
    if not requirement or not _is_requirement_available_to_relationship(requirement, relationship):
        return None
    version = await db.supplier_document_versions.find_one({"id": requirement["document_version_id"]}, {"_id": 0})
    return {"requirement": requirement, "version": version} if version else None


async def accept_supplier_document(relationship: Dict[str, Any], requirement_id: str, supplier_user_id: str) -> Optional[Dict[str, Any]]:
    document = await get_supplier_document(relationship, requirement_id)
    if not document:
        return None
    requirement, version = document["requirement"], document["version"]
    if requirement.get("response_mode", "ACCEPTANCE") != "ACCEPTANCE":
        raise ValueError("Select one of the configured status responses instead")
    existing = await _current_document_submission(relationship["id"], requirement_id, version["id"])
    if existing and existing.get("status") == "reopened":
        now = _now()
        await db.supplier_document_submissions.update_one({"id": existing["id"]}, {"$set": {"status": "submitted", "response_value": "Accepted", "accepted_by": supplier_user_id, "accepted_at": now, "submitted_at": now, "parent_visible": True}})
        await db.supplier_document_submissions.update_many({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement_id, "id": {"$ne": existing["id"]}}, {"$set": {"parent_visible": False}})
        return await db.supplier_document_submissions.find_one({"id": existing["id"]}, {"_id": 0})
    if existing:
        return existing
    legacy = await db.supplier_document_acceptances.find_one({
        "supplier_relationship_id": relationship["id"], "document_requirement_id": requirement_id,
        "document_version_id": version["id"],
    }, {"_id": 0})
    if legacy:
        return legacy
    acceptance = {
        "id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"],
        "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": relationship["customer_org_id"],
        "document_requirement_id": requirement_id, "document_version_id": version["id"],
        "accepted_by": supplier_user_id, "accepted_at": _now(), "status": "submitted", "revision": 1,
        "is_current": True, "parent_visible": True,
    }
    await db.supplier_document_acceptances.insert_one(acceptance)
    acceptance.pop("_id", None)
    return acceptance


async def respond_to_supplier_document(relationship: Dict[str, Any], requirement_id: str, response_value: str, supplier_user_id: str) -> Optional[Dict[str, Any]]:
    document = await get_supplier_document(relationship, requirement_id)
    if not document:
        return None
    requirement, version = document["requirement"], document["version"]
    if requirement.get("response_mode", "ACCEPTANCE") != "STATUS":
        raise ValueError("This document requires acceptance")
    if response_value not in requirement.get("response_options", []):
        raise ValueError("Choose one of the configured status responses")
    existing = await _current_document_submission(relationship["id"], requirement_id, version["id"])
    if existing and existing.get("status") == "reopened":
        now = _now()
        await db.supplier_document_submissions.update_one({"id": existing["id"]}, {"$set": {"status": "submitted", "response_value": response_value, "responded_by": supplier_user_id, "responded_at": now, "submitted_at": now, "parent_visible": True}})
        await db.supplier_document_submissions.update_many({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement_id, "id": {"$ne": existing["id"]}}, {"$set": {"parent_visible": False}})
        return await db.supplier_document_submissions.find_one({"id": existing["id"]}, {"_id": 0})
    if existing:
        if existing.get("response_value") == response_value:
            return existing
        raise ValueError("This document response has already been submitted and is locked")
    legacy = await db.supplier_document_responses.find_one({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement_id, "document_version_id": version["id"]}, {"_id": 0})
    if legacy:
        if legacy.get("response_value") == response_value:
            return legacy
        raise ValueError("This document response has already been submitted and is locked")
    response = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": relationship["customer_org_id"], "document_requirement_id": requirement_id, "document_version_id": version["id"], "response_value": response_value, "responded_by": supplier_user_id, "responded_at": _now()}
    response.update({"status": "submitted", "revision": 1, "is_current": True, "parent_visible": True, "submitted_at": response["responded_at"]})
    await db.supplier_document_submissions.insert_one(response)
    response.pop("_id", None)
    return response


async def list_customer_documents(customer_org_id: str, reporting_period: Optional[str] = None) -> List[Dict[str, Any]]:
    query = {"customer_org_id": customer_org_id, "is_active": True}
    if reporting_period:
        query["reporting_period"] = reporting_period
    requirements = await db.supplier_document_requirements.find(
        query, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return requirements


async def list_document_supplier_responses(customer_org_id: str, requirement_id: str) -> Optional[Dict[str, Any]]:
    requirement = await db.supplier_document_requirements.find_one({"id": requirement_id, "customer_org_id": customer_org_id, "is_active": True}, {"_id": 0})
    if not requirement:
        return None
    related_requirements = await db.supplier_document_requirements.find({"customer_org_id": customer_org_id, "document_version_id": requirement["document_version_id"], "is_active": True}, {"_id": 0}).to_list(1000)
    requirement_by_program = {(item["assessment_program_id"], item["assessment_program_version"]): item for item in related_requirements}
    suppliers = await db.supplier_relationships.find({"customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1, "company_name": 1, "assessment_program_id": 1, "assessment_program_version": 1}).to_list(1000)
    rows = []
    for supplier in suppliers:
        assigned_requirement = requirement_by_program.get((supplier.get("assessment_program_id"), supplier.get("assessment_program_version")))
        if not assigned_requirement or (assigned_requirement.get("supplier_relationship_ids") and supplier["id"] not in assigned_requirement["supplier_relationship_ids"]):
            continue
        current_submission = await _current_document_submission(supplier["id"], assigned_requirement["id"], assigned_requirement["document_version_id"])
        visible_submission = await db.supplier_document_submissions.find_one(
            {"supplier_relationship_id": supplier["id"], "document_requirement_id": assigned_requirement["id"], "parent_visible": True, "status": "submitted"},
            {"_id": 0}, sort=[("revision", -1)],
        )
        if assigned_requirement.get("response_mode", "ACCEPTANCE") == "STATUS":
            response = visible_submission or await db.supplier_document_responses.find_one({"supplier_relationship_id": supplier["id"], "document_requirement_id": assigned_requirement["id"], "document_version_id": assigned_requirement["document_version_id"]}, {"_id": 0})
            rows.append({"supplier_relationship_id": supplier["id"], "supplier_name": supplier.get("company_name"), "response_mode": "STATUS", "selected_response": response.get("response_value") if response else None, "responded_at": (response.get("responded_at") or response.get("submitted_at")) if response else None, "can_unlock": bool(response), "submission_status": current_submission.get("status", "submitted") if current_submission else "submitted"})
        else:
            acceptance = visible_submission or await db.supplier_document_acceptances.find_one({"supplier_relationship_id": supplier["id"], "document_requirement_id": assigned_requirement["id"], "document_version_id": assigned_requirement["document_version_id"]}, {"_id": 0})
            rows.append({"supplier_relationship_id": supplier["id"], "supplier_name": supplier.get("company_name"), "response_mode": "ACCEPTANCE", "selected_response": "Accepted" if acceptance else None, "responded_at": (acceptance.get("accepted_at") or acceptance.get("submitted_at")) if acceptance else None, "can_unlock": bool(acceptance), "submission_status": current_submission.get("status", "submitted") if current_submission else "submitted"})
    return {"document_version_id": requirement["document_version_id"], "response_mode": requirement.get("response_mode", "ACCEPTANCE"), "response_options": requirement.get("response_options", []), "responses": rows}


async def archive_document(customer_org_id: str, requirement_id: str) -> Optional[List[str]]:
    """Remove an agreement from active supplier access while retaining its audit history."""
    requirement = await db.supplier_document_requirements.find_one(
        {"id": requirement_id, "customer_org_id": customer_org_id, "is_active": True}, {"_id": 0}
    )
    if not requirement:
        return None
    now = _now()
    await db.supplier_document_requirements.update_many(
        {"customer_org_id": customer_org_id, "document_version_id": requirement["document_version_id"], "is_active": True},
        {"$set": {"is_active": False, "deleted_at": now}},
    )
    await db.supplier_document_versions.update_one(
        {"id": requirement["document_version_id"], "customer_org_id": customer_org_id},
        {"$set": {"is_deleted": True, "deleted_at": now}},
    )
    relationships = await db.supplier_relationships.find(
        {"customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1}
    ).to_list(1000)
    return [relationship["id"] for relationship in relationships]


async def reopen_supplier_document(customer_org_id: str, supplier_relationship_id: str, requirement_id: str, reopened_by: str) -> Dict[str, Any]:
    relationship = await db.supplier_relationships.find_one({"id": supplier_relationship_id, "customer_org_id": customer_org_id, "is_active": True}, {"_id": 0})
    if not relationship:
        raise ValueError("Supplier not found")
    document = await get_supplier_document(relationship, requirement_id)
    if not document:
        raise ValueError("Agreement not found")
    requirement, version = document["requirement"], document["version"]
    current = await _current_document_submission(relationship["id"], requirement_id, version["id"])
    if current and current.get("status") == "reopened":
        raise ValueError("This document is already unlocked for resubmission")
    legacy_collection = db.supplier_document_responses if requirement.get("response_mode") == "STATUS" else db.supplier_document_acceptances
    legacy = await legacy_collection.find_one({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement_id, "document_version_id": version["id"]}, {"_id": 0})
    if not current and not legacy:
        raise ValueError("No submitted document response is available to unlock")
    if current:
        await db.supplier_document_submissions.update_one({"id": current["id"]}, {"$set": {"is_current": False}})
    latest = await db.supplier_document_submissions.find_one({"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement_id}, {"_id": 0, "revision": 1}, sort=[("revision", -1)])
    draft = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": customer_org_id, "document_requirement_id": requirement_id, "document_version_id": version["id"], "response_mode": requirement.get("response_mode", "ACCEPTANCE"), "status": "reopened", "revision": (latest.get("revision", 1) + 1) if latest else 2, "is_current": True, "parent_visible": False, "reopened_by": reopened_by, "reopened_at": _now()}
    await db.supplier_document_submissions.insert_one(draft)
    draft.pop("_id", None)
    return draft


async def ensure_indexes():
    await db.supplier_document_requirements.create_index([
        ("customer_org_id", 1), ("assessment_program_id", 1), ("assessment_program_version", 1)
    ])
    await db.supplier_document_versions.create_index("id", unique=True)
    await db.supplier_document_versions.create_index([
        ("customer_org_id", 1), ("document_key", 1), ("version_number", 1)
    ], unique=True)
    await db.supplier_document_acceptances.create_index([
        ("supplier_relationship_id", 1), ("document_requirement_id", 1), ("document_version_id", 1)
    ], unique=True)
    await db.supplier_document_responses.create_index([
        ("supplier_relationship_id", 1), ("document_requirement_id", 1), ("document_version_id", 1)
    ], unique=True)
    await db.supplier_document_submissions.create_index("id", unique=True)
    await db.supplier_document_submissions.create_index([("supplier_relationship_id", 1), ("document_requirement_id", 1), ("is_current", 1)])