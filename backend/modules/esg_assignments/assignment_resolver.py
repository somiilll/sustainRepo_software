"""
AssignmentResolver - Single Source of Truth for Assignment Resolution

This module provides a centralized way to resolve assignments across the ESG platform.
It supports both the V2 architecture (esg_assignment_assignees) and legacy architecture
(assigned_to_user_id) during the migration period.

ARCHITECTURE:
- V2 (current): Assignees stored in esg_assignment_assignees collection (many-to-many)
- Legacy: Assignees stored as assigned_to_user_id on assignment document (single user)

USAGE:
    from modules.esg_assignments.assignment_resolver import assignment_resolver

    # Get assignment (returns None if not found)
    assignment = await assignment_resolver.resolve(
        organization_id=org_id,
        user_id=user_id,
        category="Water",
        subcategory="Withdrawal",
    )

    # Get assignment (raises exception if not found)
    assignment = await assignment_resolver.require_assignment(
        organization_id=org_id,
        user_id=user_id,
        category="Water",
        subcategory="Withdrawal",
    )

TODO: Remove legacy assigned_to_user_id fallback after migration is complete.
      Track migration progress and remove when all assignments use V2 model.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from fastapi import HTTPException
from shared.database.mongo import db


class AssignmentResolver:
    """
    Centralized assignment resolution service.
    
    This is the ONLY place that should resolve "which assignment governs this submission".
    All modules (records, approval, permissions, reminders) should use this resolver.
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._assignees = db["esg_assignment_assignees"]
    
    async def resolve(
        self,
        organization_id: str,
        user_id: str,
        category: str,
        subcategory: Optional[str] = None,
        sub_subcategory: Optional[str] = None,
        facility_id: Optional[str] = None,
        record_level: str = "organization",
        include_approval_info: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve the assignment that governs a submission.
        
        This method finds the MOST SPECIFIC matching assignment for the given parameters.
        It checks V2 architecture (esg_assignment_assignees) first, then falls back to
        legacy (assigned_to_user_id) for backwards compatibility.
        
        Args:
            organization_id: Organization ID
            user_id: User ID making the submission
            category: Record category (e.g., "Water")
            subcategory: Record subcategory (e.g., "Withdrawal")
            sub_subcategory: Record sub-subcategory (optional)
            facility_id: Facility ID (for facility-level records)
            record_level: "organization" or "facility"
            include_approval_info: Whether to include approver details
        
        Returns:
            Assignment document with requires_approval, approver_id, etc.
            Returns None if no matching assignment found.
        
        Priority (most specific wins):
            1. Exact match on category + subcategory + sub_subcategory
            2. Match on category + subcategory (sub_subcategory is None in assignment)
            3. Match on category only (subcategory and sub_subcategory are None)
        """
        # Step 1: Find assignment IDs where user is an assignee (V2 architecture)
        v2_assignment_ids = await self._get_v2_assignment_ids(organization_id, user_id)
        
        # Step 2: Build base query for assignments
        base_query = {
            "organization_id": organization_id,
            "entity_type": "record_category",
            "status": {"$nin": ["completed", "cancelled"]},
            "category": category,
        }
        
        # Handle facility level matching
        if record_level == "facility" and facility_id:
            base_query["$or"] = [
                {"facility_id": facility_id},  # Exact facility match
                {"assignment_level": "organization"},  # Org-level can cover any facility
            ]
        elif record_level == "organization":
            base_query["assignment_level"] = "organization"
        
        # Step 3: Try V2 architecture first (esg_assignment_assignees)
        if v2_assignment_ids:
            v2_query = {**base_query, "id": {"$in": v2_assignment_ids}}
            v2_assignments = await self._assignments.find(v2_query, {"_id": 0}).to_list(100)
            
            if v2_assignments:
                best_match = self._find_best_match(
                    v2_assignments, subcategory, sub_subcategory
                )
                if best_match:
                    if include_approval_info:
                        best_match = await self._enrich_with_approval_info(best_match)
                    return best_match
        
        # Step 4: Fallback to legacy architecture (assigned_to_user_id)
        # TODO: Remove this fallback after migration is complete.
        legacy_query = {**base_query, "assigned_to_user_id": user_id}
        legacy_assignments = await self._assignments.find(legacy_query, {"_id": 0}).to_list(100)
        
        if legacy_assignments:
            best_match = self._find_best_match(
                legacy_assignments, subcategory, sub_subcategory
            )
            if best_match:
                if include_approval_info:
                    best_match = await self._enrich_with_approval_info(best_match)
                return best_match
        
        return None
    
    async def require_assignment(
        self,
        organization_id: str,
        user_id: str,
        category: str,
        subcategory: Optional[str] = None,
        sub_subcategory: Optional[str] = None,
        facility_id: Optional[str] = None,
        record_level: str = "organization",
        include_approval_info: bool = True,
        error_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Resolve assignment or raise HTTPException if not found.
        
        This is a convenience method for cases where an assignment MUST exist.
        Use this when you want to fail fast with a clear error message.
        
        Args:
            Same as resolve() plus:
            error_message: Custom error message (optional)
        
        Returns:
            Assignment document
        
        Raises:
            HTTPException(403): If no matching assignment found
        """
        assignment = await self.resolve(
            organization_id=organization_id,
            user_id=user_id,
            category=category,
            subcategory=subcategory,
            sub_subcategory=sub_subcategory,
            facility_id=facility_id,
            record_level=record_level,
            include_approval_info=include_approval_info,
        )
        
        if not assignment:
            msg = error_message or (
                f"You don't have an active assignment for {category}"
                + (f" / {subcategory}" if subcategory else "")
                + (f" at facility {facility_id}" if facility_id else "")
                + ". Please contact your administrator."
            )
            raise HTTPException(status_code=403, detail=msg)
        
        return assignment
    
    async def resolve_by_assignment_id(
        self,
        assignment_id: str,
        user_id: Optional[str] = None,
        include_approval_info: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve an assignment by its ID.
        
        Optionally verify that the user is assigned to it.
        
        Args:
            assignment_id: Assignment ID
            user_id: If provided, verify user is assigned (V2 or legacy)
            include_approval_info: Whether to include approver details
        
        Returns:
            Assignment document or None
        """
        assignment = await self._assignments.find_one(
            {"id": assignment_id},
            {"_id": 0}
        )
        
        if not assignment:
            return None
        
        # Verify user is assigned if user_id provided
        if user_id:
            is_assigned = await self._is_user_assigned(assignment_id, user_id, assignment)
            if not is_assigned:
                return None
        
        if include_approval_info:
            assignment = await self._enrich_with_approval_info(assignment)
        
        return assignment
    
    async def get_user_assignments(
        self,
        organization_id: str,
        user_id: str,
        category: Optional[str] = None,
        status_filter: Optional[List[str]] = None,
        include_approval_info: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        Get all assignments for a user.
        
        Useful for listing user's assignments, checking permissions, etc.
        
        Args:
            organization_id: Organization ID
            user_id: User ID
            category: Optional category filter
            status_filter: Optional list of statuses to exclude
            include_approval_info: Whether to include approver details
        
        Returns:
            List of assignment documents
        """
        # Get V2 assignment IDs
        v2_assignment_ids = await self._get_v2_assignment_ids(organization_id, user_id)
        
        # Build query
        query = {
            "organization_id": organization_id,
            "$or": [
                {"id": {"$in": v2_assignment_ids}} if v2_assignment_ids else {"id": None},
                {"assigned_to_user_id": user_id},  # Legacy fallback
            ],
        }
        
        if category:
            query["category"] = category
        
        if status_filter:
            query["status"] = {"$nin": status_filter}
        
        assignments = await self._assignments.find(query, {"_id": 0}).to_list(500)
        
        # Deduplicate (in case both V2 and legacy match)
        seen_ids = set()
        unique_assignments = []
        for a in assignments:
            if a["id"] not in seen_ids:
                seen_ids.add(a["id"])
                if include_approval_info:
                    a = await self._enrich_with_approval_info(a)
                unique_assignments.append(a)
        
        return unique_assignments
    
    async def is_user_assigned(
        self,
        organization_id: str,
        user_id: str,
        category: str,
        subcategory: Optional[str] = None,
        facility_id: Optional[str] = None,
    ) -> bool:
        """
        Check if user has any assignment for the given category/subcategory.
        
        This is a lightweight check that doesn't return the full assignment.
        """
        assignment = await self.resolve(
            organization_id=organization_id,
            user_id=user_id,
            category=category,
            subcategory=subcategory,
            facility_id=facility_id,
            include_approval_info=False,
        )
        return assignment is not None
    
    # =========================================================================
    # Private Helper Methods
    # =========================================================================
    
    async def _get_v2_assignment_ids(
        self,
        organization_id: str,
        user_id: str,
    ) -> List[str]:
        """
        Get assignment IDs where user is an assignee (V2 architecture).
        
        Note: organization_id filter is optional as some legacy data may not have it.
        We verify org match via the assignment itself.
        """
        # Query without org_id filter first (some legacy data missing this field)
        # TODO: After backfilling organization_id, add it back to query for efficiency
        assignees = await self._assignees.find(
            {
                "user_id": user_id,
                "$or": [
                    {"removed_at": None},
                    {"removed_at": {"$exists": False}},
                ],
            },
            {"_id": 0, "assignment_id": 1}
        ).to_list(500)
        
        return [a["assignment_id"] for a in assignees]
    
    async def _is_user_assigned(
        self,
        assignment_id: str,
        user_id: str,
        assignment: Dict[str, Any],
    ) -> bool:
        """
        Check if user is assigned to a specific assignment (V2 or legacy).
        """
        # Check V2
        v2_assignee = await self._assignees.find_one({
            "assignment_id": assignment_id,
            "user_id": user_id,
            "$or": [
                {"removed_at": None},
                {"removed_at": {"$exists": False}},
            ],
        })
        if v2_assignee:
            return True
        
        # Check legacy
        # TODO: Remove after migration
        if assignment.get("assigned_to_user_id") == user_id:
            return True
        
        return False
    
    def _find_best_match(
        self,
        assignments: List[Dict[str, Any]],
        subcategory: Optional[str],
        sub_subcategory: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """
        Find the most specific matching assignment.
        
        Priority:
            3 = Exact match (category + subcategory + sub_subcategory)
            2 = Subcategory match (sub_subcategory is None in assignment)
            1 = Category only (subcategory and sub_subcategory are None)
        """
        best_match = None
        best_score = -1
        
        for assignment in assignments:
            a_subcat = assignment.get("subcategory")
            a_sub_subcat = assignment.get("sub_subcategory")
            
            score = 0
            
            # Exact match on all levels
            if a_subcat == subcategory and a_sub_subcat == sub_subcategory:
                score = 3
            # Subcategory match (sub_subcategory is None in assignment)
            elif a_subcat == subcategory and a_sub_subcat is None:
                score = 2
            # Category-only match (both are None in assignment)
            elif a_subcat is None and a_sub_subcat is None:
                score = 1
            # Subcategory matches but we're filling a different sub_subcategory
            elif a_subcat == subcategory:
                score = 2
            else:
                continue  # No match
            
            if score > best_score:
                best_score = score
                best_match = assignment
        
        return best_match
    
    async def _enrich_with_approval_info(
        self,
        assignment: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Add approver details to assignment document.
        """
        approver_id = assignment.get("approver_id")
        if approver_id:
            approver = await db.users.find_one(
                {"id": approver_id},
                {"_id": 0, "id": 1, "email": 1, "full_name": 1}
            )
            if approver:
                assignment["approver_info"] = approver
        
        return assignment


# Singleton instance
assignment_resolver = AssignmentResolver()
