"""
Supplier Assessment Router - API endpoints for supplier management.
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query

from modules.auth.dependencies import get_current_user, get_admin_user
from modules.supplier_assessment.service import supplier_service
from modules.supplier_assessment.contracts import (
    SupplierCreate,
    SupplierUpdate,
    SupplierResponse,
    SupplierListResponse,
    RevenuePercentageUpdate,
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
)
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
    
    return {
        "relationship": relationship,
        "customer_name": customer_org.get("name") if customer_org else None,
    }


@router.put("/my-assessment/revenue")
async def update_my_revenue(
    data: RevenuePercentageUpdate,
    current_user: dict = Depends(get_supplier_user),
):
    """Supplier updates their revenue percentage."""
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    success = await supplier_service.update_revenue_percentage(
        relationship_id=relationship["id"],
        supplier_org_id=current_user["organization_id"],
        revenue_percentage=data.revenue_percentage,
    )
    
    if success:
        return {"message": "Revenue percentage updated"}
    raise HTTPException(status_code=400, detail="Failed to update")


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
    
    if response_doc and response_doc.get("status") == "submitted" and not data.is_draft:
        raise HTTPException(status_code=400, detail="Questionnaire already submitted")
    
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
    
    emissions = await db.emission_records.find(
        {
            "source": "supplier",
            "supplier_relationship_id": relationship["id"],
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
    return emissions


@router.post("/my-assessment/emissions")
async def create_my_emission(
    data: SupplierEmissionCreate,
    current_user: dict = Depends(get_supplier_user),
):
    """Create simplified emission record for supplier."""
    import uuid
    from datetime import datetime, timezone
    
    relationship = await supplier_service.get_supplier_relationship_for_user(
        user_id=current_user["id"],
        user_org_id=current_user["organization_id"],
    )
    
    if not relationship:
        raise HTTPException(status_code=404, detail="No active supplier relationship found")
    
    # Validate scope (only scope1 and scope2 allowed)
    if data.scope not in ["scope1", "scope2"]:
        raise HTTPException(status_code=400, detail="Only Scope 1 and Scope 2 emissions are allowed")
    
    # Get or create a default facility for the supplier org
    supplier_facility = await db.facilities.find_one(
        {"organization_id": current_user["organization_id"], "is_active": True},
        {"_id": 0, "id": 1}
    )
    
    facility_id = supplier_facility["id"] if supplier_facility else None
    if not facility_id:
        # Create a default facility
        facility_id = str(uuid.uuid4())
        await db.facilities.insert_one({
            "id": facility_id,
            "organization_id": current_user["organization_id"],
            "name": "Default Facility",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    
    # Create emission record with supplier metadata
    emission_id = str(uuid.uuid4())
    emission_record = {
        "id": emission_id,
        "facility_id": facility_id,
        "organization_id": current_user["organization_id"],
        "reporting_period": data.reporting_period,
        "scope": data.scope,
        "category": data.category,
        "sub_category": data.sub_category,
        "fuel_type": data.fuel_type,
        "dynamic_field_values": data.dynamic_field_values or {},
        "notes": data.notes,
        # Supplier metadata
        "source": "supplier",
        "supplier_relationship_id": relationship["id"],
        "customer_org_id": relationship["customer_org_id"],
        # Audit fields
        "status": "draft",
        "created_by": current_user["id"],
        "created_by_email": current_user["email"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    # TODO: Run calculation engine here to compute emissions
    # For now, just save the record
    
    await db.emission_records.insert_one(emission_record)
    
    # Update completion status
    await supplier_service._update_completion_status(relationship["id"])
    
    return {"id": emission_id, "message": "Emission record created"}


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
    
    emissions = await db.emission_records.find(
        {
            "source": "supplier",
            "supplier_relationship_id": supplier_id,
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    
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
    """Admin views all supplier emissions."""
    # Get all supplier relationships for this customer
    relationships = await db.supplier_relationships.find(
        {"customer_org_id": current_user["organization_id"], "is_active": True},
        {"_id": 0, "id": 1, "company_name": 1}
    ).to_list(1000)
    
    rel_map = {r["id"]: r["company_name"] for r in relationships}
    rel_ids = list(rel_map.keys())
    
    emissions = await db.emission_records.find(
        {
            "source": "supplier",
            "supplier_relationship_id": {"$in": rel_ids},
        },
        {"_id": 0}
    ).sort("created_at", -1).to_list(10000)
    
    # Add supplier name to each emission
    for e in emissions:
        e["supplier_name"] = rel_map.get(e.get("supplier_relationship_id"), "Unknown")
    
    # Calculate totals by supplier
    supplier_totals = {}
    for e in emissions:
        supplier_id = e.get("supplier_relationship_id")
        if supplier_id not in supplier_totals:
            supplier_totals[supplier_id] = {
                "supplier_name": rel_map.get(supplier_id, "Unknown"),
                "scope1": 0,
                "scope2": 0,
                "total": 0,
            }
        
        amount = e.get("total_emissions", 0) or 0
        supplier_totals[supplier_id]["total"] += amount
        if e.get("scope") == "scope1":
            supplier_totals[supplier_id]["scope1"] += amount
        elif e.get("scope") == "scope2":
            supplier_totals[supplier_id]["scope2"] += amount
    
    return {
        "emissions": emissions,
        "supplier_totals": list(supplier_totals.values()),
        "grand_total": sum(t["total"] for t in supplier_totals.values()),
    }
