"""
Access Control Service for ESG Assignments

Provides permission checking utilities for determining user access to
questions and records based on assignments.
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from shared.database.mongo import db
from .models import EntityType, AssignmentLevel, AssignmentRole
from .inheritance import (
    build_inheritance_query,
    resolve_effective_assignment,
    get_question_hierarchy,
    get_record_hierarchy,
)


class AccessControlService:
    """
    Service for checking user access to ESG entities based on assignments.
    
    Key behaviors:
    - If no assignment exists for an entity, all org users can access (default behavior)
    - If assignment exists, only assigned user (and admins) can access
    - Admins always have full access
    - Uses inheritance: section assignment covers all questions in section
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._question_configs = db["esg_question_configs"]
        self._record_categories = db["esg_record_categories"]
        self._users = db["users"]
    
    async def is_admin(self, user_id: str, organization_id: str) -> bool:
        """Check if user is an admin for the organization"""
        user = await self._users.find_one(
            {"id": user_id, "organization_id": organization_id},
            {"role": 1}
        )
        return user and user.get("role") in ["admin", "super_admin", "org_admin"]
    
    async def can_access_question(
        self,
        user_id: str,
        organization_id: str,
        question_key: str,
        reporting_period: str,
        required_role: AssignmentRole = AssignmentRole.VIEWER,
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Check if user can access a specific question.
        
        Returns:
            Tuple of (has_access, effective_assignment)
            - has_access: True if user can access
            - effective_assignment: The assignment that grants access (if any)
        """
        # Admins always have access
        if await self.is_admin(user_id, organization_id):
            return True, None
        
        # Get question config for hierarchy info
        question_config = await self._question_configs.find_one(
            {"question_key": question_key},
            {"_id": 0}
        )
        
        if not question_config:
            # Question not found - deny access
            return False, None
        
        hierarchy = get_question_hierarchy(question_config)
        
        # Build query for all potentially applicable assignments
        query = build_inheritance_query(
            entity_type=EntityType.QUESTION,
            question_key=hierarchy["question_key"],
            section=hierarchy["section"],
            topic=hierarchy["topic"],
            principle=hierarchy["principle"],
            organization_id=organization_id,
            reporting_period=reporting_period,
        )
        
        # Find all matching assignments
        cursor = self._assignments.find(query, {"_id": 0})
        assignments = await cursor.to_list(100)
        
        # If no assignments exist, use default behavior (all users can access)
        if not assignments:
            return True, None
        
        # Resolve effective assignment using inheritance
        effective = resolve_effective_assignment(assignments, EntityType.QUESTION)
        
        if not effective:
            return True, None
        
        # Check if user is the assigned user
        if effective.get("assigned_to_user_id") == user_id:
            # Check role permission
            if self._has_role_permission(effective.get("role"), required_role):
                return True, effective
        
        # Check if user is in additional reminder recipients (viewers)
        recipients = effective.get("reminder_recipients") or []
        if user_id in recipients and required_role == AssignmentRole.VIEWER:
            return True, effective
        
        return False, effective
    
    async def can_access_record(
        self,
        user_id: str,
        organization_id: str,
        category: str,
        reporting_period: str,
        subcategory: Optional[str] = None,
        record_type: Optional[str] = None,
        facility_id: Optional[str] = None,
        required_role: AssignmentRole = AssignmentRole.VIEWER,
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        """
        Check if user can access a record category/type.
        
        Returns:
            Tuple of (has_access, effective_assignment)
        """
        # Admins always have access
        if await self.is_admin(user_id, organization_id):
            return True, None
        
        # Build query for all potentially applicable assignments
        query = build_inheritance_query(
            entity_type=EntityType.RECORD,
            category=category,
            subcategory=subcategory,
            record_type=record_type,
            organization_id=organization_id,
            reporting_period=reporting_period,
        )
        
        # Add facility filter if provided
        if facility_id:
            query["$or"] = [
                {"$and": [{"facility_id": facility_id}, q]} 
                for q in query.get("$or", [{"entity_type": EntityType.RECORD.value}])
            ] + [
                {"$and": [{"facility_id": None}, q]}
                for q in query.get("$or", [{"entity_type": EntityType.RECORD.value}])
            ]
        
        # Find all matching assignments
        cursor = self._assignments.find(query, {"_id": 0})
        assignments = await cursor.to_list(100)
        
        # If no assignments exist, use default behavior (all users can access)
        if not assignments:
            return True, None
        
        # Resolve effective assignment
        effective = resolve_effective_assignment(assignments, EntityType.RECORD)
        
        if not effective:
            return True, None
        
        # Check if user is the assigned user
        if effective.get("assigned_to_user_id") == user_id:
            if self._has_role_permission(effective.get("role"), required_role):
                return True, effective
        
        return False, effective
    
    async def get_accessible_questions(
        self,
        user_id: str,
        organization_id: str,
        reporting_period: str,
        section: Optional[str] = None,
    ) -> List[str]:
        """
        Get list of question_keys the user can access.
        
        For admins: returns empty list (meaning all questions accessible)
        For users: returns list of accessible question_keys
        
        Returns empty list if user is admin (signaling full access)
        """
        if await self.is_admin(user_id, organization_id):
            return []  # Empty means "all" for admins
        
        # Find all assignments for this user
        query = {
            "organization_id": organization_id,
            "entity_type": EntityType.QUESTION.value,
            "reporting_period": reporting_period,
            "assigned_to_user_id": user_id,
        }
        
        cursor = self._assignments.find(query, {"_id": 0})
        assignments = await cursor.to_list(500)
        
        if not assignments:
            # No assignments = check if ANY assignments exist for this org/period
            any_assignments = await self._assignments.count_documents({
                "organization_id": organization_id,
                "entity_type": EntityType.QUESTION.value,
                "reporting_period": reporting_period,
            })
            
            if any_assignments == 0:
                return []  # No assignments at all = full access
            else:
                # Assignments exist but not for this user = no access
                return ["__no_access__"]
        
        # Expand assignments to question_keys
        accessible = set()
        
        for assignment in assignments:
            level = assignment.get("assignment_level")
            entity_id = assignment.get("entity_id")
            
            if level == AssignmentLevel.QUESTION.value:
                accessible.add(entity_id)
            elif level == AssignmentLevel.SECTION.value:
                # Get all questions in section
                questions = await self._get_questions_by_section(entity_id)
                accessible.update(questions)
            elif level == AssignmentLevel.TOPIC.value:
                # Get all questions in topic (group)
                questions = await self._get_questions_by_topic(entity_id, section)
                accessible.update(questions)
            elif level == AssignmentLevel.PRINCIPLE.value:
                # Get all questions for principle
                questions = await self._get_questions_by_principle(entity_id)
                accessible.update(questions)
        
        return list(accessible)
    
    async def get_accessible_record_categories(
        self,
        user_id: str,
        organization_id: str,
        reporting_period: str,
        facility_id: Optional[str] = None,
    ) -> List[str]:
        """
        Get list of record category IDs the user can access.
        
        Returns empty list if user is admin (signaling full access)
        """
        if await self.is_admin(user_id, organization_id):
            return []
        
        query = {
            "organization_id": organization_id,
            "entity_type": EntityType.RECORD.value,
            "reporting_period": reporting_period,
            "assigned_to_user_id": user_id,
        }
        
        if facility_id:
            query["$or"] = [
                {"facility_id": facility_id},
                {"facility_id": None},
            ]
        
        cursor = self._assignments.find(query, {"_id": 0})
        assignments = await cursor.to_list(500)
        
        if not assignments:
            any_assignments = await self._assignments.count_documents({
                "organization_id": organization_id,
                "entity_type": EntityType.RECORD.value,
                "reporting_period": reporting_period,
            })
            
            if any_assignments == 0:
                return []
            else:
                return ["__no_access__"]
        
        # Extract unique category identifiers
        accessible = set()
        for assignment in assignments:
            accessible.add(assignment.get("entity_id"))
        
        return list(accessible)
    
    async def _get_questions_by_section(self, section: str) -> List[str]:
        """Get all question_keys in a section"""
        cursor = self._question_configs.find(
            {"section": section.lower()},
            {"question_key": 1}
        )
        docs = await cursor.to_list(500)
        return [d["question_key"] for d in docs]
    
    async def _get_questions_by_topic(self, topic: str, section: Optional[str] = None) -> List[str]:
        """Get all question_keys in a topic (group)"""
        query = {"group": topic}
        if section:
            query["section"] = section.lower()
        
        cursor = self._question_configs.find(query, {"question_key": 1})
        docs = await cursor.to_list(500)
        return [d["question_key"] for d in docs]
    
    async def _get_questions_by_principle(self, principle: str) -> List[str]:
        """Get all question_keys for a principle"""
        cursor = self._question_configs.find(
            {"brsr_principle": principle},
            {"question_key": 1}
        )
        docs = await cursor.to_list(500)
        return [d["question_key"] for d in docs]
    
    def _has_role_permission(
        self,
        user_role: Optional[str],
        required_role: AssignmentRole
    ) -> bool:
        """Check if user's role has sufficient permission"""
        role_hierarchy = {
            AssignmentRole.VIEWER.value: 1,
            AssignmentRole.REVIEWER.value: 2,
            AssignmentRole.EDITOR.value: 3,
            AssignmentRole.APPROVER.value: 4,
            AssignmentRole.OWNER.value: 5,
        }
        
        user_level = role_hierarchy.get(user_role, 0)
        required_level = role_hierarchy.get(required_role.value, 0)
        
        return user_level >= required_level


# Singleton instance
access_control_service = AccessControlService()
