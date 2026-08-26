"""Focused, version-aware supplier training content and progress service."""
import asyncio
import json
import subprocess
import tempfile
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import fitz

from r2_storage import get_r2_storage
from shared.database.mongo import db
from modules.supplier_assessment.programs import get_or_create_program_revision, resolve_program_context
from modules.sustainability_config import service as sustainability_config_service

TRAINING_BUCKET = "supplier_assessment"
TRAINING_FOLDER = "training"
ALLOWED_TYPES = {
    "application/pdf", "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "audio/mpeg", "audio/mp4", "audio/wav", "video/mp4", "video/webm",
}
MAX_TRAINING_SIZE = 250 * 1024 * 1024
MAX_RENDERED_PAGES = 200

def _now(): return datetime.now(timezone.utc).isoformat()

def _viewer_type(content_type: str) -> str:
    if content_type in {"application/pdf", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"}:
        return "pages"
    if content_type.startswith("audio/"):
        return "audio"
    if content_type.startswith("video/"):
        return "video"
    raise ValueError("Unsupported training viewer format")

def _render_pages(content: bytes, file_name: str, content_type: str) -> List[bytes]:
    with tempfile.TemporaryDirectory() as temp_dir:
        source = Path(temp_dir) / f"source{Path(file_name).suffix.lower()}"
        source.write_bytes(content)
        pdf_path = source
        if content_type != "application/pdf":
            result = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", temp_dir, str(source)], capture_output=True, text=True, timeout=120)
            candidates = list(Path(temp_dir).glob("*.pdf"))
            if result.returncode != 0 or not candidates:
                raise ValueError("Could not prepare this presentation for in-app viewing")
            pdf_path = candidates[0]
        document = fitz.open(pdf_path)
        if not 1 <= len(document) <= MAX_RENDERED_PAGES:
            raise ValueError(f"Training documents must contain 1 to {MAX_RENDERED_PAGES} pages")
        images = []
        for page in document:
            images.append(page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4), alpha=False).tobytes("png"))
        document.close()
        return images

def _probe_media_duration(content: bytes, file_name: str) -> float:
    with tempfile.TemporaryDirectory() as temp_dir:
        source = Path(temp_dir) / f"source{Path(file_name).suffix.lower()}"
        source.write_bytes(content)
        result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(source)], capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            raise ValueError("Could not read this media file for in-app playback")
        duration = float(json.loads(result.stdout).get("format", {}).get("duration") or 0)
        if duration <= 0:
            raise ValueError("Training media must have a valid duration")
        return duration

async def _prepare_viewer(content: bytes, file_name: str, content_type: str) -> Dict[str, Any]:
    viewer_type = _viewer_type(content_type)
    if viewer_type == "pages":
        return {"viewer_type": viewer_type, "page_images": await asyncio.to_thread(_render_pages, content, file_name, content_type)}
    return {"viewer_type": viewer_type, "duration_seconds": await asyncio.to_thread(_probe_media_duration, content, file_name)}

