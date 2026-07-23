"""
Detailed Progress Service

Provides period-by-period breakdown of assignment progress,
including facility-level status for each reporting period.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from shared.database.mongo import db


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
        
        # Get assignment details from first assignment (they share common properties)
        assignment = assignments[0]
        is_facility_level = assignment.get("assignment_level") == "facility"
        frequency = assignment.get("filling_frequency", "monthly")
        start_date = assignment.get("start_date")
        end_date = assignment.get("end_date")
        
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
        
        # Determine which collection to query
        collection_name = self._get_collection_name(category, subcategory)
        
        # Get all records for this category/subcategory
        records = await self._get_records(
            org_id, category, subcategory, collection_name, facilities
        )
        
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
                    has_data = self._check_record_exists(
                        records, period, fac["id"], collection_name
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
                has_data = self._check_record_exists(
                    records, period, None, collection_name
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
            "assignment_level": assignment.get("assignment_level", "organization"),
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
                label = f"FY {current.year}-{str(current.year + 1)[-2:]}"
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
                "period_string": f"{current.year}-{current.month:02d}",
            })
            
            current = next_period
            
            # Safety limit
            if len(periods) > 365:
                break
        
        return periods
    
    def _get_collection_name(self, category: str, subcategory: str) -> str:
        """Determine which collection stores records for this category."""
        cat_lower = (category or "").lower()
        sub_lower = (subcategory or "").lower()
        
        # Emission records
        if "ghg" in cat_lower or "emission" in cat_lower or "scope" in sub_lower:
            return "emission_records"
        
        # Social records
        if any(k in cat_lower or k in sub_lower for k in ["social", "employee", "worker", "health", "safety", "complaint", "training"]):
            return "social_records"
        
        # Governance records
        if any(k in cat_lower or k in sub_lower for k in ["governance", "board", "ethic", "compliance", "corruption", "financial"]):
            return "governance_records"
        
        # Default to environment
        return "environment_records"
    
    async def _get_records(
        self,
        org_id: str,
        category: str,
        subcategory: str,
        collection_name: str,
        facilities: List[Dict]
    ) -> List[Dict]:
        """Get all relevant records for the category/subcategory."""
        
        if collection_name == "emission_records":
            # emission_records has facility_id but no org_id
            facility_ids = [f["id"] for f in facilities] if facilities else []
            if not facility_ids:
                # Get all facilities for this org
                fac_docs = await self._db["facilities"].find(
                    {"organization_id": org_id}, {"_id": 0, "id": 1}
                ).to_list(500)
                facility_ids = [f["id"] for f in fac_docs]
            
            query = {"facility_id": {"$in": facility_ids}}
            
            # Map category to scope for emission_records
            if "scope 1" in subcategory.lower():
                query["scope"] = "scope1"
            elif "scope 2" in subcategory.lower():
                query["scope"] = "scope2"
            elif "scope 3" in subcategory.lower():
                query["scope"] = "scope3"
        else:
            # Standard records have org_id
            query = {
                "$or": [
                    {"org_id": org_id},
                    {"organization_id": org_id},
                ],
                "category": {"$regex": f"^{category}$", "$options": "i"},
            }
            if subcategory:
                query["subcategory"] = {"$regex": f"^{subcategory}$", "$options": "i"}
        
        records = await self._db[collection_name].find(
            query,
            {"_id": 0, "facility_id": 1, "reporting_period": 1, "created_at": 1, "updated_at": 1}
        ).to_list(5000)
        
        return records
    
    def _check_record_exists(
        self,
        records: List[Dict],
        period: Dict,
        facility_id: Optional[str],
        collection_name: str
    ) -> bool:
        """Check if a record exists for the given period and facility."""
        year = period["year"]
        month = period["month"]
        period_string = period["period_string"]
        
        for record in records:
            # Check facility match
            if facility_id:
                if record.get("facility_id") != facility_id:
                    continue
            else:
                # Org-level: should not have facility_id
                if record.get("facility_id"):
                    continue
            
            # Check period match
            rp = record.get("reporting_period")
            if not rp:
                continue
            
            # Handle string format (emission_records): "2026-07"
            if isinstance(rp, str):
                if rp == period_string:
                    return True
                # Try partial match
                if rp.startswith(f"{year}-{month:02d}") or rp.startswith(f"{year}-{month}"):
                    return True
            
            # Handle dict format (environment_records): {year: 2026, month: "7"}
            elif isinstance(rp, dict):
                rp_year = rp.get("year")
                rp_month = rp.get("month")
                
                if rp_year and rp_month:
                    # Normalize
                    try:
                        rp_year_int = int(rp_year)
                        rp_month_int = int(rp_month) if str(rp_month).isdigit() else self._month_to_int(rp_month)
                        if rp_year_int == year and rp_month_int == month:
                            return True
                    except (ValueError, TypeError):
                        pass
        
        return False
    
    def _month_to_int(self, month_str: str) -> int:
        """Convert month name to integer."""
        months = {
            "january": 1, "february": 2, "march": 3, "april": 4,
            "may": 5, "june": 6, "july": 7, "august": 8,
            "september": 9, "october": 10, "november": 11, "december": 12,
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
            "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
        }
        return months.get(str(month_str).lower(), 0)


# Default service instance
detailed_progress_service = DetailedProgressService()
