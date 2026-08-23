"""Focused, version-aware supplier training content and progress service."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from r2_storage import get_r2_storage
from shared.database.mongo import db
from modules.supplier_assessment.programs import get_or_create_program_revision, resolve_program_context
from modules.sustainability_config import service as sustainability_config_service

TRAINING_BUCKET = "supplier_assessment"
TRAINING_FOLDER = "supplier-assessment/training"
ALLOWED_TYPES = {
    "application/pdf", "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "audio/mpeg", "audio/mp4", "audio/wav", "video/mp4", "video/webm",
}
MAX_TRAINING_SIZE = 250 * 1024 * 1024

def _now(): return datetime.now(timezone.utc).isoformat()

async def create_training(org_id: str, user_id: str, title: str, description: str, threshold: float, file_name: str, content_type: str, content: bytes, relationship_ids: List[str], due_date: Optional[str] = None):
    threshold = 100.0
    if not title.strip(): raise ValueError("Title is required")
    if content_type not in ALLOWED_TYPES or not content or len(content) > MAX_TRAINING_SIZE: raise ValueError("Unsupported training file or file exceeds 250MB")
    organization_config = await sustainability_config_service.resolve_supplier_assessment_config(org_id)
    if not (organization_config.get("modules", {}).get("training") or {}).get("enabled"):
        raise ValueError("Enable the Training module in Organization Config before assigning training")
    relationships = await db.supplier_relationships.find({"id": {"$in": relationship_ids}, "customer_org_id": org_id, "is_active": True}, {"_id": 0, "id": 1}).to_list(1000)
    if len(relationships) != len(set(relationship_ids)): raise ValueError("One or more suppliers are not available to this organization")
    upload = await get_r2_storage().upload_file(content, file_name, TRAINING_BUCKET, content_type, folder=TRAINING_FOLDER, metadata={"uploaded_by": user_id, "kind": "supplier_training"})
    if upload.get("error"): raise ValueError(upload["error"])
    now, content_id, requirement_id, version_id = _now(), str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    content_doc = {"id": content_id, "organization_id": org_id, "title": title.strip(), "description": description or "", "created_by": user_id, "created_at": now}
    version = {"id": version_id, "training_content_id": content_id, "version_number": 1, "original_filename": file_name, "content_type": content_type, "file_size": len(content), "bucket_type": TRAINING_BUCKET, "r2_key": upload["key"], "created_by": user_id, "created_at": now}
    requirement = {"id": requirement_id, "organization_id": org_id, "training_content_id": content_id, "training_version_id": version_id, "completion_threshold": threshold, "title": title.strip(), "description": description or "", "due_date": due_date or None, "is_active": True, "is_deleted": False, "created_by": user_id, "created_at": now}
    await db.supplier_training_contents.insert_one(content_doc); await db.supplier_training_versions.insert_one(version); await db.supplier_training_requirements.insert_one(requirement)
    assignments=[]
    for relationship in relationships:
        context = await resolve_program_context(relationship)
        program_config = context["config"].copy()
        program_config["modules"] = {
            **program_config.get("modules", {}),
            "training": organization_config["modules"]["training"],
        }
        revision = await get_or_create_program_revision(org_id, program_config, user_id)
        await db.supplier_relationships.update_one({"id": relationship["id"]}, {"$set": {"assessment_program_id": revision["program_id"], "assessment_program_version": revision["version"], "training_completion_percent": 0.0, "updated_at": now}})
        assignment={"id":str(uuid.uuid4()),"supplier_relationship_id":relationship["id"],"organization_id":org_id,"training_requirement_id":requirement_id,"requirement_version_id":version_id,"assigned_at":now,"is_active":True}
        await db.supplier_training_assignments.insert_one(assignment); assignment.pop("_id",None); assignments.append(assignment)
    for doc in (content_doc, version, requirement): doc.pop("_id", None)
    return {"training": requirement, "version": version, "assignments": assignments}

async def supplier_trainings(relationship: Dict[str, Any]):
    assignments = await db.supplier_training_assignments.find({"supplier_relationship_id":relationship["id"],"is_active":True},{"_id":0}).to_list(200)
    result=[]
    for assignment in assignments:
        requirement=await db.supplier_training_requirements.find_one({"id":assignment["training_requirement_id"],"organization_id":relationship["customer_org_id"],"is_active":True},{"_id":0})
        version=await db.supplier_training_versions.find_one({"id":assignment["requirement_version_id"]},{"_id":0})
        progress=await db.supplier_training_progress.find_one({"supplier_relationship_id":relationship["id"],"training_assignment_id":assignment["id"]},{"_id":0})
        if requirement and version: result.append({"assignment_id":assignment["id"],"title":requirement["title"],"description":requirement["description"],"completion_threshold":requirement["completion_threshold"],"due_date":requirement.get("due_date"),"version_number":version["version_number"],"content_type":version["content_type"],"assigned_at":assignment["assigned_at"],"progress_percent":(progress or {}).get("progress_percent",0),"status":(progress or {}).get("status","not_started")})
    return result

async def update_progress(relationship: Dict[str, Any], assignment_id: str, percent: float, user_id: str):
    if not 0 <= percent <= 100:
        raise ValueError("Progress must be between 0 and 100")
    assignment=await db.supplier_training_assignments.find_one({"id":assignment_id,"supplier_relationship_id":relationship["id"],"is_active":True},{"_id":0})
    if not assignment: return None
    requirement=await db.supplier_training_requirements.find_one({"id":assignment["training_requirement_id"]},{"_id":0})
    status="completed" if percent >= requirement["completion_threshold"] else ("in_progress" if percent else "not_started")
    existing=await db.supplier_training_progress.find_one({"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"]},{"_id":0})
    now=_now(); progress={"id":(existing or {}).get("id",str(uuid.uuid4())),"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"],"training_version_id":assignment["requirement_version_id"],"progress_percent":percent,"status":status,"completed_at":now if status=="completed" else None,"updated_by":user_id,"updated_at":now}
    await db.supplier_training_progress.update_one({"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"]},{"$set":progress},upsert=True); progress.pop("_id",None); return progress

async def training_file_for_supplier(relationship: Dict[str, Any], assignment_id: str) -> Optional[Dict[str, Any]]:
    assignment = await db.supplier_training_assignments.find_one({"id": assignment_id, "supplier_relationship_id": relationship["id"], "is_active": True}, {"_id": 0})
    if not assignment: return None
    return await db.supplier_training_versions.find_one({"id": assignment["requirement_version_id"]}, {"_id": 0})

async def training_status(org_id: str, requirement_id: str) -> Optional[List[Dict[str, Any]]]:
    requirement = await db.supplier_training_requirements.find_one({"id": requirement_id, "organization_id": org_id, "is_deleted": {"$ne": True}}, {"_id": 0})
    if not requirement: return None
    assignments = await db.supplier_training_assignments.find({"training_requirement_id": requirement_id, "organization_id": org_id, "is_active": True}, {"_id": 0}).to_list(1000)
    result=[]
    for assignment in assignments:
        relationship=await db.supplier_relationships.find_one({"id":assignment["supplier_relationship_id"],"customer_org_id":org_id},{"_id":0,"company_name":1})
        progress=await db.supplier_training_progress.find_one({"training_assignment_id":assignment["id"]},{"_id":0})
        if relationship: result.append({"supplier_relationship_id":assignment["supplier_relationship_id"],"supplier_name":relationship.get("company_name"),"assigned_at":assignment["assigned_at"],"progress_percent":(progress or {}).get("progress_percent",0),"status":(progress or {}).get("status","not_started")})
    return result

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