"""
Unified Completion Service - Single Source of Truth

This service is the ONLY authority for determining:
- Whether a period has data (is complete)
- Task status (computed, not stored)
- Assignment progress (filled/total/percentage)

All other modules (progress_engine, task_engine, My Tasks, Dashboard)
MUST use this service. No one else decides completion.

Architecture:
    Raw ESG Data → CompletionService → All Consumers
                                      ├── Task List
                                      ├── Progress %
                                      ├── Dashboard
                                      ├── My Tasks
                                      └── Assignment Details
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from enum import Enum
import logging

from shared.database.mongo import db

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    COMPLETED = "completed"
    PENDING = "pending"
    OVERDUE = "overdue"
    BACKFILL_PENDING = "backfill_pending"
    REJECTED = "rejected"  # Data submitted but rejected, needs changes
    PENDING_APPROVAL = "pending_approval"  # Data submitted, awaiting approval


class PeriodStatus:
    """Status for a single period."""
    def __init__(
        self,
        period_key: str,
        has_data: bool,
        facility_breakdown: Optional[List[Dict]] = None,
        last_updated: Optional[datetime] = None,
    ):
        self.period_key = period_key
        self.has_data = has_data
        self.facility_breakdown = facility_breakdown or []
        self.last_updated = last_updated
    
    def to_dict(self) -> Dict:
        return {
            "period_key": self.period_key,
            "has_data": self.has_data,
            "facility_breakdown": self.facility_breakdown,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }


class ProgressResult:
    """Progress calculation result."""
    def __init__(self):
        self.total = 0
        self.completed = 0
        self.pending = 0
        self.overdue = 0
        self.last_updated: Optional[datetime] = None
        self.period_details: List[Dict] = []
    
    @property
    def percentage(self) -> float:
        if self.total == 0:
            return 0.0
        return round((self.completed / self.total) * 100, 1)
    
    def to_dict(self) -> Dict:
        last_updated_str = None
        if self.last_updated:
            if isinstance(self.last_updated, datetime):
                last_updated_str = self.last_updated.isoformat()
            else:
                last_updated_str = str(self.last_updated)
        
        return {
            "total": self.total,
            "filled": self.completed,
            "completed": self.completed,
            "pending": self.pending,
            "overdue": self.overdue,
            "percentage": self.percentage,
            "last_updated": last_updated_str,
            "period_details": self.period_details,
        }
    
    @classmethod
    def empty(cls) -> "ProgressResult":
        return cls()


# =============================================================================
# DATA EXISTENCE CHECKERS
# =============================================================================

class DataChecker:
    """
    Checks if data exists for a given org/category/subcategory/facility/period.
    
    This is the CORE logic - everything else builds on top of this.
    
    Returns: (has_data, last_updated, approval_status)
    - approval_status can be: None, "pending", "approved", "rejected"
    """
    
    @staticmethod
    async def check_exists(
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check if data exists for the given parameters.
        
        Returns: (has_data: bool, last_updated: datetime or None, approval_status: str or None)
        """
        cat_lower = (category or "").lower()
        sub_lower = (subcategory or "").lower()
        
        # Route to appropriate checker based on category
        if "ghg" in cat_lower or "emission" in cat_lower or "scope" in sub_lower:
            return await DataChecker._check_ghg(organization_id, subcategory, facility_id, period_key)
        
        if "water" in cat_lower:
            return await DataChecker._check_environment(organization_id, "Water", subcategory, facility_id, period_key)
        
        if "energy" in cat_lower:
            return await DataChecker._check_environment(organization_id, "Energy", subcategory, facility_id, period_key)
        
        if "waste" in cat_lower:
            return await DataChecker._check_environment(organization_id, "Waste", subcategory, facility_id, period_key)
        
        if any(k in cat_lower for k in ["social", "employee", "worker", "health", "safety", "training"]):
            return await DataChecker._check_social(organization_id, category, subcategory, facility_id, period_key)
        
        if "governance" in cat_lower:
            return await DataChecker._check_governance(organization_id, category, subcategory, facility_id, period_key)
        
        # Default: check environment_records
        return await DataChecker._check_environment(organization_id, category, subcategory, facility_id, period_key)
    
    @staticmethod
    async def _check_ghg(
        organization_id: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check GHG emission_records.
        
        Returns: (has_data, last_updated, approval_status)
        """
        query = {
            "organization_id": organization_id,
            "reporting_period": period_key,
        }
        
        # IMPORTANT: Explicitly filter by facility_id
        # - If facility_id is provided: match that specific facility
        # - If facility_id is None: match records with no facility (org-level entry)
        if facility_id:
            query["facility_id"] = facility_id
        else:
            # Org-level check: only match records without facility_id
            query["$or"] = [
                {"facility_id": None},
                {"facility_id": {"$exists": False}},
            ]
        
        # Map subcategory to scope
        sub_lower = (subcategory or "").lower()
        if "scope 1" in sub_lower or "scope1" in sub_lower:
            query["scope"] = "scope1"
        elif "scope 2" in sub_lower or "scope2" in sub_lower:
            query["scope"] = "scope2"
        elif "scope 3" in sub_lower or "scope3" in sub_lower:
            query["scope"] = "scope3"
        elif "biogenic" in sub_lower:
            query["scope"] = "biogenic"
        
        # Get most recent record with approval_status
        record = await db.emission_records.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1},
            sort=[("updated_at", -1)]
        )
        
        if record:
            last_updated = record.get("updated_at") or record.get("created_at")
            approval_status = record.get("approval_status")
            return True, last_updated, approval_status
        return False, None, None
    
    @staticmethod
    async def _check_environment(
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check environment_records (Water, Energy, Waste, etc.).
        
        Returns: (has_data, last_updated, approval_status)
        """
        query = {
            "$or": [
                {"organization_id": organization_id},
                {"org_id": organization_id},
            ],
        }
        
        if facility_id:
            query["facility_id"] = facility_id
        
        if category:
            query["category"] = {"$regex": f"^{category}$", "$options": "i"}
        
        if subcategory:
            query["subcategory"] = {"$regex": f"^{subcategory}$", "$options": "i"}
        
        # Parse period_key (YYYY-MM or YYYY-QX or YYYY)
        try:
            if "-Q" in period_key:
                # Quarterly: 2026-Q1
                year = int(period_key.split("-Q")[0])
                quarter = int(period_key.split("-Q")[1])
                start_month = (quarter - 1) * 3 + 1
                end_month = start_month + 2
                query["$or"] = [
                    {"reporting_period.year": year, "reporting_period.month": {"$in": [start_month, start_month + 1, end_month]}},
                    {"reporting_period.year": year, "reporting_period.month": {"$in": [str(start_month), str(start_month + 1), str(end_month)]}},
                ]
            elif "-" in period_key and len(period_key) == 7:
                # Monthly: 2026-07
                year, month = period_key.split("-")
                month_int = int(month)
                query["reporting_period.year"] = int(year)
                # Handle all month formats: integer (7), string with leading zero ("07"), string without ("7")
                query["reporting_period.month"] = {"$in": [month_int, month, str(month_int)]}
            else:
                # Yearly: 2026
                query["reporting_period.year"] = int(period_key[:4])
        except (ValueError, IndexError):
            pass
        
        record = await db.environment_records.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1},
            sort=[("updated_at", -1)]
        )
        
        if record:
            last_updated = record.get("updated_at") or record.get("created_at")
            approval_status = record.get("approval_status")
            return True, last_updated, approval_status
        return False, None, None
    
    @staticmethod
    async def _check_social(
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check social_records.
        
        Returns: (has_data, last_updated, approval_status)
        """
        query = {
            "$or": [
                {"organization_id": organization_id},
                {"org_id": organization_id},
            ],
        }
        
        if facility_id:
            query["facility_id"] = facility_id
        
        if category:
            query["category"] = {"$regex": f"^{category}$", "$options": "i"}
        
        if subcategory:
            query["subcategory"] = {"$regex": f"^{subcategory}$", "$options": "i"}
        
        # Parse period
        try:
            if "-" in period_key and len(period_key) == 7:
                year, month = period_key.split("-")
                month_int = int(month)
                query["reporting_period.year"] = int(year)
                # Handle all month formats: integer (7), string with leading zero ("07"), string without ("7")
                query["reporting_period.month"] = {"$in": [month_int, month, str(month_int)]}
            else:
                query["reporting_period.year"] = int(period_key[:4])
        except (ValueError, IndexError):
            pass
        
        record = await db.social_records.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1},
            sort=[("updated_at", -1)]
        )
        
        if record:
            last_updated = record.get("updated_at") or record.get("created_at")
            approval_status = record.get("approval_status")
            return True, last_updated, approval_status
        return False, None, None
    
    @staticmethod
    async def _check_governance(
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check governance_records.
        
        Returns: (has_data, last_updated, approval_status)
        """
        query = {
            "$or": [
                {"organization_id": organization_id},
                {"org_id": organization_id},
            ],
        }
        
        if category:
            query["category"] = {"$regex": f"^{category}$", "$options": "i"}
        
        if subcategory:
            query["subcategory"] = {"$regex": f"^{subcategory}$", "$options": "i"}
        
        record = await db.governance_records.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1},
            sort=[("updated_at", -1)]
        )
        
        if record:
            last_updated = record.get("updated_at") or record.get("created_at")
            approval_status = record.get("approval_status")
            return True, last_updated, approval_status
        return False, None, None


