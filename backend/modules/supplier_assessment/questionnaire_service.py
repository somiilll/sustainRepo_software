"""Questionnaire authoring, response, evidence, and manual-review operations."""
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from r2_storage import get_r2_storage
from shared.database.mongo import db
from modules.supplier_assessment.due_dates import validate_due_date
from modules.supplier_assessment.programs import resolve_program_context

# ========================================================================
# Questionnaire Management (Customer Admin)
# ========================================================================

async def create_questionnaire(
    self,
    organization_id: str,
    name: str,
    description: Optional[str],
    due_date: Optional[str],
    scoring_method: str,
    section_weights: Optional[Dict[str, float]],
    esg_section_weights: Optional[Dict[str, float]],
    overall_supplier_weights: Optional[Dict[str, float]],
    created_by: str,
    assignment_mode: str = "all",
    supplier_relationship_ids: Optional[List[str]] = None,
    assignment_reporting_period: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new questionnaire template."""
    validate_due_date(due_date)
    questionnaire_id = str(uuid.uuid4())
    esg_weights = self._validated_weight_config(
        esg_section_weights or section_weights,
        {"environment": 33.33, "social": 33.33, "governance": 33.34},
        "ESG category weights",
    )
    supplier_weights = self._validated_weight_config(
        overall_supplier_weights,
        {"esg": 40.0, "ghg": 40.0, "revenue": 20.0},
        "Overall component weights",
    )
    relationship_query = {"customer_org_id": organization_id, "is_active": True}
    if assignment_reporting_period:
        relationship_query["reporting_period"] = assignment_reporting_period
    eligible_relationships = [
        relationship for relationship in await db.supplier_relationships.find(
            relationship_query, {"_id": 0, "id": 1, "modules_enabled": 1}
        ).to_list(1000)
        if "esg" in (relationship.get("modules_enabled") or ["esg", "ghg"])
    ]
    eligible_ids = {relationship["id"] for relationship in eligible_relationships}
    requested_ids = list(dict.fromkeys(supplier_relationship_ids or []))
    if assignment_mode == "selected":
        if not requested_ids:
            raise ValueError("Select at least one supplier for this questionnaire")
        if set(requested_ids) - eligible_ids:
            raise ValueError("Selected supplier is unavailable for this ESG questionnaire")
        assigned_supplier_ids = requested_ids
    else:
        assigned_supplier_ids = [relationship["id"] for relationship in eligible_relationships]

    existing_questionnaire_ids = [
        item["id"] for item in await db.supplier_questionnaires.find(
            {"organization_id": organization_id, "is_active": True}, {"_id": 0, "id": 1}
        ).to_list(1000)
    ]
    questionnaire = {
        "id": questionnaire_id,
        "organization_id": organization_id,
        "name": name,
        "description": description,
        "due_date": due_date,
        "scoring_method": scoring_method or "question",
        "section_weights": esg_weights,
        "esg_section_weights": esg_weights,
        "overall_supplier_weights": supplier_weights,
        "assignment_mode": assignment_mode,
        "assigned_supplier_ids": assigned_supplier_ids,
        "assignment_reporting_period": assignment_reporting_period,
        "is_active": True,
        "is_deleted": False,
        "question_count": 0,
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.supplier_questionnaires.insert_one(questionnaire)
    # Freeze historic implicit assignments before applying the new questionnaire's targeting.
    legacy_relationships = await db.supplier_relationships.find(
        {"customer_org_id": organization_id, "is_active": True, "questionnaire_ids": {"$exists": False}},
        {"_id": 0, "id": 1},
    ).to_list(1000)
    if legacy_relationships:
        await db.supplier_relationships.update_many(
            {"id": {"$in": [relationship["id"] for relationship in legacy_relationships]}},
            {"$set": {"questionnaire_ids": existing_questionnaire_ids, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    if assigned_supplier_ids:
        await db.supplier_relationships.update_many(
            {"id": {"$in": assigned_supplier_ids}},
            {"$addToSet": {"questionnaire_ids": questionnaire_id}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return questionnaire

async def get_questionnaires(
    self,
    organization_id: str,
    include_inactive: bool = False,
) -> List[Dict[str, Any]]:
    """Get questionnaires for an organization, including inactive templates when requested by an admin."""
    query = {"organization_id": organization_id}
    if include_inactive:
        query["$or"] = [
            {"is_active": True},
            {"is_active": False, "is_deleted": False},
        ]
    else:
        query["is_active"] = True
        query["is_deleted"] = {"$ne": True}
    questionnaires = await db.supplier_questionnaires.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    for questionnaire in questionnaires:
        questionnaire["scoring_method"] = questionnaire.get("scoring_method") or "question"
    return questionnaires

async def get_questionnaire(self, questionnaire_id: str) -> Optional[Dict[str, Any]]:
    """Get single questionnaire with questions."""
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id},
        {"_id": 0}
    )
    if questionnaire:
        questionnaire["scoring_method"] = questionnaire.get("scoring_method") or "question"
        questions = await db.supplier_questions.find(
            {"questionnaire_id": questionnaire_id, "is_active": True},
            {"_id": 0}
        ).sort("order", 1).to_list(500)
        questionnaire["questions"] = questions
    return questionnaire

async def update_questionnaire(
    self,
    questionnaire_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update questionnaire."""
    existing = await self.get_questionnaire(questionnaire_id)
    if not existing:
        return None
    if "due_date" in updates:
        validate_due_date(updates["due_date"])
    if "esg_section_weights" in updates or "section_weights" in updates:
        updates["esg_section_weights"] = self._validated_weight_config(
            updates.get("esg_section_weights") or updates.get("section_weights"),
            {"environment": 33.33, "social": 33.33, "governance": 33.34},
            "ESG category weights",
        )
        updates["section_weights"] = updates["esg_section_weights"]
    if "overall_supplier_weights" in updates:
        updates["overall_supplier_weights"] = self._validated_weight_config(
            updates["overall_supplier_weights"],
            {"esg": 40.0, "ghg": 40.0, "revenue": 20.0},
            "Overall component weights",
        )
    if "is_active" in updates:
        updates["is_deleted"] = False
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.supplier_questionnaires.update_one(
        {"id": questionnaire_id},
        {"$set": updates}
    )
    return await self.get_questionnaire(questionnaire_id)


async def list_questionnaire_assignments(self, customer_org_id: str, questionnaire_id: str) -> Optional[Dict[str, Any]]:
    questionnaire = await db.supplier_questionnaires.find_one({"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True}, {"_id": 0})
    if not questionnaire:
        return None
    supplier_query = {"customer_org_id": customer_org_id, "is_active": True}
    if questionnaire.get("assignment_reporting_period"):
        supplier_query["reporting_period"] = questionnaire["assignment_reporting_period"]
    suppliers = await db.supplier_relationships.find(supplier_query, {"_id": 0, "id": 1, "company_name": 1, "questionnaire_ids": 1, "reporting_period": 1}).to_list(1000)
    assigned_ids = set(questionnaire.get("assigned_supplier_ids") or [])
    responses = await db.supplier_questionnaire_responses.find(
        {"questionnaire_id": questionnaire_id, "supplier_relationship_id": {"$in": [supplier["id"] for supplier in suppliers]}, "is_current": True}, {"_id": 0, "supplier_relationship_id": 1, "status": 1}
    ).to_list(1000)
    response_statuses = {response["supplier_relationship_id"]: response.get("status") for response in responses}
    rows = []
    for supplier in suppliers:
        is_assigned = supplier["id"] in assigned_ids or ("questionnaire_ids" in supplier and questionnaire_id in (supplier.get("questionnaire_ids") or []))
        status = response_statuses.get(supplier["id"], "not_started")
        rows.append({"supplier_relationship_id": supplier["id"], "supplier_name": supplier.get("company_name", "Supplier"), "is_assigned": is_assigned, "status": status, "can_unassign": is_assigned and status != "submitted"})
    return {"questionnaire_id": questionnaire_id, "assignments": rows}


async def assign_questionnaire_to_supplier(self, customer_org_id: str, questionnaire_id: str, supplier_relationship_id: str) -> None:
    questionnaire = await db.supplier_questionnaires.find_one({"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True}, {"_id": 0, "assigned_supplier_ids": 1})
    relationship = await db.supplier_relationships.find_one({"id": supplier_relationship_id, "customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1})
    if not questionnaire or not relationship:
        raise ValueError("Questionnaire or supplier is unavailable")
    now = datetime.now(timezone.utc).isoformat()
    await db.supplier_questionnaires.update_one({"id": questionnaire_id}, {"$addToSet": {"assigned_supplier_ids": supplier_relationship_id}, "$set": {"assignment_mode": "selected", "updated_at": now}})
    await db.supplier_relationships.update_one({"id": supplier_relationship_id}, {"$addToSet": {"questionnaire_ids": questionnaire_id}, "$set": {"updated_at": now}})


async def unassign_questionnaire_from_supplier(self, customer_org_id: str, questionnaire_id: str, supplier_relationship_id: str) -> None:
    response = await db.supplier_questionnaire_responses.find_one(
        {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "is_current": True, "status": "submitted"}, {"_id": 0, "id": 1}
    )
    if response:
        raise ValueError("A submitted questionnaire cannot be unassigned")
    questionnaire = await db.supplier_questionnaires.find_one({"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1})
    relationship = await db.supplier_relationships.find_one({"id": supplier_relationship_id, "customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "questionnaire_ids": 1})
    if not questionnaire or not relationship:
        raise ValueError("Questionnaire or supplier is unavailable")
    now = datetime.now(timezone.utc).isoformat()
    if "questionnaire_ids" not in relationship:
        active_ids = [item["id"] for item in await db.supplier_questionnaires.find({"organization_id": customer_org_id, "is_active": True, "id": {"$ne": questionnaire_id}}, {"_id": 0, "id": 1}).to_list(1000)]
        await db.supplier_relationships.update_one({"id": supplier_relationship_id}, {"$set": {"questionnaire_ids": active_ids, "updated_at": now}})
    else:
        await db.supplier_relationships.update_one({"id": supplier_relationship_id}, {"$pull": {"questionnaire_ids": questionnaire_id}, "$set": {"updated_at": now}})
    await db.supplier_questionnaires.update_one({"id": questionnaire_id}, {"$pull": {"assigned_supplier_ids": supplier_relationship_id}, "$set": {"assignment_mode": "selected", "updated_at": now}})

async def delete_questionnaire(self, questionnaire_id: str) -> bool:
    """Soft delete questionnaire."""
    result = await db.supplier_questionnaires.update_one(
        {"id": questionnaire_id},
        {"$set": {"is_active": False, "is_deleted": True, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return result.modified_count > 0

async def duplicate_questionnaire(
    self,
    questionnaire_id: str,
    new_name: str,
    created_by: str,
) -> Optional[Dict[str, Any]]:
    """Duplicate a questionnaire with all questions."""
    original = await self.get_questionnaire(questionnaire_id)
    if not original:
        return None
    
    # Create new questionnaire
    new_questionnaire = await self.create_questionnaire(
        organization_id=original["organization_id"],
        name=new_name,
        description=original.get("description"),
        due_date=original.get("due_date"),
        scoring_method=original.get("scoring_method", "question"),
        section_weights=original.get("section_weights"),
        esg_section_weights=original.get("esg_section_weights"),
        overall_supplier_weights=original.get("overall_supplier_weights"),
        created_by=created_by,
    )
    
    # Copy questions
    for q in original.get("questions", []):
        await self.add_question(
            questionnaire_id=new_questionnaire["id"],
            question_text=q["question_text"],
            description=q.get("description"),
            response_type=q["response_type"],
            options=q.get("options"),
            required=q.get("required", True),
            evidence_requirement=q.get("evidence_requirement", "not_required"),
            weight=q.get("weight", 1.0),
            importance=q.get("importance"),
            exact_numerical_weight=q.get("exact_numerical_weight"),
            category=q["category"],
            order=q.get("order", 0),
            scoring=q.get("scoring"),
        )
    
    return await self.get_questionnaire(new_questionnaire["id"])

# ========================================================================
# Question Management
# ========================================================================

async def add_question(
    self,
    questionnaire_id: str,
    question_text: str,
    description: Optional[str],
    response_type: str,
    options: Optional[List[Dict[str, Any]]],
    required: bool,
    evidence_requirement: str,
    weight: Optional[float],
    importance: Optional[str],
    exact_numerical_weight: Optional[float],
    category: str,
    order: int,
    scoring: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Add a question to a questionnaire."""
    question_id = str(uuid.uuid4())
    importance, exact_numerical_weight, effective_weight = self._resolve_question_weight(
        importance, exact_numerical_weight, weight
    )
    scoring = self._synchronize_choice_mapping(scoring, options)
    question = {
        "id": question_id,
        "questionnaire_id": questionnaire_id,
        "question_text": question_text,
        "description": description,
        "response_type": response_type,
        "options": options,
        "required": required,
        "evidence_requirement": self._question_evidence_requirement(evidence_requirement),
        "weight": effective_weight,
        "importance": importance,
        "exact_numerical_weight": exact_numerical_weight,
        "category": category,
        "order": order,
        "scoring": scoring,  # New: Scoring configuration
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.supplier_questions.insert_one(question)
    
    # Update question count
    await db.supplier_questionnaires.update_one(
        {"id": questionnaire_id},
        {"$inc": {"question_count": 1}}
    )
    
    return question

async def update_question(
    self,
    question_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update a question."""
    existing = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if not existing:
        return None
    if {"importance", "exact_numerical_weight", "weight"}.intersection(updates):
        importance, exact_weight, effective_weight = self._resolve_question_weight(
            updates.get("importance", existing.get("importance")),
            updates.get("exact_numerical_weight", existing.get("exact_numerical_weight")),
            updates.get("weight", existing.get("weight")),
        )
        updates.update({
            "importance": importance,
            "exact_numerical_weight": exact_weight,
            "weight": effective_weight,
        })
    if "scoring" in updates or "options" in updates:
        updates["scoring"] = self._synchronize_choice_mapping(
            updates.get("scoring", existing.get("scoring")),
            updates.get("options", existing.get("options")),
        )
    if "evidence_requirement" in updates:
        updates["evidence_requirement"] = self._question_evidence_requirement(updates["evidence_requirement"])
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.supplier_questions.update_one(
        {"id": question_id},
        {"$set": updates}
    )
    updated_question = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if updated_question and ("scoring" in updates or "options" in updates or {"importance", "exact_numerical_weight", "weight"}.intersection(updates)):
        from modules.supplier_assessment.scoring import ScoringEngine
        await ScoringEngine(db).recalculate_all_suppliers(updated_question["questionnaire_id"])
    return updated_question

async def delete_question(self, question_id: str) -> bool:
    """Soft delete a question."""
    question = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if not question:
        return False
    
    result = await db.supplier_questions.update_one(
        {"id": question_id},
        {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count > 0:
        await db.supplier_questionnaires.update_one(
            {"id": question["questionnaire_id"]},
            {"$inc": {"question_count": -1}}
        )
    
    return result.modified_count > 0

async def reorder_questions(
    self,
    questionnaire_id: str,
    question_orders: List[Dict[str, Any]],  # [{"id": "...", "order": 1}, ...]
) -> bool:
    """Reorder questions in a questionnaire."""
    for item in question_orders:
        await db.supplier_questions.update_one(
            {"id": item["id"], "questionnaire_id": questionnaire_id},
            {"$set": {"order": item["order"]}}
        )
    return True

# ========================================================================
# Supplier Response Management
# ========================================================================

async def _current_questionnaire_response(self, questionnaire_id: str, supplier_relationship_id: str, reporting_period: Optional[str] = None) -> Optional[Dict[str, Any]]:
    query = {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "is_current": True}
    if reporting_period:
        query["reporting_period"] = reporting_period
    response = await db.supplier_questionnaire_responses.find_one(
        query,
        {"_id": 0}, sort=[("revision", -1)],
    )
    if response:
        return response
    legacy_query = {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "is_current": {"$exists": False}}
    if reporting_period:
        legacy_query["reporting_period"] = {"$exists": False}
    return await db.supplier_questionnaire_responses.find_one(
        legacy_query,
        {"_id": 0}, sort=[("submitted_at", -1)],
    )

async def get_supplier_questionnaire_status(
    self,
    supplier_org_id: str,
    customer_org_id: str,
) -> List[Dict[str, Any]]:
    """Get questionnaire status for a supplier."""
    # Get relationship
    relationship = await db.supplier_relationships.find_one(
        {
            "supplier_org_id": supplier_org_id,
            "customer_org_id": customer_org_id,
            "is_active": True,
        },
        {"_id": 0}
    )
    if not relationship:
        return []
    
    # Relationships created before explicit assignment retain legacy access to all active questionnaires.
    questionnaire_query = {"organization_id": customer_org_id, "is_active": True}
    if "questionnaire_ids" in relationship:
        questionnaire_query["id"] = {"$in": relationship.get("questionnaire_ids") or []}
    questionnaires = await db.supplier_questionnaires.find(
        questionnaire_query,
        {"_id": 0}
    ).to_list(100)
    
    statuses = []
    for q in questionnaires:
        # Get response status
        response_doc = await self._current_questionnaire_response(q["id"], relationship["id"], relationship.get("reporting_period"))
        
        # Count questions
        total_questions = await db.supplier_questions.count_documents(
            {"questionnaire_id": q["id"], "is_active": True}
        )
        
        answered_count = 0
        status = "not_started"
        completion_percent = 0.0
        calculated_score = None
        submitted_at = None
        
        if response_doc:
            answers = response_doc.get("answers", {})
            answered_count = len([a for a in answers.values() if a is not None])
            status = response_doc.get("status", "in_progress")
            submitted_at = response_doc.get("submitted_at")
            calculated_score = response_doc.get("calculated_score")
            
            if total_questions > 0:
                completion_percent = (answered_count / total_questions) * 100
        
        statuses.append({
            "questionnaire_id": q["id"],
            "questionnaire_name": q["name"],
            "supplier_relationship_id": relationship["id"],
            "status": status,
            "completion_percent": round(completion_percent, 1),
            "answered_count": answered_count,
            "total_questions": total_questions,
            "calculated_score": calculated_score,
            "submitted_at": submitted_at,
            "due_date": q.get("due_date") or relationship.get("due_date"),
        })
    
    return statuses

async def get_questionnaire_for_supplier(
    self,
    questionnaire_id: str,
    supplier_relationship_id: str,
) -> Optional[Dict[str, Any]]:
    """Get questionnaire with supplier's answers."""
    questionnaire = await self.get_questionnaire(questionnaire_id)
    if not questionnaire:
        return None
    
    # Get supplier's responses
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship or ("questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", [])):
        return None
    response_doc = await self._current_questionnaire_response(questionnaire_id, supplier_relationship_id, (relationship or {}).get("reporting_period"))
    
    answers = response_doc.get("answers", {}) if response_doc else {}
    evidence_by_question = response_doc.get("question_evidence", {}) if response_doc else {}
    
    # Merge answers into questions
    for q in questionnaire.get("questions", []):
        q["answer"] = answers.get(q["id"])
        q["evidence_requirement"] = self._question_evidence_requirement(q.get("evidence_requirement"))
        q["evidence_files"] = await self._question_evidence_metadata(
            supplier_relationship_id, questionnaire_id, q["id"], evidence_by_question.get(q["id"], [])
        )
    
    questionnaire["response_status"] = response_doc.get("status", "not_started") if response_doc else "not_started"
    questionnaire["submitted_at"] = response_doc.get("submitted_at") if response_doc else None
    questionnaire["reopened_at"] = response_doc.get("reopened_at") if response_doc else None
    
    return questionnaire

async def _question_evidence_metadata(
    self, supplier_relationship_id: str, questionnaire_id: str, question_id: str, evidence_ids: List[str]
) -> List[Dict[str, Any]]:
    if not evidence_ids:
        return []
    records = await db.supplier_question_evidence.find(
        {"id": {"$in": evidence_ids}, "supplier_relationship_id": supplier_relationship_id,
         "questionnaire_id": questionnaire_id, "question_id": question_id, "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "original_filename": 1, "content_type": 1, "file_size": 1, "uploaded_at": 1},
    ).to_list(100)
    by_id = {record["id"]: record for record in records}
    return [by_id[evidence_id] for evidence_id in evidence_ids if evidence_id in by_id]

async def upload_supplier_question_evidence(
    self, relationship: Dict[str, Any], questionnaire_id: str, question_id: str,
    filename: str, content_type: str, content: bytes, uploaded_by: str,
) -> Dict[str, Any]:
    questionnaire = await self.get_questionnaire(questionnaire_id)
    if not questionnaire or questionnaire.get("organization_id") != relationship["customer_org_id"]:
        raise ValueError("Questionnaire not found")
    if "questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", []):
        raise ValueError("Questionnaire is not assigned to this supplier")
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True}, {"_id": 0, "id": 1}
    )
    if not question:
        raise ValueError("Question not found")
    if not content or len(content) > self.MAX_QUESTION_EVIDENCE_SIZE:
        raise ValueError("Evidence files must be no larger than 5MB")
    if content_type not in self.QUESTION_EVIDENCE_CONTENT_TYPES:
        raise ValueError("Unsupported evidence file type")
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    response_doc = await self._current_questionnaire_response(questionnaire_id, relationship["id"], reporting_period)
    if response_doc and response_doc.get("status") == "submitted":
        raise ValueError("Questionnaire already submitted and locked")
    organization = await db.organizations.find_one(
        {"id": relationship["customer_org_id"]}, {"_id": 0, "name": 1, "organization_name": 1}
    ) or {}
    upload = await get_r2_storage().upload_file(
        content, filename, self.QUESTION_EVIDENCE_BUCKET, content_type,
        folder=self.QUESTION_EVIDENCE_FOLDER,
        metadata={"uploaded_by": uploaded_by, "kind": "supplier_question_evidence", "question_id": question_id},
        org_name=organization.get("organization_name") or organization.get("name"),
    )
    if upload.get("error"):
        raise ValueError(upload["error"])
    now = datetime.now(timezone.utc).isoformat()
    evidence = {
        "id": str(uuid.uuid4()), "supplier_relationship_id": relationship["id"],
        "supplier_org_id": relationship["supplier_org_id"], "customer_org_id": relationship["customer_org_id"],
        "questionnaire_id": questionnaire_id, "question_id": question_id, "reporting_period": reporting_period,
        "original_filename": filename, "content_type": content_type, "file_size": len(content),
        "bucket_type": self.QUESTION_EVIDENCE_BUCKET, "r2_key": upload["key"], "uploaded_by": uploaded_by,
        "uploaded_at": now, "is_deleted": False,
    }
    await db.supplier_question_evidence.insert_one(evidence)
    if not response_doc:
        response_doc = {
            "id": str(uuid.uuid4()), "questionnaire_id": questionnaire_id, "supplier_relationship_id": relationship["id"],
            "supplier_org_id": relationship["supplier_org_id"], "answers": {}, "question_evidence": {},
            "status": "in_progress", "reporting_period": reporting_period, "revision": 1, "is_current": True,
            "parent_visible": False, "data_verified": False, "created_at": now, "updated_at": now,
        }
        await db.supplier_questionnaire_responses.insert_one(response_doc)
    question_evidence = dict(response_doc.get("question_evidence") or {})
    question_evidence[question_id] = [*question_evidence.get(question_id, []), evidence["id"]]
    await db.supplier_questionnaire_responses.update_one(
        {"id": response_doc["id"]}, {"$set": {"question_evidence": question_evidence, "updated_at": now}}
    )
    return {key: value for key, value in evidence.items() if key in {"id", "original_filename", "content_type", "file_size", "uploaded_at"}}

async def get_question_evidence_file(
    self, relationship: Dict[str, Any], questionnaire_id: str, question_id: str, evidence_id: str,
    parent_visible_only: bool = False,
) -> Optional[Dict[str, Any]]:
    response = await self._current_questionnaire_response(
        questionnaire_id, relationship["id"], relationship.get("reporting_period")
    )
    if parent_visible_only:
        response = await db.supplier_questionnaire_responses.find_one(
            {"questionnaire_id": questionnaire_id, "supplier_relationship_id": relationship["id"],
             "reporting_period": relationship.get("reporting_period"), "status": "submitted", "parent_visible": {"$ne": False}},
            {"_id": 0}, sort=[("revision", -1)],
        )
    evidence_ids = ((response or {}).get("question_evidence") or {}).get(question_id, [])
    if evidence_id not in evidence_ids:
        return None
    return await db.supplier_question_evidence.find_one(
        {"id": evidence_id, "supplier_relationship_id": relationship["id"], "questionnaire_id": questionnaire_id,
         "question_id": question_id, "is_deleted": {"$ne": True}}, {"_id": 0}
    )

async def submit_supplier_answers(
    self,
    questionnaire_id: str,
    supplier_relationship_id: str,
    supplier_org_id: str,
    answers: List[Dict[str, Any]],
    is_draft: bool,
    data_verified: bool = False,
    verified_by: Optional[str] = None,
) -> Dict[str, Any]:
    """Submit or save draft answers."""
    # Check if response doc exists
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship or ("questionnaire_ids" in relationship and questionnaire_id not in relationship.get("questionnaire_ids", [])):
        raise ValueError("Questionnaire is not assigned to this supplier")
    reporting_period = (relationship or {}).get("reporting_period") or self._default_reporting_period()
    response_doc = await self._current_questionnaire_response(questionnaire_id, supplier_relationship_id, reporting_period)
    if response_doc and response_doc.get("status") == "submitted":
        raise ValueError("Questionnaire already submitted and locked")
    
    # Build answers dict
    answers_dict = {}
    question_evidence = {}
    if response_doc:
        answers_dict = response_doc.get("answers", {})
        question_evidence = response_doc.get("question_evidence", {})
    
    for answer in answers:
        answers_dict[answer["question_id"]] = answer["answer"]
    
    status = "in_progress" if is_draft else "submitted"
    submitted_at = None if is_draft else datetime.now(timezone.utc).isoformat()
    if not is_draft and not data_verified:
        raise ValueError("Confirm that the submitted data has been reviewed and verified")
    if not is_draft:
        required_questions = await db.supplier_questions.find(
            {"questionnaire_id": questionnaire_id, "is_active": True, "evidence_requirement": "required"},
            {"_id": 0, "id": 1, "question_text": 1},
        ).to_list(500)
        missing_evidence = [question.get("question_text", "Question") for question in required_questions if not question_evidence.get(question["id"])]
        if missing_evidence:
            raise ValueError(f"Evidence is required for: {', '.join(missing_evidence[:3])}")
    
    # Calculate score if submitting
    calculated_score = None
    if not is_draft:
        calculated_score, score_breakdown = await self._calculate_questionnaire_score(
            questionnaire_id, answers_dict, supplier_relationship_id
        )
    else:
        score_breakdown = None
    
    if response_doc:
        # Update existing
        update_data = {
            "answers": answers_dict,
            "question_evidence": question_evidence,
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if submitted_at:
            update_data.update({
                "submitted_at": submitted_at,
                "parent_visible": True,
                "data_verified": True,
                "data_verified_at": submitted_at,
                "data_verified_by": verified_by,
            })
            await db.supplier_questionnaire_responses.update_many(
                {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "id": {"$ne": response_doc["id"]}, "parent_visible": True},
                {"$set": {"parent_visible": False, "replaced_at": submitted_at}},
            )
        if calculated_score is not None:
            update_data["calculated_score"] = calculated_score
            update_data["score_breakdown"] = score_breakdown
        
        await db.supplier_questionnaire_responses.update_one(
            {"id": response_doc["id"]},
            {"$set": update_data}
        )
    else:
        # Create new
        response_id = str(uuid.uuid4())
        new_doc = {
            "id": response_id,
            "questionnaire_id": questionnaire_id,
            "supplier_relationship_id": supplier_relationship_id,
            "supplier_org_id": supplier_org_id,
            "answers": answers_dict,
            "question_evidence": question_evidence,
            "status": status,
            "calculated_score": calculated_score,
            "score_breakdown": score_breakdown,
            "reporting_period": reporting_period,
            "submitted_at": submitted_at,
            "revision": 1,
            "is_current": True,
            "parent_visible": not is_draft,
            "data_verified": bool(data_verified) if not is_draft else False,
            "data_verified_at": submitted_at,
            "data_verified_by": verified_by if not is_draft else None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.supplier_questionnaire_responses.insert_one(new_doc)
    
    # Update completion status
    canonical_score = None
    if not is_draft:
        canonical_score = await self.refresh_supplier_canonical_score(supplier_relationship_id)
    await self._update_completion_status(supplier_relationship_id)
    
    return {
        "status": status,
        "calculated_score": calculated_score,
        "canonical_score": canonical_score,
        "message": "Answers saved" if is_draft else "Questionnaire submitted",
    }

async def _calculate_questionnaire_score(
    self,
    questionnaire_id: str,
    answers: Dict[str, Any],
    supplier_relationship_id: Optional[str] = None,
) -> tuple[float, Optional[Dict[str, Any]]]:
    """
    Calculate questionnaire score using the new unified scoring engine.
    
    The new engine supports per-question scoring rules:
    - higher_is_better: Linear scale (e.g., renewable energy %)
    - lower_is_better: Inverted scale (e.g., emissions)
    - boolean: Yes/No mapping
    - choice_mapping: Map choices to scores
    - manual: Requires human review
    
    Falls back to legacy scoring for backward compatibility.
    """
    from modules.supplier_assessment.scoring import ScoringEngine
    
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id},
        {"_id": 0}
    )
    if not questionnaire:
        return 0.0, None
    
    questions = await db.supplier_questions.find(
        {"questionnaire_id": questionnaire_id, "is_active": True},
        {"_id": 0}
    ).to_list(500)
    
    # Check if any question has the new scoring config
    has_new_scoring = any(q.get("scoring") for q in questions)
    
    if has_new_scoring:
        # Use new scoring engine
        engine = ScoringEngine(db)
        
        # Get supplier info for full calculation
        revenue_percentage = None
        supplier_name = None
        if supplier_relationship_id:
            relationship = await db.supplier_relationships.find_one(
                {"id": supplier_relationship_id},
                {"_id": 0, "revenue_percentage": 1, "company_name": 1}
            )
            if relationship:
                revenue_percentage = relationship.get("revenue_percentage")
                supplier_name = relationship.get("company_name")
        
        try:
            breakdown = await engine.calculate_supplier_assessment(
                supplier_relationship_id=supplier_relationship_id or "unknown",
                questionnaire_id=questionnaire_id,
                save_to_db=False,
                answers_override=answers,
                manual_scores_override={},
                reporting_period=(await self.get_supplier(supplier_relationship_id) if supplier_relationship_id else {}).get("reporting_period") if supplier_relationship_id else None,
            )
            return breakdown.esg_score.overall_score, breakdown.model_dump()
        except Exception as e:
            # Log error and fall back to legacy
            print(f"New scoring engine error: {e}, falling back to legacy")
    
    # Legacy scoring for backward compatibility
    return await self._calculate_legacy_score(questionnaire, questions, answers), None

async def _calculate_legacy_score(
    self,
    questionnaire: Dict[str, Any],
    questions: List[Dict[str, Any]],
    answers: Dict[str, Any],
) -> float:
    """
    Legacy scoring method for backward compatibility.
    Used when questions don't have the new scoring config.
    """
    scoring_method = questionnaire.get("scoring_method", "question")
    section_weights = questionnaire.get("section_weights", {})
    
    if scoring_method == "section":
        # Section-based scoring
        section_scores = {"environment": [], "social": [], "governance": []}
        
        for q in questions:
            answer = answers.get(q["id"])
            if answer is None:
                continue
            
            score = self._get_legacy_answer_score(q, answer)
            category = q.get("category", "environment")
            if category in section_scores:
                section_scores[category].append(score)
        
        # Calculate weighted average
        total_score = 0.0
        total_weight = 0.0
        
        for section, scores in section_scores.items():
            if scores:
                section_avg = sum(scores) / len(scores)
                weight = section_weights.get(section, 33.33)
                total_score += section_avg * weight
                total_weight += weight
        
        return round(total_score / total_weight, 2) if total_weight > 0 else 0.0
    
    else:
        # Question-level scoring
        total_score = 0.0
        total_weight = 0.0
        
        for q in questions:
            answer = answers.get(q["id"])
            if answer is None:
                continue
            
            weight = q.get("weight", 1.0)
            score = self._get_legacy_answer_score(q, answer)
            total_score += score * weight
            total_weight += weight
        
        return round(total_score / total_weight, 2) if total_weight > 0 else 0.0

def _get_legacy_answer_score(self, question: Dict[str, Any], answer: Any) -> float:
    """
    Legacy scoring for backward compatibility.
    Get score for an answer based on question type.
    """
    response_type = question.get("response_type", "text")
    
    if response_type == "yes_no":
        # Yes = 100, No = 0
        if isinstance(answer, bool):
            return 100.0 if answer else 0.0
        if isinstance(answer, str):
            return 100.0 if answer.lower() in ["yes", "true", "1"] else 0.0
        return 0.0
    
    elif response_type == "dropdown":
        # Look for score in options
        options = question.get("options", [])
        for opt in options:
            if opt.get("value") == answer and opt.get("score") is not None:
                return float(opt["score"])
        # Default: first option = 100, last = 0
        if options:
            for i, opt in enumerate(options):
                if opt.get("value") == answer:
                    return 100.0 - (i * (100.0 / max(len(options) - 1, 1)))
        return 0.0
    
    elif response_type == "numeric":
        # Numeric scores can be 0-100 directly or need normalization
        try:
            return min(100.0, max(0.0, float(answer)))
        except (ValueError, TypeError):
            return 0.0
    
    else:  # text
        # Text answers get full score if answered
        return 100.0 if answer else 0.0

# ========================================================================
# Customer Admin: View Supplier Responses
# ========================================================================

async def get_supplier_responses_for_admin(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
) -> Optional[Dict[str, Any]]:
    """Admin views a supplier's questionnaire responses."""
    questionnaire = await self.get_questionnaire(questionnaire_id)
    if not questionnaire:
        return None
    
    relationship = await self.get_supplier(supplier_relationship_id)
    response_doc = await db.supplier_questionnaire_responses.find_one(
        {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "reporting_period": (relationship or {}).get("reporting_period"), "status": "submitted", "parent_visible": {"$ne": False}},
        {"_id": 0}, sort=[("revision", -1)],
    )
    if not response_doc:
        return None
    
    answers = response_doc.get("answers", {}) if response_doc else {}
    
    # Merge answers into questions
    manual_question_scores = response_doc.get("manual_question_scores", {})
    for q in questionnaire.get("questions", []):
        q["answer"] = answers.get(q["id"])
        q["evidence_requirement"] = self._question_evidence_requirement(q.get("evidence_requirement"))
        q["evidence_files"] = await self._question_evidence_metadata(
            supplier_relationship_id, questionnaire_id, q["id"], (response_doc.get("question_evidence") or {}).get(q["id"], [])
        )
        manual_entry = manual_question_scores.get(q["id"])
        q["manual_score"] = manual_entry.get("score") if isinstance(manual_entry, dict) else manual_entry
        q["manual_score_note"] = manual_entry.get("note") if isinstance(manual_entry, dict) else None
    
    questionnaire["response_status"] = response_doc.get("status", "not_started") if response_doc else "not_started"
    questionnaire["calculated_score"] = response_doc.get("calculated_score") if response_doc else None
    questionnaire["manual_score"] = response_doc.get("manual_score") if response_doc else None
    questionnaire["manual_score_note"] = response_doc.get("manual_score_note") if response_doc else None
    questionnaire["submitted_at"] = response_doc.get("submitted_at") if response_doc else None
    questionnaire["score_breakdown"] = response_doc.get("score_breakdown") if response_doc else None
    questionnaire["canonical_score_snapshot"] = (relationship or {}).get("canonical_score_snapshot")
    
    return questionnaire

async def get_questionnaire_submissions_for_admin(
    self,
    customer_org_id: str,
    questionnaire_id: str,
    reporting_period: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    questionnaire = await db.supplier_questionnaires.find_one(
        {"id": questionnaire_id, "organization_id": customer_org_id, "is_active": True},
        {"_id": 0, "id": 1, "name": 1},
    )
    if not questionnaire:
        return None
    query: Dict[str, Any] = {
        "questionnaire_id": questionnaire_id,
        "status": "submitted",
        "parent_visible": {"$ne": False},
    }
    if reporting_period:
        query["reporting_period"] = reporting_period
    responses = await db.supplier_questionnaire_responses.find(
        query,
        {"_id": 0, "supplier_relationship_id": 1, "submitted_at": 1, "calculated_score": 1, "manual_question_scores": 1},
    ).sort("submitted_at", -1).to_list(1000)
    supplier_ids = [response["supplier_relationship_id"] for response in responses]
    suppliers = await db.supplier_relationships.find(
        {"id": {"$in": supplier_ids}, "customer_org_id": customer_org_id, "is_active": True},
        {"_id": 0, "id": 1, "company_name": 1},
    ).to_list(1000)
    supplier_names = {supplier["id"]: supplier.get("company_name") for supplier in suppliers}
    submissions = [
        {
            "supplier_id": response["supplier_relationship_id"],
            "supplier_name": supplier_names.get(response["supplier_relationship_id"], "Supplier"),
            "submitted_at": response.get("submitted_at"),
            "calculated_score": response.get("calculated_score"),
            "manual_question_count": len(response.get("manual_question_scores") or {}),
        }
        for response in responses
        if response["supplier_relationship_id"] in supplier_names
    ]
    return {"questionnaire_id": questionnaire["id"], "questionnaire_name": questionnaire["name"], "submissions": submissions}

async def set_manual_questionnaire_score(self, supplier_relationship_id: str, questionnaire_id: str, score: float, note: Optional[str], scored_by: str) -> Optional[Dict[str, Any]]:
    relationship = await self.get_supplier(supplier_relationship_id)
    response = await db.supplier_questionnaire_responses.find_one(
        {"supplier_relationship_id": supplier_relationship_id, "questionnaire_id": questionnaire_id, "reporting_period": (relationship or {}).get("reporting_period"), "status": "submitted", "parent_visible": {"$ne": False}}, {"_id": 0}, sort=[("revision", -1)]
    )
    if not response:
        return None
    now = datetime.now(timezone.utc).isoformat()
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]}, {"$set": {"manual_score": score, "manual_score_note": note, "manual_scored_by": scored_by, "manual_scored_at": now}}
    )
    await self.refresh_supplier_canonical_score(supplier_relationship_id)
    return {"questionnaire_id": questionnaire_id, "manual_score": score, "manual_score_note": note, "manual_scored_at": now}

async def set_manual_question_score(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
    question_id: str,
    score: float,
    note: Optional[str],
    scored_by: str,
) -> Optional[Dict[str, Any]]:
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        return None
    question = await db.supplier_questions.find_one(
        {"id": question_id, "questionnaire_id": questionnaire_id, "is_active": True},
        {"_id": 0, "id": 1, "scoring": 1},
    )
    if not question:
        raise ValueError("Question not found")
    if (question.get("scoring") or {}).get("rule") != "manual":
        raise ValueError("Only questions marked as Manual Review can be manually scored.")
    response = await db.supplier_questionnaire_responses.find_one(
        {
            "supplier_relationship_id": supplier_relationship_id,
            "questionnaire_id": questionnaire_id,
            "reporting_period": relationship.get("reporting_period"),
            "status": "submitted",
            "parent_visible": {"$ne": False},
        },
        {"_id": 0},
        sort=[("revision", -1)],
    )
    if not response:
        return None
    answer = (response.get("answers") or {}).get(question_id)
    if answer is None or answer == "":
        raise ValueError("A supplier response is required before this question can be scored")
    now = datetime.now(timezone.utc).isoformat()
    manual_scores = dict(response.get("manual_question_scores") or {})
    manual_scores[question_id] = {"score": float(score), "note": note, "scored_by": scored_by, "scored_at": now}
    await db.supplier_questionnaire_responses.update_one(
        {"id": response["id"]},
        {
            "$set": {"manual_question_scores": manual_scores, "updated_at": now},
            "$unset": {"manual_score": "", "manual_score_note": "", "manual_scored_by": "", "manual_scored_at": ""},
        },
    )
    from modules.supplier_assessment.scoring import ScoringEngine
    breakdown = await ScoringEngine(db).calculate_supplier_assessment(
        supplier_relationship_id=supplier_relationship_id,
        questionnaire_id=questionnaire_id,
        save_to_db=True,
        reporting_period=relationship.get("reporting_period"),
    )
    return {
        "questionnaire_id": questionnaire_id,
        "question_id": question_id,
        "manual_score": manual_scores[question_id],
        "calculated_score": breakdown.esg_score.overall_score,
        "score_breakdown": breakdown.model_dump(),
    }

async def reopen_questionnaire(
    self,
    supplier_relationship_id: str,
    questionnaire_id: str,
    reopened_by: Optional[str] = None,
) -> bool:
    """Create a private draft revision while preserving the parent-visible submission."""
    relationship = await self.get_supplier(supplier_relationship_id)
    reporting_period = (relationship or {}).get("reporting_period") or self._default_reporting_period()
    visible_response = await db.supplier_questionnaire_responses.find_one(
        {"questionnaire_id": questionnaire_id, "supplier_relationship_id": supplier_relationship_id, "reporting_period": reporting_period, "status": "submitted", "parent_visible": {"$ne": False}},
        {"_id": 0}, sort=[("revision", -1)],
    )
    if not visible_response:
        return False
    current = await self._current_questionnaire_response(questionnaire_id, supplier_relationship_id, reporting_period)
    if current and current.get("status") != "submitted":
        return False
    if current and current.get("id") != visible_response.get("id"):
        return False
    now = datetime.now(timezone.utc).isoformat()
    if current:
        await db.supplier_questionnaire_responses.update_one({"id": current["id"]}, {"$set": {"is_current": False}})
    revision = int(visible_response.get("revision") or 1) + 1
    draft = {
        "id": str(uuid.uuid4()), "questionnaire_id": questionnaire_id,
        "supplier_relationship_id": supplier_relationship_id,
        "supplier_org_id": visible_response.get("supplier_org_id"),
        "answers": visible_response.get("answers", {}), "question_evidence": visible_response.get("question_evidence", {}), "status": "in_progress",
        "calculated_score": None, "submitted_at": None, "reporting_period": reporting_period, "revision": revision,
        "is_current": True, "parent_visible": False, "reopened_at": now,
        "reopened_by": reopened_by, "created_at": now, "updated_at": now,
    }
    await db.supplier_questionnaire_responses.insert_one(draft)
    return True

async def get_supplier_submission_status(self, supplier_relationship_id: str) -> Dict[str, Any]:
    relationship = await self.get_supplier(supplier_relationship_id)
    if not relationship:
        return {"esg": [], "esg_items": [], "ghg": {"status": "pending"}, "documents": [], "training": []}
    submitted_responses = await db.supplier_questionnaire_responses.find(
        {"supplier_relationship_id": supplier_relationship_id, "reporting_period": (relationship or {}).get("reporting_period"), "status": "submitted", "parent_visible": {"$ne": False}},
        {"_id": 0, "questionnaire_id": 1, "submitted_at": 1, "revision": 1},
    ).to_list(100)
    submitted_by_questionnaire = {item["questionnaire_id"]: item for item in submitted_responses}
    questionnaire_ids = relationship.get("questionnaire_ids") or []
    questionnaire_query: Dict[str, Any] = {"organization_id": relationship["customer_org_id"], "is_active": True}
    if questionnaire_ids:
        questionnaire_query["id"] = {"$in": questionnaire_ids}
    questionnaires = await db.supplier_questionnaires.find(
        questionnaire_query,
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(500)
    esg_items = []
    for questionnaire in questionnaires:
        submitted = submitted_by_questionnaire.get(questionnaire["id"])
        esg_items.append({
            "questionnaire_id": questionnaire["id"],
            "name": questionnaire.get("name", "Questionnaire"),
            "status": "locked" if submitted else "pending",
            "locked_at": submitted.get("submitted_at") if submitted else None,
            "submitted_at": submitted.get("submitted_at") if submitted else None,
            "due_date": relationship.get("due_date"),
        })
    from modules.supplier_assessment.ghg_submission_service import reporting_period_values
    ghg_entries = await db.emission_records.find(
        {
            "source": "supplier", "supplier_relationship_id": supplier_relationship_id,
            "submitted_to_parent_org": {"$exists": True, "$ne": None}, "parent_visible": {"$ne": False},
            "reporting_period": {"$in": reporting_period_values(relationship.get("reporting_period"))},
        },
        {"_id": 0, "submitted_to_parent_org": 1},
    ).to_list(1000)
    locked_at = min((entry.get("submitted_to_parent_org") for entry in ghg_entries if entry.get("submitted_to_parent_org")), default=None)
    from modules.supplier_assessment.documents_service import list_supplier_documents
    from modules.supplier_assessment.training_service import supplier_trainings
    documents = [
        {"id": item["id"], "name": item.get("title", "Document"), "status": "locked" if item.get("submission_status") == "submitted" else "pending", "locked_at": item.get("responded_at"), "due_date": item.get("due_date") or relationship.get("due_date")}
        for item in await list_supplier_documents(relationship)
    ]
    training = [
        {"id": item["assignment_id"], "name": item.get("title", "Training"), "status": item.get("status", "pending"), "completed_at": item.get("completed_at"), "progress_percent": item.get("progress_percent", 0), "due_date": item.get("due_date") or relationship.get("due_date")}
        for item in await supplier_trainings(relationship)
    ]
    program_context = await resolve_program_context(relationship)
    program_modules = (program_context.get("config") or {}).get("modules") or {}
    module_visibility = {
        "esg": bool((program_modules.get("esg") or {}).get("enabled", False)),
        "ghg": bool((program_modules.get("ghg") or {}).get("enabled", False)),
        "documents": bool((program_modules.get("documents") or {}).get("enabled", False)) and bool(documents),
        "training": bool((program_modules.get("training") or {}).get("enabled", False)) and bool(training),
    }
    return {
        "esg": [item for item in esg_items if item["status"] == "locked"],
        "esg_items": esg_items,
        "ghg": {"status": "locked" if ghg_entries else "pending", "locked_at": locked_at, "entry_count": len(ghg_entries), "due_date": relationship.get("due_date")},
        "documents": documents,
        "training": training,
        "module_visibility": module_visibility,
    }
