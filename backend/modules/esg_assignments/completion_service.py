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
from typing import Dict, Any, List, Optional, Tuple, Set
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
    # Lifecycle statuses for deleted assignments
    CANCELLED = "cancelled"  # Assignment was deleted, task has no data
    ORPHANED = "orphaned"  # Assignment was deleted, but task has data (preserved for audit)
    ARCHIVED = "archived"  # Old cancelled tasks that have been archived


class AggregateApprovalStatus(str, Enum):
    """
    Aggregate approval status for organization-level tasks when facilities have mixed states.
    
    BUSINESS RULES:
    - ALL_APPROVED: All facilities have approved data → Org task is "Completed - Approved"
    - PARTIALLY_APPROVED: Some approved, some pending → "Completed - Partially Approved"
    - ALL_PENDING: All facilities have pending approval → "Completed - Awaiting Approval"
    - HAS_REJECTION: Any facility rejected → "Rejected" (blocks completion)
    - NOT_REQUIRED: No approval workflow configured
    
    Progress calculation treats APPROVED, PENDING_APPROVAL, and PARTIALLY_APPROVED as "completed"
    because data exists. Only REJECTED blocks the task from being considered complete.
    """
    ALL_APPROVED = "all_approved"
    PARTIALLY_APPROVED = "partially_approved"
    ALL_PENDING = "all_pending"
    HAS_REJECTION = "has_rejection"
    NOT_REQUIRED = "not_required"


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


def calculate_aggregate_approval_status(facility_statuses: List[str]) -> AggregateApprovalStatus:
    """
    Calculate aggregate approval status from a list of facility-level approval statuses.
    
    BUSINESS RULES (updated logic - priority order):
    
    1. If ANY facility is approved → ALL_APPROVED (even if others rejected/pending)
       - Status: completed, approval_status: approved
       - Rationale: At least some work is approved
    
    2. If NO approvals but ANY pending → ALL_PENDING (even if others rejected)
       - Status: completed, approval_status: pending_approval
       - Rationale: Work submitted, awaiting review
    
    3. If ALL rejected (no approved, no pending) → HAS_REJECTION
       - Status: pending, approval_status: rejected
       - Rationale: All work rejected, needs resubmission
    
    4. If all are not_required → NOT_REQUIRED
       - No approval workflow configured
       - Status: completed, approval_status: None
    
    Args:
        facility_statuses: List of approval_status values from facility records
                          e.g., ["approved", "pending_approval", "rejected"]
    
    Returns:
        AggregateApprovalStatus enum value
    """
    if not facility_statuses:
        return AggregateApprovalStatus.NOT_REQUIRED
    
    # Normalize status values
    statuses = set(s.lower() if s else "not_required" for s in facility_statuses)
    
    has_approved = "approved" in statuses
    has_pending = "pending" in statuses or "pending_approval" in statuses
    has_rejected = "rejected" in statuses
    
    # Rule 1: ANY approved → treat as approved (highest priority)
    if has_approved:
        return AggregateApprovalStatus.ALL_APPROVED
    
    # Rule 2: No approved, but has pending → pending_approval
    if has_pending:
        return AggregateApprovalStatus.ALL_PENDING
    
    # Rule 3: All rejected (no approved, no pending)
    if has_rejected:
        return AggregateApprovalStatus.HAS_REJECTION
    
    # Rule 4: All not_required
    return AggregateApprovalStatus.NOT_REQUIRED


# =============================================================================
# DATA EXISTENCE CHECKERS
# =============================================================================

