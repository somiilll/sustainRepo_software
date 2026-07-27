"""
ESG Questionnaire Service

Business logic for config-driven ESG questionnaire system.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from shared.database.mongo import db
from modules.esg_questionnaire.contracts import (
    QuestionConfigCreate,
    QuestionConfigUpdate,
    ESGResponseCreate,
    NGRBC_PRINCIPLES,
)
from modules.esg_records.version_utils import compare_versions, format_field_display_name


class ESGQuestionnaireService:
    """Service for managing ESG questionnaire configs and responses."""

    CONFIGS_COLLECTION = "esg_question_configs"
    RESPONSES_COLLECTION = "organization_esg_responses"

    def __init__(self, database=None):
        self._db = database or db
        self._configs = self._db[self.CONFIGS_COLLECTION]
        self._responses = self._db[self.RESPONSES_COLLECTION]

    # =========================================================================
    # Question Config Methods
    # =========================================================================

    async def get_question_config(self, question_key: str) -> Optional[Dict[str, Any]]:
        """Get a single question config by key."""
        return await self._configs.find_one(
            {"question_key": question_key},
            {"_id": 0}
        )

    async def list_question_configs(
        self,
        framework: Optional[str] = None,
        section: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List question configs with optional filtering."""
        query = {}
        if framework:
            query["frameworks"] = framework
        if section:
            query["section"] = section
        
        cursor = self._configs.find(query, {"_id": 0}).sort("order", 1)
        return await cursor.to_list(500)

    async def create_question_config(self, config: QuestionConfigCreate) -> Dict[str, Any]:
        """Create a new question config."""
        # Check if question_key already exists
        existing = await self.get_question_config(config.question_key)
        if existing:
            raise ValueError(f"Question with key '{config.question_key}' already exists")
        
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            **config.model_dump(),
            "created_at": now,
            "updated_at": None,
        }
        await self._configs.insert_one(doc)
        doc.pop("_id", None)
        return doc

    async def update_question_config(
        self, 
        question_key: str, 
        update: QuestionConfigUpdate
    ) -> Optional[Dict[str, Any]]:
        """Update an existing question config."""
        existing = await self.get_question_config(question_key)
        if not existing:
            return None
        
        update_dict = update.model_dump(exclude_unset=True)
        if not update_dict:
            return existing
        
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        await self._configs.update_one(
            {"question_key": question_key},
            {"$set": update_dict}
        )
        return await self.get_question_config(question_key)

    async def delete_question_config(self, question_key: str) -> bool:
        """Delete a question config."""
        result = await self._configs.delete_one({"question_key": question_key})
        return result.deleted_count > 0

    async def bulk_create_question_configs(
        self, 
        configs: List[QuestionConfigCreate]
    ) -> List[Dict[str, Any]]:
        """Bulk create question configs."""
        now = datetime.now(timezone.utc).isoformat()
        docs = []
        for config in configs:
            doc = {
                "id": str(uuid.uuid4()),
                **config.model_dump(),
                "created_at": now,
                "updated_at": None,
            }
            docs.append(doc)
        
        if docs:
            await self._configs.insert_many(docs)
            for doc in docs:
                doc.pop("_id", None)
        return docs

    # =========================================================================
    # GRI Disclosure Methods
    # =========================================================================

    async def get_gri_disclosures(
        self,
        org_id: str,
        section: str,
        reporting_period: str,
        user_id: Optional[str] = None,
        filter_by_assignment: bool = False,
    ) -> Dict[str, Any]:
        """
        Get GRI disclosures with responses for a section.
        Returns questions with their current responses.
        Supports sub_questions with individual response fields.
        Also includes pending submission status for the user.
        
        If filter_by_assignment=True, only returns questions assigned to the user.
        """
        # Fetch GRI question configs for this section
        configs = await self._configs.find(
            {
                "framework": "GRI",
                "section": section,
            },
            {"_id": 0}
        ).sort([("disclosure_id", 1), ("question_order", 1)]).to_list(500)
        
        if not configs:
            return {
                "section": section,
                "reporting_period": reporting_period,
                "questions": [],
                "total": 0
            }
        
        # If filtering by assignment, get user's assigned disclosure/question IDs
        assigned_disclosure_ids = None
        assigned_question_keys = None
        if filter_by_assignment and user_id:
            # Get assignments for this user from esg_assignments
            assignments_cursor = db.esg_assignments.find(
                {
                    "organization_id": org_id,
                    "assigned_to_user_id": user_id,
                    "entity_type": {"$in": ["disclosure", "question", "material_topic"]},
                    "reporting_period": reporting_period,
                },
                {"_id": 0, "entity_id": 1, "entity_type": 1, "disclosure_id": 1, "question_key": 1}
            )
            assignments = await assignments_cursor.to_list(500)
            
            assigned_disclosure_ids = set()
            assigned_question_keys = set()
            for a in assignments:
                if a.get("entity_type") == "disclosure":
                    assigned_disclosure_ids.add(a.get("entity_id") or a.get("disclosure_id"))
                elif a.get("entity_type") == "question":
                    assigned_question_keys.add(a.get("entity_id") or a.get("question_key"))
                elif a.get("entity_type") == "material_topic":
                    # If assigned to a material topic, include all disclosures in that topic
                    topic_id = a.get("entity_id")
                    if topic_id:
                        topic_disclosures = [c.get("disclosure_id") for c in configs 
                                            if c.get("material_topic_id") == topic_id]
                        assigned_disclosure_ids.update(topic_disclosures)
            
            # Filter configs to only include assigned items
            if assigned_disclosure_ids or assigned_question_keys:
                configs = [
                    c for c in configs 
                    if c.get("disclosure_id") in assigned_disclosure_ids 
                    or c.get("question_key") in assigned_question_keys
                ]
            else:
                # User has no assignments - return empty
                return {
                    "section": section,
                    "reporting_period": reporting_period,
                    "questions": [],
                    "total": 0,
                    "message": "No disclosures assigned to you in this section"
                }
        
        # Build list of all response keys (including sub-question keys)
        all_response_keys = []
        for config in configs:
            q_key = config["question_key"]
            sub_questions = config.get("sub_questions", [])
            if sub_questions:
                # For questions with sub-parts, each sub_key gets its own response
                for sub in sub_questions:
                    all_response_keys.append(f"{q_key}_{sub['sub_key']}")
            else:
                all_response_keys.append(q_key)
        
        # Fetch responses from esg_responses collection (include status)
        responses_cursor = db.esg_responses.find(
            {
                "organization_id": org_id,
                "question_key": {"$in": all_response_keys},
                "reporting_period": reporting_period,
            },
            {"_id": 0, "question_key": 1, "value": 1, "status": 1, "updated_at": 1, "updated_by_name": 1}
        )
        responses_list = await responses_cursor.to_list(1000)
        responses_map = {r["question_key"]: r for r in responses_list}
        
        # Fetch user's drafts from esg_response_drafts
        user_drafts_map = {}
        if user_id:
            drafts_cursor = db[self.DRAFTS_COLLECTION].find(
                {
                    "organization_id": org_id,
                    "reporting_period": reporting_period,
                    "user_id": user_id,
                    "is_latest": True,
                },
                {"_id": 0, "draft_data": 1}
            )
            drafts_list = await drafts_cursor.to_list(100)
            for draft in drafts_list:
                draft_data = draft.get("draft_data", {})
                for qk, val in draft_data.items():
                    user_drafts_map[qk] = val
        
        # Fetch pending submissions for all questions (to show pending_approval status)
        submissions_cursor = db[self.SUBMISSIONS_COLLECTION].find(
            {
                "organization_id": org_id,
                "question_key": {"$in": all_response_keys},
                "reporting_period": reporting_period,
                "status": "pending_approval",
            },
            {"_id": 0, "question_key": 1, "submitted_by_user_id": 1, "status": 1}
        )
        submissions_list = await submissions_cursor.to_list(1000)
        # Map: question_key -> list of pending submissions
        submissions_map = {}
        for sub in submissions_list:
            qk = sub["question_key"]
            if qk not in submissions_map:
                submissions_map[qk] = []
            submissions_map[qk].append(sub)
        
        # Build questions list with responses
        questions = []
        for config in configs:
            q_key = config["question_key"]
            sub_questions = config.get("sub_questions", [])
            
            question_data = {
                "question_key": q_key,
                "disclosure_id": config.get("disclosure_id"),
                "disclosure_name": config.get("disclosure_name"),
                "material_topic": config.get("material_topic"),
                "material_topic_id": config.get("material_topic_id"),
                "question_order": config.get("question_order", 0),
                "description": config.get("description"),
                "input_type": config.get("input_type", "textarea"),
                "response_mode": config.get("response_mode", "single"),
                "is_required": config.get("is_required", False),
                "validation_rules": config.get("validation_rules"),
                "visibility_conditions": config.get("visibility_conditions"),
            }
            
            if sub_questions:
                # Include sub_questions with their individual responses
                question_data["sub_questions"] = []
                has_any_saved = False
                has_any_draft = False
                has_any_pending_approval = False
                has_any_user_draft = False
                for sub in sub_questions:
                    sub_response_key = f"{q_key}_{sub['sub_key']}"
                    sub_response = responses_map.get(sub_response_key, {})
                    sub_submissions = submissions_map.get(sub_response_key, [])
                    user_draft_value = user_drafts_map.get(sub_response_key)
                    
                    # Determine status: user draft > pending_approval > saved status
                    sub_status = sub_response.get("status")
                    user_has_pending = any(s["submitted_by_user_id"] == user_id for s in sub_submissions) if user_id else False
                    user_has_draft = user_draft_value is not None
                    
                    # For display: if user has draft, show as "draft" for this user
                    display_status = sub_status
                    if user_has_draft:
                        display_status = "draft"
                        has_any_user_draft = True
                    elif user_has_pending:
                        display_status = "pending_approval"
                        has_any_pending_approval = True
                    elif sub_status == "saved":
                        has_any_saved = True
                    elif sub_status == "draft":
                        has_any_draft = True
                    
                    question_data["sub_questions"].append({
                        "sub_key": sub["sub_key"],
                        "label": sub["label"],
                        "response_key": sub_response_key,
                        "response_value": sub_response.get("value"),
                        "response_status": display_status,
                        "saved_status": sub_status,  # Original saved status
                        "user_draft_value": user_draft_value,  # User's draft if any
                        "has_user_draft": user_has_draft,
                        "pending_submissions_count": len(sub_submissions),
                    })
                
                # Overall status for the parent question
                if has_any_user_draft:
                    question_data["status"] = "draft"
                elif has_any_pending_approval:
                    question_data["status"] = "pending_approval"
                elif has_any_saved:
                    question_data["status"] = "saved"
                elif has_any_draft:
                    question_data["status"] = "draft"
                else:
                    question_data["status"] = "pending"
                    
                question_data["pending_submissions_count"] = sum(
                    len(submissions_map.get(f"{q_key}_{sub['sub_key']}", []))
                    for sub in sub_questions
                )
            else:
                # Simple question with single response
                response = responses_map.get(q_key, {})
                pending_submissions = submissions_map.get(q_key, [])
                user_has_pending = any(s["submitted_by_user_id"] == user_id for s in pending_submissions) if user_id else False
                user_draft_value = user_drafts_map.get(q_key)
                user_has_draft = user_draft_value is not None
                
                question_data["response_value"] = response.get("value")
                question_data["user_draft_value"] = user_draft_value
                question_data["has_user_draft"] = user_has_draft
                question_data["saved_status"] = response.get("status")
                
                # Determine display status
                if user_has_draft:
                    question_data["status"] = "draft"
                elif user_has_pending:
                    question_data["status"] = "pending_approval"
                else:
                    question_data["status"] = response.get("status", "pending") if response else "pending"
                
                question_data["updated_at"] = response.get("updated_at")
                question_data["updated_by_name"] = response.get("updated_by_name")
                question_data["pending_submissions_count"] = len(pending_submissions)
            
            questions.append(question_data)
        
        return {
            "section": section,
            "reporting_period": reporting_period,
            "questions": questions,
            "total": len(questions)
        }

    async def _has_approval_workflow_enabled(self, org_id: str) -> bool:
        """Check if organization has approval workflow enabled for ESG responses."""
        try:
            from modules.approval_workflow.service import ApprovalWorkflowService
            workflow = await ApprovalWorkflowService.get_workflow_for_entity(
                org_id, "esg_response", None
            )
            return workflow is not None
        except Exception:
            return False
    
    async def _has_approver_assigned(
        self, 
        org_id: str, 
        question_key: str, 
        reporting_period: str
    ) -> bool:
        """
        Check if there's an approver assigned to this question or its section.
        Returns True if approval workflow is enabled AND approver is assigned.
        
        For subpart questions (e.g., gri_101_2_a_iii), also checks parent assignments (gri_101_2_a).
        """
        # Check if there's an assignment with requires_approval=True for this question
        assignment = await db.esg_assignments.find_one({
            "organization_id": org_id,
            "entity_id": question_key,
            "entity_type": "question",
            "reporting_period": reporting_period,
            "requires_approval": True,
        }, {"_id": 0, "id": 1})
        
        if assignment:
            return True
        
        # Check parent question assignments for subparts (e.g., gri_101_2_a_iii -> gri_101_2_a)
        if "_" in question_key:
            parts = question_key.rsplit("_", 1)
            while len(parts) > 1:
                parent_key = parts[0]
                parent_assignment = await db.esg_assignments.find_one({
                    "organization_id": org_id,
                    "entity_id": parent_key,
                    "entity_type": "question",
                    "reporting_period": reporting_period,
                    "requires_approval": True,
                }, {"_id": 0, "id": 1})
                
                if parent_assignment:
                    return True
                parts = parent_key.rsplit("_", 1)
        
        # Also check section-level assignment
        # Extract section from question_key (e.g., "gri_302_1_a" -> get section from config)
        config = await self._configs.find_one(
            {"question_key": question_key},
            {"_id": 0, "section": 1}
        )
        
        if config and config.get("section"):
            section_assignment = await db.esg_assignments.find_one({
                "organization_id": org_id,
                "entity_id": config["section"],
                "entity_type": "section",
                "reporting_period": reporting_period,
                "requires_approval": True,
            }, {"_id": 0, "id": 1})
            
            if section_assignment:
                return True
        
        return False

    async def _should_use_direct_save(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str
    ) -> bool:
        """
        Determine if direct save (last save wins) should be used.
        
        Direct save (last save wins) applies when:
        - Approval workflow is OFF for org, OR
        - Approval workflow is ON but NO approver is assigned to question/section
        
        Returns True if direct save should be used (last save wins).
        Returns False if submissions should go to approver queue.
        """
        has_approval = await self._has_approval_workflow_enabled(org_id)
        
        if not has_approval:
            # No approval workflow → direct save (last save wins)
            return True
        
        has_approver = await self._has_approver_assigned(org_id, question_key, reporting_period)
        
        if not has_approver:
            # Approval ON but no approver assigned → direct save (last save wins)
            return True
        
        # Approval ON and approver assigned → submissions go to approver queue
        return False

    async def _clear_other_users_drafts(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str,
        saved_by_user_id: str
    ) -> int:
        """
        Delete all drafts for this question except from the user who saved.
        Called after a successful "Save" to clean up other users' drafts.
        
        Returns the number of drafts deleted.
        """
        # The question_key might be a sub-question key like "gri_302_1_a_i"
        # We need to find the parent disclosure_id to delete related drafts
        
        # For individual question drafts in esg_response_drafts
        # These are stored with draft_data containing multiple question_keys
        # We need to remove this specific question_key from all other users' draft_data
        
        # Find all drafts that contain this question_key (from other users)
        drafts_cursor = db[self.DRAFTS_COLLECTION].find({
            "organization_id": org_id,
            "reporting_period": reporting_period,
            "user_id": {"$ne": saved_by_user_id},
            f"draft_data.{question_key}": {"$exists": True},
            "is_latest": True,
        })
        
        drafts = await drafts_cursor.to_list(100)
        deleted_count = 0
        
        for draft in drafts:
            draft_data = draft.get("draft_data", {})
            if question_key in draft_data:
                # Remove this question from the draft
                del draft_data[question_key]
                
                if draft_data:
                    # Update the draft with the question removed
                    await db[self.DRAFTS_COLLECTION].update_one(
                        {"id": draft["id"]},
                        {"$set": {"draft_data": draft_data}}
                    )
                else:
                    # No more questions in draft, delete entirely
                    await db[self.DRAFTS_COLLECTION].delete_one({"id": draft["id"]})
                
                deleted_count += 1
        
        return deleted_count

    # =========================================================================
    # Submission Management (Phase 2: Approval Queue)
    # =========================================================================
    
    SUBMISSIONS_COLLECTION = "esg_response_submissions"

    async def _create_submission_for_approval(
        self,
        org_id: str,
        question_key: str,
        value: Any,
        reporting_period: str,
        user_id: str,
        user_name: str,
        user_email: str,
    ) -> dict:
        """
        Create a submission entry for approver review.
        Called when approval workflow is ON and approver is assigned.
        
        Multiple users can submit - all submissions go to the queue.
        """
        now = datetime.now(timezone.utc)
        submission_id = str(uuid.uuid4())
        
        # Check if user already has a pending submission for this question
        existing_submission = await db[self.SUBMISSIONS_COLLECTION].find_one({
            "organization_id": org_id,
            "question_key": question_key,
            "reporting_period": reporting_period,
            "submitted_by_user_id": user_id,
            "status": "pending_approval",
        })
        
        if existing_submission:
            # Update existing submission
            await db[self.SUBMISSIONS_COLLECTION].update_one(
                {"id": existing_submission["id"]},
                {
                    "$set": {
                        "value": value,
                        "updated_at": now,
                    }
                }
            )
            submission_id = existing_submission["id"]
        else:
            # Create new submission
            submission_doc = {
                "id": submission_id,
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
                "submitted_by_user_id": user_id,
                "submitted_by_user_name": user_name,
                "submitted_by_user_email": user_email,
                "submitted_at": now,
                "value": value,
                "status": "pending_approval",
                "approval_request_id": None,
                "approved_by_user_id": None,
                "approved_by_user_name": None,
                "approved_at": None,
                "rejection_reason": None,
                "created_at": now,
                "updated_at": now,
            }
            await db[self.SUBMISSIONS_COLLECTION].insert_one(submission_doc)
        
        # Log to audit trail
        audit_entry = {
            "id": str(uuid.uuid4()),
            "question_key": question_key,
            "reporting_period": reporting_period,
            "organization_id": org_id,
            "action": "submitted_for_approval",
            "timestamp": now,
            "performed_by": {
                "user_id": user_id,
                "name": user_name,
                "email": user_email,
            },
            "change_details": {
                "submission_id": submission_id,
                "value": value,
            },
        }
        await db.question_audit_log.insert_one(audit_entry)
        
        return {
            "submission_id": submission_id,
            "status": "pending_approval",
            "is_update": existing_submission is not None,
        }

    async def get_pending_submissions(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str,
    ) -> List[Dict[str, Any]]:
        """
        Get all pending submissions for a question.
        Used by approvers to review and select/merge submissions.
        """
        cursor = db[self.SUBMISSIONS_COLLECTION].find(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
                "status": "pending_approval",
            },
            {"_id": 0}
        ).sort("submitted_at", -1)
        
        return await cursor.to_list(100)

    async def get_all_pending_submissions_for_org(
        self,
        org_id: str,
        reporting_period: Optional[str] = None,
        section: Optional[str] = None,
        approver_user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get all pending submissions for an organization.
        Optionally filter by reporting period, section, and approver assignment.
        Used by approvers to see their approval queue.
        
        If approver_user_id is provided, only return submissions where:
        - The user is assigned as approver for that question/section
        """
        query = {
            "organization_id": org_id,
            "status": "pending_approval",
        }
        
        if reporting_period:
            query["reporting_period"] = reporting_period
        
        cursor = db[self.SUBMISSIONS_COLLECTION].find(query, {"_id": 0}).sort("submitted_at", -1)
        submissions = await cursor.to_list(500)
        
        # If section filter, get question configs and filter
        if section:
            # Get all question keys for this section
            configs = await self._configs.find(
                {"section": section},
                {"_id": 0, "question_key": 1}
            ).to_list(500)
            section_question_keys = {c["question_key"] for c in configs}
            
            # Also include sub-question keys (question_key + "_" + sub_key)
            submissions = [
                s for s in submissions 
                if s["question_key"] in section_question_keys or 
                   any(s["question_key"].startswith(qk + "_") for qk in section_question_keys)
            ]
        
        # If approver_user_id filter, check assignments
        if approver_user_id:
            # Get all assignments where this user is an approver
            assignments = await db["esg_assignments"].find(
                {
                    "organization_id": org_id,
                    "approver_ids": approver_user_id,
                },
                {"_id": 0, "entity_id": 1, "section": 1}
            ).to_list(500)
            
            # Create set of question keys this user can approve
            approver_question_keys = {a["entity_id"] for a in assignments}
            approver_sections = {a["section"] for a in assignments if a.get("section")}
            
            # Filter submissions to only those the user can approve
            filtered_submissions = []
            for sub in submissions:
                qk = sub["question_key"]
                # Check if user is approver for this specific question
                if qk in approver_question_keys:
                    filtered_submissions.append(sub)
                # Or check if user is approver for any question in this section
                elif any(qk.startswith(aqk) for aqk in approver_question_keys):
                    filtered_submissions.append(sub)
            
            submissions = filtered_submissions
        
        # Group by question_key for easier display
        grouped = {}
        for sub in submissions:
            qk = sub["question_key"]
            if qk not in grouped:
                grouped[qk] = {
                    "question_key": qk,
                    "reporting_period": sub["reporting_period"],
                    "submissions": []
                }
            grouped[qk]["submissions"].append(sub)
        
        return list(grouped.values())

    async def approve_submission(
        self,
        org_id: str,
        submission_id: str,
        approver_user_id: str,
        approver_user_name: str,
        approver_user_email: str,
        merged_value: Optional[str] = None,
    ) -> dict:
        """
        Approve a submission and save to final esg_responses.
        
        If merged_value is provided, use that instead of the submission's value.
        This supports:
        - Approving a single submission as-is
        - Approving with a merged/edited value
        
        Also rejects all other pending submissions for the same question.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Find the submission
        submission = await db[self.SUBMISSIONS_COLLECTION].find_one(
            {
                "id": submission_id,
                "organization_id": org_id,
                "status": "pending_approval",
            },
            {"_id": 0}
        )
        
        if not submission:
            return {
                "success": False,
                "message": "Submission not found or already processed"
            }
        
        question_key = submission["question_key"]
        reporting_period = submission["reporting_period"]
        final_value = merged_value if merged_value is not None else submission["value"]
        
        # Save to final esg_responses
        # Set both 'status' and 'approval_status' for consistency across frameworks
        await db.esg_responses.update_one(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            {
                "$set": {
                    "value": final_value,
                    "status": "approved",
                    "approval_status": "approved",  # Also set approval_status for tracker compatibility
                    "reporting_year": reporting_period,  # Ensure reporting_year is set for queries
                    "updated_at": now_iso,
                    "updated_by": submission["submitted_by_user_id"],
                    "updated_by_name": submission["submitted_by_user_name"],
                    "updated_by_email": submission["submitted_by_user_email"],
                    "approved_by": approver_user_id,
                    "approved_by_name": approver_user_name,
                    "approved_at": now_iso,
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "organization_id": org_id,
                    "question_key": question_key,
                    "reporting_period": reporting_period,
                    "reporting_year": reporting_period,
                    "created_at": now_iso,
                }
            },
            upsert=True
        )
        
        # Mark this submission as approved
        await db[self.SUBMISSIONS_COLLECTION].update_one(
            {"id": submission_id},
            {
                "$set": {
                    "status": "approved",
                    "approved_by_user_id": approver_user_id,
                    "approved_by_user_name": approver_user_name,
                    "approved_at": now,
                    "final_value": final_value,
                    "updated_at": now,
                }
            }
        )
        
        # Reject all other pending submissions for this question
        other_submissions = await db[self.SUBMISSIONS_COLLECTION].update_many(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
                "status": "pending_approval",
                "id": {"$ne": submission_id},
            },
            {
                "$set": {
                    "status": "superseded",
                    "rejection_reason": f"Another submission was approved by {approver_user_name}",
                    "updated_at": now,
                }
            }
        )
        
        # Clear all drafts for this question
        await self._clear_other_users_drafts(
            org_id, question_key, reporting_period, submission["submitted_by_user_id"]
        )
        
        # Log to audit trail
        audit_entry = {
            "id": str(uuid.uuid4()),
            "question_key": question_key,
            "reporting_period": reporting_period,
            "organization_id": org_id,
            "action": "submission_approved",
            "timestamp": now,
            "performed_by": {
                "user_id": approver_user_id,
                "name": approver_user_name,
                "email": approver_user_email,
            },
            "change_details": {
                "submission_id": submission_id,
                "submitted_by": submission["submitted_by_user_name"],
                "original_value": submission["value"],
                "final_value": final_value,
                "was_merged": merged_value is not None,
                "other_submissions_superseded": other_submissions.modified_count,
            },
        }
        await db.question_audit_log.insert_one(audit_entry)
        
        return {
            "success": True,
            "message": "Submission approved",
            "question_key": question_key,
            "final_value": final_value,
            "other_submissions_superseded": other_submissions.modified_count,
        }

    async def reject_submission(
        self,
        org_id: str,
        submission_id: str,
        rejector_user_id: str,
        rejector_user_name: str,
        rejector_user_email: str,
        rejection_reason: Optional[str] = None,
    ) -> dict:
        """
        Reject a single submission.
        The user can revise and resubmit.
        """
        now = datetime.now(timezone.utc)
        
        # Find the submission
        submission = await db[self.SUBMISSIONS_COLLECTION].find_one(
            {
                "id": submission_id,
                "organization_id": org_id,
                "status": "pending_approval",
            },
            {"_id": 0}
        )
        
        if not submission:
            return {
                "success": False,
                "message": "Submission not found or already processed"
            }
        
        # Mark as rejected
        await db[self.SUBMISSIONS_COLLECTION].update_one(
            {"id": submission_id},
            {
                "$set": {
                    "status": "rejected",
                    "rejection_reason": rejection_reason,
                    "rejected_by_user_id": rejector_user_id,
                    "rejected_by_user_name": rejector_user_name,
                    "rejected_at": now,
                    "updated_at": now,
                }
            }
        )
        
        # Log to audit trail
        audit_entry = {
            "id": str(uuid.uuid4()),
            "question_key": submission["question_key"],
            "reporting_period": submission["reporting_period"],
            "organization_id": org_id,
            "action": "submission_rejected",
            "timestamp": now,
            "performed_by": {
                "user_id": rejector_user_id,
                "name": rejector_user_name,
                "email": rejector_user_email,
            },
            "change_details": {
                "submission_id": submission_id,
                "submitted_by": submission["submitted_by_user_name"],
                "rejection_reason": rejection_reason,
            },
        }
        await db.question_audit_log.insert_one(audit_entry)
        
        return {
            "success": True,
            "message": "Submission rejected",
            "submission_id": submission_id,
        }

    async def get_user_submission_status(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get the current user's submission status for a question.
        Returns the latest submission by this user if any.
        """
        submission = await db[self.SUBMISSIONS_COLLECTION].find_one(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
                "submitted_by_user_id": user_id,
            },
            {"_id": 0},
            sort=[("submitted_at", -1)]
        )
        return submission

    async def save_gri_response(
        self,
        org_id: str,
        question_key: str,
        value: Any,
        reporting_period: str,
        changed_by_user_id: Optional[str] = None,
        changed_by_user_name: Optional[str] = None,
        changed_by_user_email: Optional[str] = None,
        status: str = "saved",  # "draft" or "saved"
    ) -> dict:
        """
        Save a single GRI disclosure response.
        
        Workflow logic:
        1. If no approval workflow OR no approver assigned → "last save wins"
           - Latest save overwrites previous value
           - Other users' drafts are cleared
        2. If approval workflow ON and approver assigned → submissions go to approver queue
           - All saves create/update submissions in pending_approval state
           - Approver reviews and approves one (or merges)
           - Only approved submission goes to esg_responses
        
        Returns dict with:
          - success: bool
          - submitted_for_approval: bool (True if went to approval queue)
          - status: str (actual status)
          - drafts_cleared: int (number of other users' drafts cleared)
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # If value is empty, set status to "pending" regardless of requested status
        value_is_empty = value is None or (isinstance(value, str) and value.strip() == "")
        if value_is_empty:
            status = "pending"
        
        # Get previous response
        previous_response = await db.esg_responses.find_one(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            {"_id": 0, "value": 1, "status": 1, "updated_by": 1, "updated_by_name": 1}
        )
        
        previous_value = previous_response.get("value") if previous_response else None
        previous_status = previous_response.get("status") if previous_response else None
        is_new = previous_response is None
        
        # Check workflow logic (only for actual "saved" status, not drafts or empty)
        if status == "saved" and not value_is_empty:
            use_direct_save = await self._should_use_direct_save(
                org_id, question_key, reporting_period
            )
            
            if not use_direct_save:
                # APPROVAL WORKFLOW LOGIC
                # Route to submission queue instead of direct save
                submission_result = await self._create_submission_for_approval(
                    org_id=org_id,
                    question_key=question_key,
                    value=value,
                    reporting_period=reporting_period,
                    user_id=changed_by_user_id,
                    user_name=changed_by_user_name,
                    user_email=changed_by_user_email,
                )
                
                # ALSO save to esg_responses with pending_approval status
                # This ensures the value is visible in UI while awaiting approval
                await db.esg_responses.update_one(
                    {
                        "organization_id": org_id,
                        "question_key": question_key,
                        "reporting_period": reporting_period,
                    },
                    {
                        "$set": {
                            "value": value,
                            "status": "pending_approval",
                            "approval_status": "pending_approval",
                            "reporting_year": reporting_period,
                            "updated_at": now_iso,
                            "updated_by": changed_by_user_id,
                            "updated_by_name": changed_by_user_name,
                            "updated_by_email": changed_by_user_email,
                        },
                        "$setOnInsert": {
                            "id": str(uuid.uuid4()),
                            "organization_id": org_id,
                            "question_key": question_key,
                            "reporting_period": reporting_period,
                            "created_at": now_iso,
                        }
                    },
                    upsert=True
                )
                
                # ALSO save to organization_esg_responses for tracker compatibility
                config = await self._configs.find_one(
                    {"question_key": question_key},
                    {"_id": 0, "section": 1}
                )
                section = config.get("section", "environment") if config else "environment"
                
                await db.organization_esg_responses.update_one(
                    {
                        "org_id": org_id,
                        "framework": "GRI",
                        "reporting_year": reporting_period,
                        "section": section,
                    },
                    {
                        "$set": {
                            f"responses.{question_key}": value,
                            "updated_at": now_iso,
                        },
                        "$setOnInsert": {
                            "id": str(uuid.uuid4()),
                            "org_id": org_id,
                            "organization_id": org_id,
                            "framework": "GRI",
                            "section": section,
                            "created_at": now_iso,
                        }
                    },
                    upsert=True
                )
                
                return {
                    "success": True,
                    "submitted_for_approval": True,
                    "submission_id": submission_result["submission_id"],
                    "status": "pending_approval",
                    "drafts_cleared": 0,
                    "message": "Submitted for approval" if not submission_result["is_update"] else "Submission updated"
                }
            # else: use direct save (last save wins) - continue to save below
        
        # Direct save to esg_responses (last save wins, drafts, or empty values)
        result = await db.esg_responses.update_one(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            {
                "$set": {
                    "value": value,
                    "status": status,
                    "reporting_year": reporting_period,  # Also set reporting_year for query compatibility
                    "updated_at": now_iso,
                    "updated_by": changed_by_user_id,
                    "updated_by_name": changed_by_user_name,
                    "updated_by_email": changed_by_user_email,
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "organization_id": org_id,
                    "question_key": question_key,
                    "reporting_period": reporting_period,
                    "reporting_year": reporting_period,  # Also set reporting_year for query compatibility
                    "created_at": now_iso,
                }
            },
            upsert=True
        )
        
        # Also save to organization_esg_responses for tracker compatibility
        # Get the section from config
        config = await self._configs.find_one(
            {"question_key": question_key},
            {"_id": 0, "section": 1}
        )
        section = config.get("section", "environment") if config else "environment"
        
        await db.organization_esg_responses.update_one(
            {
                "org_id": org_id,
                "framework": "GRI",
                "reporting_year": reporting_period,
                "section": section,
            },
            {
                "$set": {
                    f"responses.{question_key}": value,
                    "updated_at": now_iso,
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "organization_id": org_id,
                    "framework": "GRI",
                    "reporting_year": reporting_period,
                    "section": section,
                    "created_at": now_iso,
                }
            },
            upsert=True
        )
        
        # If this was a successful "saved" (not draft), clear other users' drafts
        drafts_cleared = 0
        if result.acknowledged and status == "saved" and not value_is_empty:
            drafts_cleared = await self._clear_other_users_drafts(
                org_id, question_key, reporting_period, changed_by_user_id
            )
        
        # Log to audit trail for version history (only if value is not empty)
        if result.acknowledged and not value_is_empty:
            # Determine the action type
            if is_new:
                action = "created"
            elif previous_status == "draft" and status == "saved":
                action = "submitted"
            elif status == "draft":
                action = "draft_updated"
            else:
                action = "updated"
            
            audit_entry = {
                "id": str(uuid.uuid4()),
                "question_key": question_key,
                "reporting_period": reporting_period,
                "organization_id": org_id,
                "action": action,
                "timestamp": now,
                "performed_by": {
                    "user_id": changed_by_user_id,
                    "name": changed_by_user_name or "Unknown",
                    "email": changed_by_user_email or "Unknown",
                },
                "change_details": {
                    "field_changed": "response_value",
                    "old_value": previous_value,
                    "new_value": value,
                    "old_status": previous_status,
                    "new_status": status,
                },
                "drafts_cleared": drafts_cleared,
            }
            
            await db.question_audit_log.insert_one(audit_entry)
        
        return {
            "success": result.acknowledged,
            "submitted_for_approval": False,
            "status": status,
            "drafts_cleared": drafts_cleared,
            "message": "Response saved successfully"
        }
    
    async def get_question_history(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str,
    ) -> List[Dict[str, Any]]:
        """
        Get version history for a specific question.
        Returns all audit log entries with computed field diffs.
        """
        cursor = db.question_audit_log.find(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            {"_id": 0}
        ).sort("timestamp", -1)
        
        entries = await cursor.to_list(100)
        
        # Compute field_diffs for each entry that has change_details
        for entry in entries:
            change_details = entry.get("change_details", {})
            old_val = change_details.get("old_value")
            new_val = change_details.get("new_value")
            
            # Compute diffs if both values exist and are dicts
            if isinstance(old_val, dict) and isinstance(new_val, dict):
                changes = compare_versions(old_val, new_val)
                entry["field_diffs"] = [
                    {"field": c["field"], "display_name": format_field_display_name(c["field"]), "old_value": c["old"], "new_value": c["new"]}
                    for c in changes
                ]
            elif old_val != new_val:
                # Simple value change
                entry["field_diffs"] = [{
                    "field": "value",
                    "display_name": "Value",
                    "old_value": old_val,
                    "new_value": new_val
                }]
            else:
                entry["field_diffs"] = []
        
        return entries

    # =========================================================================
    # Draft Management Methods (Per-User Drafts)
    # =========================================================================
    
    DRAFTS_COLLECTION = "esg_response_drafts"

    async def save_user_draft(
        self,
        org_id: str,
        framework_id: str,
        disclosure_id: str,
        reporting_period: str,
        user_id: str,
        user_name: str,
        user_email: str,
        draft_data: Dict[str, Any],
        draft_status: str = "draft",  # editing | draft | submitted
        assignment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Save or update a user's draft for a specific disclosure.
        Each user has their own draft per disclosure.
        
        draft_data format: { "question_key": "response_value", ... }
        """
        now = datetime.now(timezone.utc)
        
        # Mark any existing drafts for this user+disclosure as not latest
        await db[self.DRAFTS_COLLECTION].update_many(
            {
                "organization_id": org_id,
                "framework_id": framework_id,
                "disclosure_id": disclosure_id,
                "reporting_period": reporting_period,
                "user_id": user_id,
            },
            {"$set": {"is_latest": False, "updated_at": now}}
        )
        
        # Create new draft entry
        draft_id = str(uuid.uuid4())
        draft_doc = {
            "id": draft_id,
            "organization_id": org_id,
            "framework_id": framework_id,
            "disclosure_id": disclosure_id,
            "reporting_period": reporting_period,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "assignment_id": assignment_id,
            "draft_data": draft_data,
            "draft_status": draft_status,
            "is_latest": True,
            "created_at": now,
            "updated_at": now,
        }
        
        await db[self.DRAFTS_COLLECTION].insert_one(draft_doc)
        
        # Log to audit trail
        audit_entry = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "framework_id": framework_id,
            "disclosure_id": disclosure_id,
            "reporting_period": reporting_period,
            "action": f"draft_{draft_status}",
            "timestamp": now,
            "performed_by": {
                "user_id": user_id,
                "name": user_name,
                "email": user_email,
            },
            "draft_id": draft_id,
            "change_details": {
                "draft_status": draft_status,
                "questions_updated": list(draft_data.keys()),
            },
        }
        await db.question_audit_log.insert_one(audit_entry)
        
        # Remove _id for response
        draft_doc.pop("_id", None)
        return draft_doc

    async def get_user_draft(
        self,
        org_id: str,
        framework_id: str,
        disclosure_id: str,
        reporting_period: str,
        user_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get the latest draft for a specific user and disclosure.
        """
        draft = await db[self.DRAFTS_COLLECTION].find_one(
            {
                "organization_id": org_id,
                "framework_id": framework_id,
                "disclosure_id": disclosure_id,
                "reporting_period": reporting_period,
                "user_id": user_id,
                "is_latest": True,
            },
            {"_id": 0}
        )
        return draft

    async def discard_user_draft(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str,
        user_id: str,
    ) -> bool:
        """
        Discard a user's draft for a specific question.
        Removes the question_key from all of the user's draft_data.
        """
        # Find all user drafts that contain this question_key
        drafts_cursor = db[self.DRAFTS_COLLECTION].find({
            "organization_id": org_id,
            "reporting_period": reporting_period,
            "user_id": user_id,
            f"draft_data.{question_key}": {"$exists": True},
            "is_latest": True,
        })
        
        drafts = await drafts_cursor.to_list(100)
        
        for draft in drafts:
            draft_data = draft.get("draft_data", {})
            if question_key in draft_data:
                del draft_data[question_key]
                
                if draft_data:
                    # Update the draft with the question removed
                    await db[self.DRAFTS_COLLECTION].update_one(
                        {"id": draft["id"]},
                        {"$set": {"draft_data": draft_data}}
                    )
                else:
                    # No more questions in draft, delete entirely
                    await db[self.DRAFTS_COLLECTION].delete_one({"id": draft["id"]})
        
        return True

    async def get_all_drafts_for_disclosure(
        self,
        org_id: str,
        framework_id: str,
        disclosure_id: str,
        reporting_period: str,
    ) -> List[Dict[str, Any]]:
        """
        Get all latest drafts from all users for a specific disclosure.
        Useful for admins to review all drafts before approving.
        """
        cursor = db[self.DRAFTS_COLLECTION].find(
            {
                "organization_id": org_id,
                "framework_id": framework_id,
                "disclosure_id": disclosure_id,
                "reporting_period": reporting_period,
                "is_latest": True,
            },
            {"_id": 0}
        ).sort("updated_at", -1)
        
        return await cursor.to_list(100)

    async def get_user_drafts_for_section(
        self,
        org_id: str,
        framework_id: str,
        section: str,
        reporting_period: str,
        user_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get all latest drafts for a user in a specific section.
        Used to show draft status in the questionnaire UI.
        """
        # First get all disclosure IDs for this section
        configs = await db.esg_question_configs.distinct(
            "disclosure_id",
            {
                "framework": framework_id.upper(),
                "section": section,
            }
        )
        
        cursor = db[self.DRAFTS_COLLECTION].find(
            {
                "organization_id": org_id,
                "framework_id": framework_id,
                "disclosure_id": {"$in": configs},
                "reporting_period": reporting_period,
                "user_id": user_id,
                "is_latest": True,
            },
            {"_id": 0}
        )
        
        return await cursor.to_list(500)

    async def submit_draft_for_approval(
        self,
        org_id: str,
        framework_id: str,
        disclosure_id: str,
        reporting_period: str,
        user_id: str,
        user_name: str,
        user_email: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Submit a user's draft for approval.
        Changes draft_status from 'draft' to 'submitted'.
        """
        now = datetime.now(timezone.utc)
        
        # Find the latest draft
        draft = await self.get_user_draft(
            org_id, framework_id, disclosure_id, reporting_period, user_id
        )
        
        if not draft:
            return None
        
        # Update the draft status to submitted
        await db[self.DRAFTS_COLLECTION].update_one(
            {"id": draft["id"]},
            {
                "$set": {
                    "draft_status": "submitted",
                    "updated_at": now,
                }
            }
        )
        
        # Log to audit trail
        audit_entry = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "framework_id": framework_id,
            "disclosure_id": disclosure_id,
            "reporting_period": reporting_period,
            "action": "draft_submitted_for_approval",
            "timestamp": now,
            "performed_by": {
                "user_id": user_id,
                "name": user_name,
                "email": user_email,
            },
            "draft_id": draft["id"],
        }
        await db.question_audit_log.insert_one(audit_entry)
        
        draft["draft_status"] = "submitted"
        draft["updated_at"] = now
        return draft

    async def approve_draft(
        self,
        org_id: str,
        framework_id: str,
        disclosure_id: str,
        reporting_period: str,
        draft_user_id: str,
        approver_user_id: str,
        approver_name: str,
        approver_email: str,
    ) -> bool:
        """
        Approve a submitted draft and save to final esg_responses.
        Only drafts with status 'submitted' can be approved.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Find the submitted draft
        draft = await db[self.DRAFTS_COLLECTION].find_one(
            {
                "organization_id": org_id,
                "framework_id": framework_id,
                "disclosure_id": disclosure_id,
                "reporting_period": reporting_period,
                "user_id": draft_user_id,
                "is_latest": True,
                "draft_status": "submitted",
            }
        )
        
        if not draft:
            return False
        
        # Save each question response to esg_responses (final)
        draft_data = draft.get("draft_data", {})
        for question_key, value in draft_data.items():
            await db.esg_responses.update_one(
                {
                    "organization_id": org_id,
                    "question_key": question_key,
                    "reporting_period": reporting_period,
                },
                {
                    "$set": {
                        "value": value,
                        "status": "approved",
                        "approval_status": "approved",  # Also set approval_status for tracker compatibility
                        "reporting_year": reporting_period,  # Ensure reporting_year is set for queries
                        "updated_at": now_iso,
                        "updated_by": draft_user_id,
                        "updated_by_name": draft.get("user_name"),
                        "updated_by_email": draft.get("user_email"),
                        "approved_by": approver_user_id,
                        "approved_by_name": approver_name,
                        "approved_by_email": approver_email,
                        "approved_at": now_iso,
                    },
                    "$setOnInsert": {
                        "id": str(uuid.uuid4()),
                        "organization_id": org_id,
                        "question_key": question_key,
                        "reporting_period": reporting_period,
                        "reporting_year": reporting_period,
                        "created_at": now_iso,
                    }
                },
                upsert=True
            )
        
        # Update draft status to approved
        await db[self.DRAFTS_COLLECTION].update_one(
            {"id": draft["id"]},
            {
                "$set": {
                    "draft_status": "approved",
                    "updated_at": now,
                    "approved_by": approver_user_id,
                    "approved_by_name": approver_name,
                    "approved_at": now,
                }
            }
        )
        
        # Log to audit trail
        audit_entry = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "framework_id": framework_id,
            "disclosure_id": disclosure_id,
            "reporting_period": reporting_period,
            "action": "draft_approved",
            "timestamp": now,
            "performed_by": {
                "user_id": approver_user_id,
                "name": approver_name,
                "email": approver_email,
            },
            "draft_id": draft["id"],
            "draft_user_id": draft_user_id,
            "change_details": {
                "questions_approved": list(draft_data.keys()),
            },
        }
        await db.question_audit_log.insert_one(audit_entry)
        
        return True

    async def reject_draft(
        self,
        org_id: str,
        framework_id: str,
        disclosure_id: str,
        reporting_period: str,
        draft_user_id: str,
        rejector_user_id: str,
        rejector_name: str,
        rejector_email: str,
        rejection_reason: Optional[str] = None,
    ) -> bool:
        """
        Reject a submitted draft. Returns it to 'draft' status for revision.
        """
        now = datetime.now(timezone.utc)
        
        # Find the submitted draft
        draft = await db[self.DRAFTS_COLLECTION].find_one(
            {
                "organization_id": org_id,
                "framework_id": framework_id,
                "disclosure_id": disclosure_id,
                "reporting_period": reporting_period,
                "user_id": draft_user_id,
                "is_latest": True,
                "draft_status": "submitted",
            }
        )
        
        if not draft:
            return False
        
        # Update draft status back to draft (for revision)
        await db[self.DRAFTS_COLLECTION].update_one(
            {"id": draft["id"]},
            {
                "$set": {
                    "draft_status": "draft",
                    "updated_at": now,
                    "rejection_reason": rejection_reason,
                    "rejected_by": rejector_user_id,
                    "rejected_by_name": rejector_name,
                    "rejected_at": now,
                }
            }
        )
        
        # Log to audit trail
        audit_entry = {
            "id": str(uuid.uuid4()),
            "organization_id": org_id,
            "framework_id": framework_id,
            "disclosure_id": disclosure_id,
            "reporting_period": reporting_period,
            "action": "draft_rejected",
            "timestamp": now,
            "performed_by": {
                "user_id": rejector_user_id,
                "name": rejector_name,
                "email": rejector_email,
            },
            "draft_id": draft["id"],
            "draft_user_id": draft_user_id,
            "rejection_reason": rejection_reason,
        }
        await db.question_audit_log.insert_one(audit_entry)
        
        return True

    async def get_draft_history(
        self,
        org_id: str,
        framework_id: str,
        disclosure_id: str,
        reporting_period: str,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get all draft versions for a disclosure (optionally filtered by user).
        Shows the full history of drafts including all versions.
        """
        query = {
            "organization_id": org_id,
            "framework_id": framework_id,
            "disclosure_id": disclosure_id,
            "reporting_period": reporting_period,
        }
        if user_id:
            query["user_id"] = user_id
        
        cursor = db[self.DRAFTS_COLLECTION].find(
            query,
            {"_id": 0}
        ).sort("created_at", -1)
        
        return await cursor.to_list(100)

    async def get_responses(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get responses for a specific org+framework+year+section.
        
        This method fetches the current year's document and the previous year's
        document, then merges them back into the frontend-expected format with
        `*_current_fy` and `*_previous_fy` suffixes for fy_comparison questions,
        while preserving atomic questions as-is.
        """
        previous_year = self._calculate_previous_fy(reporting_year)
        
        # Fetch question configs to get response_mode for each question
        configs = await self.list_question_configs(framework=framework, section=section)
        response_modes = {c["question_key"]: c.get("response_mode", "fy_comparison") for c in configs}
        
        # Fetch both year documents
        current_doc = await self._responses.find_one(
            {
                "org_id": org_id,
                "framework": framework,
                "reporting_year": reporting_year,
                "section": section,
            },
            {"_id": 0}
        )
        
        previous_doc = await self._responses.find_one(
            {
                "org_id": org_id,
                "framework": framework,
                "reporting_year": previous_year,
                "section": section,
            },
            {"_id": 0}
        )
        
        if not current_doc and not previous_doc:
            return None
        
        # Merge responses with FY suffixes for frontend compatibility
        merged_responses = self._merge_year_responses(
            current_doc.get("responses", {}) if current_doc else {},
            previous_doc.get("responses", {}) if previous_doc else {},
            response_modes
        )
        
        # Return in expected format
        base_doc = current_doc or previous_doc
        return {
            "id": base_doc.get("id"),
            "org_id": org_id,
            "framework": framework,
            "reporting_year": reporting_year,
            "section": section,
            "responses": merged_responses,
            "created_at": base_doc.get("created_at"),
            "updated_at": base_doc.get("updated_at"),
        }

    async def get_responses_raw(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
    ) -> Optional[Dict[str, Any]]:
        """Get raw responses for a single year document (no merging)."""
        return await self._responses.find_one(
            {
                "org_id": org_id,
                "framework": framework,
                "reporting_year": reporting_year,
                "section": section,
            },
            {"_id": 0}
        )

    def _merge_year_responses(
        self,
        current_year_data: Dict[str, Any],
        previous_year_data: Dict[str, Any],
        response_modes: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """
        Merge current and previous year data back into frontend format.
        
        Uses response_modes to determine how to handle each question:
        - "atomic": Preserve value as-is (no FY suffixes). Use current year value only.
        - "fy_comparison": Add _current_fy/_previous_fy suffixes for comparison fields.
        
        Args:
            current_year_data: Responses from current reporting year
            previous_year_data: Responses from previous reporting year
            response_modes: Dict mapping question_key to response mode ("atomic" or "fy_comparison")
        """
        merged = {}
        response_modes = response_modes or {}
        all_questions = set(current_year_data.keys()) | set(previous_year_data.keys())
        
        for question_key in all_questions:
            current_val = current_year_data.get(question_key)
            previous_val = previous_year_data.get(question_key)
            mode = response_modes.get(question_key, "fy_comparison")  # Default to fy_comparison for safety
            
            # ATOMIC MODE: Preserve value as-is, use current year only
            if mode == "atomic":
                if current_val is not None:
                    merged[question_key] = current_val
                elif previous_val is not None:
                    merged[question_key] = previous_val
                continue
            
            # FY_COMPARISON MODE: Add suffixes for comparison
            # Handle dict-based responses (row categories)
            if isinstance(current_val, dict) or isinstance(previous_val, dict):
                current_dict = current_val or {}
                previous_dict = previous_val or {}
                merged_q = {}
                
                all_fields = set(current_dict.keys()) | set(previous_dict.keys())
                
                for field_key in all_fields:
                    curr_field = current_dict.get(field_key)
                    prev_field = previous_dict.get(field_key)
                    
                    # Nested dict (row categories like plastics, e_waste)
                    if isinstance(curr_field, dict) or isinstance(prev_field, dict):
                        curr_row = curr_field or {}
                        prev_row = prev_field or {}
                        merged_row = {}
                        
                        all_cols = set(curr_row.keys()) | set(prev_row.keys())
                        for col_key in all_cols:
                            col_val_curr = curr_row.get(col_key)
                            col_val_prev = prev_row.get(col_key)
                            
                            # If key is exactly 'current_fy' or 'previous_fy' (field names, not suffixes), copy as-is
                            if col_key in ('current_fy', 'previous_fy'):
                                if col_val_curr is not None:
                                    merged_row[col_key] = col_val_curr
                            # Check if key already has FY suffix (old format)
                            elif col_key.endswith('_current_fy'):
                                if col_val_curr is not None:
                                    merged_row[col_key] = col_val_curr
                            elif col_key.endswith('_previous_fy'):
                                if col_val_curr is not None:
                                    merged_row[col_key] = col_val_curr
                            else:
                                # New normalized format - add suffixes
                                if col_val_curr is not None:
                                    merged_row[f"{col_key}_current_fy"] = col_val_curr
                                if col_val_prev is not None:
                                    merged_row[f"{col_key}_previous_fy"] = col_val_prev
                        
                        if merged_row:
                            merged_q[field_key] = merged_row
                    else:
                        # Direct field - check for FY suffix
                        if field_key.endswith('_current_fy'):
                            if curr_field is not None:
                                merged_q[field_key] = curr_field
                        elif field_key.endswith('_previous_fy'):
                            if curr_field is not None:
                                merged_q[field_key] = curr_field
                        else:
                            if curr_field is not None:
                                merged_q[f"{field_key}_current_fy"] = curr_field
                            if prev_field is not None:
                                merged_q[f"{field_key}_previous_fy"] = prev_field
                
                if merged_q:
                    merged[question_key] = merged_q
                    
            # Handle array-based responses (material tables)
            elif isinstance(current_val, list) or isinstance(previous_val, list):
                current_list = current_val or []
                previous_list = previous_val or []
                merged_rows = []
                
                # Match rows by index
                max_len = max(len(current_list), len(previous_list))
                
                for i in range(max_len):
                    curr_row = current_list[i] if i < len(current_list) else {}
                    prev_row = previous_list[i] if i < len(previous_list) else {}
                    
                    if not isinstance(curr_row, dict):
                        curr_row = {}
                    if not isinstance(prev_row, dict):
                        prev_row = {}
                    
                    merged_row = {}
                    all_cols = set(curr_row.keys()) | set(prev_row.keys())
                    
                    for col_key in all_cols:
                        col_val_curr = curr_row.get(col_key)
                        col_val_prev = prev_row.get(col_key)
                        
                        # Identifier fields go as-is
                        if col_key in ['indicate_input_material', 'product_category', 'material_name']:
                            merged_row[col_key] = col_val_curr or col_val_prev
                        # Already has FY suffix (old format)
                        elif col_key.endswith('_current_fy') or col_key.endswith('_previous_fy'):
                            if col_val_curr is not None:
                                merged_row[col_key] = col_val_curr
                        else:
                            # New normalized format
                            if col_val_curr is not None:
                                merged_row[f"{col_key}_current_fy"] = col_val_curr
                            if col_val_prev is not None:
                                merged_row[f"{col_key}_previous_fy"] = col_val_prev
                    
                    if merged_row:
                        merged_rows.append(merged_row)
                
                if merged_rows:
                    merged[question_key] = merged_rows
            else:
                # Simple value - just use current year
                if current_val is not None:
                    merged[question_key] = current_val
                elif previous_val is not None:
                    merged[question_key] = previous_val
        
        return merged

    async def save_responses(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
        data: ESGResponseCreate,
        changed_by_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Save responses using 1-document-per-year architecture.
        
        When user enters data for both Current FY and Previous FY columns,
        this method splits the data into two separate year documents:
        - Current FY data → saved to `reporting_year` document
        - Previous FY data → saved to `previous_year` document
        
        Field names like `reused_current_fy` become `reused` in the stored document.
        Also tracks version history for each question if changed_by_user_id is provided.
        """
        now = datetime.now(timezone.utc).isoformat()
        previous_year = self._calculate_previous_fy(reporting_year)
        
        # Split responses into current year and previous year data
        current_year_data, previous_year_data = self._split_responses_by_year(data.responses)
        
        # Save current year data
        if current_year_data:
            await self._save_year_document(
                org_id, framework, reporting_year, section, current_year_data, now, changed_by_user_id
            )
        
        # Save previous year data (if any previous_fy fields were filled)
        if previous_year_data:
            await self._save_year_document(
                org_id, framework, previous_year, section, previous_year_data, now, changed_by_user_id
            )
        
        # Return merged view (for frontend compatibility)
        return await self.get_responses(org_id, framework, reporting_year, section)

    async def _save_year_document(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
        responses: Dict[str, Any],
        now: str,
        changed_by_user_id: Optional[str] = None,
    ) -> None:
        """Save or update a single year's document and track version history."""
        existing = await self._responses.find_one({
            "org_id": org_id,
            "framework": framework,
            "reporting_year": reporting_year,
            "section": section,
        })
        
        if existing:
            # Merge with existing responses
            old_responses = existing.get("responses", {})
            merged = self._deep_merge(old_responses, responses)
            
            await self._responses.update_one(
                {
                    "org_id": org_id,
                    "framework": framework,
                    "reporting_year": reporting_year,
                    "section": section,
                },
                {"$set": {"responses": merged, "updated_at": now}}
            )
            
            # Trigger approval workflow and log audit for changed questions
            if changed_by_user_id:
                for question_key, new_value in responses.items():
                    old_value = old_responses.get(question_key)
                    value_changed = old_value != new_value
                    
                    # Always trigger approval check (handles re-submission of approved/rejected questions)
                    try:
                        await self._trigger_approval_if_required(
                            org_id, question_key, reporting_year, new_value, changed_by_user_id
                        )
                        # Log to audit trail only if value actually changed
                        if value_changed:
                            await self._log_question_audit(
                                org_id, question_key, reporting_year, 
                                old_value, new_value, changed_by_user_id, "updated"
                            )
                    except Exception as e:
                        print(f"Warning: Failed to trigger approval for {question_key}: {e}")
        else:
            doc = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "framework": framework,
                "reporting_year": reporting_year,
                "section": section,
                "responses": responses,
                "created_at": now,
                "updated_at": None,
            }
            await self._responses.insert_one(doc)
            
            # Trigger approval workflow and log audit for new questions
            if changed_by_user_id:
                for question_key, new_value in responses.items():
                    try:
                        await self._trigger_approval_if_required(
                            org_id, question_key, reporting_year, new_value, changed_by_user_id
                        )
                        # Log to audit trail for version history (new question)
                        if self._response_has_value(new_value):
                            await self._log_question_audit(
                                org_id, question_key, reporting_year,
                                None, new_value, changed_by_user_id, "created"
                            )
                    except Exception as e:
                        print(f"Warning: Failed to trigger approval for {question_key}: {e}")

    def _split_responses_by_year(
        self, 
        responses: Dict[str, Any]
    ) -> tuple:
        """
        Split responses into current year and previous year data.
        
        Transforms:
          { "q1": { "reused_current_fy": 10, "reused_previous_fy": 5 } }
        Into:
          current_year: { "q1": { "reused": 10 } }
          previous_year: { "q1": { "reused": 5 } }
        """
        current_year_data = {}
        previous_year_data = {}
        
        for question_key, value in responses.items():
            if value is None:
                continue
                
            # Handle dict-based responses (like reclaim tables with row categories)
            if isinstance(value, dict):
                current_q = {}
                previous_q = {}
                
                for field_key, field_value in value.items():
                    # Check if this is a nested dict (row categories like plastics, e_waste)
                    if isinstance(field_value, dict):
                        current_row = {}
                        previous_row = {}
                        for col_key, col_value in field_value.items():
                            base_key, year_type = self._parse_field_key(col_key)
                            if year_type == 'current':
                                current_row[base_key] = col_value
                            elif year_type == 'previous':
                                previous_row[base_key] = col_value
                            else:
                                # Non-FY field, goes to current year
                                current_row[col_key] = col_value
                        if current_row:
                            current_q[field_key] = current_row
                        if previous_row:
                            previous_q[field_key] = previous_row
                    else:
                        # Direct field (not nested)
                        base_key, year_type = self._parse_field_key(field_key)
                        if year_type == 'current':
                            current_q[base_key] = field_value
                        elif year_type == 'previous':
                            previous_q[base_key] = field_value
                        else:
                            current_q[field_key] = field_value
                
                if current_q:
                    current_year_data[question_key] = current_q
                if previous_q:
                    previous_year_data[question_key] = previous_q
                    
            # Handle array-based responses (like material tables)
            elif isinstance(value, list):
                current_rows = []
                previous_rows = []
                
                for row in value:
                    if not isinstance(row, dict):
                        current_rows.append(row)
                        continue
                    
                    current_row = {}
                    previous_row = {}
                    
                    for col_key, col_value in row.items():
                        base_key, year_type = self._parse_field_key(col_key)
                        if year_type == 'current':
                            current_row[base_key] = col_value
                        elif year_type == 'previous':
                            previous_row[base_key] = col_value
                        else:
                            # Non-FY field (like material name), goes to both
                            current_row[col_key] = col_value
                            if previous_row or any('previous' in k for k in row.keys()):
                                previous_row[col_key] = col_value
                    
                    if current_row:
                        current_rows.append(current_row)
                    if previous_row and any(k not in ['indicate_input_material', 'product_category'] for k in previous_row.keys()):
                        previous_rows.append(previous_row)
                
                if current_rows:
                    current_year_data[question_key] = current_rows
                if previous_rows:
                    previous_year_data[question_key] = previous_rows
            else:
                # Simple value, goes to current year
                current_year_data[question_key] = value
        
        return current_year_data, previous_year_data

    def _parse_field_key(self, field_key: str) -> tuple:
        """
        Parse a field key to extract base name and year type.
        
        Examples:
          "reused_current_fy" → ("reused", "current")
          "reused_previous_fy" → ("reused", "previous")
          "material_name" → ("material_name", None)
        """
        if field_key.endswith('_current_fy'):
            return field_key[:-11], 'current'  # Remove "_current_fy"
        elif field_key.endswith('_previous_fy'):
            return field_key[:-12], 'previous'  # Remove "_previous_fy"
        return field_key, None

    def _deep_merge(self, base: Dict, update: Dict) -> Dict:
        """Deep merge two dictionaries."""
        result = base.copy()
        for key, value in update.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        return result

    def _response_has_value(self, value: Any) -> bool:
        """Check if a response has meaningful value (not empty/null)."""
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, dict)):
            if not value:
                return False
            # For dicts, check if any nested value is meaningful
            if isinstance(value, dict):
                return any(self._response_has_value(v) for v in value.values())
            # For lists, check if any item has value
            return any(self._response_has_value(v) for v in value)
        # For numbers, booleans, etc.
        return True

    async def _log_question_audit(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str,
        old_value: Any,
        new_value: Any,
        user_id: str,
        action: str,
    ) -> None:
        """Log a question change to the audit trail for version history."""
        from shared.database.mongo import db
        
        # Skip if no meaningful change
        if not self._response_has_value(new_value) and not self._response_has_value(old_value):
            return
        
        audit_entry = {
            "id": str(uuid.uuid4()),
            "question_key": question_key,
            "reporting_period": reporting_period,
            "organization_id": org_id,
            "action": action,
            "timestamp": datetime.now(timezone.utc),
            "performed_by": {"user_id": user_id},
            "change_details": {
                "old_value": old_value,
                "new_value": new_value,
            },
        }
        await db.question_audit_log.insert_one(audit_entry)

    async def _trigger_approval_if_required(
        self,
        org_id: str,
        question_key: str,
        reporting_year: str,
        response_value: Any,
        changed_by_user_id: str,
    ) -> None:
        """
        Check if a disclosure requires approval and trigger approval workflow.
        Also updates assignment status with new dual-status architecture.
        
        This is called after a response is saved. It:
        1. Checks if there's an assignment for this question with requires_approval=True
        2. Writes/updates the esg_responses collection with approval_status
        3. Creates an approval_request if conditions are met
        4. Updates assignment status accordingly
        
        Smart approval logic:
        - If question has actual value -> trigger approval if required
        - If question was previously filled and now empty -> trigger approval (for deletion)
        - If question was never filled and is still empty -> skip (no approval needed)
        """
        try:
            from shared.database.mongo import db
            from modules.approval_workflow.service import ApprovalWorkflowService
            from modules.approval_workflow.models import SubmitForApprovalInput, EntityType
            import uuid
            
            # Check if there's an assignment for this question
            # For subpart questions (e.g., gri_101_2_a_iii), also check parent question (gri_101_2_a)
            assignment = await db.esg_assignments.find_one({
                "organization_id": org_id,
                "entity_id": question_key,
                "entity_type": "question",
                "reporting_period": reporting_year,
            }, {"_id": 0})
            
            # If no direct assignment found, check for parent question assignment (for subparts)
            if not assignment and "_" in question_key:
                # Try progressively shorter parent keys (e.g., gri_101_2_a_iii -> gri_101_2_a -> gri_101_2)
                parts = question_key.rsplit("_", 1)
                while len(parts) > 1 and not assignment:
                    parent_key = parts[0]
                    assignment = await db.esg_assignments.find_one({
                        "organization_id": org_id,
                        "entity_id": parent_key,
                        "entity_type": "question",
                        "reporting_period": reporting_year,
                    }, {"_id": 0})
                    if not assignment:
                        parts = parent_key.rsplit("_", 1)
            
            requires_approval = assignment.get("requires_approval", False) if assignment else False
            now_iso = datetime.now(timezone.utc).isoformat()
            
            # Check existing response
            existing_response = await db.esg_responses.find_one({
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_year": reporting_year,
            })
            
            # Check if response has actual value
            has_value = self._response_has_value(response_value)
            had_previous_value = existing_response and self._response_has_value(existing_response.get("value"))
            
            # Skip if never filled and still empty (no approval needed for empty questions)
            if not has_value and not had_previous_value:
                return  # Nothing to approve
            
            # Determine approval status
            if requires_approval:
                approval_status = "pending_approval"
            else:
                approval_status = "approved"  # Auto-approved if no approval required
            
            if existing_response:
                # Update existing
                await db.esg_responses.update_one(
                    {"id": existing_response["id"]},
                    {"$set": {
                        "value": response_value,
                        "approval_status": approval_status,
                        "submitted_at": now_iso,
                        "submitted_by": changed_by_user_id,
                        "updated_at": now_iso,
                    }}
                )
            else:
                # Create new - include section for proper filtering
                section = assignment.get("section") if assignment else None
                if not section:
                    # Try to get section from question config
                    config = await self._configs.find_one(
                        {"question_key": question_key},
                        {"_id": 0, "section": 1}
                    )
                    section = config.get("section") if config else None
                
                await db.esg_responses.insert_one({
                    "id": str(uuid.uuid4()),
                    "organization_id": org_id,
                    "question_key": question_key,
                    "reporting_year": reporting_year,
                    "framework": assignment.get("framework_id", "brsr") if assignment else "brsr",
                    "section": section,
                    "value": response_value,
                    "approval_status": approval_status,
                    "submitted_at": now_iso,
                    "submitted_by": changed_by_user_id,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                })
            
            if not assignment:
                return  # No assignment for this disclosure, but response is saved
            
            # Update assignment status with new architecture
            # status=completed (user finished work)
            # approval_status depends on requires_approval
            await self._update_assignment_status(
                assignment_id=assignment.get("id"),
                status="completed",
                approval_status="pending_approval" if requires_approval else "not_required",
                completed_by_user_id=changed_by_user_id,
            )
            
            if not requires_approval:
                return  # No approval required, we're done
            
            # Check if org has approval workflow enabled for esg_response entity type
            workflow = await ApprovalWorkflowService.get_workflow_for_entity(
                org_id, "esg_response", None
            )
            
            if not workflow:
                return  # No workflow configured for ESG responses
            
            # Check if there's already a pending approval request for this entity
            existing_request = await db.approval_requests.find_one({
                "organization_id": org_id,
                "entity_type": "esg_response",
                "entity_id": question_key,
                "status": {"$in": ["pending", "in_review"]},
            })
            
            if existing_request:
                return  # Already has a pending request
            
            # Get user details for submission
            user = await db.users.find_one(
                {"id": changed_by_user_id},
                {"_id": 0, "id": 1, "email": 1, "full_name": 1, "name": 1}
            )
            
            if not user:
                print(f"Warning: Could not find user {changed_by_user_id} for approval submission")
                return
            
            # Create approval request
            submit_input = SubmitForApprovalInput(
                entity_type=EntityType.ESG_RESPONSE,
                entity_id=question_key,
                entity_subtype=None,
                entity_snapshot={"value": response_value, "reporting_year": reporting_year},
                comment="Auto-submitted for approval after disclosure update",
                workflow_id=workflow.get("id"),
            )
            
            current_user = {
                "id": user.get("id"),
                "email": user.get("email", ""),
                "full_name": user.get("full_name") or user.get("name") or user.get("email", ""),
                "role": "user",  # Role doesn't matter for submission
            }
            
            success, message, request = await ApprovalWorkflowService.submit_for_approval(
                org_id, submit_input, current_user
            )
            
            if success:
                print(f"Auto-submitted approval request for {question_key}: {request.get('id')}")
                # Status already updated above via _update_assignment_status
            else:
                print(f"Warning: Failed to auto-submit approval for {question_key}: {message}")
                
        except Exception as e:
            # Don't fail the save if approval workflow fails
            print(f"Warning: Approval workflow trigger failed for {question_key}: {e}")

    async def _update_assignment_status(
        self,
        assignment_id: str,
        status: str,
        approval_status: str,
        completed_by_user_id: Optional[str] = None,
        rejected_by_user_id: Optional[str] = None,
        rejection_reason: Optional[str] = None,
    ) -> None:
        """
        Update assignment status using new dual-status architecture.
        
        Args:
            assignment_id: Assignment to update
            status: Operational status (pending/completed/reopened)
            approval_status: Governance status (not_required/pending_approval/approved/rejected)
            completed_by_user_id: User who completed the work
            rejected_by_user_id: User who rejected (if rejection)
            rejection_reason: Reason for rejection
        """
        from shared.database.mongo import db
        from datetime import datetime, timezone
        
        now = datetime.now(timezone.utc)
        
        # Auto-set status=reopened when rejected
        if approval_status == "rejected":
            status = "reopened"
        
        update_doc = {
            "status": status,
            "approval_status": approval_status,
            "updated_at": now,
        }
        
        if status == "completed" and completed_by_user_id:
            update_doc["completed_at"] = now
            update_doc["completed_by_user_id"] = completed_by_user_id
        
        if approval_status == "rejected":
            update_doc["rejected_at"] = now
            if rejected_by_user_id:
                update_doc["rejected_by_user_id"] = rejected_by_user_id
            if rejection_reason:
                update_doc["rejection_reason"] = rejection_reason
        
        await db.esg_assignments.update_one(
            {"id": assignment_id},
            {"$set": update_doc}
        )


    async def get_response_summary(
        self,
        org_id: str,
        framework: str,
        reporting_year: str,
        section: str,
    ) -> Dict[str, Any]:
        """Get completion summary for a section."""
        # Get question configs for this section/framework
        configs = await self.list_question_configs(framework=framework, section=section)
        total_questions = len(configs)
        
        # Get responses
        responses = await self.get_responses(org_id, framework, reporting_year, section)
        response_data = responses.get("responses", {}) if responses else {}
        
        # Count answered questions
        answered = 0
        for config in configs:
            answer = response_data.get(config["question_key"])
            if answer is not None and answer != "" and answer != []:
                answered += 1
        
        completion = (answered / total_questions * 100) if total_questions > 0 else 0
        
        return {
            "org_id": org_id,
            "framework": framework,
            "reporting_year": reporting_year,
            "section": section,
            "total_questions": total_questions,
            "answered_questions": answered,
            "completion_percentage": round(completion, 1),
        }

    async def list_available_years(
        self,
        org_id: str,
        framework: str,
        section: str,
    ) -> List[str]:
        """List reporting years with responses for org+framework+section."""
        cursor = self._responses.find(
            {"org_id": org_id, "framework": framework, "section": section},
            {"_id": 0, "reporting_year": 1}
        ).sort("reporting_year", -1)
        docs = await cursor.to_list(100)
        return [doc["reporting_year"] for doc in docs]

    async def get_historical_data(
        self,
        org_id: str,
        framework: str,
        section: str,
        current_reporting_year: str,
    ) -> Dict[str, Any]:
        """
        Get previous FY data for historical autofill.
        
        This method fetches the previous reporting year's responses and returns
        the data that should be auto-filled into "Previous FY" columns.
        
        Example: If current_reporting_year is "2025-26", it fetches "2024-25" data.
        
        Returns:
            Dict with:
            - previous_year: The calculated previous reporting year
            - previous_responses: The responses from the previous year (or empty)
            - autofill_mappings: Question-to-field mappings for autofill
        """
        # Parse reporting year format (e.g., "2025-26" -> previous is "2024-25")
        previous_year = self._calculate_previous_fy(current_reporting_year)
        
        # Fetch previous year's responses
        previous_responses = await self.get_responses(
            org_id=org_id,
            framework=framework,
            reporting_year=previous_year,
            section=section
        )
        
        # Get question configs to identify which have historical autofill
        configs = await self.list_question_configs(framework=framework, section=section)
        
        # Build autofill mappings
        autofill_mappings = {}
        for config in configs:
            table_config = config.get("table_config", {})
            autofill_config = table_config.get("historical_autofill_config", {})
            
            if autofill_config.get("enabled"):
                question_key = config["question_key"]
                autofill_mappings[question_key] = {
                    "source_column": autofill_config.get("source_column"),
                    "target_column": autofill_config.get("target_column"),
                    "mappings": autofill_config.get("mappings", [])
                }
        
        return {
            "current_year": current_reporting_year,
            "previous_year": previous_year,
            "previous_responses": previous_responses.get("responses", {}) if previous_responses else {},
            "autofill_mappings": autofill_mappings,
            "has_previous_data": previous_responses is not None
        }

    async def get_multi_year_responses(
        self,
        org_id: str,
        framework: str,
        section: str,
        reporting_year: str,
    ) -> Dict[str, Any]:
        """
        Fetch current year + previous year responses in a single call.
        This supports the normalized 1-doc-per-year data model.
        
        Returns:
            Dict with current_year_data, previous_year_data, and metadata
        """
        previous_year = self._calculate_previous_fy(reporting_year)
        next_year = self._calculate_next_fy(reporting_year)
        
        # Fetch current year
        current_responses = await self.get_responses(
            org_id=org_id,
            framework=framework,
            reporting_year=reporting_year,
            section=section
        )
        
        # Fetch previous year
        previous_responses = await self.get_responses(
            org_id=org_id,
            framework=framework,
            reporting_year=previous_year,
            section=section
        )
        
        # Also check if next year has data (for backward fill)
        # If viewing 2024-25 and 2025-26 has previous_fy data for 2024-25
        next_year_responses = await self.get_responses(
            org_id=org_id,
            framework=framework,
            reporting_year=next_year,
            section=section
        )
        
        return {
            "reporting_year": reporting_year,
            "previous_year": previous_year,
            "next_year": next_year,
            "current_year_data": current_responses.get("responses", {}) if current_responses else {},
            "previous_year_data": previous_responses.get("responses", {}) if previous_responses else {},
            "next_year_data": next_year_responses.get("responses", {}) if next_year_responses else {},
            "has_current_data": current_responses is not None,
            "has_previous_data": previous_responses is not None,
            "has_next_year_data": next_year_responses is not None,
        }

    def _calculate_next_fy(self, reporting_year: str) -> str:
        """Calculate the next financial year from a reporting year string."""
        if reporting_year.startswith("CY "):
            year = int(reporting_year.replace("CY ", ""))
            return f"CY {year + 1}"
        elif reporting_year.startswith("FY "):
            # Handle "FY 2025-2026" format
            parts = reporting_year.replace("FY ", "").split("-")
            start_year = int(parts[0])
            return f"FY {start_year + 1}-{start_year + 2}"
        else:
            return str(int(reporting_year) + 1)

    def _calculate_previous_fy(self, reporting_year: str) -> str:
        """
        Calculate the previous financial year from a reporting year string.
        
        Examples:
            "FY 2025-2026" -> "FY 2024-2025"
            "CY 2025" -> "CY 2024"
        """
        if reporting_year.startswith("CY "):
            # Calendar year format: "CY 2025"
            year = int(reporting_year.replace("CY ", ""))
            return f"CY {year - 1}"
        elif reporting_year.startswith("FY "):
            # Handle "FY 2025-2026" format
            parts = reporting_year.replace("FY ", "").split("-")
            start_year = int(parts[0])
            return f"FY {start_year - 1}-{start_year}"
        else:
            # Default: assume numeric year
            return str(int(reporting_year) - 1)

    # =========================================================================
    # Helper Methods
    # =========================================================================

    async def get_question_statuses(
        self,
        org_id: str,
        framework: str,
        section: str,
        reporting_year: str,
    ) -> Dict[str, Any]:
        """
        Get approval status and version history for all questions in a section.
        
        Returns:
            {
                "statuses": {
                    "question_key": {
                        "approval_status": "pending_approval" | "approved" | "rejected" | null,
                        "submitted_at": "...",
                        "approved_at": "...",
                        "rejected_at": "...",
                        "rejection_reason": "...",
                        "version_count": 3
                    }
                },
                "versions": {
                    "question_key": [
                        {"version": 1, "change_type": "created", "created_at": "...", "created_by": "..."},
                        {"version": 2, "change_type": "approved", "created_at": "...", "created_by": "..."}
                    ]
                }
            }
        """
        from shared.database.mongo import db
        
        # First, get all question_keys for this section from configs
        section_configs = await self._configs.find(
            {"frameworks": {"$in": [framework.upper(), framework.lower(), framework]}, "section": section},
            {"_id": 0, "question_key": 1}
        ).to_list(500)
        section_question_keys = [c["question_key"] for c in section_configs]
        
        if not section_question_keys:
            return {"statuses": {}, "versions": {}}
        
        # Get esg_responses for these specific question_keys
        responses = await db.esg_responses.find(
            {
                "organization_id": org_id,
                "question_key": {"$in": section_question_keys},
                "reporting_year": reporting_year,
            },
            {"_id": 0}
        ).to_list(500)
        
        # Build status map
        statuses = {}
        for r in responses:
            qk = r.get("question_key")
            if qk:
                statuses[qk] = {
                    "approval_status": r.get("approval_status"),
                    "submitted_at": r.get("submitted_at"),
                    "submitted_by": r.get("submitted_by"),
                    "approved_at": r.get("approved_at"),
                    "approved_by": r.get("approved_by"),
                    "rejected_at": r.get("rejected_at"),
                    "rejected_by": r.get("rejected_by"),
                    "rejection_reason": r.get("rejection_reason"),
                }
        
        # Get version history from question_audit_log (this is where versions are stored)
        versions = {}
        
        if section_question_keys:
            # Query question_audit_log for version history with full details
            version_docs = await db.question_audit_log.find(
                {
                    "organization_id": org_id,
                    "question_key": {"$in": section_question_keys},
                    "reporting_period": reporting_year,
                },
                {"_id": 0}
            ).sort("timestamp", -1).to_list(1000)
            
            # Also get user details for performed_by user_ids
            user_ids = list(set(
                v.get("performed_by", {}).get("user_id") 
                for v in version_docs 
                if v.get("performed_by", {}).get("user_id")
            ))
            users_map = {}
            if user_ids:
                users = await db.users.find(
                    {"id": {"$in": user_ids}},
                    {"_id": 0, "id": 1, "name": 1, "email": 1}
                ).to_list(100)
                users_map = {u["id"]: u for u in users}
            
            for v in version_docs:
                qk = v.get("question_key")
                if qk not in versions:
                    versions[qk] = []
                
                # Get user details
                user_id = v.get("performed_by", {}).get("user_id")
                user = users_map.get(user_id, {})
                user_name = v.get("performed_by", {}).get("name") or user.get("name") or user.get("email") or "Unknown"
                
                # Get change details
                change_details = v.get("change_details", {})
                
                versions[qk].append({
                    "change_type": v.get("action"),
                    "created_at": v.get("timestamp").isoformat() if hasattr(v.get("timestamp"), 'isoformat') else str(v.get("timestamp")),
                    "created_by": user_name,
                    "old_value": change_details.get("old_value"),
                    "new_value": change_details.get("new_value"),
                    "rejection_reason": v.get("rejection_reason") or change_details.get("rejection_reason"),
                })
        
        # Add version count to statuses
        for qk in statuses:
            statuses[qk]["version_count"] = len(versions.get(qk, []))
        
        return {
            "statuses": statuses,
            "versions": versions,
        }


    def get_ngrbc_principles(self) -> List[Dict[str, str]]:
        """Get list of NGRBC principles (P1-P9)."""
        return NGRBC_PRINCIPLES


# Default service instance
esg_questionnaire_service = ESGQuestionnaireService()