# =============================================================================
# PERIOD GENERATOR
# =============================================================================

class PeriodGenerator:
    """Generates periods from assignment date range and frequency."""
    
    @staticmethod
    def generate(
        start_date,
        end_date,
        frequency: str,
    ) -> List[Dict[str, Any]]:
        """
        Generate period definitions from date range.
        
        Returns list of: {period_key, period_start, period_end, due_date}
        """
        from datetime import timedelta
        import calendar
        
        def parse_date(d):
            if not d:
                return None
            if isinstance(d, datetime):
                return d
            if isinstance(d, str):
                try:
                    return datetime.fromisoformat(d.replace('Z', '+00:00')).replace(tzinfo=None)
                except (ValueError, TypeError):
                    try:
                        return datetime.strptime(d[:10], "%Y-%m-%d")
                    except (ValueError, TypeError):
                        return None
            return None
        
        start = parse_date(start_date)
        end = parse_date(end_date)
        
        if not start:
            return []
        if not end:
            end = datetime(datetime.now().year, 12, 31)
        
        periods = []
        freq_lower = (frequency or "monthly").lower()
        
        if freq_lower == "monthly":
            current = start.replace(day=1)
            while current <= end:
                last_day = calendar.monthrange(current.year, current.month)[1]
                period_end = current.replace(day=last_day)
                
                periods.append({
                    "period_key": current.strftime("%Y-%m"),
                    "period_start": current,
                    "period_end": period_end,
                })
                
                # Next month
                if current.month == 12:
                    current = current.replace(year=current.year + 1, month=1)
                else:
                    current = current.replace(month=current.month + 1)
        
        elif freq_lower == "quarterly":
            current = start.replace(day=1)
            q_month = ((current.month - 1) // 3) * 3 + 1
            current = current.replace(month=q_month)
            
            while current <= end:
                q_end_month = q_month + 2
                last_day = calendar.monthrange(current.year, q_end_month)[1]
                period_end = datetime(current.year, q_end_month, last_day)
                
                quarter_num = ((q_month - 1) // 3) + 1
                periods.append({
                    "period_key": f"{current.year}-Q{quarter_num}",
                    "period_start": current,
                    "period_end": period_end,
                })
                
                # Next quarter
                if q_month == 10:
                    current = datetime(current.year + 1, 1, 1)
                    q_month = 1
                else:
                    q_month += 3
                    current = current.replace(month=q_month)
        
        elif freq_lower == "yearly" or freq_lower == "annually":
            current = datetime(start.year, 1, 1)
            while current <= end:
                period_end = datetime(current.year, 12, 31)
                
                periods.append({
                    "period_key": str(current.year),
                    "period_start": current,
                    "period_end": period_end,
                })
                
                current = datetime(current.year + 1, 1, 1)
        
        elif freq_lower == "daily":
            current = start
            while current <= end:
                periods.append({
                    "period_key": current.strftime("%Y-%m-%d"),
                    "period_start": current,
                    "period_end": current,
                })
                current += timedelta(days=1)
        
        elif freq_lower == "weekly":
            current = start
            while current <= end:
                week_end = min(current + timedelta(days=6), end)
                week_num = current.isocalendar()[1]
                
                periods.append({
                    "period_key": f"{current.year}-W{week_num:02d}",
                    "period_start": current,
                    "period_end": week_end,
                })
                current = week_end + timedelta(days=1)
        
        return periods


# =============================================================================
# COMPLETION SERVICE - MAIN CLASS
# =============================================================================

class CompletionService:
    """
    THE single source of truth for all completion/progress queries.
    
    Usage:
        service = CompletionService()
        
        # Check single period
        has_data = await service.is_period_complete(org_id, category, subcategory, facility_id, period_key)
        
        # Get task status (computed)
        status = await service.get_task_status(task)
        
        # Get assignment progress
        progress = await service.get_assignment_progress(assignment)
    """
    
    async def is_period_complete(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
    ) -> bool:
        """Check if a period is complete (has data)."""
        has_data, _, _ = await DataChecker.check_exists(
            organization_id, category, subcategory, facility_id, period_key
        )
        return has_data
    
    async def get_task_status(
        self,
        task: Dict[str, Any],
        assignment_created_at: Optional[datetime] = None,
    ) -> TaskStatus:
        """
        Compute task status from underlying data and approval status.
        
        This is COMPUTED, not read from task.status field.
        
        Status priority:
        1. If data exists and rejected -> REJECTED
        2. If data exists and pending_approval -> PENDING_APPROVAL
        3. If data exists and approved/no status -> COMPLETED
        4. If no data and backfill -> BACKFILL_PENDING
        5. If no data and overdue -> OVERDUE
        6. If no data -> PENDING
        """
        org_id = task.get("organization_id")
        facility_id = task.get("facility_id")
        category = task.get("category")
        subcategory = task.get("subcategory")
        period_key = task.get("period_key")
        due_at = task.get("due_at")
        period_end = task.get("period_end")
        is_backfill = task.get("is_backfill", False)
        
        # Check if data exists and get approval status
        has_data, _, approval_status = await DataChecker.check_exists(
            org_id, category, subcategory, facility_id, period_key
        )
        
        if has_data:
            # Check approval status
            if approval_status == "rejected":
                return TaskStatus.REJECTED
            elif approval_status == "pending" or approval_status == "pending_approval":
                return TaskStatus.PENDING_APPROVAL
            # approved or no status = completed
            return TaskStatus.COMPLETED
        
        now = datetime.now(timezone.utc)
        
        # Check if backfill
        if is_backfill:
            return TaskStatus.BACKFILL_PENDING
        
        # Check if overdue
        if due_at:
            due_dt = due_at if isinstance(due_at, datetime) else datetime.fromisoformat(str(due_at).replace('Z', '+00:00'))
            if due_dt.tzinfo is None:
                due_dt = due_dt.replace(tzinfo=timezone.utc)
            if due_dt < now:
                return TaskStatus.OVERDUE
        
        return TaskStatus.PENDING
    
    async def get_assignment_progress(
        self,
        assignment: Dict[str, Any],
        include_period_details: bool = False,
    ) -> ProgressResult:
        """
        Calculate progress for an assignment.
        
        Handles both org-level and facility-level assignments.
        
        FACILITY SNAPSHOT: For org-level assignments, uses facility_snapshot if available
        to ensure historical task completion cannot change retroactively when new facilities
        are added to the organization.
        """
        org_id = assignment.get("organization_id")
        category = assignment.get("category")
        subcategory = assignment.get("subcategory")
        facility_id = assignment.get("facility_id")
        assignment_level = assignment.get("assignment_level", "organization")
        frequency = assignment.get("filling_frequency", "monthly")
        due_day = assignment.get("filling_due_day", 15)
        facility_snapshot = assignment.get("facility_snapshot")
        
        # Generate periods
        periods = PeriodGenerator.generate(
            assignment.get("start_date"),
            assignment.get("end_date"),
            frequency,
        )
        
        if not periods:
            return ProgressResult.empty()
        
        # Get facilities for org-level assignment
        facilities = []
        if assignment_level == "organization" or not facility_id:
            # Use facility snapshot if available (ensures historical stability)
            if facility_snapshot and facility_snapshot.get("facility_ids"):
                snapshot_facility_ids = facility_snapshot.get("facility_ids", [])
                facilities = await db.facilities.find(
                    {"id": {"$in": snapshot_facility_ids}},
                    {"_id": 0, "id": 1, "name": 1}
                ).to_list(500)
            else:
                # Fallback: query current facilities (for legacy assignments without snapshot)
                facilities = await db.facilities.find(
                    {"organization_id": org_id, "is_deleted": {"$ne": True}},
                    {"_id": 0, "id": 1, "name": 1}
                ).to_list(500)
        else:
            # Facility-level: just one facility
            fac = await db.facilities.find_one({"id": facility_id}, {"_id": 0, "id": 1, "name": 1})
            if fac:
                facilities = [fac]
        
        if facility_id:
            # Facility-level assignment
            return await self._calculate_facility_level(
                org_id, category, subcategory, facility_id, periods, due_day, include_period_details
            )
        else:
            # Org-level assignment
            return await self._calculate_org_level(
                org_id, category, subcategory, facilities, periods, due_day, include_period_details
            )
    
    async def _calculate_facility_level(
        self,
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: str,
        periods: List[Dict],
        due_day: int,
        include_details: bool,
    ) -> ProgressResult:
        """Calculate progress for facility-level assignment."""
        result = ProgressResult()
        now = datetime.now(timezone.utc)
        
        for period in periods:
            period_key = period["period_key"]
            has_data, last_updated, _ = await DataChecker.check_exists(
                org_id, category, subcategory, facility_id, period_key
            )
            
            result.total += 1
            
            if has_data:
                result.completed += 1
                if last_updated and (not result.last_updated or last_updated > result.last_updated):
                    result.last_updated = last_updated
            else:
                # Check if overdue
                period_end = period.get("period_end")
                if period_end:
                    due_date = period_end.replace(day=min(due_day, 28))
                    if due_date.replace(tzinfo=timezone.utc) < now:
                        result.overdue += 1
                    else:
                        result.pending += 1
                else:
                    result.pending += 1
            
            if include_details:
                result.period_details.append({
                    "period_key": period_key,
                    "has_data": has_data,
                    "facility_breakdown": [{
                        "facility_id": facility_id,
                        "has_data": has_data,
                    }]
                })
        
        return result
    
    async def _calculate_org_level(
        self,
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facilities: List[Dict],
        periods: List[Dict],
        due_day: int,
        include_details: bool,
    ) -> ProgressResult:
        """
        Calculate progress for org-level assignment.
        
        Logic:
        - Check if any facility-level data exists anywhere
        - If yes: expand to require ALL facilities for each period
        - If no: count as 1 task per period (org-level entry expected)
        """
        result = ProgressResult()
        now = datetime.now(timezone.utc)
        
        if not facilities:
            # No facilities - return empty but valid result
            result.total = len(periods)
            result.pending = len(periods)
            return result
        
        # First pass: check if ANY facility-level records exist
        has_any_facility_records = False
        for facility in facilities:
            for period in periods:
                has_data, _, _ = await DataChecker.check_exists(
                    org_id, category, subcategory, facility.get("id"), period["period_key"]
                )
                if has_data:
                    has_any_facility_records = True
                    break
            if has_any_facility_records:
                break
        
        # Second pass: calculate progress
        for period in periods:
            period_key = period["period_key"]
            period_end = period.get("period_end")
            
            # Check org-level record first (facility_id=None)
            has_org_record, org_last_updated, _ = await DataChecker.check_exists(
                org_id, category, subcategory, None, period_key
            )
            
            facility_breakdown = []
            
            if has_org_record:
                # Org-level record exists - count as 1 completed
                result.total += 1
                result.completed += 1
                if org_last_updated and (not result.last_updated or org_last_updated > result.last_updated):
                    result.last_updated = org_last_updated
                
                if include_details:
                    facility_breakdown = [{"facility_id": None, "facility_name": "Organization Level", "has_data": True}]
            
            elif has_any_facility_records:
                # No org record, but facility-level reporting is used
                # Expand to require ALL facilities
                num_facilities = len(facilities)
                result.total += num_facilities
                
                facilities_completed = 0
                period_last_updated = None
                
                for facility in facilities:
                    fac_id = facility.get("id")
                    fac_name = facility.get("name", "Unknown")
                    
                    has_fac_data, fac_last_updated, _ = await DataChecker.check_exists(
                        org_id, category, subcategory, fac_id, period_key
                    )
                    
                    if has_fac_data:
                        facilities_completed += 1
                        if fac_last_updated and (not period_last_updated or fac_last_updated > period_last_updated):
                            period_last_updated = fac_last_updated
                    
                    if include_details:
                        facility_breakdown.append({
                            "facility_id": fac_id,
                            "facility_name": fac_name,
                            "has_data": has_fac_data,
                        })
                
                result.completed += facilities_completed
                remaining = num_facilities - facilities_completed
                
                # Check if overdue
                if period_end:
                    due_date = period_end.replace(day=min(due_day, 28))
                    if due_date.replace(tzinfo=timezone.utc) < now:
                        result.overdue += remaining
                    else:
                        result.pending += remaining
                else:
                    result.pending += remaining
                
                if period_last_updated and (not result.last_updated or period_last_updated > result.last_updated):
                    result.last_updated = period_last_updated
            
            else:
                # No data at all - just 1 pending org-level task
                result.total += 1
                
                if period_end:
                    due_date = period_end.replace(day=min(due_day, 28))
                    if due_date.replace(tzinfo=timezone.utc) < now:
                        result.overdue += 1
                    else:
                        result.pending += 1
                else:
                    result.pending += 1
            
            if include_details:
                result.period_details.append({
                    "period_key": period_key,
                    "has_data": has_org_record or (has_any_facility_records and facilities_completed > 0),
                    "facility_breakdown": facility_breakdown,
                })
        
        return result
    
    async def get_user_tasks_with_status(
        self,
        user_id: str,
        organization_id: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get tasks assigned to user with COMPUTED status.
        
        This replaces reading task.status from DB.
        """
        # Find task assignees for user
        assignee_query = {"user_id": user_id, "is_active": True}
        assignees = await db.esg_task_assignees.find(
            assignee_query,
            {"_id": 0, "task_id": 1}
        ).to_list(1000)
        
        task_ids = [a["task_id"] for a in assignees]
        
        if not task_ids:
            return []
        
        # Get tasks
        task_query = {"id": {"$in": task_ids}}
        if organization_id:
            task_query["organization_id"] = organization_id
        
        tasks = await db.esg_reporting_tasks.find(
            task_query,
            {"_id": 0}
        ).to_list(1000)
        
        # Compute status for each task
        result = []
        for task in tasks:
            computed_status = await self.get_task_status(task)
            
            # Apply filter if specified
            if status_filter and computed_status.value != status_filter:
                continue
            
            task["computed_status"] = computed_status.value
            result.append(task)
        
        return result


# Singleton instance
completion_service = CompletionService()