async def create_training(org_id: str, user_id: str, title: str, description: str, threshold: float, file_name: str, content_type: str, content: bytes, relationship_ids: List[str], due_date: Optional[str] = None):
    threshold = 100.0
    if not title.strip(): raise ValueError("Title is required")
    if content_type not in ALLOWED_TYPES or not content or len(content) > MAX_TRAINING_SIZE: raise ValueError("Unsupported training file or file exceeds 250MB")
    organization_config = await sustainability_config_service.resolve_supplier_assessment_config(org_id)
    if not (organization_config.get("modules", {}).get("training") or {}).get("enabled"):
        raise ValueError("Enable the Training module in Organization Config before assigning training")
    relationships = await db.supplier_relationships.find(
        {"id": {"$in": relationship_ids}, "customer_org_id": org_id, "is_active": True}, {"_id": 0}
    ).to_list(1000)
    if len(relationships) != len(set(relationship_ids)): raise ValueError("One or more suppliers are not available to this organization")
    organization = await db.organizations.find_one({"id": org_id}, {"_id": 0, "name": 1, "organization_name": 1})
    viewer_seed = await _prepare_viewer(content, file_name, content_type)
    storage = get_r2_storage()
    upload = await storage.upload_file(content, file_name, TRAINING_BUCKET, content_type, folder=TRAINING_FOLDER, metadata={"uploaded_by": user_id, "kind": "supplier_training"}, org_name=(organization or {}).get("organization_name") or (organization or {}).get("name"))
    if upload.get("error"): raise ValueError(upload["error"])
    viewer_manifest = {"viewer_type": viewer_seed["viewer_type"]}
    uploaded_render_keys = []
    try:
        if viewer_seed["viewer_type"] == "pages":
            prefix = upload["key"].rsplit(".", 1)[0]
            pages = []
            for index, image in enumerate(viewer_seed["page_images"], start=1):
                key = f"{prefix}/viewer/page-{index}.png"
                rendered = await storage.upload_file(image, f"page-{index}.png", TRAINING_BUCKET, "image/png", object_key=key, metadata={"kind": "supplier_training_page", "source": upload["key"]})
                if rendered.get("error"):
                    raise ValueError(rendered["error"])
                uploaded_render_keys.append(key)
                pages.append({"index": index, "r2_key": key})
            viewer_manifest.update({"page_count": len(pages), "pages": pages})
        else:
            viewer_manifest["duration_seconds"] = viewer_seed["duration_seconds"]
    except Exception:
        for key in uploaded_render_keys:
            await storage.delete_file(TRAINING_BUCKET, key)
        await storage.delete_file(TRAINING_BUCKET, upload["key"])
        raise
    now, content_id, requirement_id, version_id = _now(), str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    content_doc = {"id": content_id, "organization_id": org_id, "title": title.strip(), "description": description or "", "created_by": user_id, "created_at": now}
    version = {"id": version_id, "training_content_id": content_id, "version_number": 1, "original_filename": file_name, "content_type": content_type, "file_size": len(content), "bucket_type": TRAINING_BUCKET, "r2_key": upload["key"], "viewer_manifest": viewer_manifest, "created_by": user_id, "created_at": now}
    requirement = {"id": requirement_id, "organization_id": org_id, "training_content_id": content_id, "training_version_id": version_id, "completion_threshold": threshold, "title": title.strip(), "description": description or "", "due_date": due_date or None, "is_active": True, "is_deleted": False, "created_by": user_id, "created_at": now}
    await db.supplier_training_contents.insert_one(content_doc); await db.supplier_training_versions.insert_one(version); await db.supplier_training_requirements.insert_one(requirement)
    assignments=[]
    for relationship in relationships:
        context = await resolve_program_context(relationship)
        program_config = deepcopy(context["config"])
        program_config["modules"] = {
            **program_config.get("modules", {}),
            "training": organization_config["modules"]["training"],
        }
        revision = await get_or_create_program_revision(org_id, program_config, user_id)
        await db.supplier_relationships.update_one({"id": relationship["id"]}, {"$set": {"assessment_program_id": revision["program_id"], "assessment_program_version": revision["version"], "training_completion_percent": 0.0, "updated_at": now}})
        assignment={"id":str(uuid.uuid4()),"supplier_relationship_id":relationship["id"],"organization_id":org_id,"training_requirement_id":requirement_id,"requirement_version_id":version_id,"reporting_period":relationship.get("reporting_period"),"assigned_at":now,"is_active":True}
        await db.supplier_training_assignments.insert_one(assignment); assignment.pop("_id",None); assignments.append(assignment)
    from modules.supplier_assessment.service import supplier_service
    for relationship in relationships:
        await supplier_service._update_completion_status(relationship["id"])
    for doc in (content_doc, version, requirement): doc.pop("_id", None)
    return {"training": requirement, "version": version, "assignments": assignments}

