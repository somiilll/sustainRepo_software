"""
Supplier Assessment Router - API endpoints for supplier management.
"""
from typing import Optional, List
import json
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form

from modules.auth.dependencies import get_current_user, get_admin_user
from modules.supplier_assessment.service import supplier_service
from modules.supplier_assessment.module_registry import supplier_assessment_module_registry
from modules.supplier_assessment.contracts import (
    SupplierCreate,
    SupplierUpdate,
    SupplierResponse,
    SupplierListResponse,
    RevenueInfoUpdate,
    QuestionnaireCreate,
    QuestionnaireUpdate,
    QuestionnaireResponse,
    QuestionCreate,
    QuestionUpdate,
    QuestionResponse,
    SupplierResponsesSubmit,
    SupplierQuestionnaireStatusResponse,
    SupplierRankingResponse,
    ReminderSend,
    SupplierEmissionCreate,
    SupplierEmissionResponse,
    SupplierDocumentResponse,
    SupplierDocumentStatusSubmit,
    TrainingUpdate,
    TrainingConsumptionEvent,
)
from modules.supplier_assessment import documents_service
from modules.supplier_assessment import training_service
from modules.supplier_assessment import ghg_submission_service
from r2_storage import get_r2_storage
from shared.database.mongo import db

router = APIRouter(prefix="/supplier-assessment", tags=["Supplier Assessment"])


# ============================================================================
# Helper: Check if user is supplier
# ============================================================================

async def get_supplier_user(current_user: dict = Depends(get_current_user)):
    """Dependency that checks if user is a supplier."""
    user_type = current_user.get("user_type")
    org = await db.organizations.find_one(
        {"id": current_user.get("organization_id")},
        {"_id": 0, "org_type": 1}
    )
    
    if user_type == "supplier" or (org and org.get("org_type") == "supplier"):
        return current_user
    
    raise HTTPException(status_code=403, detail="Supplier access required")


async def get_customer_admin(current_user: dict = Depends(get_admin_user)):
    """Dependency that checks if user is a customer admin (not supplier)."""
    org = await db.organizations.find_one(
        {"id": current_user.get("organization_id")},
        {"_id": 0, "org_type": 1}
    )
    
    if org and org.get("org_type") == "supplier":
        raise HTTPException(status_code=403, detail="Customer admin access required")
    
    return current_user


# ============================================================================
# Supplier Management (Customer Admin)
# ============================================================================

@router.post("/suppliers", response_model=dict)
async def create_supplier(
    data: SupplierCreate,
    current_user: dict = Depends(get_customer_admin),
):
    """Create a new supplier and send invitation."""
    try:
        result = await supplier_service.create_supplier(
            customer_org_id=current_user["organization_id"],
            company_name=data.company_name,
            contact_person=data.contact_person,
            email=data.email,
            contact_number=data.contact_number,
            due_date=data.due_date,
            created_by=current_user["id"],
            created_by_email=current_user["email"],
            modules_enabled=data.modules_enabled,
            ghg_scopes_enabled=data.ghg_scopes_enabled,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/suppliers", response_model=SupplierListResponse)
async def list_suppliers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_customer_admin),
):
    """Get paginated list of suppliers."""
    result = await supplier_service.get_suppliers(
        customer_org_id=current_user["organization_id"],
        page=page,
        page_size=page_size,
        status_filter=status,
        search=search,
    )
    return result