class DataChecker:
    """
    Checks if data exists for a given org/category/subcategory/facility/period.
    
    This is the CORE logic - everything else builds on top of this.
    
    Returns: (has_data, last_updated, approval_status)
    - approval_status can be: None, "pending", "pending_approval", "approved", "rejected"
    
    PRIORITY LOGIC: When multiple records exist for the same period, returns the BEST
    approval_status based on: approved > pending_approval > pending > None > rejected
    """
    
    # Priority order for approval statuses (higher = better)
    APPROVAL_PRIORITY = {
        "approved": 5,
        "pending_approval": 4,
        "pending": 3,
        None: 2,
        "not_required": 2,
        "rejected": 1,
    }
    
    @staticmethod
    def _get_best_approval_status(records: list) -> Tuple[Optional[datetime], Optional[str]]:
        """
        From a list of records, return the best approval_status based on priority.
        
        Priority: approved > pending_approval > pending > None > rejected
        
        Returns: (last_updated, best_approval_status)
        """
        if not records:
            return None, None
        
        best_record = None
        best_priority = -1
        
        for record in records:
            status = record.get("approval_status")
            priority = DataChecker.APPROVAL_PRIORITY.get(status, 0)
            
            if priority > best_priority:
                best_priority = priority
                best_record = record
        
        if best_record:
            last_updated = best_record.get("updated_at") or best_record.get("created_at")
            return last_updated, best_record.get("approval_status")
        
        return None, None
    
    @staticmethod
    async def check_exists(
        organization_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period_key: str,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check if data exists for the given parameters.
        
        Supports both KPI metrics (record_category) and questionnaires (question).
        
        Args:
            organization_id: Organization ID
            category: Category (for metrics) - ignored for questions
            subcategory: Subcategory (for metrics) - ignored for questions
            facility_id: Facility ID (for facility-level) - ignored for questions
            period_key: Period key (e.g., "2026-07", "2026")
            entity_type: "record_category" (default) or "question"
            entity_id: Question key (required if entity_type="question")
        
        Returns: (has_data: bool, last_updated: datetime or None, approval_status: str or None)
        """
        # Route to questionnaire checker if entity_type is question
        if entity_type == "question" and entity_id:
            return await DataChecker._check_questionnaire(organization_id, entity_id, period_key)
        
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
    async def _check_questionnaire(
        organization_id: str,
        question_key: str,
        period_key: str,
    ) -> Tuple[bool, Optional[datetime], Optional[str]]:
        """
        Check organization_esg_responses for questionnaire completion.
        
        Returns: (has_data, last_updated, approval_status)
        
        NOTE: Draft responses are excluded - only submitted/completed responses count.
        PRIORITY: When multiple responses exist, returns best status (approved > pending > rejected)
        
        Uses the unified organization_esg_responses collection which stores:
        - Simple questions: Direct documents with question_key
        - Sub-questions: Nested within parent document's sub_responses
        """
        # First, try direct question lookup
        query = {
            "org_id": organization_id,
            "question_key": question_key,
            "status": {"$ne": "draft"},
        }
        
        # Parse period_key for matching
        if period_key:
            query["reporting_year"] = period_key
        
        # Try direct document lookup
        doc = await db.organization_esg_responses.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1, "value": 1, "status": 1}
        )
        
        if doc:
            # Check if has meaningful value
            value = doc.get("value")
            if DataChecker._has_value(value):
                updated_at = DataChecker._parse_datetime(doc.get("updated_at") or doc.get("created_at"))
                return True, updated_at, doc.get("approval_status")
        
        # If not found, check if this is a sub-question (e.g., gri_302_1_a)
        if "_" in question_key:
            parent_key, sub_key = DataChecker._split_question_key(question_key)
            if parent_key and sub_key:
                parent_query = {
                    "org_id": organization_id,
                    "question_key": parent_key,
                }
                if period_key:
                    parent_query["reporting_year"] = period_key
                
                parent_doc = await db.organization_esg_responses.find_one(
                    parent_query,
                    {"_id": 0, "sub_responses": 1, "updated_at": 1}
                )
                
                if parent_doc and "sub_responses" in parent_doc:
                    sub_data = parent_doc.get("sub_responses", {}).get(sub_key)
                    if sub_data and sub_data.get("status") != "draft":
                        value = sub_data.get("value")
                        if DataChecker._has_value(value):
                            updated_at = DataChecker._parse_datetime(sub_data.get("updated_at") or parent_doc.get("updated_at"))
                            return True, updated_at, sub_data.get("approval_status")
        
        # Fallback: Check legacy esg_responses collection for backward compatibility
        legacy_query = {
            "organization_id": organization_id,
            "question_key": question_key,
            "status": {"$ne": "draft"},
        }
        if period_key:
            if len(period_key) == 4:
                legacy_query["$or"] = [
                    {"reporting_period": period_key},
                    {"reporting_period": int(period_key)},
                    {"reporting_period.year": int(period_key)},
                    {"reporting_year": period_key},
                ]
            elif "-" in period_key:
                legacy_query["$or"] = [
                    {"reporting_period": period_key},
                    {"reporting_year": period_key},
                ]
        
        records = await db.esg_responses.find(
            legacy_query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1, "value": 1}
        ).to_list(100)
        
        # Filter for records with actual values
        valid_records = [r for r in records if DataChecker._has_value(r.get("value"))]
        
        if valid_records:
            last_updated, approval_status = DataChecker._get_best_approval_status(valid_records)
            return True, last_updated, approval_status
        
        return False, None, None
    
    @staticmethod
    def _split_question_key(question_key: str) -> Tuple[Optional[str], Optional[str]]:
        """Split question key into parent and sub-key if applicable."""
        if not question_key or "_" not in question_key:
            return None, None
        
        sub_suffixes = {'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
                       'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n'}
        
        parts = question_key.rsplit("_", 1)
        if len(parts) == 2 and parts[1].lower() in sub_suffixes:
            return parts[0], parts[1]
        return None, None
    
    @staticmethod
    def _has_value(value: Any) -> bool:
        """Check if a value is meaningful (not empty/null)."""
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, dict)):
            return bool(value)
        return True
    
    @staticmethod
    def _parse_datetime(dt_value: Any) -> Optional[datetime]:
        """Parse datetime from various formats."""
        if not dt_value:
            return None
        if isinstance(dt_value, datetime):
            return dt_value
        if isinstance(dt_value, str):
            try:
                return datetime.fromisoformat(dt_value.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return None
        return None
    
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
        
        NOTE: Draft records are excluded - only submitted/completed records count as "has_data"
        PRIORITY: When multiple records exist, returns best status (approved > pending > rejected)
        """
        query = {
            "organization_id": organization_id,
            "reporting_period": period_key,
            # EXCLUDE DRAFTS: Only count submitted/completed records
            "status": {"$ne": "draft"},
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
        
        # Get ALL records for this period and find the best approval_status
        records = await db.emission_records.find(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1}
        ).to_list(100)
        
        if records:
            last_updated, approval_status = DataChecker._get_best_approval_status(records)
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
        
        NOTE: Draft records are excluded - only submitted/completed records count as "has_data"
        PRIORITY: When multiple records exist, returns best status (approved > pending > rejected)
        """
        query = {
            "$or": [
                {"organization_id": organization_id},
                {"org_id": organization_id},
            ],
            # EXCLUDE DRAFTS: Only count submitted/completed records
            # Draft records should NOT mark a task as completed
            "status": {"$ne": "draft"},
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
        
        # Get ALL records for this period and find the best approval_status
        records = await db.environment_records.find(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1}
        ).to_list(100)
        
        if records:
            last_updated, approval_status = DataChecker._get_best_approval_status(records)
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
        
        NOTE: Draft records are excluded - only submitted/completed records count as "has_data"
        PRIORITY: When multiple records exist, returns best status (approved > pending > rejected)
        """
        query = {
            "$or": [
                {"organization_id": organization_id},
                {"org_id": organization_id},
            ],
            # EXCLUDE DRAFTS: Only count submitted/completed records
            "status": {"$ne": "draft"},
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
        
        # Get ALL records for this period and find the best approval_status
        records = await db.social_records.find(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1}
        ).to_list(100)
        
        if records:
            last_updated, approval_status = DataChecker._get_best_approval_status(records)
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
        
        NOTE: Draft records are excluded - only submitted/completed records count as "has_data"
        PRIORITY: When multiple records exist, returns best status (approved > pending > rejected)
        """
        query = {
            "$or": [
                {"organization_id": organization_id},
                {"org_id": organization_id},
            ],
            # EXCLUDE DRAFTS: Only count submitted/completed records
            "status": {"$ne": "draft"},
        }
        
        if category:
            query["category"] = {"$regex": f"^{category}$", "$options": "i"}
        
        if subcategory:
            query["subcategory"] = {"$regex": f"^{subcategory}$", "$options": "i"}
        
        # Get ALL records for this period and find the best approval_status
        records = await db.governance_records.find(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1, "approval_status": 1}
        ).to_list(100)
        
        if records:
            last_updated, approval_status = DataChecker._get_best_approval_status(records)
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
        0. If lifecycle_status is set (cancelled/orphaned/archived) -> return that
        1. If data exists and rejected -> REJECTED
        2. If data exists and pending_approval -> PENDING_APPROVAL
        3. If data exists and approved/no status -> COMPLETED
        4. If no data and backfill -> BACKFILL_PENDING
        5. If no data and overdue -> OVERDUE
        6. If no data -> PENDING
        
        For org-level tasks:
        - Uses aggregate approval status across all facilities
        - See calculate_aggregate_approval_status() for business rules
        """
        # Check lifecycle status first (for deleted assignments)
        lifecycle_status = task.get("lifecycle_status")
        if lifecycle_status == "cancelled":
            return TaskStatus.CANCELLED
        elif lifecycle_status == "orphaned":
            return TaskStatus.ORPHANED
        elif lifecycle_status == "archived":
            return TaskStatus.ARCHIVED
        
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
        
        # For org-level tasks (facility_id is None), calculate aggregate status
        if has_data and not facility_id:
            aggregate_status = await self._get_aggregate_approval_status(
                org_id, category, subcategory, period_key
            )
            
            if aggregate_status == AggregateApprovalStatus.HAS_REJECTION:
                return TaskStatus.REJECTED
            elif aggregate_status in [AggregateApprovalStatus.ALL_PENDING, AggregateApprovalStatus.PARTIALLY_APPROVED]:
                return TaskStatus.PENDING_APPROVAL
            # ALL_APPROVED or NOT_REQUIRED = completed
            return TaskStatus.COMPLETED
        
        if has_data:
            # Facility-level: use direct approval status
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

    async def get_task_status_with_approval(
        self,
        task: Dict[str, Any],
    ) -> tuple:
        """
        Compute both task status and approval status from underlying data.
        
        Returns: (TaskStatus, approval_status_string or None)
        
        BUSINESS RULES:
        - pending_approval: status=completed, approval_status=pending_approval
        - rejected but one approved: status=completed, approval_status=approved
        - rejected and none approved and none pending: status=pending, approval_status=rejected
        - rejected and none approved but one pending: status=completed, approval_status=pending_approval
        
        Supports both KPI metrics (record_category) and questionnaires (question).
        This is the single source of truth - status AND approval_status come from RECORDS.
        """
        org_id = task.get("organization_id")
        facility_id = task.get("facility_id")
        category = task.get("category")
        subcategory = task.get("subcategory")
        period_key = task.get("period_key")
        due_at = task.get("due_at")
        is_backfill = task.get("is_backfill", False)
        entity_type = task.get("entity_type", "record_category")
        entity_id = task.get("entity_id")  # For question tasks
        
        # Check if data exists and get approval status from RECORD
        has_data, _, record_approval_status = await DataChecker.check_exists(
            organization_id=org_id,
            category=category,
            subcategory=subcategory,
            facility_id=facility_id,
            period_key=period_key,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        
        # If no data exists, return pending/overdue status
        if not has_data:
            if due_at:
                due_datetime = datetime.fromisoformat(due_at.replace("Z", "+00:00")) if isinstance(due_at, str) else due_at
                if due_datetime.tzinfo is None:
                    due_datetime = due_datetime.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) > due_datetime:
                    return TaskStatus.OVERDUE, None
            if is_backfill:
                return TaskStatus.BACKFILL_PENDING, None
            return TaskStatus.PENDING, None
        
        # Data exists - determine approval status
        approval_status = None
        
        # Question tasks don't have facility aggregation - use direct status
        if entity_type == "question":
            if record_approval_status == "rejected":
                return TaskStatus.PENDING, "rejected"
            elif record_approval_status in ["pending", "pending_approval"]:
                return TaskStatus.COMPLETED, "pending_approval"
            elif record_approval_status == "approved":
                return TaskStatus.COMPLETED, "approved"
            else:
                return TaskStatus.COMPLETED, None
        
        # KPI metrics: check org-level vs facility-level
        if not facility_id:
            # Org-level: aggregate across facilities
            aggregate = await self._get_aggregate_approval_status(
                org_id, category, subcategory, period_key
            )
            if aggregate == AggregateApprovalStatus.HAS_REJECTION:
                # All rejected, none approved, none pending → status=pending, approval_status=rejected
                return TaskStatus.PENDING, "rejected"
            elif aggregate == AggregateApprovalStatus.ALL_PENDING:
                # Has pending (maybe some rejected) but no approved → status=completed, approval_status=pending_approval
                return TaskStatus.COMPLETED, "pending_approval"
            elif aggregate == AggregateApprovalStatus.ALL_APPROVED:
                # Has at least one approved → status=completed, approval_status=approved
                return TaskStatus.COMPLETED, "approved"
            elif aggregate == AggregateApprovalStatus.PARTIALLY_APPROVED:
                # Some approved, some pending → status=completed, approval_status=approved (at least one approved)
                return TaskStatus.COMPLETED, "approved"
            else:
                # NOT_REQUIRED - no approval workflow
                return TaskStatus.COMPLETED, None
        else:
            # Facility-level: use direct status from record
            if record_approval_status == "rejected":
                return TaskStatus.PENDING, "rejected"
            elif record_approval_status in ["pending", "pending_approval"]:
                # Work submitted, awaiting approval → status=completed, approval_status=pending_approval
                return TaskStatus.COMPLETED, "pending_approval"
            elif record_approval_status == "approved":
                return TaskStatus.COMPLETED, "approved"
            else:
                # No approval workflow or not_required
                return TaskStatus.COMPLETED, None

    async def _get_aggregate_approval_status(
        self,
        org_id: str,
        category: str,
        subcategory: Optional[str],
        period_key: str,
    ) -> AggregateApprovalStatus:
        """
        Calculate aggregate approval status for org-level task by checking all facility records.
        """
        # Get all facilities for this org
        facilities = await db.facilities.find(
            {"organization_id": org_id, "is_deleted": {"$ne": True}},
            {"_id": 0, "id": 1}
        ).to_list(500)
        
        if not facilities:
            return AggregateApprovalStatus.NOT_REQUIRED
        
        # Collect approval statuses from all facility records for this period
        facility_statuses = []
        
        for facility in facilities:
            _, _, approval_status = await DataChecker.check_exists(
                org_id, category, subcategory, facility["id"], period_key
            )
            if approval_status:
                facility_statuses.append(approval_status)
        
        if not facility_statuses:
            # Check if org-level record exists
            _, _, org_approval_status = await DataChecker.check_exists(
                org_id, category, subcategory, None, period_key
            )
            if org_approval_status:
                # Org-level record - use its status directly
                if org_approval_status == "rejected":
                    return AggregateApprovalStatus.HAS_REJECTION
                elif org_approval_status in ["pending", "pending_approval"]:
                    return AggregateApprovalStatus.ALL_PENDING
                elif org_approval_status == "approved":
                    return AggregateApprovalStatus.ALL_APPROVED
            return AggregateApprovalStatus.NOT_REQUIRED
        
        return calculate_aggregate_approval_status(facility_statuses)

    
    async def get_assignment_progress(
        self,
        assignment: Dict[str, Any],
        include_period_details: bool = False,
    ) -> ProgressResult:
        """
        Calculate progress for an assignment.
        
        Handles:
        - KPI metrics (record_category): org-level and facility-level
        - Questionnaires (question): single question per assignment
        
        FACILITY SNAPSHOT: For org-level assignments, uses facility_snapshot if available
        to ensure historical task completion cannot change retroactively when new facilities
        are added to the organization.
        """
        entity_type = assignment.get("entity_type", "record_category")
        
        # Route to questionnaire progress if entity_type is question
        if entity_type == "question":
            return await self._calculate_question_progress(assignment, include_period_details)
        
        # Default: KPI metric progress
        org_id = assignment.get("organization_id")
        category = assignment.get("category")
        subcategory = assignment.get("subcategory")
        facility_id = assignment.get("facility_id")
        assignment_level = assignment.get("assignment_level", "organization")
        frequency = assignment.get("filling_frequency", "monthly")
        facility_snapshot = assignment.get("facility_snapshot")
        
        # Get due_day from due_config (primary) or filling_due_day (fallback)
        # This must match how tasks are generated in task_engine.py
        # Note: due_config can be explicitly None in DB, so use `or {}` not default arg
        due_config = assignment.get("due_config") or {}
        due_day = due_config.get("day_of_month") or assignment.get("filling_due_day", 15)
        
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
            has_data, last_updated, approval_status = await DataChecker.check_exists(
                org_id, category, subcategory, facility_id, period_key
            )
            
            result.total += 1
            
            # BUSINESS RULE: Rejected records do NOT count as completed for progress
            # - pending_approval: counts as completed (work done, awaiting review)
            # - approved: counts as completed
            # - rejected: does NOT count (needs resubmission)
            is_completed_for_progress = has_data and approval_status != "rejected"
            
            if is_completed_for_progress:
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
                    "approval_status": approval_status,
                    "counts_as_completed": is_completed_for_progress,
                    "facility_breakdown": [{
                        "facility_id": facility_id,
                        "has_data": has_data,
                        "approval_status": approval_status,
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
            has_org_record, org_last_updated, org_approval_status = await DataChecker.check_exists(
                org_id, category, subcategory, None, period_key
            )
            
            # BUSINESS RULE: Rejected records do NOT count as completed for progress
            org_counts_as_completed = has_org_record and org_approval_status != "rejected"
            
            facility_breakdown = []
            
            if org_counts_as_completed:
                # Org-level record exists and is not rejected - count as 1 completed
                result.total += 1
                result.completed += 1
                if org_last_updated and (not result.last_updated or org_last_updated > result.last_updated):
                    result.last_updated = org_last_updated
                
                if include_details:
                    facility_breakdown = [{"facility_id": None, "facility_name": "Organization Level", "has_data": True, "approval_status": org_approval_status}]
            
            elif has_any_facility_records:
                # No org record (or rejected), but facility-level reporting is used
                # Expand to require ALL facilities
                num_facilities = len(facilities)
                result.total += num_facilities
                
                facilities_completed = 0
                period_last_updated = None
                
                for facility in facilities:
                    fac_id = facility.get("id")
                    fac_name = facility.get("name", "Unknown")
                    
                    has_fac_data, fac_last_updated, fac_approval_status = await DataChecker.check_exists(
                        org_id, category, subcategory, fac_id, period_key
                    )
                    
                    # BUSINESS RULE: Rejected records do NOT count as completed
                    fac_counts_as_completed = has_fac_data and fac_approval_status != "rejected"
                    
                    if fac_counts_as_completed:
                        facilities_completed += 1
                        if fac_last_updated and (not period_last_updated or fac_last_updated > period_last_updated):
                            period_last_updated = fac_last_updated
                    
                    if include_details:
                        facility_breakdown.append({
                            "facility_id": fac_id,
                            "facility_name": fac_name,
                            "has_data": has_fac_data,
                            "approval_status": fac_approval_status,
                            "counts_as_completed": fac_counts_as_completed,
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
    
    async def _calculate_question_progress(
        self,
        assignment: Dict[str, Any],
        include_details: bool = False,
    ) -> ProgressResult:
        """
        Calculate progress for a questionnaire (question) assignment.
        
        Questionnaire assignments are simpler than KPI metrics:
        - No facility breakdown (questions are org-level)
        - One response per period expected
        - Progress based on whether response exists and its approval status
        """
        result = ProgressResult()
        now = datetime.now(timezone.utc)
        
        org_id = assignment.get("organization_id")
        entity_id = assignment.get("entity_id")  # question_key
        frequency = assignment.get("filling_frequency", "yearly")  # Most questions are yearly
        
        # Get due_day from due_config
        due_config = assignment.get("due_config") or {}
        due_day = due_config.get("day_of_month") or 15
        
        # Generate periods
        periods = PeriodGenerator.generate(
            assignment.get("start_date"),
            assignment.get("end_date"),
            frequency,
        )
        
        if not periods:
            return ProgressResult.empty()
        
        for period in periods:
            period_key = period["period_key"]
            
            # Check if response exists
            has_data, last_updated, approval_status = await DataChecker.check_exists(
                organization_id=org_id,
                category=None,
                subcategory=None,
                facility_id=None,
                period_key=period_key,
                entity_type="question",
                entity_id=entity_id,
            )
            
            result.total += 1
            
            # BUSINESS RULE: Rejected responses do NOT count as completed
            is_completed_for_progress = has_data and approval_status != "rejected"
            
            if is_completed_for_progress:
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
                    "approval_status": approval_status,
                    "counts_as_completed": is_completed_for_progress,
                    "entity_id": entity_id,
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
