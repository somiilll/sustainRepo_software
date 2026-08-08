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


class SupplierAssessmentService:
    """Service for supplier assessment operations."""
    
    # ========================================================================
    # Supplier Management
    # ========================================================================
    
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
    ) -> Dict[str, Any]:
        """
        Create a new supplier:
        1. Create supplier organization (org_type=supplier)
        2. Create supplier admin user (user_type=supplier)
        3. Generate temp password and send invitation email
        4. Create supplier_relationship record
        """
        # Default module configuration
        if modules_enabled is None:
            modules_enabled = ["esg", "ghg"]
        if ghg_scopes_enabled is None:
            ghg_scopes_enabled = ["scope1", "scope2"]
        
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
            "invitation_status": "pending",
            "due_date": due_date,
            "last_reminder_sent": None,
            "reminder_count": 0,
            "is_active": True,
            # Module configuration
            "modules_enabled": modules_enabled,
            "ghg_scopes_enabled": ghg_scopes_enabled,
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
        
        # Get customer org name for email
        customer_org = await db.organizations.find_one(
            {"id": customer_org_id},
            {"_id": 0, "name": 1}
        )
        customer_name = customer_org.get("name", "Your Customer") if customer_org else "Your Customer"
        
        # Send invitation email
        frontend_url = os.environ.get('FRONTEND_URL', 'https://brsr-migration.preview.emergentagent.com')
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
    ) -> Dict[str, Any]:
        """Get paginated list of suppliers for a customer."""
        query = {
            "customer_org_id": customer_org_id,
            "is_active": True,
        }
        
        if status_filter:
            query["invitation_status"] = status_filter
        
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
    
    async def update_supplier(
        self,
        relationship_id: str,
        updates: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Update supplier relationship."""
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.supplier_relationships.update_one(
            {"id": relationship_id},
            {"$set": updates}
        )
        
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
        
        frontend_url = os.environ.get('FRONTEND_URL', 'https://brsr-migration.preview.emergentagent.com')
        login_link = f"{frontend_url}/login"
        
        # Determine pending modules
        pending_modules = []
        if relationship.get("esg_completion_percent", 0) < 100:
            pending_modules.append("ESG Questionnaire")
        if relationship.get("ghg_completion_percent", 0) < 100:
            pending_modules.append("GHG Emissions")
        if relationship.get("revenue_percentage") is None:
            pending_modules.append("Revenue Information")
        
        email_body = supplier_reminder_email(
            supplier_name=relationship["contact_person"],
            customer_name=customer_name,
            pending_modules=pending_modules,
            due_date=relationship.get("due_date"),
            login_link=login_link,
            custom_message=custom_message,
        )
        
        await send_email(
            relationship["contact_email"],
            f"Reminder: Complete Your Supplier Assessment for {customer_name}",
            email_body,
        )
        
        # Update reminder tracking
        await db.supplier_relationships.update_one(
            {"id": relationship_id},
            {"$set": {
                "last_reminder_sent": datetime.now(timezone.utc).isoformat(),
            }, "$inc": {"reminder_count": 1}}
        )
        
        return True
    
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
        
        # Recalculate completion
        await self._update_completion_status(relationship_id)
        
        return result.modified_count > 0
    
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
        created_by: str,
    ) -> Dict[str, Any]:
        """Create a new questionnaire template."""
        questionnaire_id = str(uuid.uuid4())
        questionnaire = {
            "id": questionnaire_id,
            "organization_id": organization_id,
            "name": name,
            "description": description,
            "due_date": due_date,
            "scoring_method": scoring_method,
            "section_weights": section_weights or {"environment": 33.33, "social": 33.33, "governance": 33.34},
            "is_active": True,
            "question_count": 0,
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.supplier_questionnaires.insert_one(questionnaire)
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
        return questionnaires
    
    async def get_questionnaire(self, questionnaire_id: str) -> Optional[Dict[str, Any]]:
        """Get single questionnaire with questions."""
        questionnaire = await db.supplier_questionnaires.find_one(
            {"id": questionnaire_id},
            {"_id": 0}
        )
        if questionnaire:
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
                category=q["category"],
                order=q.get("order", 0),
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
        weight: float,
        category: str,
        order: int,
        scoring: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Add a question to a questionnaire."""
        question_id = str(uuid.uuid4())
        question = {
            "id": question_id,
            "questionnaire_id": questionnaire_id,
            "question_text": question_text,
            "description": description,
            "response_type": response_type,
            "options": options,
            "required": required,
            "weight": weight,
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
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.supplier_questions.update_one(
            {"id": question_id},
            {"$set": updates}
        )
        return await db.supplier_questions.find_one({"id": question_id}, {"_id": 0})
    
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
        
        # Get all questionnaires for this customer
        questionnaires = await db.supplier_questionnaires.find(
            {"organization_id": customer_org_id, "is_active": True},
            {"_id": 0}
        ).to_list(100)
        
        statuses = []
        for q in questionnaires:
            # Get response status
            response_doc = await db.supplier_questionnaire_responses.find_one(
                {
                    "questionnaire_id": q["id"],
                    "supplier_relationship_id": relationship["id"],
                },
                {"_id": 0}
            )
            
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
        response_doc = await db.supplier_questionnaire_responses.find_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
            },
            {"_id": 0}
        )
        
        answers = response_doc.get("answers", {}) if response_doc else {}
        
        # Merge answers into questions
        for q in questionnaire.get("questions", []):
            q["answer"] = answers.get(q["id"])
        
        questionnaire["response_status"] = response_doc.get("status", "not_started") if response_doc else "not_started"
        questionnaire["submitted_at"] = response_doc.get("submitted_at") if response_doc else None
        
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
        response_doc = await db.supplier_questionnaire_responses.find_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
            },
            {"_id": 0}
        )
        
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
            calculated_score = await self._calculate_questionnaire_score(
                questionnaire_id, answers_dict, supplier_relationship_id
            )
        
        if response_doc:
            # Update existing
            update_data = {
                "answers": answers_dict,
                "status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if submitted_at:
                update_data["submitted_at"] = submitted_at
            if calculated_score is not None:
                update_data["calculated_score"] = calculated_score
            
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
                "submitted_at": submitted_at,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.supplier_questionnaire_responses.insert_one(new_doc)
        
        # Update completion status
        await self._update_completion_status(supplier_relationship_id)
        
        return {
            "status": status,
            "calculated_score": calculated_score,
            "message": "Answers saved" if is_draft else "Questionnaire submitted",
        }
    
    async def _calculate_questionnaire_score(
        self,
        questionnaire_id: str,
        answers: Dict[str, Any],
        supplier_relationship_id: Optional[str] = None,
    ) -> float:
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
            return 0.0
        
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
                    save_to_db=False,  # Don't save here, save in submit_supplier_answers
                )
                return breakdown.esg_score.overall_score
            except Exception as e:
                # Log error and fall back to legacy
                print(f"New scoring engine error: {e}, falling back to legacy")
        
        # Legacy scoring for backward compatibility
        return await self._calculate_legacy_score(questionnaire, questions, answers)
    
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
    
    async def _update_completion_status(self, relationship_id: str):
        """Update completion percentages for a supplier relationship."""
        relationship = await db.supplier_relationships.find_one(
            {"id": relationship_id},
            {"_id": 0}
        )
        if not relationship:
            return
        
        # Calculate ESG completion
        questionnaires = await db.supplier_questionnaires.find(
            {"organization_id": relationship["customer_org_id"], "is_active": True},
            {"_id": 0, "id": 1}
        ).to_list(100)
        
        if questionnaires:
            total_completion = 0.0
            for q in questionnaires:
                response = await db.supplier_questionnaire_responses.find_one(
                    {
                        "questionnaire_id": q["id"],
                        "supplier_relationship_id": relationship_id,
                    },
                    {"_id": 0}
                )
                if response:
                    total_questions = await db.supplier_questions.count_documents(
                        {"questionnaire_id": q["id"], "is_active": True}
                    )
                    answered = len([a for a in response.get("answers", {}).values() if a is not None])
                    if total_questions > 0:
                        total_completion += (answered / total_questions) * 100
            
            esg_completion = total_completion / len(questionnaires) if questionnaires else 0.0
        else:
            esg_completion = 0.0
        
        # Calculate GHG completion (simplified: has any emissions = 50%, has for all scopes = 100%)
        ghg_count = await db.emission_records.count_documents({
            "source": "supplier",
            "supplier_relationship_id": relationship_id,
        })
        ghg_completion = min(100.0, ghg_count * 25)  # Each record adds 25%
        
        # Revenue percentage counts as part of overall
        revenue_done = 1 if relationship.get("revenue_percentage") is not None else 0
        
        # Overall = weighted average (ESG 40%, GHG 40%, Revenue 20%)
        overall_completion = (esg_completion * 0.4) + (ghg_completion * 0.4) + (revenue_done * 100 * 0.2)
        
        # Update status
        status = "pending"
        if overall_completion > 0:
            status = "accepted"
        if overall_completion >= 100:
            status = "completed"
        
        await db.supplier_relationships.update_one(
            {"id": relationship_id},
            {"$set": {
                "esg_completion_percent": round(esg_completion, 1),
                "ghg_completion_percent": round(ghg_completion, 1),
                "overall_completion_percent": round(overall_completion, 1),
                "invitation_status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
    
    # ========================================================================
    # Supplier Rankings
    # ========================================================================
    
    async def get_supplier_rankings(
        self,
        customer_org_id: str,
    ) -> Dict[str, Any]:
        """Get supplier rankings for a customer with detailed breakdown."""
        suppliers = await db.supplier_relationships.find(
            {"customer_org_id": customer_org_id, "is_active": True},
            {"_id": 0}
        ).to_list(1000)
        
        # Calculate scores for each supplier
        rankings = []
        for s in suppliers:
            # Get ESG score from questionnaire responses with breakdown
            esg_scores = []
            env_scores = []
            social_scores = []
            gov_scores = []
            
            responses = await db.supplier_questionnaire_responses.find(
                {"supplier_relationship_id": s["id"], "status": "submitted"},
                {"_id": 0, "calculated_score": 1, "score_breakdown": 1, "esg_score": 1, "questionnaire_id": 1, "answers": 1}
            ).to_list(100)
            
            for r in responses:
                if r.get("calculated_score") is not None:
                    esg_scores.append(r["calculated_score"])
                
                # Try to extract section scores from breakdown first
                breakdown = r.get("score_breakdown", {})
                has_breakdown = False
                if breakdown:
                    esg_data = breakdown.get("esg_score", {})
                    if esg_data:
                        env = esg_data.get("environment", {})
                        social = esg_data.get("social", {})
                        gov = esg_data.get("governance", {})
                        if env and env.get("score"):
                            env_scores.append(env["score"])
                            has_breakdown = True
                        if social and social.get("score"):
                            social_scores.append(social["score"])
                            has_breakdown = True
                        if gov and gov.get("score"):
                            gov_scores.append(gov["score"])
                            has_breakdown = True
                
                # Fallback: Calculate E/S/G from question answers if no breakdown
                if not has_breakdown and r.get("questionnaire_id") and r.get("answers"):
                    questions = await db.supplier_questions.find(
                        {"questionnaire_id": r["questionnaire_id"], "is_active": True},
                        {"_id": 0, "id": 1, "category": 1, "response_type": 1, "weight": 1}
                    ).to_list(200)
                    
                    cat_scores = {"environment": [], "social": [], "governance": []}
                    for q in questions:
                        ans = r["answers"].get(q["id"])
                        if ans is not None:
                            # Simple scoring: yes_no -> 100/0, else use answer if numeric
                            score = 0
                            if q.get("response_type") == "yes_no":
                                score = 100 if str(ans).lower() in ["yes", "true", "1"] else 0
                            elif isinstance(ans, (int, float)):
                                score = min(100, max(0, float(ans)))
                            else:
                                score = 100  # Text answers = full score if answered
                            
                            cat = q.get("category", "environment")
                            if cat in cat_scores:
                                cat_scores[cat].append(score * q.get("weight", 1))
                    
                    if cat_scores["environment"]:
                        env_scores.append(sum(cat_scores["environment"]) / len(cat_scores["environment"]))
                    if cat_scores["social"]:
                        social_scores.append(sum(cat_scores["social"]) / len(cat_scores["social"]))
                    if cat_scores["governance"]:
                        gov_scores.append(sum(cat_scores["governance"]) / len(cat_scores["governance"]))
            
            esg_score = sum(esg_scores) / len(esg_scores) if esg_scores else None
            env_score = min(100, sum(env_scores) / len(env_scores)) if env_scores else None
            social_score = min(100, sum(social_scores) / len(social_scores)) if social_scores else None
            gov_score = min(100, sum(gov_scores) / len(gov_scores)) if gov_scores else None
            
            # Get GHG emissions by scope (Scope 1 & 2 only for suppliers)
            # First try supplier-specific emissions, then fall back to org-level emissions
            ghg_emissions = await db.emission_records.find(
                {
                    "$or": [
                        # Option 1: Emissions tagged with supplier relationship
                        {"source": "supplier", "supplier_relationship_id": s["id"]},
                        # Option 2: Emissions from supplier's organization
                        {"organization_id": s.get("supplier_org_id")},
                    ],
                    "scope": {"$in": ["scope_1", "scope_2", "scope1", "scope2"]},  # Handle both formats
                },
                {"_id": 0, "total_emissions": 1, "scope": 1}
            ).to_list(1000)
            
            scope1 = sum(e.get("total_emissions", 0) or 0 for e in ghg_emissions if e.get("scope") in ["scope_1", "scope1"])
            scope2 = sum(e.get("total_emissions", 0) or 0 for e in ghg_emissions if e.get("scope") in ["scope_2", "scope2"])
            total_ghg = scope1 + scope2
            
            ghg_score = None
            if ghg_emissions:
                # Normalize: assume 1000 tCO2e is "bad" (score 0), 0 is "good" (score 100)
                ghg_score = max(0, 100 - (total_ghg / 10))  # Simple normalization
            
            # Calculate overall score
            overall_score = None
            if esg_score is not None or ghg_score is not None:
                scores = [sc for sc in [esg_score, ghg_score] if sc is not None]
                overall_score = sum(scores) / len(scores)
            
            # Determine completion status
            completion_status = "not_started"
            if s.get("overall_completion_percent", 0) > 0:
                completion_status = "in_progress"
            if s.get("overall_completion_percent", 0) >= 100:
                completion_status = "completed"
            
            rankings.append({
                "supplier_id": s["id"],
                "company_name": s["company_name"],
                "esg_score": round(esg_score, 1) if esg_score else None,
                "environment_score": round(env_score, 1) if env_score else None,
                "social_score": round(social_score, 1) if social_score else None,
                "governance_score": round(gov_score, 1) if gov_score else None,
                "ghg_score": round(ghg_score, 1) if ghg_score else None,
                "scope1_emissions": round(scope1, 2),
                "scope2_emissions": round(scope2, 2),
                "total_emissions": round(total_ghg, 2),
                "overall_score": round(overall_score, 1) if overall_score else None,
                "completion_status": completion_status,
                "revenue_percentage": s.get("revenue_percentage"),
            })
        
        # Sort by overall score (None at end)
        rankings.sort(key=lambda x: (x["overall_score"] is None, -(x["overall_score"] or 0)))
        
        # Add ranks
        for i, r in enumerate(rankings):
            r["rank"] = i + 1 if r["overall_score"] is not None else None
        
        # Calculate aggregates for charts
        ranked_suppliers = [r for r in rankings if r["overall_score"] is not None]
        
        # Score distribution buckets
        score_distribution = {
            "excellent": len([r for r in ranked_suppliers if r["overall_score"] and r["overall_score"] >= 80]),
            "good": len([r for r in ranked_suppliers if r["overall_score"] and 60 <= r["overall_score"] < 80]),
            "average": len([r for r in ranked_suppliers if r["overall_score"] and 40 <= r["overall_score"] < 60]),
            "poor": len([r for r in ranked_suppliers if r["overall_score"] and r["overall_score"] < 40]),
        }
        
        # Average scores
        avg_esg = sum(r["esg_score"] for r in ranked_suppliers if r["esg_score"]) / len([r for r in ranked_suppliers if r["esg_score"]]) if any(r["esg_score"] for r in ranked_suppliers) else 0
        avg_env = sum(r["environment_score"] for r in ranked_suppliers if r["environment_score"]) / len([r for r in ranked_suppliers if r["environment_score"]]) if any(r["environment_score"] for r in ranked_suppliers) else 0
        avg_social = sum(r["social_score"] for r in ranked_suppliers if r["social_score"]) / len([r for r in ranked_suppliers if r["social_score"]]) if any(r["social_score"] for r in ranked_suppliers) else 0
        avg_gov = sum(r["governance_score"] for r in ranked_suppliers if r["governance_score"]) / len([r for r in ranked_suppliers if r["governance_score"]]) if any(r["governance_score"] for r in ranked_suppliers) else 0
        avg_ghg = sum(r["ghg_score"] for r in ranked_suppliers if r["ghg_score"]) / len([r for r in ranked_suppliers if r["ghg_score"]]) if any(r["ghg_score"] for r in ranked_suppliers) else 0
        
        # Total emissions by scope (Scope 1 & 2 only)
        total_scope1 = sum(r["scope1_emissions"] for r in rankings)
        total_scope2 = sum(r["scope2_emissions"] for r in rankings)
        
        return {
            "rankings": rankings,
            "total_suppliers": len(rankings),
            "ranked_suppliers": len(ranked_suppliers),
            "score_distribution": score_distribution,
            "averages": {
                "esg": round(avg_esg, 1),
                "environment": round(avg_env, 1),
                "social": round(avg_social, 1),
                "governance": round(avg_gov, 1),
                "ghg": round(avg_ghg, 1),
            },
            "emissions_by_scope": {
                "scope1": round(total_scope1, 2),
                "scope2": round(total_scope2, 2),
                "total": round(total_scope1 + total_scope2, 2),
            },
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
        
        response_doc = await db.supplier_questionnaire_responses.find_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
            },
            {"_id": 0}
        )
        
        answers = response_doc.get("answers", {}) if response_doc else {}
        
        # Merge answers into questions
        for q in questionnaire.get("questions", []):
            q["answer"] = answers.get(q["id"])
        
        questionnaire["response_status"] = response_doc.get("status", "not_started") if response_doc else "not_started"
        questionnaire["calculated_score"] = response_doc.get("calculated_score") if response_doc else None
        questionnaire["submitted_at"] = response_doc.get("submitted_at") if response_doc else None
        
        return questionnaire
    
    async def reopen_questionnaire(
        self,
        supplier_relationship_id: str,
        questionnaire_id: str,
    ) -> bool:
        """Admin reopens a questionnaire for a supplier to edit."""
        result = await db.supplier_questionnaire_responses.update_one(
            {
                "questionnaire_id": questionnaire_id,
                "supplier_relationship_id": supplier_relationship_id,
            },
            {"$set": {
                "status": "in_progress",
                "reopened_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        
        if result.modified_count > 0:
            await self._update_completion_status(supplier_relationship_id)
        
        return result.modified_count > 0


# Singleton instance
supplier_service = SupplierAssessmentService()
