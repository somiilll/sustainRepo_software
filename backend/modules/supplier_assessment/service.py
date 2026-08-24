"""
Supplier Assessment Service - Business logic layer.
"""
import uuid
import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from shared.database.mongo import db
from shared.helpers.passwords import generate_random_password, get_password_hash
from shared.helpers.email import send_email
from modules.supplier_assessment.email_templates import (
    supplier_invitation_email,
    supplier_reminder_email,
)
from modules.supplier_assessment.module_registry import supplier_assessment_module_registry
from modules.supplier_assessment.programs import (
    apply_legacy_request_overrides,
    bind_current_program,
    get_or_create_program_revision,
    resolve_program_context,
)


class SupplierAssessmentService:
    """Service for supplier assessment operations."""

    IMPORTANCE_WEIGHTS = {"low": 1.0, "medium": 2.0, "high": 3.0, "critical": 4.0}

    @staticmethod
    def _validated_weight_config(weights: Optional[Dict[str, float]], defaults: Dict[str, float], label: str) -> Dict[str, float]:
        resolved = {**defaults, **(weights or {})}
        if set(resolved) != set(defaults):
            raise ValueError(f"{label} must include: {', '.join(defaults)}")
        try:
            normalized = {key: float(value) for key, value in resolved.items()}
        except (TypeError, ValueError):
            raise ValueError(f"{label} must contain numeric values")
        if any(value < 0 for value in normalized.values()) or abs(sum(normalized.values()) - 100) > 0.01:
            raise ValueError(f"{label} must total 100%")
        return normalized

    @classmethod
    def _resolve_question_weight(cls, importance: Optional[str], exact_numerical_weight: Optional[float], legacy_weight: Optional[float]) -> tuple[str, Optional[float], float]:
        normalized_importance = (importance or "medium").lower()
        if normalized_importance not in cls.IMPORTANCE_WEIGHTS:
            normalized_importance = "medium"
        if exact_numerical_weight is not None:
            return normalized_importance, float(exact_numerical_weight), float(exact_numerical_weight)
        # Preserve historic API clients which only supplied `weight`.
        if importance is None and legacy_weight not in (None, 1, 1.0):
            return normalized_importance, float(legacy_weight), float(legacy_weight)
        return normalized_importance, None, cls.IMPORTANCE_WEIGHTS[normalized_importance]

    @staticmethod
    def _synchronize_choice_mapping(
        scoring: Optional[Dict[str, Any]],
        options: Optional[List[Dict[str, Any]]],
    ) -> Optional[Dict[str, Any]]:
        """Keep dropdown option scores and canonical choice mappings aligned."""
        normalized = dict(scoring or {})
        if normalized.get("rule") != "choice_mapping":
            return scoring
        option_scores = {
            str(option["value"]): float(option["score"])
            for option in (options or [])
            if option.get("value") not in (None, "") and option.get("score") is not None
        }
        if option_scores:
            normalized["choices"] = option_scores
        return normalized
    
    # ========================================================================
    # Supplier Management
    # ========================================================================

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
        due_date: Optional[str],
        created_by: str,
        created_by_email: str,
        modules_enabled: Optional[List[str]] = None,
        ghg_scopes_enabled: Optional[List[str]] = None,
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
                    raise ValueError("Selected ESG questionnaire is unavailable")

        # Create supplier relationship
        relationship_id = str(uuid.uuid4())
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
            "due_date": due_date,
            "reporting_period": reporting_period or await self._organization_default_reporting_period(customer_org_id),
            "last_reminder_sent": None,
            "reminder_count": 0,
            "is_active": True,
            # Module configuration
            "modules_enabled": modules_enabled,
            "ghg_scopes_enabled": ghg_scopes_enabled,
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

        if document_requirement_ids:
            from modules.supplier_assessment import documents_service
            await documents_service.assign_existing_documents_to_supplier(
                customer_org_id, relationship, document_requirement_ids, created_by
            )
        if training_requirement_ids:
            from modules.supplier_assessment import training_service
            await training_service.assign_existing_trainings_to_supplier(
                customer_org_id, relationship, training_requirement_ids
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
            due_date=due_date,
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
        for supplier in suppliers:
            supplier["questionnaire_assignment_is_implicit"] = "questionnaire_ids" not in supplier
        
        return {
            "suppliers": suppliers,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    
    async def get_supplier(self, relationship_id: str) -> Optional[Dict[str, Any]]:
        """Get single supplier relationship."""
        return await db.supplier_relationships.find_one(
            {"id": relationship_id, "is_active": True},
            {"_id": 0}
        )

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
            if set(updates["questionnaire_ids"]) - active_ids:
                raise ValueError("Selected ESG questionnaire is unavailable")
            current_questionnaire_ids = relationship.get("questionnaire_ids")
            if current_questionnaire_ids is None:
                current_questionnaire_ids = list(active_ids)
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

        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.supplier_relationships.update_one(
            {"id": relationship_id},
            {"$set": updates}
        )
        if "questionnaire_ids" in updates:
            await self._update_completion_status(relationship_id)
        
        return await self.get_supplier(relationship_id)
    
    async def deactivate_supplier(self, relationship_id: str) -> bool:
        """Soft delete a supplier relationship."""
        result = await db.supplier_relationships.update_one(
            {"id": relationship_id},
            {"$set": {
                "is_active": False,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
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
            due_date=relationship.get("due_date"),
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

    async def _pending_reminder_modules(self, relationship: Dict[str, Any], requested_modules: set[str], reporting_period: str) -> List[str]:
        pending = []
        labels = {
            "esg": "ESG Questionnaire",
            "ghg": "GHG Emissions",
            "revenue": "Revenue Information",
        }
        for module_code, completion_field in (("esg", "esg_completion_percent"), ("ghg", "ghg_completion_percent")):
            if module_code in requested_modules and relationship.get(completion_field, 0) < 100:
                pending.append(labels[module_code])
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
                {"customer_org_id": relationship["customer_org_id"], "is_active": True}, {"_id": 0, "title": 1, "due_date": 1, "supplier_relationship_ids": 1, "assessment_program_id": 1, "assessment_program_version": 1, "reporting_period": 1}
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
        if relationship.get("revenue_percentage") is None or relationship.get("revenue_amount") is None:
            raise ValueError("Save both revenue percentage and amount before submitting")
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
            "revenue_amount": relationship["revenue_amount"], "revenue_currency": relationship.get("revenue_currency") or "USD",
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
    ) -> List[Dict[str, Any]]:
        """Get all questionnaires for an organization."""
        questionnaires = await db.supplier_questionnaires.find(
            {"organization_id": organization_id, "is_active": True},
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
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.supplier_questionnaires.update_one(
            {"id": questionnaire_id},
            {"$set": updates}
        )
        return await self.get_questionnaire(questionnaire_id)
    
    async def delete_questionnaire(self, questionnaire_id: str) -> bool:
        """Soft delete questionnaire."""
        result = await db.supplier_questionnaires.update_one(
            {"id": questionnaire_id},
            {"$set": {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
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
        
        # Merge answers into questions
        for q in questionnaire.get("questions", []):
            q["answer"] = answers.get(q["id"])
        
        questionnaire["response_status"] = response_doc.get("status", "not_started") if response_doc else "not_started"
        questionnaire["submitted_at"] = response_doc.get("submitted_at") if response_doc else None
        questionnaire["reopened_at"] = response_doc.get("reopened_at") if response_doc else None
        
        return questionnaire
    
    async def submit_supplier_answers(
        self,
        questionnaire_id: str,
        supplier_relationship_id: str,
        supplier_org_id: str,
        answers: List[Dict[str, Any]],
        is_draft: bool,
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
        if response_doc:
            answers_dict = response_doc.get("answers", {})
        
        for answer in answers:
            answers_dict[answer["question_id"]] = answer["answer"]
        
        status = "in_progress" if is_draft else "submitted"
        submitted_at = None if is_draft else datetime.now(timezone.utc).isoformat()
        
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
                "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if submitted_at:
                update_data.update({"submitted_at": submitted_at, "parent_visible": True})
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
                "status": status,
                "calculated_score": calculated_score,
                "score_breakdown": score_breakdown,
                "reporting_period": reporting_period,
                "submitted_at": submitted_at,
                "revision": 1,
                "is_current": True,
                "parent_visible": not is_draft,
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
        - target_based: % of target achieved
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

    async def refresh_supplier_canonical_score(self, supplier_relationship_id: str) -> Optional[Dict[str, Any]]:
        """Persist the only supplier-level score consumed by tables, rankings, and details."""
        relationship = await self.get_supplier(supplier_relationship_id)
        if not relationship:
            return None
        reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
        responses = await db.supplier_questionnaire_responses.find(
            {
                "supplier_relationship_id": supplier_relationship_id,
                "reporting_period": reporting_period,
                "status": "submitted",
                "parent_visible": {"$ne": False},
            },
            {"_id": 0, "questionnaire_id": 1, "submitted_at": 1, "calculated_score": 1, "manual_score": 1, "score_breakdown": 1},
        ).sort("submitted_at", -1).to_list(100)
        scored_responses = [
            response for response in responses
            if response.get("manual_score") is not None or response.get("calculated_score") is not None
        ]
        latest_breakdown = next((response.get("score_breakdown") for response in scored_responses if response.get("score_breakdown")), None)
        weights = (latest_breakdown or {}).get("overall_weights") or {"esg": 40.0, "ghg": 40.0, "revenue": 20.0}
        weights = self._validated_weight_config(weights, {"esg": 40.0, "ghg": 40.0, "revenue": 20.0}, "Overall component weights")

        esg_values = [
            float(response["manual_score"] if response.get("manual_score") is not None else response["calculated_score"])
            for response in scored_responses
        ]
        section_values = {"environment": [], "social": [], "governance": []}
        for response in scored_responses:
            esg_score = (response.get("score_breakdown") or {}).get("esg_score") or {}
            for section in section_values:
                section_score = (esg_score.get(section) or {}).get("score")
                if section_score is not None:
                    section_values[section].append(float(section_score))
        section_scores = {
            section: round(sum(values) / len(values), 2) if values else None
            for section, values in section_values.items()
        }
        esg_score = round(sum(esg_values) / len(esg_values), 2) if esg_values else None

        from modules.supplier_assessment.scoring import ScoringEngine
        engine = ScoringEngine(db)
        revenue_component = await engine.get_revenue_component(supplier_relationship_id, reporting_period)
        ghg_component = await engine.get_ghg_component(
            supplier_relationship_id, reporting_period, revenue_component.get("revenue_amount")
        )
        revenue_percentage = revenue_component.get("revenue_percentage")
        revenue_score = min(100.0, float(revenue_percentage)) if revenue_percentage is not None else None
        components = {"esg": esg_score, "ghg": ghg_component.get("score"), "revenue": revenue_score}
        required_components = [name for name, weight in weights.items() if weight > 0]
        if not relationship.get("revenue_required", False):
            required_components = [name for name in required_components if name != "revenue"]
        is_complete = all(components.get(name) is not None for name in required_components)
        active_weight_total = sum(weights[name] for name in required_components)
        overall_score = round(sum(float(components[name]) * weights[name] / active_weight_total for name in required_components), 2) if is_complete and active_weight_total else None
        now = datetime.now(timezone.utc).isoformat()
        snapshot = {
            "version": "supplier-assessment-canonical-v1",
            "reporting_period": reporting_period,
            "questionnaire_count": len(scored_responses),
            "esg_score": esg_score,
            "environment_score": section_scores["environment"],
            "social_score": section_scores["social"],
            "governance_score": section_scores["governance"],
            "ghg_score": ghg_component.get("score"),
            "ghg_intensity_tco2e_per_million_revenue": ghg_component.get("intensity"),
            "scope1_emissions": ghg_component.get("scope1_emissions", 0.0),
            "scope2_emissions": ghg_component.get("scope2_emissions", 0.0),
            "total_emissions": ghg_component.get("total_emissions", 0.0),
            "revenue_score": revenue_score,
            "revenue_amount": revenue_component.get("revenue_amount"),
            "component_weights": weights,
            "overall_score": overall_score,
            "is_complete": is_complete,
            "calculated_at": now,
        }
        await db.supplier_relationships.update_one(
            {"id": supplier_relationship_id},
            {"$set": {
                "canonical_score_snapshot": snapshot,
                "esg_score": esg_score,
                "ghg_score": ghg_component.get("score"),
                "overall_score": overall_score,
                "last_scored_at": now,
                "updated_at": now,
            }},
        )
        return snapshot
    
    async def _update_completion_status(self, relationship_id: str):
        """Compatibility facade delegating completion to registered assessment modules."""
        relationship = await db.supplier_relationships.find_one(
            {"id": relationship_id},
            {"_id": 0}
        )
        if not relationship:
            return
        context = await resolve_program_context(relationship)
        enabled_modules = supplier_assessment_module_registry.enabled_modules(context["config"])
        completions = [
            await module.get_completion(db, relationship)
            for module in enabled_modules
        ]
        completion_by_code = {completion.module_code: completion for completion in completions}
        applicable_modules = [
            module for module in enabled_modules
            if completion_by_code[module.module_code].is_applicable
        ]
        total_module_weight = sum(module.legacy_weight for module in applicable_modules)
        module_completion = sum(
            completion_by_code[module.module_code].completion_percent * module.legacy_weight
            for module in applicable_modules
        )
        if context["is_legacy"]:
            module_completion /= 100.0
        elif total_module_weight:
            module_completion = (module_completion / total_module_weight) * 0.8
        else:
            module_completion = 0.0

        reporting_period = relationship.get("reporting_period") or self._default_reporting_period()
        revenue_submission = await db.supplier_revenue_submissions.find_one(
            {"supplier_relationship_id": relationship_id, "reporting_period": reporting_period, "status": "submitted", "parent_visible": {"$ne": False}}, {"_id": 0, "id": 1}
        )
        revenue_completion = 20.0 if revenue_submission else 0.0
        overall_completion = module_completion + revenue_completion
        
        # Update status
        status = "pending"
        if overall_completion > 0:
            status = "accepted"
        if overall_completion >= 100:
            status = "completed"
        
        update_fields = {
            completion.legacy_field: round(completion.completion_percent, 1)
            for completion in completions
        }
        update_fields.update({
            "overall_completion_percent": round(overall_completion, 1),
            "invitation_status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "revenue_submission_status": "submitted" if revenue_submission else "not_started",
        })
        await db.supplier_relationships.update_one(
            {"id": relationship_id},
            {"$set": update_fields}
        )
    
    # ========================================================================
    # Supplier Rankings
    # ========================================================================
    
    async def get_supplier_rankings(
        self,
        customer_org_id: str,
        reporting_period: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Read rankings exclusively from the persisted canonical score snapshot."""
        supplier_query = {"customer_org_id": customer_org_id, "is_active": True}
        if reporting_period:
            supplier_query["reporting_period"] = reporting_period
        suppliers = await db.supplier_relationships.find(
            supplier_query,
            {"_id": 0}
        ).to_list(1000)
        
        active_questionnaires = await db.supplier_questionnaires.find(
            {"organization_id": customer_org_id, "is_active": True},
            {"_id": 0, "id": 1, "question_count": 1, "due_date": 1},
        ).to_list(500)
        questionnaire_by_id = {questionnaire["id"]: questionnaire for questionnaire in active_questionnaires}
        all_questionnaire_ids = set(questionnaire_by_id)
        supplier_ids = [supplier["id"] for supplier in suppliers]
        response_docs = await db.supplier_questionnaire_responses.find(
            {"supplier_relationship_id": {"$in": supplier_ids}},
            {"_id": 0, "supplier_relationship_id": 1, "questionnaire_id": 1, "reporting_period": 1, "status": 1, "answers": 1, "revision": 1, "updated_at": 1},
        ).sort([("revision", -1), ("updated_at", -1)]).to_list(10000)
        supplier_by_id = {supplier["id"]: supplier for supplier in suppliers}
        current_responses: Dict[tuple[str, str], Dict[str, Any]] = {}
        for response in response_docs:
            supplier = supplier_by_id.get(response["supplier_relationship_id"])
            if not supplier:
                continue
            response_period = response.get("reporting_period")
            if response_period and response_period != supplier.get("reporting_period"):
                continue
            key = (response["supplier_relationship_id"], response["questionnaire_id"])
            if key not in current_responses:
                current_responses[key] = response

        document_requirements_exist = await db.supplier_document_requirements.count_documents({
            "customer_org_id": customer_org_id,
            "is_active": True,
            "$or": [{"reporting_period": reporting_period}, {"reporting_period": {"$exists": False}}, {"reporting_period": None}],
        }) > 0
        training_assignments = await db.supplier_training_assignments.find(
            {"supplier_relationship_id": {"$in": supplier_ids}, "is_active": True},
            {"_id": 0, "supplier_relationship_id": 1, "reporting_period": 1},
        ).to_list(10000)
        training_supplier_ids = {
            assignment["supplier_relationship_id"]
            for assignment in training_assignments
            if not assignment.get("reporting_period") or assignment.get("reporting_period") == reporting_period
        }

        def due_date_has_passed(value: Optional[str]) -> bool:
            if not value:
                return False
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).date() < datetime.now(timezone.utc).date()
            except ValueError:
                return False

        rankings = []
        module_totals: Dict[str, Dict[str, float]] = {}
        for s in suppliers:
            snapshot = s.get("canonical_score_snapshot") or {}
            esg_score = snapshot.get("esg_score")
            env_score = snapshot.get("environment_score")
            social_score = snapshot.get("social_score")
            gov_score = snapshot.get("governance_score")
            ghg_score = snapshot.get("ghg_score")
            attribution_factor = float(s["revenue_percentage"]) / 100 if s.get("revenue_percentage") is not None else None
            raw_scope1 = snapshot.get("scope1_emissions", 0.0)
            raw_scope2 = snapshot.get("scope2_emissions", 0.0)
            raw_total = snapshot.get("total_emissions", 0.0)
            scope1 = float(raw_scope1) * attribution_factor if attribution_factor is not None else None
            scope2 = float(raw_scope2) * attribution_factor if attribution_factor is not None else None
            total_ghg = float(raw_total) * attribution_factor if attribution_factor is not None else None
            overall_score = snapshot.get("overall_score")
            
            assigned_questionnaire_ids = set(s.get("questionnaire_ids") or all_questionnaire_ids)
            assigned_questionnaire_ids &= all_questionnaire_ids
            supplier_responses = [
                current_responses[(s["id"], questionnaire_id)]
                for questionnaire_id in assigned_questionnaire_ids
                if (s["id"], questionnaire_id) in current_responses
            ]
            total_questions = sum(int(questionnaire_by_id[questionnaire_id].get("question_count") or 0) for questionnaire_id in assigned_questionnaire_ids)
            answered_questions = sum(
                len([answer for answer in (response.get("answers") or {}).values() if answer not in (None, "")])
                for response in supplier_responses
            )
            submitted_count = len([response for response in supplier_responses if response.get("status") == "submitted"])
            is_overdue = any(due_date_has_passed(value) for value in [s.get("due_date"), *[questionnaire_by_id[qid].get("due_date") for qid in assigned_questionnaire_ids]])
            all_assigned_submitted = bool(assigned_questionnaire_ids) and submitted_count == len(assigned_questionnaire_ids)
            if s.get("overall_completion_percent", 0) >= 100:
                completion_status, status_label = "completed", "Completed"
            elif is_overdue and not all_assigned_submitted:
                completion_status, status_label = "overdue", "Overdue"
            elif all_assigned_submitted:
                completion_status, status_label = "submitted", "Submitted"
            elif answered_questions > 0 or any(float(s.get(field) or 0) > 0 for field in ("esg_completion_percent", "ghg_completion_percent", "documents_completion_percent", "training_completion_percent")):
                completion_status, status_label = "in_progress", "In Progress"
            elif s.get("invitation_status") == "pending":
                completion_status, status_label = "invited", "Invited"
            else:
                completion_status, status_label = "not_started", "Not Started"
            attention_reasons = []
            if overall_score is not None and overall_score < 60:
                attention_reasons.append("Overall score needs improvement")
            for label, value in (("Environment", env_score), ("Social", social_score), ("Governance", gov_score)):
                if value is None and esg_score is not None:
                    attention_reasons.append(f"{label} assessment missing")
            if ghg_score is None and "ghg" in (s.get("modules_enabled") or []):
                attention_reasons.append("GHG assessment not completed")
            if completion_status == "overdue":
                attention_reasons.append("Assessment is overdue")
            module_progress: Dict[str, float] = {}
            module_fields = {
                "esg": "esg_completion_percent",
                "ghg": "ghg_completion_percent",
                "documents": "documents_completion_percent",
                "training": "training_completion_percent",
            }
            enabled_modules = set(s.get("modules_enabled") or ["esg", "ghg"])
            for module_code, completion_field in module_fields.items():
                if module_code not in enabled_modules:
                    continue
                if module_code == "documents" and not document_requirements_exist:
                    continue
                if module_code == "training" and s["id"] not in training_supplier_ids:
                    continue
                completion = round(float(s.get(completion_field) or 0), 1)
                module_progress[module_code] = completion
                totals = module_totals.setdefault(module_code, {"configured_suppliers": 0.0, "completed_suppliers": 0.0, "completion_total": 0.0})
                totals["configured_suppliers"] += 1
                totals["completed_suppliers"] += int(completion >= 100)
                totals["completion_total"] += completion
            
            rankings.append({
                "supplier_id": s["id"],
                "company_name": s["company_name"],
                "esg_score": round(esg_score, 1) if esg_score is not None else None,
                "environment_score": round(env_score, 1) if env_score is not None else None,
                "social_score": round(social_score, 1) if social_score is not None else None,
                "governance_score": round(gov_score, 1) if gov_score is not None else None,
                # Parent rankings intentionally do not expose a separate GHG score.
                "ghg_score": None,
                "scope1_emissions": round(scope1, 2) if scope1 is not None else None,
                "scope2_emissions": round(scope2, 2) if scope2 is not None else None,
                "total_emissions": round(total_ghg, 2) if total_ghg is not None else None,
                # Rankings are ESG-led: GHG is tracked in its dedicated emissions view.
                "overall_score": round(esg_score, 1) if esg_score is not None else None,
                "completion_status": completion_status,
                "status_label": status_label,
                "question_progress": f"{answered_questions} / {total_questions} questions" if completion_status == "in_progress" and total_questions else None,
                "attention_reasons": attention_reasons,
                "module_progress": module_progress,
                "due_date": s.get("due_date"),
                "revenue_percentage": s.get("revenue_percentage"),
                "revenue_amount": s.get("revenue_amount"),
                "revenue_currency": s.get("revenue_currency"),
            })
        
        # Sort and rank suppliers by ESG score. GHG has its own parent-emissions experience.
        rankings.sort(key=lambda x: (x["overall_score"] is None, -(x["overall_score"] or 0)))
        
        # Add ranks
        for i, r in enumerate(rankings):
            r["rank"] = i + 1 if r["overall_score"] is not None else None
        
        # Calculate aggregates for charts
        ranked_suppliers = [r for r in rankings if r["overall_score"] is not None]
        
        # Score distribution buckets
        score_distribution = {
            "excellent": len([r for r in ranked_suppliers if r["overall_score"] is not None and r["overall_score"] >= 80]),
            "good": len([r for r in ranked_suppliers if r["overall_score"] is not None and 60 <= r["overall_score"] < 80]),
            "average": len([r for r in ranked_suppliers if r["overall_score"] is not None and 40 <= r["overall_score"] < 60]),
            "poor": len([r for r in ranked_suppliers if r["overall_score"] is not None and r["overall_score"] < 40]),
        }
        
        # ESG data remains useful even when a supplier lacks another component
        # required for an Overall Score (for example, GHG or revenue).
        def average_score(field: str) -> Optional[float]:
            values = [float(row[field]) for row in rankings if row.get(field) is not None]
            return round(sum(values) / len(values), 1) if values else None

        avg_esg = average_score("esg_score")
        avg_env = average_score("environment_score")
        avg_social = average_score("social_score")
        avg_gov = average_score("governance_score")
        avg_ghg = average_score("ghg_score")
        
        # Total emissions by scope (Scope 1 & 2 only)
        total_scope1 = sum(r["scope1_emissions"] or 0 for r in rankings)
        total_scope2 = sum(r["scope2_emissions"] or 0 for r in rankings)
        module_summary = {
            code: {
                "configured_suppliers": int(totals["configured_suppliers"]),
                "completed_suppliers": int(totals["completed_suppliers"]),
                "average_completion": round(totals["completion_total"] / totals["configured_suppliers"], 1) if totals["configured_suppliers"] else 0.0,
            }
            for code, totals in module_totals.items()
        }
        
        return {
            "rankings": rankings,
            "total_suppliers": len(rankings),
            "ranked_suppliers": len(ranked_suppliers),
            "score_distribution": score_distribution,
            "averages": {
                "esg": avg_esg,
                "environment": avg_env,
                "social": avg_social,
                "governance": avg_gov,
                "ghg": avg_ghg,
            },
            "emissions_by_scope": {
                "scope1": round(total_scope1, 2),
                "scope2": round(total_scope2, 2),
                "total": round(total_scope1 + total_scope2, 2),
            },
            "module_summary": module_summary,
        }
    
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
            raise ValueError("Only Manual Review questions can receive a parent score")
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
            "answers": visible_response.get("answers", {}), "status": "in_progress",
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
        return {
            "esg": [item for item in esg_items if item["status"] == "locked"],
            "esg_items": esg_items,
            "ghg": {"status": "locked" if ghg_entries else "pending", "locked_at": locked_at, "entry_count": len(ghg_entries), "due_date": relationship.get("due_date")},
            "documents": documents,
            "training": training,
        }


# Singleton instance
supplier_service = SupplierAssessmentService()