async def supplier_trainings(relationship: Dict[str, Any]):
    assignments = await db.supplier_training_assignments.find({"supplier_relationship_id":relationship["id"],"is_active":True},{"_id":0}).to_list(200)
    result=[]
    for assignment in assignments:
        requirement=await db.supplier_training_requirements.find_one({"id":assignment["training_requirement_id"],"organization_id":relationship["customer_org_id"],"is_active":True},{"_id":0})
        version=await db.supplier_training_versions.find_one({"id":assignment["requirement_version_id"]},{"_id":0})
        progress=await db.supplier_training_progress.find_one({"supplier_relationship_id":relationship["id"],"training_assignment_id":assignment["id"]},{"_id":0})
        if requirement and version:
            manifest = version.get("viewer_manifest") or {}
            result.append({"assignment_id":assignment["id"],"title":requirement["title"],"description":requirement["description"],"completion_threshold":requirement["completion_threshold"],"due_date":requirement.get("due_date"),"reporting_period":assignment.get("reporting_period") or relationship.get("reporting_period"),"version_number":version["version_number"],"content_type":version["content_type"],"assigned_at":assignment["assigned_at"],"progress_percent":(progress or {}).get("progress_percent",0),"status":(progress or {}).get("status","not_started"),"highest_page_index":(progress or {}).get("highest_page_index",0),"page_count":manifest.get("page_count") if manifest.get("viewer_type") == "pages" else None})
    return result

async def update_progress(relationship: Dict[str, Any], assignment_id: str, percent: float, user_id: str, highest_page_index: Optional[int] = None):
    if not 0 <= percent <= 100:
        raise ValueError("Progress must be between 0 and 100")
    assignment=await db.supplier_training_assignments.find_one({"id":assignment_id,"supplier_relationship_id":relationship["id"],"is_active":True},{"_id":0})
    if not assignment: return None
    requirement=await db.supplier_training_requirements.find_one({"id":assignment["training_requirement_id"]},{"_id":0})
    status="completed" if percent >= requirement["completion_threshold"] else ("in_progress" if percent else "not_started")
    existing=await db.supplier_training_progress.find_one({"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"]},{"_id":0})
    now=_now(); progress={"id":(existing or {}).get("id",str(uuid.uuid4())),"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"],"training_version_id":assignment["requirement_version_id"],"reporting_period":assignment.get("reporting_period") or relationship.get("reporting_period"),"progress_percent":percent,"status":status,"completed_at":now if status=="completed" else None,"updated_by":user_id,"updated_at":now}
    persisted_highest_page = max(int((existing or {}).get("highest_page_index") or 0), int(highest_page_index or 0))
    if persisted_highest_page:
        progress["highest_page_index"] = persisted_highest_page
    await db.supplier_training_progress.update_one({"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"]},{"$set":progress},upsert=True); progress.pop("_id",None); return progress

async def training_file_for_supplier(relationship: Dict[str, Any], assignment_id: str) -> Optional[Dict[str, Any]]:
    assignment = await db.supplier_training_assignments.find_one({"id": assignment_id, "supplier_relationship_id": relationship["id"], "is_active": True}, {"_id": 0})
    if not assignment: return None
    return await db.supplier_training_versions.find_one({"id": assignment["requirement_version_id"]}, {"_id": 0})

async def _ensure_viewer_manifest(version: Dict[str, Any]) -> Dict[str, Any]:
    if version.get("viewer_manifest"):
        return version
    storage = get_r2_storage()
    content, content_type = await storage.get_file(version["bucket_type"], version["r2_key"])
    viewer_seed = await _prepare_viewer(content, version["original_filename"], version.get("content_type") or content_type)
    manifest = {"viewer_type": viewer_seed["viewer_type"]}
    uploaded_render_keys = []
    try:
        if viewer_seed["viewer_type"] == "pages":
            prefix = version["r2_key"].rsplit(".", 1)[0]
            pages = []
            for index, image in enumerate(viewer_seed["page_images"], start=1):
                key = f"{prefix}/viewer/page-{index}.png"
                rendered = await storage.upload_file(image, f"page-{index}.png", version["bucket_type"], "image/png", object_key=key, metadata={"kind": "supplier_training_page", "source": version["r2_key"]})
                if rendered.get("error"):
                    raise ValueError(rendered["error"])
                uploaded_render_keys.append(key)
                pages.append({"index": index, "r2_key": key})
            manifest.update({"page_count": len(pages), "pages": pages})
        else:
            manifest["duration_seconds"] = viewer_seed["duration_seconds"]
    except Exception:
        for key in uploaded_render_keys:
            await storage.delete_file(version["bucket_type"], key)
        raise
    await db.supplier_training_versions.update_one({"id": version["id"]}, {"$set": {"viewer_manifest": manifest, "viewer_prepared_at": _now()}})
    return {**version, "viewer_manifest": manifest}

