"""
Unified ESG Response Service

Single source of truth for ESG questionnaire responses.
Uses organization_esg_responses collection with question-level documents.

Document Structure (Option B - Nested sub-questions):
{
    "id": "uuid",
    "org_id": "uuid",
    "question_key": "gri_302_1",  # Parent question key
    "framework": "GRI",           # or "BRSR"
    "reporting_year": "FY 2026-2027",
    "section": "environment",
    "value": "...",               # For simple questions OR
    "sub_responses": {            # For questions with sub-parts
        "a": {
            "value": "...",
            "status": "saved",
            "approval_status": "approved",
            "updated_at": "...",
            "updated_by": "user_id"
        },
        "b": {...}
    },
    "status": "saved",            # Overall question status
    "approval_status": "approved",
    "response_statuses": {...},   # Legacy compatibility
    "created_at": "...",
    "updated_at": "..."
}
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple

from shared.database.mongo import db


class UnifiedResponseService:
    """
    Centralized service for reading/writing ESG questionnaire responses.
    
    This replaces the dual-collection pattern (esg_responses + organization_esg_responses)
    with a single unified collection using question-level documents.
    """
    
    COLLECTION = "organization_esg_responses"
    
    def __init__(self):
        self._collection = db[self.COLLECTION]
        self._configs = db["esg_question_configs"]
    
    # =========================================================================
    # Core Read Methods
    # =========================================================================
    
    async def get_response(
        self,
        org_id: str,
        question_key: str,
        reporting_year: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get a single question response.
        
        For questions with sub-parts, returns the full document including sub_responses.
        """
        # First try direct question key lookup
        doc = await self._collection.find_one(
            {
                "org_id": org_id,
                "question_key": question_key,
                "reporting_year": reporting_year,
            },
            {"_id": 0}
        )
        
        if doc:
            return doc
        
        # If not found and this looks like a sub-question key (e.g., gri_302_1_a),
        # try to find the parent and extract the sub-response
        if "_" in question_key:
            parent_key, sub_key = self._split_question_key(question_key)
            if parent_key:
                parent_doc = await self._collection.find_one(
                    {
                        "org_id": org_id,
                        "question_key": parent_key,
                        "reporting_year": reporting_year,
                    },
                    {"_id": 0}
                )
                if parent_doc and "sub_responses" in parent_doc:
                    sub_data = parent_doc.get("sub_responses", {}).get(sub_key)
                    if sub_data:
                        return {
                            "org_id": org_id,
                            "question_key": question_key,
                            "reporting_year": reporting_year,
                            "framework": parent_doc.get("framework"),
                            "section": parent_doc.get("section"),
                            **sub_data
                        }
        
        return None
    
    async def get_responses_for_section(
        self,
        org_id: str,
        framework: str,
        section: str,
        reporting_year: str,
    ) -> Dict[str, Any]:
        """
        Get all responses for a section.
        
        Returns a dict keyed by question_key with their values/statuses.
        """
        cursor = self._collection.find(
            {
                "org_id": org_id,
                "framework": framework,
                "section": section,
                "reporting_year": reporting_year,
            },
            {"_id": 0}
        )
        
        docs = await cursor.to_list(500)
        
        # Build response map
        responses = {}
        response_statuses = {}
        
        for doc in docs:
            q_key = doc.get("question_key")
            if not q_key:
                continue
            
            # Check if document has sub_responses (nested structure)
            if "sub_responses" in doc and doc["sub_responses"]:
                # Flatten sub_responses into individual entries
                for sub_key, sub_data in doc["sub_responses"].items():
                    full_key = f"{q_key}_{sub_key}"
                    responses[full_key] = sub_data.get("value")
                    response_statuses[full_key] = {
                        "status": sub_data.get("status", "pending"),
                        "approval_status": sub_data.get("approval_status"),
                        "updated_at": sub_data.get("updated_at"),
                        "updated_by": sub_data.get("updated_by"),
                    }
            else:
                # Simple question - direct value
                responses[q_key] = doc.get("value")
                response_statuses[q_key] = {
                    "status": doc.get("status", "pending"),
                    "approval_status": doc.get("approval_status"),
                    "updated_at": doc.get("updated_at"),
                    "updated_by": doc.get("updated_by"),
                }
            
            # Also include any legacy responses stored in the document
            if "responses" in doc:
                for rkey, rval in doc.get("responses", {}).items():
                    if rkey not in responses:
                        responses[rkey] = rval
        
        return {
            "responses": responses,
            "response_statuses": response_statuses,
        }
    
    async def check_completion(
        self,
        org_id: str,
        question_key: str,
        reporting_year: str,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check if a question has been completed.
        
        Returns: (has_data, last_updated, approval_status)
        
        Used by completion_service for task status calculation.
        """
        doc = await self.get_response(org_id, question_key, reporting_year)
        
        if not doc:
            return False, None, None
        
        # Check if value exists and is meaningful
        value = doc.get("value")
        has_value = self._has_meaningful_value(value)
        
        if not has_value and "sub_responses" in doc:
            # Check if any sub-response has value
            for sub_data in doc.get("sub_responses", {}).values():
                if self._has_meaningful_value(sub_data.get("value")):
                    has_value = True
                    break
        
        if not has_value:
            return False, None, None
        
        # Parse updated_at
        updated_at = doc.get("updated_at")
        if updated_at and isinstance(updated_at, str):
            try:
                updated_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            except (TypeError, ValueError):
                updated_at = None
        
        approval_status = doc.get("approval_status")
        
        return True, updated_at, approval_status
    
    # =========================================================================
    # Core Write Methods
    # =========================================================================
    
    async def save_response(
        self,
        org_id: str,
        question_key: str,
        value: Any,
        reporting_year: str,
        framework: str,
        section: str,
        status: str = "saved",
        approval_status: Optional[str] = None,
        updated_by: Optional[str] = None,
        updated_by_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Save a single question response.
        
        For sub-questions (e.g., gri_302_1_a), updates the parent document's sub_responses.
        """
        now = datetime.now(timezone.utc)
        now_iso = now.isoformat()
        
        # Determine if this is a sub-question
        parent_key, sub_key = self._split_question_key(question_key)
        
        if parent_key and sub_key:
            # Sub-question: Update parent's sub_responses
            return await self._save_sub_response(
                org_id=org_id,
                parent_key=parent_key,
                sub_key=sub_key,
                value=value,
                reporting_year=reporting_year,
                framework=framework,
                section=section,
                status=status,
                approval_status=approval_status,
                updated_by=updated_by,
                updated_by_name=updated_by_name,
                now_iso=now_iso,
            )
        else:
            # Simple question: Direct document update
            return await self._save_simple_response(
                org_id=org_id,
                question_key=question_key,
                value=value,
                reporting_year=reporting_year,
                framework=framework,
                section=section,
                status=status,
                approval_status=approval_status,
                updated_by=updated_by,
                updated_by_name=updated_by_name,
                now_iso=now_iso,
            )
    
    async def _save_simple_response(
        self,
        org_id: str,
        question_key: str,
        value: Any,
        reporting_year: str,
        framework: str,
        section: str,
        status: str,
        approval_status: Optional[str],
        updated_by: Optional[str],
        updated_by_name: Optional[str],
        now_iso: str,
    ) -> Dict[str, Any]:
        """Save a simple (non-sub-question) response."""
        
        update_fields = {
            "value": value,
            "status": status,
            "framework": framework,
            "section": section,
            "updated_at": now_iso,
            "updated_by": updated_by,
            "updated_by_name": updated_by_name,
        }
        
        if approval_status:
            update_fields["approval_status"] = approval_status
        
        result = await self._collection.update_one(
            {
                "org_id": org_id,
                "question_key": question_key,
                "reporting_year": reporting_year,
            },
            {
                "$set": update_fields,
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "organization_id": org_id,  # Legacy compatibility
                    "question_key": question_key,
                    "reporting_year": reporting_year,
                    "created_at": now_iso,
                }
            },
            upsert=True
        )
        
        return {
            "success": result.acknowledged,
            "question_key": question_key,
            "status": status,
        }
    
    async def _save_sub_response(
        self,
        org_id: str,
        parent_key: str,
        sub_key: str,
        value: Any,
        reporting_year: str,
        framework: str,
        section: str,
        status: str,
        approval_status: Optional[str],
        updated_by: Optional[str],
        updated_by_name: Optional[str],
        now_iso: str,
    ) -> Dict[str, Any]:
        """Save a sub-question response within parent's sub_responses."""
        
        sub_data = {
            "value": value,
            "status": status,
            "updated_at": now_iso,
            "updated_by": updated_by,
            "updated_by_name": updated_by_name,
        }
        
        if approval_status:
            sub_data["approval_status"] = approval_status
        
        result = await self._collection.update_one(
            {
                "org_id": org_id,
                "question_key": parent_key,
                "reporting_year": reporting_year,
            },
            {
                "$set": {
                    f"sub_responses.{sub_key}": sub_data,
                    "framework": framework,
                    "section": section,
                    "updated_at": now_iso,
                },
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "organization_id": org_id,
                    "question_key": parent_key,
                    "reporting_year": reporting_year,
                    "created_at": now_iso,
                }
            },
            upsert=True
        )
        
        return {
            "success": result.acknowledged,
            "question_key": f"{parent_key}_{sub_key}",
            "parent_key": parent_key,
            "sub_key": sub_key,
            "status": status,
        }
    
    async def update_approval_status(
        self,
        org_id: str,
        question_key: str,
        reporting_year: str,
        approval_status: str,
        approved_by: Optional[str] = None,
        approved_by_name: Optional[str] = None,
        final_value: Any = None,
    ) -> bool:
        """
        Update approval status for a question after approval/rejection.
        
        If final_value is provided (edited during approval), also updates the value.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        
        parent_key, sub_key = self._split_question_key(question_key)
        
        if parent_key and sub_key:
            # Sub-question
            update_fields = {
                f"sub_responses.{sub_key}.approval_status": approval_status,
                f"sub_responses.{sub_key}.updated_at": now_iso,
            }
            
            if approval_status == "approved":
                update_fields[f"sub_responses.{sub_key}.approved_at"] = now_iso
                update_fields[f"sub_responses.{sub_key}.approved_by"] = approved_by
                update_fields[f"sub_responses.{sub_key}.approved_by_name"] = approved_by_name
            
            if final_value is not None:
                update_fields[f"sub_responses.{sub_key}.value"] = final_value
            
            result = await self._collection.update_one(
                {
                    "org_id": org_id,
                    "question_key": parent_key,
                    "reporting_year": reporting_year,
                },
                {"$set": update_fields}
            )
        else:
            # Simple question
            update_fields = {
                "approval_status": approval_status,
                "updated_at": now_iso,
            }
            
            if approval_status == "approved":
                update_fields["approved_at"] = now_iso
                update_fields["approved_by"] = approved_by
                update_fields["approved_by_name"] = approved_by_name
            
            if final_value is not None:
                update_fields["value"] = final_value
            
            result = await self._collection.update_one(
                {
                    "org_id": org_id,
                    "question_key": question_key,
                    "reporting_year": reporting_year,
                },
                {"$set": update_fields}
            )
        
        return result.modified_count > 0
    
    # =========================================================================
    # Helper Methods
    # =========================================================================
    
    def _split_question_key(self, question_key: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Split a question key into parent and sub-key.
        
        Examples:
        - "gri_302_1_a" -> ("gri_302_1", "a")
        - "gri_302_1_a_i" -> ("gri_302_1_a", "i")
        - "gri_302_1" -> (None, None) - no sub-key
        - "p1_essential_indicators" -> (None, None) - BRSR with underscores
        
        Returns: (parent_key, sub_key) or (None, None) if not a sub-question
        """
        if not question_key or "_" not in question_key:
            return None, None
        
        # Known sub-question suffixes (roman numerals and letters)
        sub_suffixes = {'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
                       'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n'}
        
        parts = question_key.rsplit("_", 1)
        if len(parts) == 2:
            potential_parent, potential_sub = parts
            if potential_sub.lower() in sub_suffixes:
                return potential_parent, potential_sub
        
        return None, None
    
    def _has_meaningful_value(self, value: Any) -> bool:
        """Check if a value is meaningful (not empty/null)."""
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, dict)):
            if not value:
                return False
            if isinstance(value, dict):
                return any(self._has_meaningful_value(v) for v in value.values())
            return any(self._has_meaningful_value(v) for v in value)
        return True
    
    # =========================================================================
    # Bulk Operations
    # =========================================================================
    
    async def get_question_statuses(
        self,
        org_id: str,
        framework: str,
        section: str,
        reporting_year: str,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get approval statuses for all questions in a section.
        
        Returns dict keyed by question_key with status info.
        """
        result = await self.get_responses_for_section(
            org_id=org_id,
            framework=framework,
            section=section,
            reporting_year=reporting_year,
        )
        
        return result.get("response_statuses", {})


# Singleton instance
unified_response_service = UnifiedResponseService()
