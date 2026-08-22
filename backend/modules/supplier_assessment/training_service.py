"""Focused, version-aware supplier training content and progress service."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from r2_storage import get_r2_storage
from shared.database.mongo import db

TRAINING_BUCKET = "supplier_assessment"
TRAINING_FOLDER = "supplier-assessment/training"
ALLOWED_TYPES = {
    "application/pdf", "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "audio/mpeg", "audio/mp4", "audio/wav", "video/mp4", "video/webm",
}
MAX_TRAINING_SIZE = 250 * 1024 * 1024

def _now(): return datetime.now(timezone.utc).isoformat()

async def create_training(org_id: str, user_id: str, title: str, description: str, threshold: float, file_name: str, content_type: str, content: bytes, relationship_ids: List[str]):
    if not title.strip() or not 1 <= threshold <= 100: raise ValueError("Title and a threshold from 1 to 100 are required")
    if content_type not in ALLOWED_TYPES or not content or len(content) > MAX_TRAINING_SIZE: raise ValueError("Unsupported training file or file exceeds 250MB")
    relationships = await db.supplier_relationships.find({"id": {"$in": relationship_ids}, "customer_org_id": org_id, "is_active": True}, {"_id": 0, "id": 1}).to_list(1000)
    if len(relationships) != len(set(relationship_ids)): raise ValueError("One or more suppliers are not available to this organization")
    upload = await get_r2_storage().upload_file(content, file_name, TRAINING_BUCKET, content_type, folder=TRAINING_FOLDER, metadata={"uploaded_by": user_id, "kind": "supplier_training"})
    if upload.get("error"): raise ValueError(upload["error"])
    now, content_id, requirement_id, version_id = _now(), str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    content_doc = {"id": content_id, "organization_id": org_id, "title": title.strip(), "description": description or "", "created_by": user_id, "created_at": now}
    version = {"id": version_id, "training_content_id": content_id, "version_number": 1, "original_filename": file_name, "content_type": content_type, "file_size": len(content), "bucket_type": TRAINING_BUCKET, "r2_key": upload["key"], "created_by": user_id, "created_at": now}
    requirement = {"id": requirement_id, "organization_id": org_id, "training_content_id": content_id, "training_version_id": version_id, "completion_threshold": threshold, "title": title.strip(), "description": description or "", "is_active": True, "created_by": user_id, "created_at": now}
    await db.supplier_training_contents.insert_one(content_doc); await db.supplier_training_versions.insert_one(version); await db.supplier_training_requirements.insert_one(requirement)
    assignments=[]
    for relationship in relationships:
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
        if requirement and version: result.append({"assignment_id":assignment["id"],"title":requirement["title"],"description":requirement["description"],"completion_threshold":requirement["completion_threshold"],"version_number":version["version_number"],"content_type":version["content_type"],"assigned_at":assignment["assigned_at"],"progress_percent":(progress or {}).get("progress_percent",0),"status":(progress or {}).get("status","not_started")})
    return result

async def update_progress(relationship: Dict[str, Any], assignment_id: str, percent: float, user_id: str):
    assignment=await db.supplier_training_assignments.find_one({"id":assignment_id,"supplier_relationship_id":relationship["id"],"is_active":True},{"_id":0})
    if not assignment or not 0 <= percent <= 100: return None
    requirement=await db.supplier_training_requirements.find_one({"id":assignment["training_requirement_id"]},{"_id":0})
    status="completed" if percent >= requirement["completion_threshold"] else ("in_progress" if percent else "not_started")
    existing=await db.supplier_training_progress.find_one({"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"]},{"_id":0})
    now=_now(); progress={"id":(existing or {}).get("id",str(uuid.uuid4())),"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"],"training_version_id":assignment["requirement_version_id"],"progress_percent":percent,"status":status,"completed_at":now if status=="completed" else None,"updated_by":user_id,"updated_at":now}
    await db.supplier_training_progress.update_one({"training_assignment_id":assignment_id,"supplier_relationship_id":relationship["id"]},{"$set":progress},upsert=True); progress.pop("_id",None); return progress

async def training_file_for_supplier(relationship: Dict[str, Any], assignment_id: str) -> Optional[Dict[str, Any]]:
    assignment = await db.supplier_training_assignments.find_one({"id": assignment_id, "supplier_relationship_id": relationship["id"], "is_active": True}, {"_id": 0})
    if not assignment: return None
    return await db.supplier_training_versions.find_one({"id": assignment["requirement_version_id"]}, {"_id": 0})

async def ensure_indexes():
    await db.supplier_training_contents.create_index("id", unique=True)
    await db.supplier_training_versions.create_index("id", unique=True)
    await db.supplier_training_requirements.create_index([("organization_id", 1), ("is_active", 1)])
    await db.supplier_training_assignments.create_index([("supplier_relationship_id", 1), ("is_active", 1)])
    await db.supplier_training_progress.create_index([("training_assignment_id", 1), ("supplier_relationship_id", 1)], unique=True)