async def training_viewer_for_supplier(relationship: Dict[str, Any], assignment_id: str) -> Optional[Dict[str, Any]]:
    version = await training_file_for_supplier(relationship, assignment_id)
    if not version:
        return None
    version = await _ensure_viewer_manifest(version)
    manifest = version["viewer_manifest"]
    storage = get_r2_storage()
    if manifest["viewer_type"] == "pages":
        progress = await db.supplier_training_progress.find_one(
            {"training_assignment_id": assignment_id, "supplier_relationship_id": relationship["id"]},
            {"_id": 0, "highest_page_index": 1},
        ) or {}
        return {"viewer_type": "pages", "page_count": manifest["page_count"], "highest_page_index": progress.get("highest_page_index", 0), "page_urls": [storage.generate_presigned_url(version["bucket_type"], page["r2_key"], expiration=900) for page in manifest["pages"]]}
    return {"viewer_type": manifest["viewer_type"], "duration_seconds": manifest["duration_seconds"], "asset_url": storage.generate_presigned_url(version["bucket_type"], version["r2_key"], expiration=900, response_content_disposition="inline")}

async def record_consumption_event(relationship: Dict[str, Any], assignment_id: str, event: Dict[str, Any], user_id: str) -> Optional[Dict[str, Any]]:
    assignment = await db.supplier_training_assignments.find_one({"id": assignment_id, "supplier_relationship_id": relationship["id"], "is_active": True}, {"_id": 0})
    if not assignment:
        return None
    version = await db.supplier_training_versions.find_one({"id": assignment["requirement_version_id"]}, {"_id": 0})
    manifest = (version or {}).get("viewer_manifest")
    if not manifest:
        raise ValueError("This legacy training must be republished for in-app viewing")
    existing = await db.supplier_training_progress.find_one({"training_assignment_id": assignment_id, "supplier_relationship_id": relationship["id"]}, {"_id": 0})
    current_percent = float((existing or {}).get("progress_percent", 0))
    highest_page_index = None
    if event["event_type"] == "page_view":
        if manifest["viewer_type"] != "pages" or event.get("unit_index") is None or not 1 <= event["unit_index"] <= manifest["page_count"]:
            raise ValueError("Invalid training page event")
        highest_page_index = max(int((existing or {}).get("highest_page_index") or 0), int(event["unit_index"]))
        percent = max(current_percent, round(highest_page_index / manifest["page_count"] * 100, 2))
    else:
        if manifest["viewer_type"] not in {"audio", "video"} or event.get("position_seconds") is None:
            raise ValueError("Invalid training media event")
        duration = manifest["duration_seconds"]
        percent = max(current_percent, round(min(max(event["position_seconds"], 0), duration) / duration * 100, 2))
    now = _now()
    await db.supplier_training_consumption_events.insert_one({"id": str(uuid.uuid4()), "training_assignment_id": assignment_id, "supplier_relationship_id": relationship["id"], "training_version_id": assignment["requirement_version_id"], "event_type": event["event_type"], "unit_index": event.get("unit_index"), "position_seconds": event.get("position_seconds"), "progress_percent": percent, "recorded_at": now, "recorded_by": user_id})
    return await update_progress(relationship, assignment_id, percent, user_id, highest_page_index)

