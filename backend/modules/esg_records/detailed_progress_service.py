"""
Detailed Progress Service

Provides period-by-period breakdown of assignment progress,
including facility-level status for each reporting period.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from shared.database.mongo import db
from modules.esg_assignments.completion_service import DataChecker
from shared.utils.period_keys import period_key_for_frequency


class DetailedProgressService:
    """Service for getting detailed period-by-period progress."""
    
    def __init__(self, database=None):
        self._db = database or db
    
    async def get_subcategory_detail(
        self,
        org_id: str,
        category: str,
        subcategory: str,
    ) -> Dict[str, Any]:
        """
        Get detailed progress for a subcategory showing:
        - Assignment info (level, frequency, dates)
        - List of periods with their status
        - For facility-level: per-facility status for each period
        - Unassigned facilities are shown with "unassigned" status
        """
        
        # Get ALL assignments for this subcategory (there can be multiple for facility-level)
        assignments_cursor = self._db["esg_assignments"].find({
            "organization_id": org_id,
            "category": category,
            "subcategory": subcategory,
        }, {"_id": 0})
        assignments = await assignments_cursor.to_list(500)
        
        if not assignments:
            return {
                "category": category,
                "subcategory": subcategory,
                "has_assignment": False,
                "periods": [],
                "facilities": [],
            }
        
        # Check if ANY assignment is facility-level (not just the first one)
        is_facility_level = any(a.get("assignment_level") == "facility" for a in assignments)
        
        # Get common properties from facility-level assignment if exists, otherwise first assignment
        facility_assignment = next((a for a in assignments if a.get("assignment_level") == "facility"), None)
        reference_assignment = facility_assignment or assignments[0]
        frequency = reference_assignment.get("filling_frequency", "monthly")
        start_date = reference_assignment.get("start_date")
        end_date = reference_assignment.get("end_date")
        
        # Collect assigned facility IDs from all assignments
        assigned_facility_ids = set()
        for asn in assignments:
            if asn.get("facility_id"):
                assigned_facility_ids.add(asn["facility_id"])
            if asn.get("facility_ids"):
                assigned_facility_ids.update(asn["facility_ids"])
        
        # Generate periods based on frequency and date range
        periods = self._generate_periods(start_date, end_date, frequency)
        
        # Get ALL facilities for the org (we'll mark which are assigned)
        all_facilities = []
        assigned_facilities = []
        unassigned_facilities = []
        
        if is_facility_level:
            facility_docs = await self._db["facilities"].find(
                {"organization_id": org_id},
                {"_id": 0, "id": 1, "name": 1}
            ).to_list(500)
            all_facilities = facility_docs
            
            # Separate assigned vs unassigned
            for fac in all_facilities:
                if fac["id"] in assigned_facility_ids:
                    assigned_facilities.append({**fac, "is_assigned": True})
                else:
                    unassigned_facilities.append({**fac, "is_assigned": False})
        
        # For progress calculation, only use assigned facilities
        facilities = assigned_facilities
        
        # Build period status matrix
        period_statuses = []
        now = datetime.now(timezone.utc)
        
        for period in periods:
            period_info = {
                "label": period["label"],
                "start": period["start"],
                "end": period["end"],
                "is_overdue": period["due_date"] < now if period.get("due_date") else False,
            }
            
            if is_facility_level:
                # For each ASSIGNED facility, check if data exists for this period
                facility_statuses = []
                for fac in facilities:  # facilities = assigned_facilities only
                    has_data, _, _ = await DataChecker.check_exists(
                        org_id, category, subcategory, fac["id"], period["key"]
                    )
                    facility_statuses.append({
                        "facility_id": fac["id"],
                        "facility_name": fac["name"],
                        "status": "completed" if has_data else ("overdue" if period_info["is_overdue"] else "pending"),
                        "has_data": has_data,
                        "is_assigned": True,
                    })
                
                # Add UNASSIGNED facilities with "unassigned" status
                for fac in unassigned_facilities:
                    facility_statuses.append({
                        "facility_id": fac["id"],
                        "facility_name": fac["name"],
                        "status": "unassigned",
                        "has_data": False,
                        "is_assigned": False,
                    })
                
                period_info["facility_statuses"] = facility_statuses
                
                # Aggregate status for the period (only count assigned facilities)
                assigned_statuses = [fs for fs in facility_statuses if fs["is_assigned"]]
                completed = sum(1 for fs in assigned_statuses if fs["has_data"])
                period_info["completed_count"] = completed
                period_info["total_count"] = len(assigned_statuses)  # Only count assigned
                period_info["unassigned_count"] = len(unassigned_facilities)
                period_info["status"] = (
                    "completed" if len(assigned_statuses) > 0 and completed == len(assigned_statuses) else
                    "partial" if completed > 0 else
                    "overdue" if period_info["is_overdue"] and len(assigned_statuses) > 0 else 
                    "pending" if len(assigned_statuses) > 0 else
                    "no_assignments"
                )
            else:
                # Org-level: check if org record exists
                has_data, _, _ = await DataChecker.check_exists(
                    org_id, category, subcategory, None, period["key"]
                )
                period_info["status"] = (
                    "completed" if has_data else
                    "overdue" if period_info["is_overdue"] else "pending"
                )
                period_info["has_data"] = has_data
            
            period_statuses.append(period_info)
        
        return {
            "category": category,
            "subcategory": subcategory,
            "has_assignment": True,
            "assignment_level": reference_assignment.get("assignment_level", "organization"),
            "frequency": frequency,
            "start_date": start_date,
            "end_date": end_date,
            "periods": period_statuses,
            "facilities": [{"id": f["id"], "name": f["name"], "is_assigned": True} for f in facilities],
            "unassigned_facilities": [{"id": f["id"], "name": f["name"], "is_assigned": False} for f in unassigned_facilities],
            "summary": {
                "total_periods": len(period_statuses),
                "completed": sum(1 for p in period_statuses if p["status"] == "completed"),
                "partial": sum(1 for p in period_statuses if p.get("status") == "partial"),
                "overdue": sum(1 for p in period_statuses if p["status"] == "overdue"),
                "pending": sum(1 for p in period_statuses if p["status"] == "pending"),
                "assigned_facilities": len(facilities),
                "unassigned_facilities": len(unassigned_facilities),
            }
        }
    
    def _generate_periods(
        self,
        start_date: Optional[str],
        end_date: Optional[str],
        frequency: str
    ) -> List[Dict]:
        """Generate list of periods based on frequency and date range."""
        if not start_date:
            return []
        
        # Parse start date and ensure timezone aware
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if isinstance(start_date, str) else start_date
        if isinstance(start, str):
            start = datetime.fromisoformat(start)
        # Make timezone aware if naive
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        
        # Parse end date
        if end_date:
            end = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if isinstance(end_date, str) else end_date
            if isinstance(end, str):
                end = datetime.fromisoformat(end)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)
        else:
            end = start + relativedelta(months=12)
        
        periods = []
        current = start
        
        while current <= end:
            if frequency == "daily":
                period_end = current
                label = current.strftime("%d %b %Y")
                due_date = current + relativedelta(days=1)
                next_period = current + relativedelta(days=1)
            elif frequency == "weekly":
                period_end = current + relativedelta(days=6)
                label = f"Week of {current.strftime('%d %b')}"
                due_date = period_end + relativedelta(days=7)
                next_period = current + relativedelta(weeks=1)
            elif frequency == "monthly":
                period_end = current + relativedelta(months=1, days=-1)
                label = current.strftime("%b %Y")
                due_date = period_end + relativedelta(days=15)
                next_period = current + relativedelta(months=1)
            elif frequency == "quarterly":
                period_end = current + relativedelta(months=3, days=-1)
                quarter = (current.month - 1) // 3 + 1
                label = f"Q{quarter} {current.year}"
                due_date = period_end + relativedelta(days=15)
                next_period = current + relativedelta(months=3)
            elif frequency == "half_yearly":
                period_end = current + relativedelta(months=6, days=-1)
                half = "H1" if current.month <= 6 else "H2"
                label = f"{half} {current.year}"
                due_date = period_end + relativedelta(days=15)
                next_period = current + relativedelta(months=6)
            elif frequency == "yearly":
                period_end = current + relativedelta(years=1, days=-1)
                label = f"FY {current.year}-{current.year + 1}"
                due_date = period_end + relativedelta(days=30)
                next_period = current + relativedelta(years=1)
            else:
                # Default to monthly
                period_end = current + relativedelta(months=1, days=-1)
                label = current.strftime("%b %Y")
                due_date = period_end + relativedelta(days=15)
                next_period = current + relativedelta(months=1)
            
            periods.append({
                "label": label,
                "start": current.isoformat(),
                "end": period_end.isoformat(),
                "due_date": due_date,
                "year": current.year,
                "month": current.month,
                "key": period_key_for_frequency(current, frequency),
                "period_string": f"{current.year}-{current.month:02d}",
            })
            
            current = next_period
            
            # Safety limit
            if len(periods) > 365:
                break
        
        return periods


# Default service instance
detailed_progress_service = DetailedProgressService()
