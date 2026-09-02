"""Supplier relationship operations extracted from the compatibility facade."""
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from modules.supplier_assessment.email_templates import supplier_invitation_email, supplier_reminder_email
from modules.supplier_assessment.due_dates import validate_due_date
from modules.supplier_assessment.module_registry import supplier_assessment_module_registry
from modules.supplier_assessment.programs import apply_legacy_request_overrides, bind_current_program, get_or_create_program_revision, resolve_program_context
from shared.database.mongo import db
from shared.helpers.email import send_email
from shared.helpers.passwords import generate_random_password, get_password_hash

# ========================================================================
# Supplier Management
# ========================================================================

def _access_revoke_date(relationship: Dict[str, Any]) -> Optional[str]:
    return relationship.get("access_revoke_date") or relationship.get("due_date")

@staticmethod
def _default_reporting_period() -> str:
    return f"CY{datetime.now(timezone.utc).year}"

async def _organization_default_reporting_period(self, customer_org_id: str) -> str:
    organization = await db.organizations.find_one(
        {"id": customer_org_id}, {"_id": 0, "reporting_year_type": 1, "financial_year_start_month": 1}
    ) or {}
    now = datetime.now(timezone.utc)
    if organization.get("reporting_year_type") == "calendar_year":
        return f"CY {now.year}"
    fiscal_start_month = int(organization.get("financial_year_start_month") or 4)
    start_year = now.year if now.month >= fiscal_start_month else now.year - 1
    return f"FY {start_year}-{str(start_year + 1)[-2:]}"

