"""
Assignment Completion Tracking Service

Tracks completion status for ESG assignments based on data submission.

Completion Logic:
- Facility-level assignments: Completed when at least one record is submitted for the facility
- Organization-level assignments: Completed when ALL facilities have at least one record

This service:
1. Checks completion status for assignments
2. Updates assignment status based on data submission
3. Provides progress information for organization-level assignments
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from shared.database.mongo import db


class CompletionTrackingService:
    """
    Service for tracking and updating assignment completion status.
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._facilities = db["facilities"]
        self._emissions = db["emission_records"]
        self._sinks = db["sinks"]
    
    async def check_and_update_completion(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str] = None,
        facility_id: Optional[str] = None,
        reporting_period: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Check and update completion status for assignments matching the criteria.
        
        Called after a record is submitted to update assignment status.
        
        Returns summary of updates made.
        """
        # Find matching assignments
        query = {
            "organization_id": organization_id,
            "category": category,
            "entity_type": "record_category",
        }
        
        if subcategory:
            query["$or"] = [
                {"subcategory": subcategory},
                {"subcategory": None},
                {"subcategory": {"$exists": False}},
            ]
        
        if reporting_period:
            query["reporting_period"] = reporting_period
        
        cursor = self._assignments.find(query, {"_id": 0})
        assignments = await cursor.to_list(500)
        
        updates = []
        
        for assignment in assignments:
            assignment_id = assignment.get("id")
            assignment_level = assignment.get("assignment_level", "organization")
            assignment_facility_id = assignment.get("facility_id")
            current_status = assignment.get("status", "pending")
            
            # Skip if already completed
            if current_status == "completed":
                continue
            
            # Calculate completion
            if assignment_level == "facility" and assignment_facility_id:
                # Facility-level: check if this specific facility has data
                is_complete = await self._check_facility_has_data(
                    organization_id=organization_id,
                    category=category,
                    subcategory=subcategory,
                    facility_id=assignment_facility_id,
                    reporting_period=reporting_period,
                )
                
                if is_complete:
                    new_status = "completed"
                else:
                    new_status = "in_progress" if facility_id == assignment_facility_id else current_status
            else:
                # Organization-level: check all facilities
                completion_info = await self._check_org_level_completion(
                    organization_id=organization_id,
                    category=category,
                    subcategory=subcategory,
                    reporting_period=reporting_period,
                )
                
                if completion_info["is_complete"]:
                    new_status = "completed"
                elif completion_info["facilities_with_data"] > 0:
                    new_status = "in_progress"
                else:
                    new_status = current_status
            
            # Update if status changed
            if new_status != current_status:
                await self._assignments.update_one(
                    {"id": assignment_id},
                    {
                        "$set": {
                            "status": new_status,
                            "updated_at": datetime.now(timezone.utc),
                        }
                    }
                )
                updates.append({
                    "assignment_id": assignment_id,
                    "old_status": current_status,
                    "new_status": new_status,
                })
        
        return {
            "assignments_checked": len(assignments),
            "updates": updates,
        }
    
    async def get_assignment_progress(
        self,
        assignment_id: str,
    ) -> Dict[str, Any]:
        """
        Get detailed progress information for an assignment.
        
        Returns:
            {
                "assignment_id": str,
                "assignment_level": "organization" | "facility",
                "is_complete": bool,
                "total_facilities": int,
                "facilities_with_data": int,
                "facility_status": [
                    {"facility_id": str, "facility_name": str, "has_data": bool},
                    ...
                ]
            }
        """
        assignment = await self._assignments.find_one(
            {"id": assignment_id},
            {"_id": 0}
        )
        
        if not assignment:
            return {"error": "Assignment not found"}
        
        organization_id = assignment.get("organization_id")
        category = assignment.get("category")
        subcategory = assignment.get("subcategory")
        reporting_period = assignment.get("reporting_period")
        assignment_level = assignment.get("assignment_level", "organization")
        facility_id = assignment.get("facility_id")
        
        if assignment_level == "facility" and facility_id:
            # Facility-level: just check one facility
            has_data = await self._check_facility_has_data(
                organization_id=organization_id,
                category=category,
                subcategory=subcategory,
                facility_id=facility_id,
                reporting_period=reporting_period,
            )
            
            facility = await self._facilities.find_one(
                {"id": facility_id},
                {"_id": 0, "name": 1}
            )
            
            return {
                "assignment_id": assignment_id,
                "assignment_level": "facility",
                "is_complete": has_data,
                "total_facilities": 1,
                "facilities_with_data": 1 if has_data else 0,
                "facility_status": [
                    {
                        "facility_id": facility_id,
                        "facility_name": facility.get("name") if facility else "Unknown",
                        "has_data": has_data,
                    }
                ]
            }
        
        # Organization-level: check all facilities
        return await self._check_org_level_completion(
            organization_id=organization_id,
            category=category,
            subcategory=subcategory,
            reporting_period=reporting_period,
            include_details=True,
            assignment_id=assignment_id,
        )
    
    async def _check_facility_has_data(
        self,
        organization_id: str,
        category: str,
        facility_id: str,
        subcategory: Optional[str] = None,
        reporting_period: Optional[str] = None,
    ) -> bool:
        """
        Check if a specific facility has at least one data record for the category.
        """
        # Build query based on category
        if category == "GHG Emissions":
            return await self._check_ghg_data_exists(
                organization_id=organization_id,
                facility_id=facility_id,
                subcategory=subcategory,
                reporting_period=reporting_period,
            )
        
        # For other categories, check esg_records collection
        query = {
            "organization_id": organization_id,
            "facility_id": facility_id,
        }
        
        if reporting_period:
            # Handle both monthly and yearly formats
            if "-" in reporting_period:
                query["reporting_period"] = reporting_period
            else:
                # Yearly - match any month in that year
                query["reporting_period"] = {"$regex": f"^{reporting_period[:4]}"}
        
        count = await db.esg_records.count_documents(query)
        return count > 0
    
    async def _check_ghg_data_exists(
        self,
        organization_id: str,
        facility_id: str,
        subcategory: Optional[str] = None,
        reporting_period: Optional[str] = None,
    ) -> bool:
        """
        Check if GHG emissions data exists for a facility.
        """
        query = {
            "organization_id": organization_id,
            "facility_id": facility_id,
        }
        
        if reporting_period:
            query["reporting_period"] = reporting_period
        
        # Map subcategory to scope
        if subcategory:
            if "Scope 1" in subcategory:
                query["scope"] = "scope1"
            elif "Scope 2" in subcategory:
                query["scope"] = "scope2"
            elif "Scope 3" in subcategory:
                query["scope"] = "scope3"
            elif "Biogenic" in subcategory:
                query["scope"] = "biogenic"
            elif "Removal" in subcategory or "Sinks" in subcategory:
                # Check sinks collection instead
                sink_query = {
                    "organization_id": organization_id,
                    "facility_id": facility_id,
                }
                if reporting_period:
                    sink_query["reporting_year"] = int(reporting_period[:4])
                count = await self._sinks.count_documents(sink_query)
                return count > 0
        
        count = await self._emissions.count_documents(query)
        return count > 0
    
    async def _check_org_level_completion(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str] = None,
        reporting_period: Optional[str] = None,
        include_details: bool = False,
        assignment_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Check completion status for organization-level assignment.
        
        Organization-level is complete when ALL facilities have data.
        """
        # Get all facilities for this organization
        cursor = self._facilities.find(
            {"organization_id": organization_id},
            {"_id": 0, "id": 1, "name": 1}
        )
        facilities = await cursor.to_list(500)
        
        if not facilities:
            return {
                "assignment_id": assignment_id,
                "assignment_level": "organization",
                "is_complete": True,  # No facilities = vacuously complete
                "total_facilities": 0,
                "facilities_with_data": 0,
                "facility_status": [] if include_details else None,
            }
        
        facilities_with_data = 0
        facility_status = []
        
        for facility in facilities:
            fac_id = facility.get("id")
            fac_name = facility.get("name", "Unknown")
            
            has_data = await self._check_facility_has_data(
                organization_id=organization_id,
                category=category,
                subcategory=subcategory,
                facility_id=fac_id,
                reporting_period=reporting_period,
            )
            
            if has_data:
                facilities_with_data += 1
            
            if include_details:
                facility_status.append({
                    "facility_id": fac_id,
                    "facility_name": fac_name,
                    "has_data": has_data,
                })
        
        total = len(facilities)
        is_complete = facilities_with_data == total and total > 0
        
        result = {
            "assignment_id": assignment_id,
            "assignment_level": "organization",
            "is_complete": is_complete,
            "total_facilities": total,
            "facilities_with_data": facilities_with_data,
        }
        
        if include_details:
            result["facility_status"] = facility_status
        
        return result
    
    async def on_record_submitted(
        self,
        organization_id: str,
        category: str,
        facility_id: str,
        subcategory: Optional[str] = None,
        reporting_period: Optional[str] = None,
    ):
        """
        Hook to be called when a record is submitted.
        
        Automatically checks and updates relevant assignment completion status.
        """
        await self.check_and_update_completion(
            organization_id=organization_id,
            category=category,
            subcategory=subcategory,
            facility_id=facility_id,
            reporting_period=reporting_period,
        )


# Singleton instance
completion_tracking_service = CompletionTrackingService()
