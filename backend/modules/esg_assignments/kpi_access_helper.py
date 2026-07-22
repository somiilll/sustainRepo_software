"""
KPI Access Helper for Assignment-Based Data Access Control

This module provides centralized helpers for determining what data
a user can access based on their ESG assignments.

Features:
- GHG Emissions subcategory restrictions (Scope 1, 2, 3, Biogenic, Sinks)
- Facility-level access restrictions
- Organization-level full access
- Admin bypass (admins always see everything)

Usage:
    from modules.esg_assignments.kpi_access_helper import kpi_access_helper
    
    # Get user's allowed GHG scopes
    scopes = await kpi_access_helper.get_allowed_ghg_scopes(user_id, org_id, reporting_period)
    
    # Get user's allowed facilities
    facilities = await kpi_access_helper.get_allowed_facilities(user_id, org_id, reporting_period, category)
    
    # Check if user can access specific emission
    can_access = await kpi_access_helper.can_access_emission(user_id, org_id, scope, facility_id, reporting_period)
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from shared.database.mongo import db


# Mapping from assignment subcategory to emission scope values
GHG_SUBCATEGORY_TO_SCOPE = {
    "GHG Emissions - Scope 1": ["scope1"],
    "GHG Emissions - Scope 2": ["scope2"],
    "GHG Emissions - Scope 3": ["scope3"],
    "GHG Emissions - Biogenic (Direct)": ["biogenic"],  # Direct biogenic
    "GHG Emissions - Biogenic (Indirect)": ["biogenic"],  # Indirect biogenic (biogenic_scope_selection='scope3')
    "GHG Emissions - Removal/Sinks": ["sinks"],  # Special case: sinks module
}

# Reverse mapping: scope value to subcategory names
SCOPE_TO_SUBCATEGORIES = {
    "scope1": ["GHG Emissions - Scope 1"],
    "scope2": ["GHG Emissions - Scope 2"],
    "scope3": ["GHG Emissions - Scope 3"],
    "biogenic": ["GHG Emissions - Biogenic (Direct)", "GHG Emissions - Biogenic (Indirect)"],
    "sinks": ["GHG Emissions - Removal/Sinks"],
}

# Category name for GHG Emissions
GHG_CATEGORY = "GHG Emissions"


class KPIAccessHelper:
    """
    Centralized helper for KPI assignment-based access control.
    
    Key principles:
    - Admins always have full access (bypass all restrictions)
    - If no assignments exist for a category, all users can access (default open)
    - If assignments exist, only assigned users can access their assigned scope
    - Facility-level assignments restrict to that facility only
    - Organization-level assignments allow access to all facilities
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._users = db["users"]
        self._facilities = db["facilities"]
    
    async def is_admin(self, user_id: str, organization_id: str) -> bool:
        """Check if user is an admin for the organization"""
        user = await self._users.find_one(
            {"id": user_id, "organization_id": organization_id},
            {"role": 1}
        )
        return user and user.get("role") in ["admin", "super_admin", "org_admin"]
    
    async def get_user_assignments_for_category(
        self,
        user_id: str,
        organization_id: str,
        category: str,
        reporting_period: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get all assignments for a user in a specific category.
        
        Supports both old model (assigned_to_user_id on assignment) and 
        new model (separate esg_assignment_assignees table).
        
        Returns list of assignment documents.
        """
        # New model: check esg_assignment_assignees first
        assignee_records = await db["esg_assignment_assignees"].find(
            {"user_id": user_id, "removed_at": None},
            {"_id": 0, "assignment_id": 1}
        ).to_list(500)
        
        assignment_ids_from_new = [a["assignment_id"] for a in assignee_records]
        
        # Build query for assignments
        query = {
            "organization_id": organization_id,
            "category": category,
            "entity_type": "record_category",
        }
        
        if reporting_period:
            query["reporting_period"] = reporting_period
        
        # Find assignments where user is in assignees table OR has old assigned_to_user_id
        if assignment_ids_from_new:
            query["$or"] = [
                {"id": {"$in": assignment_ids_from_new}},
                {"assigned_to_user_id": user_id},  # Legacy support
            ]
        else:
            query["assigned_to_user_id"] = user_id  # Legacy only
        
        cursor = self._assignments.find(query, {"_id": 0})
        return await cursor.to_list(100)
    
    async def get_allowed_ghg_scopes(
        self,
        user_id: str,
        organization_id: str,
        reporting_period: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get the GHG emission scopes a user is allowed to access.
        
        Returns:
            {
                "has_full_access": bool,  # True if admin or no assignments exist
                "allowed_scopes": ["scope1", "scope2", ...],  # List of allowed scope values
                "allowed_subcategories": ["GHG Emissions - Scope 1", ...],  # Original subcategory names
                "facility_restrictions": {
                    "scope1": ["facility_id_1", ...] or None,  # None means all facilities
                    ...
                },
                "has_sinks_access": bool,  # Special flag for sinks module access
            }
        """
        # Admins always have full access
        if await self.is_admin(user_id, organization_id):
            return {
                "has_full_access": True,
                "allowed_scopes": ["scope1", "scope2", "scope3", "biogenic"],
                "allowed_subcategories": list(GHG_SUBCATEGORY_TO_SCOPE.keys()),
                "facility_restrictions": {},
                "has_sinks_access": True,
            }
        
        # Get user's GHG assignments
        assignments = await self.get_user_assignments_for_category(
            user_id=user_id,
            organization_id=organization_id,
            category=GHG_CATEGORY,
            reporting_period=reporting_period,
        )
        
        # If no assignments exist for GHG, check if ANY assignments exist
        if not assignments:
            any_ghg_assignments = await self._assignments.count_documents({
                "organization_id": organization_id,
                "category": GHG_CATEGORY,
                "entity_type": "record_category",
                **({"reporting_period": reporting_period} if reporting_period else {}),
            })
            
            if any_ghg_assignments == 0:
                # No GHG assignments at all - full access (default open)
                return {
                    "has_full_access": True,
                    "allowed_scopes": ["scope1", "scope2", "scope3", "biogenic"],
                    "allowed_subcategories": list(GHG_SUBCATEGORY_TO_SCOPE.keys()),
                    "facility_restrictions": {},
                    "has_sinks_access": True,
                }
            else:
                # GHG assignments exist but not for this user - no access
                return {
                    "has_full_access": False,
                    "allowed_scopes": [],
                    "allowed_subcategories": [],
                    "facility_restrictions": {},
                    "has_sinks_access": False,
                }
        
        # Process assignments to determine allowed scopes
        allowed_scopes = set()
        allowed_subcategories = set()
        facility_restrictions = {}
        has_sinks_access = False
        
        for assignment in assignments:
            subcategory = assignment.get("subcategory")
            facility_id = assignment.get("facility_id")
            assignment_level = assignment.get("assignment_level", "organization")
            
            if not subcategory:
                # Category-level assignment (no subcategory) = full GHG access
                allowed_scopes.update(["scope1", "scope2", "scope3", "biogenic"])
                allowed_subcategories.update(GHG_SUBCATEGORY_TO_SCOPE.keys())
                has_sinks_access = True
                # Clear facility restrictions for these scopes (org-level)
                for scope in ["scope1", "scope2", "scope3", "biogenic", "sinks"]:
                    facility_restrictions[scope] = None
                continue
            
            # Map subcategory to scope(s)
            scopes = GHG_SUBCATEGORY_TO_SCOPE.get(subcategory, [])
            for scope in scopes:
                allowed_scopes.add(scope)
                allowed_subcategories.add(subcategory)
                
                if scope == "sinks":
                    has_sinks_access = True
                
                # Track facility restrictions
                if assignment_level == "facility" and facility_id:
                    if scope not in facility_restrictions:
                        facility_restrictions[scope] = []
                    if facility_restrictions[scope] is not None:
                        facility_restrictions[scope].append(facility_id)
                else:
                    # Organization-level = all facilities
                    facility_restrictions[scope] = None
        
        return {
            "has_full_access": False,
            "allowed_scopes": list(allowed_scopes),
            "allowed_subcategories": list(allowed_subcategories),
            "facility_restrictions": facility_restrictions,
            "has_sinks_access": has_sinks_access,
        }
    
    async def get_allowed_facilities(
        self,
        user_id: str,
        organization_id: str,
        category: str,
        subcategory: Optional[str] = None,
        reporting_period: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get the facilities a user can access for a specific category/subcategory.
        
        Supports both old model (assigned_to_user_id) and new model (esg_assignment_assignees).
        
        Returns:
            {
                "has_full_access": bool,  # True if can access all facilities
                "allowed_facility_ids": ["id1", "id2", ...] or None,  # None means all
                "assignment_level": "organization" | "facility" | None,
            }
        """
        # Admins always have full access
        if await self.is_admin(user_id, organization_id):
            return {
                "has_full_access": True,
                "allowed_facility_ids": None,
                "assignment_level": None,
            }
        
        # New model: get assignment IDs from assignees table
        assignee_records = await db["esg_assignment_assignees"].find(
            {"user_id": user_id, "removed_at": None},
            {"_id": 0, "assignment_id": 1}
        ).to_list(500)
        assignment_ids_from_new = [a["assignment_id"] for a in assignee_records]
        
        # Build base query for assignments
        base_query = {
            "organization_id": organization_id,
            "category": category,
            "entity_type": "record_category",
        }
        
        if reporting_period:
            base_query["reporting_period"] = reporting_period
        
        # Query for user's assignments (new model OR legacy)
        user_query = {**base_query}
        if assignment_ids_from_new:
            user_query["$or"] = [
                {"id": {"$in": assignment_ids_from_new}},
                {"assigned_to_user_id": user_id},
            ]
        else:
            user_query["assigned_to_user_id"] = user_id
        
        if subcategory:
            user_query["$and"] = user_query.get("$and", []) + [
                {"$or": [
                    {"subcategory": subcategory},
                    {"subcategory": None},
                    {"subcategory": {"$exists": False}},
                ]}
            ]
        
        cursor = self._assignments.find(user_query, {"_id": 0})
        assignments = await cursor.to_list(100)
        
        if not assignments:
            # Check if ANY assignments exist for this category
            any_assignments = await self._assignments.count_documents({
                "organization_id": organization_id,
                "category": category,
                "entity_type": "record_category",
                **({"reporting_period": reporting_period} if reporting_period else {}),
            })
            
            if any_assignments == 0:
                # No assignments at all - full access
                return {
                    "has_full_access": True,
                    "allowed_facility_ids": None,
                    "assignment_level": None,
                }
            else:
                # Assignments exist but not for this user - no access
                return {
                    "has_full_access": False,
                    "allowed_facility_ids": [],
                    "assignment_level": None,
                }
        
        # Process assignments
        allowed_facilities = set()
        has_org_level = False
        
        for assignment in assignments:
            assignment_level = assignment.get("assignment_level", "organization")
            facility_id = assignment.get("facility_id")
            
            if assignment_level == "organization" or not facility_id:
                # Organization-level = full facility access
                has_org_level = True
                break
            else:
                allowed_facilities.add(facility_id)
        
        if has_org_level:
            return {
                "has_full_access": True,
                "allowed_facility_ids": None,
                "assignment_level": "organization",
            }
        
        return {
            "has_full_access": False,
            "allowed_facility_ids": list(allowed_facilities),
            "assignment_level": "facility",
        }
    
    async def can_access_emission(
        self,
        user_id: str,
        organization_id: str,
        scope: str,
        facility_id: str,
        reporting_period: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """
        Check if user can access a specific emission record.
        
        Returns:
            (can_access: bool, reason: str)
        """
        # Admins always have access
        if await self.is_admin(user_id, organization_id):
            return True, "admin"
        
        # Get allowed scopes
        ghg_access = await self.get_allowed_ghg_scopes(
            user_id=user_id,
            organization_id=organization_id,
            reporting_period=reporting_period,
        )
        
        if ghg_access["has_full_access"]:
            return True, "full_access"
        
        # Check scope access
        if scope not in ghg_access["allowed_scopes"]:
            return False, f"no_access_to_scope_{scope}"
        
        # Check facility access
        facility_restrictions = ghg_access["facility_restrictions"].get(scope)
        if facility_restrictions is not None:
            if facility_id not in facility_restrictions:
                return False, f"no_access_to_facility_{facility_id}"
        
        return True, "assignment"
    
    async def can_access_sinks(
        self,
        user_id: str,
        organization_id: str,
        facility_id: str,
        reporting_period: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """
        Check if user can access sinks/removal records.
        
        Returns:
            (can_access: bool, reason: str)
        """
        # Admins always have access
        if await self.is_admin(user_id, organization_id):
            return True, "admin"
        
        # Get GHG access which includes sinks
        ghg_access = await self.get_allowed_ghg_scopes(
            user_id=user_id,
            organization_id=organization_id,
            reporting_period=reporting_period,
        )
        
        if ghg_access["has_full_access"]:
            return True, "full_access"
        
        if not ghg_access["has_sinks_access"]:
            return False, "no_sinks_access"
        
        # Check facility access for sinks
        facility_restrictions = ghg_access["facility_restrictions"].get("sinks")
        if facility_restrictions is not None:
            if facility_id not in facility_restrictions:
                return False, f"no_access_to_facility_{facility_id}"
        
        return True, "assignment"
    
    async def filter_emissions_by_access(
        self,
        user_id: str,
        organization_id: str,
        records: List[Dict[str, Any]],
        reporting_period: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Filter a list of emission records based on user's access.
        
        This is a convenience method for filtering query results.
        """
        # Admins see everything
        if await self.is_admin(user_id, organization_id):
            return records
        
        # Get access info
        ghg_access = await self.get_allowed_ghg_scopes(
            user_id=user_id,
            organization_id=organization_id,
            reporting_period=reporting_period,
        )
        
        if ghg_access["has_full_access"]:
            return records
        
        allowed_scopes = set(ghg_access["allowed_scopes"])
        facility_restrictions = ghg_access["facility_restrictions"]
        
        filtered = []
        for record in records:
            scope = record.get("scope", "").lower()
            facility_id = record.get("facility_id")
            
            # Check scope access
            if scope not in allowed_scopes:
                continue
            
            # Check facility access
            scope_facilities = facility_restrictions.get(scope)
            if scope_facilities is not None and facility_id not in scope_facilities:
                continue
            
            filtered.append(record)
        
        return filtered
    
    async def filter_sinks_by_access(
        self,
        user_id: str,
        organization_id: str,
        records: List[Dict[str, Any]],
        reporting_period: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Filter a list of sink records based on user's access.
        """
        # Admins see everything
        if await self.is_admin(user_id, organization_id):
            return records
        
        # Get access info
        ghg_access = await self.get_allowed_ghg_scopes(
            user_id=user_id,
            organization_id=organization_id,
            reporting_period=reporting_period,
        )
        
        if ghg_access["has_full_access"]:
            return records
        
        if not ghg_access["has_sinks_access"]:
            return []
        
        # Check facility access
        facility_restrictions = ghg_access["facility_restrictions"].get("sinks")
        if facility_restrictions is None:
            return records
        
        return [r for r in records if r.get("facility_id") in facility_restrictions]
    
    async def get_accessible_facilities_list(
        self,
        user_id: str,
        organization_id: str,
        category: str,
        subcategory: Optional[str] = None,
        reporting_period: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get the actual facility documents a user can access.
        
        Returns list of facility documents with id, name, etc.
        """
        access_info = await self.get_allowed_facilities(
            user_id=user_id,
            organization_id=organization_id,
            category=category,
            subcategory=subcategory,
            reporting_period=reporting_period,
        )
        
        if access_info["has_full_access"] or access_info["allowed_facility_ids"] is None:
            # Return all facilities for this org
            cursor = self._facilities.find(
                {"organization_id": organization_id},
                {"_id": 0, "id": 1, "name": 1, "facility_type": 1}
            )
            return await cursor.to_list(500)
        
        if not access_info["allowed_facility_ids"]:
            return []
        
        # Return only allowed facilities
        cursor = self._facilities.find(
            {
                "organization_id": organization_id,
                "id": {"$in": access_info["allowed_facility_ids"]}
            },
            {"_id": 0, "id": 1, "name": 1, "facility_type": 1}
        )
        return await cursor.to_list(500)


# Singleton instance
kpi_access_helper = KPIAccessHelper()