async def create_supplier(
    self,
    customer_org_id: str,
    company_name: str,
    contact_person: str,
    email: str,
    contact_number: Optional[str],
    access_revoke_date: Optional[str],
    created_by: str,
    created_by_email: str,
    modules_enabled: Optional[List[str]] = None,
    ghg_scopes_enabled: Optional[List[str]] = None,
    ghg_submission_frequency: str = "yearly",
    reporting_period: Optional[str] = None,
    revenue_required: bool = False,
    questionnaire_ids: Optional[List[str]] = None,
    document_requirement_ids: Optional[List[str]] = None,
    training_requirement_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Create a new supplier:
    1. Create supplier organization (org_type=supplier)
    2. Create supplier admin user (user_type=supplier)
    3. Generate temp password and send invitation email
    4. Create supplier_relationship record
    """
    validate_due_date(access_revoke_date)
    company_name = (company_name or "").strip()
    duplicate_supplier = await db.supplier_relationships.find_one(
        {"customer_org_id": customer_org_id, "is_active": True, "company_name": {"$regex": f"^{re.escape(company_name)}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    )
    if duplicate_supplier:
        raise ValueError("A supplier with this organization name already exists")
    # Check if supplier org already exists with this email
    existing_user = await db.users.find_one(
        {"email": email, "is_deleted": {"$ne": True}},
        {"_id": 0}
    )
    
    supplier_org_id = None
    supplier_user_id = None
    temp_password = None
    
    if existing_user:
        # User exists - check if they're already a supplier for this customer
        existing_rel = await db.supplier_relationships.find_one({
            "customer_org_id": customer_org_id,
            "contact_email": email,
            "is_active": True,
        })
        if existing_rel:
            raise ValueError("This supplier is already registered")
        
        # User exists but not as supplier for this customer
        supplier_org_id = existing_user.get("organization_id")
        supplier_user_id = existing_user.get("id")
        
        # Update user to be a supplier if not already
        if existing_user.get("user_type") != "supplier":
            await db.users.update_one(
                {"id": supplier_user_id},
                {"$set": {"user_type": "supplier"}}
            )
    else:
        # Create new supplier organization
        supplier_org_id = str(uuid.uuid4())
        supplier_org = {
            "id": supplier_org_id,
            "name": company_name,
            "org_type": "supplier",
            "corporate_address": "",
            "is_active": True,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": created_by,
        }
        await db.organizations.insert_one(supplier_org)
        
        # Create supplier admin user
        temp_password = generate_random_password()
        supplier_user_id = str(uuid.uuid4())
        supplier_user = {
            "id": supplier_user_id,
            "email": email,
            "full_name": contact_person,
            "role": "admin",  # Admin of their supplier org
            "user_type": "supplier",  # Marks as supplier user
            "password_hash": get_password_hash(temp_password),
            "organization_id": supplier_org_id,
            "assigned_facilities": [],
            "requires_password_change": True,
            "is_active": True,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(supplier_user)
    
    # Bind the relationship to an immutable assessment program revision. The
    # relationship keeps its established denormalized fields for existing APIs.
    program_revision = await bind_current_program(
        customer_org_id=customer_org_id,
        created_by=created_by,
        modules_enabled=modules_enabled,
        ghg_scopes_enabled=ghg_scopes_enabled,
    )
    program_modules = program_revision["config"]["modules"]
    modules_enabled = [
        code for code in supplier_assessment_module_registry.registered_codes()
        if (program_modules.get(code) or {}).get("enabled", False)
    ]
    ghg_scopes_enabled = (program_modules.get("ghg") or {}).get("scopes", ["scope1", "scope2"])

    assigned_questionnaire_ids: List[str] = []
    if "esg" in modules_enabled:
        active_questionnaires = await db.supplier_questionnaires.find(
            {"organization_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1}
        ).to_list(100)
        active_ids = {questionnaire["id"] for questionnaire in active_questionnaires}
        if not questionnaire_ids:
            assigned_questionnaire_ids = list(active_ids)
        else:
            assigned_questionnaire_ids = list(dict.fromkeys(questionnaire_ids))
            invalid_ids = set(assigned_questionnaire_ids) - active_ids
            if invalid_ids:
                unavailable = await db.supplier_questionnaires.find({"organization_id": customer_org_id, "id": {"$in": list(invalid_ids)}}, {"_id": 0, "id": 1, "name": 1, "is_active": 1, "is_deleted": 1}).to_list(100)
                by_id = {questionnaire["id"]: questionnaire for questionnaire in unavailable}
                labels = []
                for questionnaire_id in sorted(invalid_ids):
                    questionnaire = by_id.get(questionnaire_id)
                    if not questionnaire:
                        labels.append(f"{questionnaire_id} (not found)")
                    elif questionnaire.get("is_deleted"):
                        labels.append(f"{questionnaire.get('name') or questionnaire_id} (deleted)")
                    else:
                        labels.append(f"{questionnaire.get('name') or questionnaire_id} (inactive)")
                raise ValueError(f"Selected ESG questionnaire is unavailable: {', '.join(labels)}")

    # Create supplier relationship
    relationship_id = str(uuid.uuid4())
    customer_reporting_config = await db.organizations.find_one(
        {"id": customer_org_id}, {"_id": 0, "financial_year_start_month": 1},
    ) or {}
    relationship = {
        "id": relationship_id,
        "customer_org_id": customer_org_id,
        "supplier_org_id": supplier_org_id,
        "company_name": company_name,
        "contact_person": contact_person,
        "contact_email": email,
        "contact_number": contact_number,
        "revenue_percentage": None,
        "revenue_required": revenue_required,
        "invitation_status": "pending",
        "access_revoke_date": access_revoke_date,
        "reporting_period": reporting_period or await self._organization_default_reporting_period(customer_org_id),
        "financial_year_start_month": int(customer_reporting_config.get("financial_year_start_month") or 4),
        "last_reminder_sent": None,
        "reminder_count": 0,
        "is_active": True,
        # Module configuration
        "modules_enabled": modules_enabled,
        "ghg_scopes_enabled": ghg_scopes_enabled,
        "ghg_submission_frequency": ghg_submission_frequency,
        "questionnaire_ids": assigned_questionnaire_ids,
        "assessment_program_id": program_revision["program_id"],
        "assessment_program_version": program_revision["version"],
        # Progress tracking
        "esg_completion_percent": 0.0,
        "ghg_completion_percent": 0.0,
        "overall_completion_percent": 0.0,
        "esg_score": None,
        "ghg_score": None,
        "overall_score": None,
        "created_by": created_by,
        "created_by_email": created_by_email,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.supplier_relationships.insert_one(relationship)
    relationship.pop("_id", None)

    from modules.supplier_assessment.assignment_service import synchronize_supplier_assignments
    await synchronize_supplier_assignments(
        relationship,
        document_requirement_ids=document_requirement_ids,
        training_requirement_ids=training_requirement_ids,
        created_by=created_by,
    )
    
    # Get customer org name for email
    customer_org = await db.organizations.find_one(
        {"id": customer_org_id},
        {"_id": 0, "name": 1}
    )
    customer_name = customer_org.get("name", "Your Customer") if customer_org else "Your Customer"
    
    # Send invitation email
    frontend_url = os.environ.get('FRONTEND_URL')
    if not frontend_url:
        raise ValueError("FRONTEND_URL must be configured")
    login_link = f"{frontend_url}/login"
    
    email_body = supplier_invitation_email(
        supplier_name=contact_person,
        customer_name=customer_name,
        email=email,
        temp_password=temp_password,  # Will be None if user already exists
        login_link=login_link,
        access_revoke_date=access_revoke_date,
        assigned_modules=["revenue", *modules_enabled],
    )
    
    subject = f"Supplier Assessment Invitation from {customer_name}"
    if temp_password:
        subject = f"Welcome! {subject}"
    
    await send_email(email, subject, email_body)
    
    return {
        "id": relationship_id,
        "supplier_org_id": supplier_org_id,
        "supplier_user_id": supplier_user_id,
        "message": "Supplier created and invitation sent",
    }

async def get_suppliers(
    self,
    customer_org_id: str,
    page: int = 1,
    page_size: int = 20,
    status_filter: Optional[str] = None,
    search: Optional[str] = None,
    reporting_period: Optional[str] = None,
) -> Dict[str, Any]:
    """Get paginated list of suppliers for a customer."""
    query = {
        "customer_org_id": customer_org_id,
        "is_active": True,
    }
    
    if status_filter:
        query["invitation_status"] = status_filter
    if reporting_period:
        query["reporting_period"] = reporting_period
    
    if search:
        query["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"contact_person": {"$regex": search, "$options": "i"}},
            {"contact_email": {"$regex": search, "$options": "i"}},
        ]
    
    total = await db.supplier_relationships.count_documents(query)
    skip = (page - 1) * page_size
    
    suppliers = await db.supplier_relationships.find(
        query,
        {"_id": 0}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    from modules.supplier_assessment.documents_service import _is_requirement_available_to_relationship
    document_requirements = await db.supplier_document_requirements.find(
        {"customer_org_id": customer_org_id, "is_active": True}, {"_id": 0, "id": 1, "reporting_period": 1, "assignment_mode": 1, "supplier_relationship_ids": 1, "excluded_supplier_relationship_ids": 1, "assessment_program_id": 1, "assessment_program_version": 1},
    ).to_list(1000)
    relationship_ids = [supplier["id"] for supplier in suppliers]
    training_assignments = await db.supplier_training_assignments.find(
        {"supplier_relationship_id": {"$in": relationship_ids}, "is_active": True}, {"_id": 0, "supplier_relationship_id": 1, "training_requirement_id": 1},
    ).to_list(1000)
    training_ids_by_supplier: Dict[str, List[str]] = {}
    for assignment in training_assignments:
        training_ids_by_supplier.setdefault(assignment["supplier_relationship_id"], []).append(assignment["training_requirement_id"])
    for supplier in suppliers:
        supplier["access_revoke_date"] = _access_revoke_date(supplier)
        supplier["questionnaire_assignment_is_implicit"] = "questionnaire_ids" not in supplier
        supplier["document_requirement_ids"] = [requirement["id"] for requirement in document_requirements if _is_requirement_available_to_relationship(requirement, supplier)]
        supplier["training_requirement_ids"] = training_ids_by_supplier.get(supplier["id"], [])
    
    return {
        "suppliers": suppliers,
        "total": total,
        "page": page,
        "page_size": page_size,
    }

async def get_supplier(self, relationship_id: str) -> Optional[Dict[str, Any]]:
    """Get single supplier relationship."""
    relationship = await db.supplier_relationships.find_one(
        {"id": relationship_id, "is_active": True},
        {"_id": 0}
    )
    if relationship:
        relationship["access_revoke_date"] = _access_revoke_date(relationship)
    return relationship

async def get_program_context(self, relationship: Dict[str, Any]) -> Dict[str, Any]:
    """Expose the immutable program resolver to transport boundaries."""
    return await resolve_program_context(relationship)

async def update_supplier(
    self,
    relationship_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update supplier relationship."""
    relationship = await self.get_supplier(relationship_id)
    if not relationship:
        return None
    if "access_revoke_date" in updates:
        validate_due_date(updates["access_revoke_date"])

    if "modules_enabled" in updates or "ghg_scopes_enabled" in updates:
        context = await resolve_program_context(relationship)
        effective_config = apply_legacy_request_overrides(
            context["config"],
            updates.get("modules_enabled"),
            updates.get("ghg_scopes_enabled"),
        )
        revision = await get_or_create_program_revision(
            relationship["customer_org_id"], effective_config, relationship["created_by"]
        )
        updates["assessment_program_id"] = revision["program_id"]
        updates["assessment_program_version"] = revision["version"]

    if "questionnaire_ids" in updates:
        active_questionnaires = await db.supplier_questionnaires.find(
            {"organization_id": relationship["customer_org_id"], "is_active": True}, {"_id": 0, "id": 1}
        ).to_list(100)
        active_ids = {questionnaire["id"] for questionnaire in active_questionnaires}
        updates["questionnaire_ids"] = list(dict.fromkeys(updates["questionnaire_ids"] or []))
        current_questionnaire_ids = relationship.get("questionnaire_ids")
        if current_questionnaire_ids is None:
            current_questionnaire_ids = list(active_ids)
        newly_assigned_ids = set(updates["questionnaire_ids"]) - set(current_questionnaire_ids)
        if newly_assigned_ids - active_ids:
            raise ValueError("Selected ESG questionnaire is unavailable")
        removed_questionnaire_ids = set(current_questionnaire_ids) - set(updates["questionnaire_ids"])
        if removed_questionnaire_ids:
            submitted_response = await db.supplier_questionnaire_responses.find_one(
                {
                    "supplier_relationship_id": relationship_id,
                    "questionnaire_id": {"$in": list(removed_questionnaire_ids)},
                    "status": "submitted",
                },
                {"_id": 0, "questionnaire_id": 1},
            )
            if submitted_response:
                raise ValueError("A submitted questionnaire cannot be removed from this supplier")

    if "company_name" in updates:
        company_name = str(updates["company_name"] or "").strip()
        duplicate_supplier = await db.supplier_relationships.find_one(
            {"customer_org_id": relationship["customer_org_id"], "is_active": True, "id": {"$ne": relationship_id}, "company_name": {"$regex": f"^{re.escape(company_name)}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )
        if duplicate_supplier:
            raise ValueError("A supplier with this organization name already exists")
        updates["company_name"] = company_name

    from modules.supplier_assessment.assignment_service import synchronize_supplier_assignments
    document_requirement_ids = updates.pop("document_requirement_ids", None)
    training_requirement_ids = updates.pop("training_requirement_ids", None)
    await synchronize_supplier_assignments(
        relationship,
        document_requirement_ids=document_requirement_ids,
        training_requirement_ids=training_requirement_ids,
        created_by=relationship.get("created_by"),
    )

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.supplier_relationships.update_one(
        {"id": relationship_id},
        {"$set": updates}
    )
    if "questionnaire_ids" in updates:
        await self._update_completion_status(relationship_id)
    
    return await self.get_supplier(relationship_id)

async def deactivate_supplier(self, relationship_id: str) -> bool:
    """Deactivate a supplier relationship and revoke supplier account access."""
    relationship = await db.supplier_relationships.find_one(
        {"id": relationship_id, "is_active": True},
        {"_id": 0, "supplier_org_id": 1},
    )
    if not relationship:
        return False
    revoked_at = datetime.now(timezone.utc).isoformat()
    result = await db.supplier_relationships.update_one(
        {"id": relationship_id},
        {"$set": {
            "is_active": False,
            "updated_at": revoked_at,
        }}
    )
    if result.modified_count > 0:
        await db.users.update_many(
            {
                "organization_id": relationship["supplier_org_id"],
                "user_type": "supplier",
                "is_deleted": {"$ne": True},
            },
            {"$set": {
                "is_active": False,
                "supplier_access_revoked_at": revoked_at,
                "supplier_access_revoked_by_relationship_id": relationship_id,
            }},
        )
    return result.modified_count > 0

async def send_reminder(
    self,
    relationship_id: str,
    custom_message: Optional[str] = None,
    modules: Optional[List[str]] = None,
    reporting_period: Optional[str] = None,
) -> bool:
    """Send reminder email to supplier."""
    relationship = await self.get_supplier(relationship_id)
    if not relationship:
        return False
    
    # Get customer org name
    customer_org = await db.organizations.find_one(
        {"id": relationship["customer_org_id"]},
        {"_id": 0, "name": 1}
    )
    customer_name = customer_org.get("name", "Your Customer") if customer_org else "Your Customer"
    
    frontend_url = os.environ.get('FRONTEND_URL')
    if not frontend_url:
        raise ValueError("FRONTEND_URL must be configured")
    login_link = f"{frontend_url}/login"
    
    target_period = reporting_period or relationship.get("reporting_period") or self._default_reporting_period()
    requested_modules = set(modules or ["all"])
    if "all" in requested_modules:
        requested_modules = {"esg", "ghg", "documents", "training", "revenue"}
    pending_modules = await self._pending_reminder_modules(relationship, requested_modules, target_period)
    if not pending_modules:
        return True
    
    email_body = supplier_reminder_email(
        supplier_name=relationship["contact_person"],
        customer_name=customer_name,
        pending_modules=pending_modules,
        access_revoke_date=_access_revoke_date(relationship),
        login_link=login_link,
        custom_message=custom_message,
    )
    
    delivered = await send_email(
        relationship["contact_email"],
        f"Reminder: Complete Your Supplier Assessment for {customer_name}",
        email_body,
    )
    if not delivered:
        return False
    
    # Update reminder tracking
    await db.supplier_relationships.update_one(
        {"id": relationship_id},
        {"$set": {
            "last_reminder_sent": datetime.now(timezone.utc).isoformat(),
        }, "$inc": {"reminder_count": 1}}
    )
    
    return True


async def get_pending_reminder_modules(
    self,
    relationship_id: str,
    reporting_period: Optional[str] = None,
) -> List[Dict[str, str]]:
    """Return the module picker data from the same canonical state as reminder emails."""
    relationship = await self.get_supplier(relationship_id)
    if not relationship:
        return []
    target_period = reporting_period or relationship.get("reporting_period") or self._default_reporting_period()
    pending_items = await self._pending_reminder_modules(
        relationship,
        {"esg", "ghg", "documents", "training", "revenue"},
        target_period,
    )
    code_by_prefix = {
        "ESG Questionnaire": "esg",
        "GHG Emissions": "ghg",
        "Revenue Information": "revenue",
        "Document:": "documents",
        "Training:": "training",
    }
    pending_codes = {
        code
        for item in pending_items
        for prefix, code in code_by_prefix.items()
        if item.startswith(prefix)
    }
    labels = {
        "esg": "ESG Questionnaire",
        "ghg": "GHG Emissions",
        "documents": "Documents",
        "training": "Training",
        "revenue": "Revenue Information",
    }
    return [{"code": code, "label": labels[code]} for code in labels if code in pending_codes]

async def _pending_reminder_modules(self, relationship: Dict[str, Any], requested_modules: set[str], reporting_period: str) -> List[str]:
    pending = []
    labels = {
        "esg": "ESG Questionnaire",
        "ghg": "GHG Emissions",
        "revenue": "Revenue Information",
    }
    program_context = await resolve_program_context(relationship)
    enabled_module_codes = {
        module.module_code
        for module in supplier_assessment_module_registry.enabled_modules(program_context["config"])
    }
    if "esg" in requested_modules and "esg" in enabled_module_codes:
        esg_completion = await supplier_assessment_module_registry._modules["esg"].get_completion(db, relationship)
        if esg_completion.is_applicable and esg_completion.completion_percent < 100:
            pending.append(labels["esg"])
    if "ghg" in requested_modules and "ghg" in enabled_module_codes:
        from modules.supplier_assessment.ghg_submission_service import reporting_period_values
        submitted_ghg = await db.emission_records.find_one(
            {
                "source": "supplier",
                "supplier_relationship_id": relationship["id"],
                "reporting_period": {"$in": reporting_period_values(reporting_period)},
                "submitted_to_parent_org": {"$exists": True, "$ne": None},
                "parent_visible": {"$ne": False},
            },
            {"_id": 0, "id": 1},
        )
        if not submitted_ghg:
            pending.append(labels["ghg"])
    if "revenue" in requested_modules:
        revenue = await db.supplier_revenue_submissions.find_one(
            {"supplier_relationship_id": relationship["id"], "reporting_period": reporting_period, "status": "submitted", "parent_visible": {"$ne": False}},
            {"_id": 0, "id": 1},
        )
        if not revenue:
            pending.append(labels["revenue"])
    if "documents" in requested_modules:
        from modules.supplier_assessment.documents_service import _is_requirement_available_to_relationship
        requirements = await db.supplier_document_requirements.find(
            {"customer_org_id": relationship["customer_org_id"], "is_active": True}, {"_id": 0, "id": 1, "title": 1, "due_date": 1, "supplier_relationship_ids": 1, "assessment_program_id": 1, "assessment_program_version": 1, "reporting_period": 1}
        ).to_list(1000)
        for requirement in requirements:
            if not _is_requirement_available_to_relationship(requirement, relationship):
                continue
            submitted = await db.supplier_document_submissions.find_one(
                {"supplier_relationship_id": relationship["id"], "document_requirement_id": requirement["id"], "status": "submitted", "parent_visible": {"$ne": False}}, {"_id": 0, "id": 1}
            )
            if not submitted:
                suffix = f" (due {requirement['due_date']})" if requirement.get("due_date") else ""
                pending.append(f"Document: {requirement.get('title', 'Agreement')}{suffix}")
    if "training" in requested_modules:
        assignments = await db.supplier_training_assignments.find(
            {"supplier_relationship_id": relationship["id"], "is_active": True}, {"_id": 0, "id": 1, "training_requirement_id": 1, "reporting_period": 1}
        ).to_list(1000)
        for assignment in assignments:
            if assignment.get("reporting_period") and assignment["reporting_period"] != reporting_period:
                continue
            progress = await db.supplier_training_progress.find_one(
                {"supplier_relationship_id": relationship["id"], "training_assignment_id": assignment["id"], "status": "completed"}, {"_id": 0, "id": 1}
            )
            if progress:
                continue
            requirement = await db.supplier_training_requirements.find_one({"id": assignment["training_requirement_id"]}, {"_id": 0, "title": 1, "due_date": 1})
            suffix = f" (due {requirement['due_date']})" if requirement and requirement.get("due_date") else ""
            pending.append(f"Training: {(requirement or {}).get('title', 'Training')}{suffix}")
    return pending

# ========================================================================
# Supplier Self-Service
# ========================================================================

async def get_supplier_relationship_for_user(
    self,
    user_id: str,
    user_org_id: str,
) -> Optional[Dict[str, Any]]:
    """Get active supplier relationship for a supplier user."""
    # Find relationship where this org is the supplier
    return await db.supplier_relationships.find_one(
        {
            "supplier_org_id": user_org_id,
            "is_active": True,
        },
        {"_id": 0}
    )

async def update_revenue_info(
    self,
    relationship_id: str,
    supplier_org_id: str,
    revenue_percentage: Optional[float] = None,
    revenue_amount: Optional[float] = None,
    revenue_currency: Optional[str] = None,
) -> bool:
    """Supplier updates their revenue information (percentage and/or amount)."""
    relationship = await db.supplier_relationships.find_one(
        {"id": relationship_id, "supplier_org_id": supplier_org_id}, {"_id": 0, "reporting_period": 1}
    )
    if not relationship:
        return False
    reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
    submitted = await db.supplier_revenue_submissions.find_one(
        {"supplier_relationship_id": relationship_id, "reporting_period": reporting_period, "status": "submitted", "parent_visible": {"$ne": False}},
        {"_id": 0, "id": 1},
    )
    if submitted:
        raise ValueError("Revenue information is already submitted and locked")
    update_fields = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    
    if revenue_percentage is not None:
        update_fields["revenue_percentage"] = revenue_percentage
    if revenue_amount is not None:
        update_fields["revenue_amount"] = revenue_amount
    if revenue_currency is not None:
        update_fields["revenue_currency"] = revenue_currency
    
    result = await db.supplier_relationships.update_one(
        {
            "id": relationship_id,
            "supplier_org_id": supplier_org_id,
        },
        {"$set": update_fields}
    )
    
    return result.modified_count > 0

async def submit_revenue_info(self, relationship_id: str, supplier_org_id: str, submitted_by: str) -> Dict[str, Any]:
    relationship = await db.supplier_relationships.find_one(
        {"id": relationship_id, "supplier_org_id": supplier_org_id}, {"_id": 0}
    )
    if not relationship:
        raise ValueError("Supplier relationship not found")
    if relationship.get("revenue_percentage") is None:
        raise ValueError("Save the mandatory revenue percentage before submitting")
    if relationship.get("revenue_required", False) and relationship.get("revenue_amount") is None:
        raise ValueError("Save the mandatory annual revenue amount before submitting")
    period = relationship.get("reporting_period") or self._default_reporting_period()
    existing = await db.supplier_revenue_submissions.find_one(
        {"supplier_relationship_id": relationship_id, "reporting_period": period, "status": "submitted", "parent_visible": {"$ne": False}}, {"_id": 0, "id": 1}
    )
    if existing:
        raise ValueError("Revenue information is already submitted and locked")
    now = datetime.now(timezone.utc).isoformat()
    submission = {
        "id": str(uuid.uuid4()), "supplier_relationship_id": relationship_id,
        "supplier_org_id": supplier_org_id, "customer_org_id": relationship["customer_org_id"],
        "reporting_period": period, "revenue_percentage": relationship["revenue_percentage"],
        "revenue_amount": relationship.get("revenue_amount"), "revenue_currency": relationship.get("revenue_currency") or "USD",
        "status": "submitted", "parent_visible": True, "revision": 1,
        "submitted_by": submitted_by, "submitted_at": now,
    }
    await db.supplier_revenue_submissions.insert_one(submission)
    submission.pop("_id", None)
    await self.refresh_supplier_canonical_score(relationship_id)
    await self._update_completion_status(relationship_id)
    return submission

# Keep old method for backwards compatibility
async def update_revenue_percentage(
    self,
    relationship_id: str,
    supplier_org_id: str,
    revenue_percentage: float,
) -> bool:
    """Supplier updates their revenue percentage (deprecated, use update_revenue_info)."""
    return await self.update_revenue_info(
        relationship_id=relationship_id,
        supplier_org_id=supplier_org_id,
        revenue_percentage=revenue_percentage,
    )
