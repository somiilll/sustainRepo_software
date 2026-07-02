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
    ) -> Dict[str, Any]:
        """
        Get GRI disclosures with responses for a section.
        Returns questions with their current responses.
        Supports sub_questions with individual response fields.
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
                for sub in sub_questions:
                    sub_response_key = f"{q_key}_{sub['sub_key']}"
                    sub_response = responses_map.get(sub_response_key, {})
                    sub_status = sub_response.get("status")
                    if sub_status == "saved":
                        has_any_saved = True
                    elif sub_status == "draft":
                        has_any_draft = True
                    question_data["sub_questions"].append({
                        "sub_key": sub["sub_key"],
                        "label": sub["label"],
                        "response_key": sub_response_key,
                        "response_value": sub_response.get("value"),
                        "response_status": sub_status,
                    })
                # Overall status for the parent question
                if has_any_saved:
                    question_data["status"] = "saved"
                elif has_any_draft:
                    question_data["status"] = "draft"
                else:
                    question_data["status"] = "pending"
            else:
                # Simple question with single response
                response = responses_map.get(q_key, {})
                question_data["response_value"] = response.get("value")
                question_data["status"] = response.get("status", "pending") if response else "pending"
                question_data["updated_at"] = response.get("updated_at")
                question_data["updated_by_name"] = response.get("updated_by_name")
            
            questions.append(question_data)
        
        return {
            "section": section,
            "reporting_period": reporting_period,
            "questions": questions,
            "total": len(questions)
        }

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
    ) -> bool:
        """
        Save a single GRI disclosure response.
        Uses upsert to create or update the response.
        Supports draft and saved status.
        Logs changes to audit trail for version history.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Get previous response for audit logging
        previous_response = await db.esg_responses.find_one(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            {"_id": 0, "value": 1, "status": 1, "updated_by": 1}
        )
        
        previous_value = previous_response.get("value") if previous_response else None
        previous_status = previous_response.get("status") if previous_response else None
        is_new = previous_response is None
        
        # Upsert the response in esg_responses collection
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
        
        # Log to audit trail for version history
        if result.acknowledged:
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
            }
            
            await db.question_audit_log.insert_one(audit_entry)
        
        return result.acknowledged
    
    async def get_question_history(
        self,
        org_id: str,
        question_key: str,
        reporting_period: str,
    ) -> List[Dict[str, Any]]:
        """
        Get version history for a specific question.
        Returns all audit log entries for the question.
        """
        cursor = db.question_audit_log.find(
            {
                "organization_id": org_id,
                "question_key": question_key,
                "reporting_period": reporting_period,
            },
            {"_id": 0}
        ).sort("timestamp", -1)
        
        return await cursor.to_list(100)

    # =========================================================================
    # Response Methods
    # =========================================================================

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
        from modules.esg_assignments.service import assignment_service
        from modules.esg_assignments.models import ResponseChangeType
        
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
            
            # Log version history for each changed question
            if changed_by_user_id:
                for question_key, new_value in responses.items():
                    old_value = old_responses.get(question_key)
                    if old_value != new_value:
                        try:
                            await assignment_service.log_response_version(
                                organization_id=org_id,
                                question_key=question_key,
                                reporting_period=reporting_year,
                                previous_value=old_value,
                                new_value=new_value,
                                changed_by_user_id=changed_by_user_id,
                                change_type=ResponseChangeType.UPDATED if old_value else ResponseChangeType.CREATED,
                            )
                            
                            # Check if this disclosure requires approval and trigger workflow
                            await self._trigger_approval_if_required(
                                org_id, question_key, reporting_year, new_value, changed_by_user_id
                            )
                        except Exception as e:
                            # Don't fail save if version tracking fails
                            print(f"Warning: Failed to log response version for {question_key}: {e}")
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
            
            # Log initial version for each question
            if changed_by_user_id:
                for question_key, new_value in responses.items():
                    try:
                        await assignment_service.log_response_version(
                            organization_id=org_id,
                            question_key=question_key,
                            reporting_period=reporting_year,
                            previous_value=None,
                            new_value=new_value,
                            changed_by_user_id=changed_by_user_id,
                            change_type=ResponseChangeType.CREATED,
                        )
                        
                        # Check if this disclosure requires approval and trigger workflow
                        await self._trigger_approval_if_required(
                            org_id, question_key, reporting_year, new_value, changed_by_user_id
                        )
                    except Exception as e:
                        print(f"Warning: Failed to log response version for {question_key}: {e}")

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
        
        This is called after a response is saved. It:
        1. Checks if there's an assignment for this question with requires_approval=True
        2. Checks if the organization has approval workflows enabled
        3. Creates an approval_request if conditions are met
        """
        try:
            from shared.database.mongo import db
            from modules.approval_workflow.service import ApprovalWorkflowService
            from modules.approval_workflow.models import SubmitForApprovalInput, EntityType
            
            # Check if there's an assignment with requires_approval=True
            assignment = await db.esg_assignments.find_one({
                "organization_id": org_id,
                "entity_id": question_key,
                "entity_type": "question",
                "reporting_period": reporting_year,
                "requires_approval": True,
            }, {"_id": 0})
            
            if not assignment:
                return  # No approval required for this disclosure
            
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
                
                # Update assignment status to 'submitted'
                await db.esg_assignments.update_one(
                    {"id": assignment.get("id")},
                    {"$set": {"status": "submitted"}}
                )
            else:
                print(f"Warning: Failed to auto-submit approval for {question_key}: {message}")
                
        except Exception as e:
            # Don't fail the save if approval workflow fails
            print(f"Warning: Approval workflow trigger failed for {question_key}: {e}")

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

    def get_ngrbc_principles(self) -> List[Dict[str, str]]:
        """Get list of NGRBC principles (P1-P9)."""
        return NGRBC_PRINCIPLES


# Default service instance
esg_questionnaire_service = ESGQuestionnaireService()
