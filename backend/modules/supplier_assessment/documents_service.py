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


DOCUMENT_BUCKET_TYPE = "org_facility"
DOCUMENT_FOLDER = "supplier-assessment/documents"
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_DOCUMENT_SIZE = 10 * 1024 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _document_key(title: Optional[str], filename: str) -> str:
    """Stable, organization-local lineage key for focused agreement replacement."""
    source = (title or filename).strip().casefold()
    return re.sub(r"[^a-z0-9]+", "-", source).strip("-") or "agreement"


async def _next_document_version_number(customer_org_id: str, document_key: str) -> int:
    latest = await db.supplier_document_versions.find_one(
        {"customer_org_id": customer_org_id, "document_key": document_key},
        {"_id": 0, "version_number": 1}, sort=[("version_number", -1)],
    )
    return (latest.get("version_number", 0) + 1) if latest else 1


async def _enable_documents_for_org(customer_org_id: str, user_id: str) -> Dict[str, Any]:
    config = await sustainability_config_service.resolve_supplier_assessment_config(customer_org_id)
    config["modules"]["documents"]["enabled"] = True
    await sustainability_config_service.upsert_org_config(
        customer_org_id, {"supplier_assessment": config}, user_id
    )
    return config


async def publish_agreement(
    customer_org_id: str,
    created_by: str,
    filename: str,
    content_type: str,
    content: bytes,
    title: Optional[str],
) -> Dict[str, Any]:
    """Upload one organization agreement and bind it to immutable program revisions."""
    if not filename or content_type not in ALLOWED_DOCUMENT_TYPES:
        raise ValueError("Only PDF, DOC, and DOCX agreement files are supported")
    if not content or len(content) > MAX_DOCUMENT_SIZE:
        raise ValueError("Agreement files must be between 1 byte and 10MB")

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

    default_config = await _enable_documents_for_org(customer_org_id, created_by)
    relationships = await db.supplier_relationships.find(
        {"customer_org_id": customer_org_id, "is_active": True}, {"_id": 0}
    ).to_list(1000)
    revisions: Dict[tuple, Dict[str, Any]] = {}
    if not relationships:
        revision = await get_or_create_program_revision(customer_org_id, default_config, created_by)
        revisions[(revision["program_id"], revision["version"])] = revision

    for relationship in relationships:
        context = await resolve_program_context(relationship)
        config = deepcopy(context["config"])
        config.setdefault("modules", {}).setdefault("documents", {})["enabled"] = True
        revision = await get_or_create_program_revision(customer_org_id, config, created_by)
        revisions[(revision["program_id"], revision["version"])] = revision
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
            "is_active": True,
            "created_by": created_by,
            "created_at": now,
        }
        await db.supplier_document_requirements.insert_one(requirement)
        requirement.pop("_id", None)
        requirements.append(requirement)

    return {
        "requirements": requirements,
        "version": version,
        "affected_relationship_ids": [relationship["id"] for relationship in relationships],
    }


async def list_supplier_documents(relationship: Dict[str, Any]) -> List[Dict[str, Any]]:
    requirements = await db.supplier_document_requirements.find(
        {
            "customer_org_id": relationship["customer_org_id"],
            "assessment_program_id": relationship.get("assessment_program_id"),
            "assessment_program_version": relationship.get("assessment_program_version"),
            "is_active": True,
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    documents = []
    for requirement in requirements:
        version = await db.supplier_document_versions.find_one(
            {"id": requirement["document_version_id"]}, {"_id": 0}
        )
        if not version:
            continue
        acceptance = await db.supplier_document_acceptances.find_one(
            {
                "supplier_relationship_id": relationship["id"],
                "document_requirement_id": requirement["id"],
                "document_version_id": version["id"],
            }, {"_id": 0},
        )
        documents.append({
            "id": requirement["id"], "title": requirement["title"],
            "original_filename": version["original_filename"], "content_type": version["content_type"],
            "file_size": version["file_size"], "document_version_id": version["id"],
            "version_number": version["version_number"], "accepted": bool(acceptance),
            "accepted_at": acceptance.get("accepted_at") if acceptance else None,
            "created_at": requirement["created_at"],
        })
    return documents


async def get_supplier_document(relationship: Dict[str, Any], requirement_id: str) -> Optional[Dict[str, Any]]:
    requirement = await db.supplier_document_requirements.find_one({
        "id": requirement_id, "customer_org_id": relationship["customer_org_id"],
        "assessment_program_id": relationship.get("assessment_program_id"),
        "assessment_program_version": relationship.get("assessment_program_version"), "is_active": True,
    }, {"_id": 0})
    if not requirement:
        return None
    version = await db.supplier_document_versions.find_one({"id": requirement["document_version_id"]}, {"_id": 0})
    return {"requirement": requirement, "version": version} if version else None


async def accept_supplier_document(relationship: Dict[str, Any], requirement_id: str, supplier_user_id: str) -> Optional[Dict[str, Any]]:
    document = await get_supplier_document(relationship, requirement_id)
    if not document:
        return None
    requirement, version = document["requirement"], document["version"]
    existing = await db.supplier_document_acceptances.find_one({
        "supplier_relationship_id": relationship["id"], "document_requirement_id": requirement_id,
        "document_version_id": version["id"],
    }, {"_id": 0})
    if existing:
        return existing
    acceptance = {
        "id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"],
        "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": relationship["customer_org_id"],
        "document_requirement_id": requirement_id, "document_version_id": version["id"],
        "accepted_by": supplier_user_id, "accepted_at": _now(),
    }
    await db.supplier_document_acceptances.insert_one(acceptance)
    acceptance.pop("_id", None)
    return acceptance


async def list_customer_documents(customer_org_id: str) -> List[Dict[str, Any]]:
    requirements = await db.supplier_document_requirements.find(
        {"customer_org_id": customer_org_id, "is_active": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return requirements


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