async def training_status(org_id: str, requirement_id: str, reporting_period: Optional[str] = None) -> Optional[List[Dict[str, Any]]]:
    requirement = await db.supplier_training_requirements.find_one({"id": requirement_id, "organization_id": org_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not requirement: return None
    assignment_query = {"training_requirement_id": requirement_id, "organization_id": org_id, "is_active": True}
    if reporting_period:
        assignment_query["reporting_period"] = reporting_period
    assignments = await db.supplier_training_assignments.find(assignment_query, {"_id": 0}).to_list(1000)
    result=[]
    for assignment in assignments:
        relationship=await db.supplier_relationships.find_one({"id":assignment["supplier_relationship_id"],"customer_org_id":org_id},{"_id":0,"company_name":1})
        progress=await db.supplier_training_progress.find_one({"training_assignment_id":assignment["id"]},{"_id":0})
        if relationship: result.append({"supplier_relationship_id":assignment["supplier_relationship_id"],"supplier_name":relationship.get("company_name"),"assigned_at":assignment["assigned_at"],"progress_percent":(progress or {}).get("progress_percent",0),"status":(progress or {}).get("status","not_started"),"highest_page_index":(progress or {}).get("highest_page_index",0)})
    return result


async def assign_existing_trainings_to_supplier(org_id: str, relationship: Dict[str, Any], requirement_ids: List[str]) -> List[str]:
    """Create auditable assignments for selected existing trainings during supplier onboarding."""
    requirements = await db.supplier_training_requirements.find(
        {"id": {"$in": list(set(requirement_ids))}, "organization_id": org_id, "is_active": True, "is_deleted": {"$ne": True}}, {"_id": 0}
    ).to_list(1000)
    if len(requirements) != len(set(requirement_ids)):
        raise ValueError("One or more selected trainings are unavailable")
    created_ids = []
    for requirement in requirements:
        existing = await db.supplier_training_assignments.find_one(
            {"supplier_relationship_id": relationship["id"], "training_requirement_id": requirement["id"], "is_active": True}, {"_id": 0, "id": 1}
        )
        if existing:
            created_ids.append(existing["id"])
            continue
        assignment = {"id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"], "organization_id": org_id, "training_requirement_id": requirement["id"], "requirement_version_id": requirement["training_version_id"], "reporting_period": relationship.get("reporting_period"), "assigned_at": _now(), "is_active": True}
        await db.supplier_training_assignments.insert_one(assignment)
        created_ids.append(assignment["id"])
    return created_ids

async def update_training(org_id: str, requirement_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    requirement = await db.supplier_training_requirements.find_one(
        {"id": requirement_id, "organization_id": org_id, "is_deleted": {"$ne": True}}, {"_id": 0}
    )
    if not requirement:
        return None
    allowed_updates = {key: value for key, value in updates.items() if key in {"due_date", "is_active"}}
    if not allowed_updates:
        return requirement
    allowed_updates["updated_at"] = _now()
    await db.supplier_training_requirements.update_one({"id": requirement_id}, {"$set": allowed_updates})
    if "is_active" in allowed_updates:
        await db.supplier_training_assignments.update_many(
            {"training_requirement_id": requirement_id, "organization_id": org_id},
            {"$set": {"is_active": allowed_updates["is_active"]}},
        )
        relationships = await db.supplier_relationships.find(
            {"id": {"$in": await db.supplier_training_assignments.distinct("supplier_relationship_id", {"training_requirement_id": requirement_id, "organization_id": org_id})}},
            {"_id": 0, "id": 1},
        ).to_list(1000)
        for relationship in relationships:
            from modules.supplier_assessment.service import supplier_service
            await supplier_service._update_completion_status(relationship["id"])
    return await db.supplier_training_requirements.find_one({"id": requirement_id}, {"_id": 0})

async def archive_training(org_id: str, requirement_id: str) -> bool:
    training = await update_training(org_id, requirement_id, {"is_active": False})
    if not training:
        return False
    await db.supplier_training_requirements.update_one(
        {"id": requirement_id, "organization_id": org_id}, {"$set": {"is_deleted": True, "deleted_at": _now()}}
    )
    return True

async def ensure_indexes():
    await db.supplier_training_contents.create_index("id", unique=True)
    await db.supplier_training_versions.create_index("id", unique=True)
    await db.supplier_training_requirements.create_index([("organization_id", 1), ("is_active", 1)])
    await db.supplier_training_assignments.create_index([("supplier_relationship_id", 1), ("is_active", 1)])
    await db.supplier_training_progress.create_index([("training_assignment_id", 1), ("supplier_relationship_id", 1)], unique=True)
    await db.supplier_training_consumption_events.create_index([("training_assignment_id", 1), ("recorded_at", 1)])