@router.get("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(
    supplier_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Get single supplier details."""
    supplier = await supplier_service.get_supplier(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    # Verify ownership
    if supplier["customer_org_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return supplier


@router.put("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def update_supplier(
    supplier_id: str,
    data: SupplierUpdate,
    current_user: dict = Depends(get_customer_admin),
):
    """Update supplier details."""
    supplier = await supplier_service.get_supplier(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    if supplier["customer_org_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    updates = data.model_dump(exclude_unset=True)
    result = await supplier_service.update_supplier(supplier_id, updates)
    return result


@router.delete("/suppliers/{supplier_id}")
async def deactivate_supplier(
    supplier_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Deactivate a supplier relationship."""
    supplier = await supplier_service.get_supplier(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    if supplier["customer_org_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await supplier_service.deactivate_supplier(supplier_id)
    return {"message": "Supplier deactivated"}


@router.post("/suppliers/{supplier_id}/remind")
async def send_reminder(
    supplier_id: str,
    data: Optional[ReminderSend] = None,
    current_user: dict = Depends(get_customer_admin),
):
    """Send reminder to supplier."""
    supplier = await supplier_service.get_supplier(supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    if supplier["customer_org_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    custom_message = data.custom_message if data else None
    success = await supplier_service.send_reminder(supplier_id, custom_message)
    
    if success:
        return {"message": "Reminder sent"}
    raise HTTPException(status_code=500, detail="Failed to send reminder")


# ============================================================================
# Organization Agreements (Documents Module — focused NDA/agreement flow)
# ============================================================================

@router.get("/documents")
async def list_documents(current_user: dict = Depends(get_customer_admin)):
    """List this customer's active supplier-agreement requirements."""
    return await documents_service.list_customer_documents(current_user["organization_id"])


@router.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(default=""),
    response_mode: str = Form(default="ACCEPTANCE"),
    response_options_json: str = Form(default="[]"),
    supplier_relationship_ids: str = Form(default="[]"),
    current_user: dict = Depends(get_customer_admin),
):
    """Publish one organization NDA/agreement for the active supplier assessment program."""
    try:
        try:
            response_options = json.loads(response_options_json)
        except json.JSONDecodeError:
            raise ValueError("Status response options must be valid")
        if not isinstance(response_options, list) or not all(isinstance(option, str) for option in response_options):
            raise ValueError("Status response options must be a list of text values")
        try:
            relationship_ids = json.loads(supplier_relationship_ids)
        except json.JSONDecodeError:
            raise ValueError("Selected suppliers must be valid")
        if not isinstance(relationship_ids, list) or not all(isinstance(relationship_id, str) for relationship_id in relationship_ids):
            raise ValueError("Selected suppliers must be a list")
        if not relationship_ids:
            raise ValueError("Select at least one supplier")
        result = await documents_service.publish_agreement(
            customer_org_id=current_user["organization_id"],
            created_by=current_user["id"],
            filename=file.filename or "agreement",
            content_type=file.content_type or "application/octet-stream",
            content=await file.read(),
            title=title,
            response_mode=response_mode,
            response_options=response_options,
            relationship_ids=relationship_ids,
        )
        for relationship_id in result["affected_relationship_ids"]:
            await supplier_service._update_completion_status(relationship_id)
        return {"requirements": result["requirements"], "version": result["version"]}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Failed to publish agreement: {error}")

@router.get("/documents/{requirement_id}/responses")
async def get_document_supplier_responses(requirement_id: str, current_user: dict = Depends(get_customer_admin)):
    response_data = await documents_service.list_document_supplier_responses(current_user["organization_id"], requirement_id)
    if not response_data:
        raise HTTPException(status_code=404, detail="Agreement not found")
    return response_data

@router.delete("/documents/{requirement_id}")
async def delete_document(requirement_id: str, current_user: dict = Depends(get_customer_admin)):
    """Remove an agreement from active supplier access while retaining immutable records."""
    relationship_ids = await documents_service.archive_document(current_user["organization_id"], requirement_id)
    if relationship_ids is None:
        raise HTTPException(status_code=404, detail="Agreement not found")
    for relationship_id in relationship_ids:
        await supplier_service._update_completion_status(relationship_id)
    return {"message": "Agreement deleted"}

@router.post("/trainings")
async def create_training(file: UploadFile = File(...), title: str = Form(...), description: str = Form(""), due_date: Optional[str] = Form(None), supplier_relationship_ids: str = Form(...), current_user: dict = Depends(get_customer_admin)):
    """Create immutable v1 training content and assign it to selected suppliers."""
    try:
        return await training_service.create_training(current_user["organization_id"], current_user["id"], title, description, 100.0, file.filename or "training", file.content_type or "application/octet-stream", await file.read(), json.loads(supplier_relationship_ids), due_date)
    except (ValueError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail=str(error))

@router.get("/trainings")
async def list_trainings(current_user: dict = Depends(get_customer_admin)):
    return await db.supplier_training_requirements.find({"organization_id": current_user["organization_id"], "is_deleted": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.patch("/trainings/{training_id}")
async def update_training(training_id: str, data: TrainingUpdate, current_user: dict = Depends(get_customer_admin)):
    training = await training_service.update_training(current_user["organization_id"], training_id, data.model_dump(exclude_unset=True))
    if not training:
        raise HTTPException(status_code=404, detail="Training not found")
    return training

@router.delete("/trainings/{training_id}")
async def delete_training(training_id: str, current_user: dict = Depends(get_customer_admin)):
    if not await training_service.archive_training(current_user["organization_id"], training_id):
        raise HTTPException(status_code=404, detail="Training not found")
    return {"message": "Training deleted"}

@router.get("/trainings/{training_id}/status")
async def get_training_status(training_id: str, current_user: dict = Depends(get_customer_admin)):
    status_rows = await training_service.training_status(current_user["organization_id"], training_id)
    if status_rows is None: raise HTTPException(status_code=404, detail="Training not found")
    return status_rows


# ============================================================================
# Questionnaire Management (Customer Admin)
# ============================================================================

@router.post("/questionnaires", response_model=QuestionnaireResponse)
async def create_questionnaire(
    data: QuestionnaireCreate,
    current_user: dict = Depends(get_customer_admin),
):
    """Create a new questionnaire template."""
    result = await supplier_service.create_questionnaire(
        organization_id=current_user["organization_id"],
        name=data.name,
        description=data.description,
        due_date=data.due_date,
        scoring_method=data.scoring_method,
        section_weights=data.section_weights,
        created_by=current_user["id"],
    )
    return result


@router.get("/questionnaires", response_model=List[QuestionnaireResponse])
async def list_questionnaires(
    current_user: dict = Depends(get_customer_admin),
):
    """List all questionnaires for the organization."""
    return await supplier_service.get_questionnaires(current_user["organization_id"])


@router.get("/questionnaires/{questionnaire_id}")
async def get_questionnaire(
    questionnaire_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Get questionnaire with questions."""
    questionnaire = await supplier_service.get_questionnaire(questionnaire_id)
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    if questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return questionnaire


@router.put("/questionnaires/{questionnaire_id}", response_model=QuestionnaireResponse)
async def update_questionnaire(
    questionnaire_id: str,
    data: QuestionnaireUpdate,
    current_user: dict = Depends(get_customer_admin),
):
    """Update questionnaire."""
    questionnaire = await supplier_service.get_questionnaire(questionnaire_id)
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    if questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    updates = data.model_dump(exclude_unset=True)
    result = await supplier_service.update_questionnaire(questionnaire_id, updates)
    return result


@router.delete("/questionnaires/{questionnaire_id}")
async def delete_questionnaire(
    questionnaire_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Delete questionnaire."""
    questionnaire = await supplier_service.get_questionnaire(questionnaire_id)
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    if questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await supplier_service.delete_questionnaire(questionnaire_id)
    return {"message": "Questionnaire deleted"}


@router.post("/questionnaires/{questionnaire_id}/duplicate")
async def duplicate_questionnaire(
    questionnaire_id: str,
    new_name: str = Query(...),
    current_user: dict = Depends(get_customer_admin),
):
    """Duplicate a questionnaire."""
    questionnaire = await supplier_service.get_questionnaire(questionnaire_id)
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    if questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await supplier_service.duplicate_questionnaire(
        questionnaire_id, new_name, current_user["id"]
    )
    return result


# ============================================================================
# Question Management (Customer Admin)
# ============================================================================

@router.post("/questionnaires/{questionnaire_id}/questions", response_model=QuestionResponse)
async def add_question(
    questionnaire_id: str,
    data: QuestionCreate,
    current_user: dict = Depends(get_customer_admin),
):
    """Add a question to questionnaire."""
    questionnaire = await supplier_service.get_questionnaire(questionnaire_id)
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    if questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await supplier_service.add_question(
        questionnaire_id=questionnaire_id,
        question_text=data.question_text,
        description=data.description,
        response_type=data.response_type,
        options=[o.model_dump() for o in data.options] if data.options else None,
        required=data.required,
        weight=data.weight,
        category=data.category,
        order=data.order,
        scoring=data.scoring.model_dump() if data.scoring else None,
    )
    return result


@router.put("/questions/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: str,
    data: QuestionUpdate,
    current_user: dict = Depends(get_customer_admin),
):
    """Update a question."""
    question = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Verify ownership through questionnaire
    questionnaire = await supplier_service.get_questionnaire(question["questionnaire_id"])
    if not questionnaire or questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    updates = data.model_dump(exclude_unset=True)
    if "options" in updates and updates["options"]:
        updates["options"] = [o if isinstance(o, dict) else o.model_dump() for o in updates["options"]]
    if "scoring" in updates and updates["scoring"]:
        updates["scoring"] = updates["scoring"] if isinstance(updates["scoring"], dict) else updates["scoring"].model_dump()
    
    result = await supplier_service.update_question(question_id, updates)
    return result


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Delete a question."""
    question = await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    questionnaire = await supplier_service.get_questionnaire(question["questionnaire_id"])
    if not questionnaire or questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await supplier_service.delete_question(question_id)
    return {"message": "Question deleted"}


@router.post("/questionnaires/{questionnaire_id}/reorder")
async def reorder_questions(
    questionnaire_id: str,
    orders: List[dict],  # [{"id": "...", "order": 1}, ...]
    current_user: dict = Depends(get_customer_admin),
):
    """Reorder questions in questionnaire."""
    questionnaire = await supplier_service.get_questionnaire(questionnaire_id)
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    if questionnaire["organization_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    await supplier_service.reorder_questions(questionnaire_id, orders)
    return {"message": "Questions reordered"}


# ============================================================================
# View Supplier Responses (Customer Admin)
# ============================================================================

@router.get("/suppliers/{supplier_id}/questionnaires/{questionnaire_id}/responses")
async def get_supplier_responses(
    supplier_id: str,
    questionnaire_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Admin views supplier's questionnaire responses."""
    supplier = await supplier_service.get_supplier(supplier_id)
    if not supplier or supplier["customer_org_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    result = await supplier_service.get_supplier_responses_for_admin(supplier_id, questionnaire_id)
    if not result:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    return result


@router.post("/suppliers/{supplier_id}/questionnaires/{questionnaire_id}/reopen")
async def reopen_questionnaire(
    supplier_id: str,
    questionnaire_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Reopen questionnaire for supplier to edit."""
    supplier = await supplier_service.get_supplier(supplier_id)
    if not supplier or supplier["customer_org_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    success = await supplier_service.reopen_questionnaire(supplier_id, questionnaire_id)
    if success:
        return {"message": "Questionnaire reopened"}
    raise HTTPException(status_code=400, detail="Could not reopen questionnaire")


# ============================================================================
# Supplier Rankings (Customer Admin)
# ============================================================================

@router.get("/rankings", response_model=SupplierRankingResponse)
async def get_rankings(
    current_user: dict = Depends(get_customer_admin),
):
    """Get supplier rankings."""
    return await supplier_service.get_supplier_rankings(current_user["organization_id"])


# ============================================================================
# Supplier Self-Service Endpoints
# ============================================================================

@router.get("/my-assessment")
async def get_my_assessment(
    current_user: dict = Depends(get_supplier_user),
):
    """Get supplier's own assessment status."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    # Get customer org name
    customer_org = await db.organizations.find_one(
        {"id": relationship["customer_org_id"]},
        {"_id": 0, "name": 1}
    )
    
    program_context = await supplier_service.get_program_context(relationship)
    return {
        "relationship": relationship,
        "customer_name": customer_org.get("name") if customer_org else None,
        "assessment_modules": supplier_assessment_module_registry.supplier_module_summaries(
            program_context["config"], relationship
        ),
    }


@router.put("/my-assessment/revenue")
async def update_my_revenue(
    data: RevenueInfoUpdate,
    current_user: dict = Depends(get_supplier_user),
):
    """Supplier updates their revenue information (percentage and amount)."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    success = await supplier_service.update_revenue_info(
        relationship_id=relationship["id"],
        supplier_org_id=current_user["organization_id"],
        revenue_percentage=data.revenue_percentage,
        revenue_amount=data.revenue_amount,
        revenue_currency=data.revenue_currency,
    )
    
    if success:
        return {"message": "Revenue information updated"}
    raise HTTPException(status_code=400, detail="Failed to update")


@router.get("/my-assessment/documents", response_model=List[SupplierDocumentResponse])
async def get_my_documents(current_user: dict = Depends(get_supplier_user)):
    """List the current agreement versions required by this supplier's program."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"], user_org_id=current_user["organization_id"]
    )
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    return await documents_service.list_supplier_documents(relationship)


@router.get("/my-assessment/documents/{requirement_id}/view")
async def get_my_document_view_url(
    requirement_id: str,
    current_user: dict = Depends(get_supplier_user),
):
    """Authorize the supplier and return a short-lived URL for the exact agreement version."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"], user_org_id=current_user["organization_id"]
    )
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    document = await documents_service.get_supplier_document(relationship, requirement_id)
    if not document:
        raise HTTPException(status_code=404, detail="Agreement not found")
    version = document["version"]
    try:
        return {"url": get_r2_storage().generate_presigned_url(
            version["bucket_type"], version["r2_key"], expiration=900,
            response_content_disposition=f"inline; filename={version['original_filename']}",
        )}
    except Exception as error:
        raise HTTPException(status_code=500, detail=f"Failed to open agreement: {error}")


@router.post("/my-assessment/documents/{requirement_id}/accept")
async def accept_my_document(
    requirement_id: str,
    current_user: dict = Depends(get_supplier_user),
):
    """Record an immutable acceptance for the currently assigned agreement version."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"], user_org_id=current_user["organization_id"]
    )
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    acceptance = await documents_service.accept_supplier_document(
        relationship, requirement_id, current_user["id"]
    )
    if not acceptance:
        raise HTTPException(status_code=404, detail="Agreement not found")
    await supplier_service._update_completion_status(relationship["id"])
    return {"acceptance": acceptance}

@router.post("/my-assessment/documents/{requirement_id}/respond")
async def respond_to_my_document(requirement_id: str, data: SupplierDocumentStatusSubmit, current_user: dict = Depends(get_supplier_user)):
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"], user_org_id=current_user["organization_id"]
    )
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    try:
        response = await documents_service.respond_to_supplier_document(relationship, requirement_id, data.response_value, current_user["id"])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not response:
        raise HTTPException(status_code=404, detail="Agreement not found")
    await supplier_service._update_completion_status(relationship["id"])
    return {"response": response}

@router.get("/my-assessment/trainings")
async def get_my_trainings(current_user: dict = Depends(get_supplier_user)):
    relationship = await supplier_service.get_supplier_relationship_for_user(current_user["id"], current_user["organization_id"])
    if not relationship: raise HTTPException(status_code=404, detail="No active supplier relationship found")
    return await training_service.supplier_trainings(relationship)

@router.put("/my-assessment/trainings/{assignment_id}/progress")
async def save_training_progress(assignment_id: str, progress_percent: float = Form(...), current_user: dict = Depends(get_supplier_user)):
    raise HTTPException(status_code=403, detail="Supplier training progress cannot be self-reported")

@router.get("/my-assessment/trainings/{assignment_id}/content")
async def get_training_content(assignment_id: str, current_user: dict = Depends(get_supplier_user)):
    raise HTTPException(status_code=410, detail="Training content is available only through the in-app viewer")

@router.get("/my-assessment/trainings/{assignment_id}/viewer")
async def get_training_viewer(assignment_id: str, current_user: dict = Depends(get_supplier_user)):
    relationship = await supplier_service.get_supplier_relationship_for_user(current_user["id"], current_user["organization_id"])
    if not relationship: raise HTTPException(status_code=404, detail="No active supplier relationship found")
    viewer = await training_service.training_viewer_for_supplier(relationship, assignment_id)
    if not viewer: raise HTTPException(status_code=409, detail="This legacy training must be republished for in-app viewing")
    try:
        return viewer
    except Exception as error: raise HTTPException(status_code=500, detail=f"Failed to access training content: {error}")

@router.post("/my-assessment/trainings/{assignment_id}/consumption-events")
async def record_training_consumption(assignment_id: str, event: TrainingConsumptionEvent, current_user: dict = Depends(get_supplier_user)):
    relationship = await supplier_service.get_supplier_relationship_for_user(current_user["id"], current_user["organization_id"])
    if not relationship: raise HTTPException(status_code=404, detail="No active supplier relationship found")
    try:
        progress = await training_service.record_consumption_event(relationship, assignment_id, event.model_dump(exclude_none=True), current_user["id"])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not progress: raise HTTPException(status_code=404, detail="Training assignment not found")
    await supplier_service._update_completion_status(relationship["id"])
    return progress


@router.get("/my-assessment/questionnaires")
async def get_my_questionnaires(
    current_user: dict = Depends(get_supplier_user),
):
    """Get questionnaires assigned to supplier."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    statuses = await supplier_service.get_supplier_questionnaire_status(
        supplier_org_id=current_user["organization_id"],
        customer_org_id=relationship["customer_org_id"],
    )
    
    return statuses


@router.get("/my-assessment/questionnaires/{questionnaire_id}")
async def get_my_questionnaire(
    questionnaire_id: str,
    current_user: dict = Depends(get_supplier_user),
):
    """Get questionnaire with supplier's answers."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    result = await supplier_service.get_questionnaire_for_supplier(
        questionnaire_id=questionnaire_id,
        supplier_relationship_id=relationship["id"],
    )
    
    if not result:
        raise HTTPException(status_code=404, detail="Questionnaire not found")
    
    return result


@router.post("/my-assessment/questionnaires/{questionnaire_id}/answers")
async def submit_my_answers(
    questionnaire_id: str,
    data: SupplierResponsesSubmit,
    current_user: dict = Depends(get_supplier_user),
):
    """Submit answers to questionnaire."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    # Check if questionnaire is still open for editing
    response_doc = await db.supplier_questionnaire_responses.find_one(
        {
            "questionnaire_id": questionnaire_id,
            "supplier_relationship_id": relationship["id"],
        },
        {"_id": 0, "status": 1}
    )
    
    if response_doc and response_doc.get("status") == "submitted":
        raise HTTPException(status_code=409, detail="Questionnaire already submitted and locked")
    
    result = await supplier_service.submit_supplier_answers(
        questionnaire_id=questionnaire_id,
        supplier_relationship_id=relationship["id"],
        supplier_org_id=current_user["organization_id"],
        answers=[a.model_dump() for a in data.answers],
        is_draft=data.is_draft,
    )
    
    return result


# ============================================================================
# Supplier GHG Emissions (Simplified)
# ============================================================================

@router.get("/my-assessment/emissions")
async def get_my_emissions(
    current_user: dict = Depends(get_supplier_user),
):
    """Get supplier's emission records."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    state = await ghg_submission_service.get_supplier_ghg_state(relationship)
    return state["entries"]

@router.get("/my-assessment/emissions/submission")
async def get_my_ghg_submission(current_user: dict = Depends(get_supplier_user)):
    relationship = await supplier_service.get_supplier_relationship_for_user(current_user["id"], current_user["organization_id"])
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    return await ghg_submission_service.get_supplier_ghg_state(relationship)

@router.post("/my-assessment/emissions/submit")
async def submit_my_ghg(current_user: dict = Depends(get_supplier_user)):
    relationship = await supplier_service.get_supplier_relationship_for_user(current_user["id"], current_user["organization_id"])
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    try:
        submission = await ghg_submission_service.submit_supplier_ghg(relationship, current_user["id"])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    await supplier_service._update_completion_status(relationship["id"])
    return submission


@router.post("/my-assessment/emissions")
async def create_my_emission(
    data: SupplierEmissionCreate,
    current_user: dict = Depends(get_supplier_user),
):
    """Create emission record for supplier with CalcEngine calculation."""
    import uuid
    from datetime import datetime, timezone
    from calc_engine.execution import CalcEngine
    from calc_engine.formulas import resolve_formula_id
    
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    # Validate scope (only scope1 and scope2 allowed for suppliers)
    allowed_scopes = relationship.get("ghg_scopes_enabled", ["scope1", "scope2"])
    if data.scope not in allowed_scopes:
        raise HTTPException(
            status_code=400, 
            detail=f"Scope {data.scope} is not enabled. Allowed: {allowed_scopes}"
        )
    
    # Get or create a default facility for the supplier org
    supplier_facility = await db.facilities.find_one(
        {"organization_id": current_user["organization_id"], "is_active": True},
        {"_id": 0, "id": 1, "name": 1}
    )
    
    facility_id = supplier_facility["id"] if supplier_facility else None
    facility_name = supplier_facility["name"] if supplier_facility else "Default Facility"
    
    if not facility_id:
        # Create a default facility for the supplier
        facility_id = str(uuid.uuid4())
        facility_name = f"{relationship.get('company_name', 'Supplier')} - Default Facility"
        await db.facilities.insert_one({
            "id": facility_id,
            "organization_id": current_user["organization_id"],
            "name": facility_name,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    
    # Run CalcEngine to calculate emissions
    calc_result = None
    co2_emissions = 0
    ch4_emissions = 0
    n2o_emissions = 0
    co2e_emissions = 0
    outputs = {}
    formula_id = None
    
    if data.category_id and data.dynamic_field_values:
        try:
            # Resolve formula from category
            decision_inputs = data.decision_inputs or {}
            resolved_formula_id, _ = await resolve_formula_id(
                db, data.category_id, decision_inputs
            )
            
            if resolved_formula_id:
                formula_id = resolved_formula_id
                formula_doc = await db.ce_formulas.find_one(
                    {"id": resolved_formula_id}, {"_id": 0}
                )
                
                if formula_doc:
                    # Build inputs for CalcEngine
                    inputs = {}
                    user_overrides = {}
                    for key, val in (data.dynamic_field_values or {}).items():
                        if val is None:
                            continue
                        if isinstance(val, dict) and "value" in val:
                            if val.get("is_override"):
                                user_overrides[key] = val
                            else:
                                inputs[key] = val
                        else:
                            inputs[key] = {"value": val, "unit": ""}
                    
                    # Build context
                    context = {
                        "fuel_code": data.fuel_database_id or data.fuel_type,
                        "fuel_database_id": data.fuel_database_id,
                        "fuel_name": data.fuel_type or data.sub_category,
                        "scope": data.scope,
                        "category_id": data.category_id,
                        "reporting_period": data.reporting_period,
                    }
                    
                    # Execute calculation
                    calc_engine = CalcEngine(db)
                    calc_result = await calc_engine.execute(
                        formula_doc.get("definition", formula_doc),
                        inputs,
                        context=context,
                        user_overrides=user_overrides,
                        dry_run=False,
                        org_id=current_user["organization_id"],
                    )
                    
                    outputs = calc_result.get("outputs", {})
                    co2_emissions = outputs.get("co2", {}).get("value", 0) or 0
                    ch4_emissions = outputs.get("ch4", {}).get("value", 0) or 0
                    n2o_emissions = outputs.get("n2o", {}).get("value", 0) or 0
                    co2e_emissions = outputs.get("co2e", {}).get("value", 0) or 0
                    
        except Exception as e:
            # Log error but don't fail - allow manual entry
            print(f"CalcEngine error for supplier emission: {e}")
    
    # Create emission record with supplier metadata
    emission_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    emission_record = {
        "id": emission_id,
        "facility_id": facility_id,
        "facility_name": facility_name,
        "organization_id": current_user["organization_id"],
        "reporting_period": data.reporting_period,
        "frequency_type": data.frequency_type or "monthly",
        "scope": data.scope,
        "category": data.category,
        "category_id": data.category_id,
        "sub_category": data.sub_category,
        "fuel_type": data.fuel_type,
        "fuel_database_id": data.fuel_database_id,
        "dynamic_field_values": data.dynamic_field_values or {},
        "outputs": outputs,
        "formula_id": formula_id,
        # Calculated emissions
        "co2_emissions": co2_emissions,
        "ch4_emissions": ch4_emissions,
        "n2o_emissions": n2o_emissions,
        "co2e_emissions": co2e_emissions,
        "total_emissions": co2e_emissions,
        # Notes
        "notes": data.notes,
        # Supplier metadata
        "source": "supplier",
        "supplier_relationship_id": relationship["id"],
        "customer_org_id": relationship["customer_org_id"],
        # Audit fields
        "status": "draft",
        "approval_status": "draft",
        "created_by": current_user["id"],
        "created_by_email": current_user["email"],
        "created_at": now,
        "updated_at": now,
    }
    
    emission_record["submitted_to_parent_org"] = None
    await db.emission_records.insert_one(emission_record)
    
    # Update completion status
    await supplier_service._update_completion_status(relationship["id"])
    
    return {
        "id": emission_id, 
        "message": "Emission record created",
        "co2e_emissions": co2e_emissions,
        "total_emissions": co2e_emissions,
    }


# ============================================================================
# Customer Admin: View Supplier Emissions
# ============================================================================

@router.get("/suppliers/{supplier_id}/emissions")
async def get_supplier_emissions(
    supplier_id: str,
    current_user: dict = Depends(get_customer_admin),
):
    """Admin views supplier's emissions."""
    supplier = await supplier_service.get_supplier(supplier_id)
    if not supplier or supplier["customer_org_id"] != current_user["organization_id"]:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    submitted = await ghg_submission_service.get_parent_submitted_ghg(current_user["organization_id"])
    emissions = [entry for entry in submitted["emissions"] if entry.get("supplier_relationship_id") == supplier_id]
    
    # Calculate totals
    total_scope1 = sum(e.get("total_emissions", 0) or 0 for e in emissions if e.get("scope") == "scope1")
    total_scope2 = sum(e.get("total_emissions", 0) or 0 for e in emissions if e.get("scope") == "scope2")
    
    return {
        "emissions": emissions,
        "summary": {
            "total_scope1": total_scope1,
            "total_scope2": total_scope2,
            "total": total_scope1 + total_scope2,
            "record_count": len(emissions),
        }
    }


@router.get("/emissions/all")
async def get_all_supplier_emissions(
    current_user: dict = Depends(get_customer_admin),
):
    """Admin views only supplier GHG snapshots that were explicitly submitted."""
    return await ghg_submission_service.get_parent_submitted_ghg(current_user["organization_id"])
