"""
Assignment Progress Calculation Engine

A clean, modular engine for calculating real progress based on actual data collection tasks.

Architecture:
- ProgressCalculationEngine: Main orchestrator
- PeriodGenerator: Generates reporting periods based on frequency
- RecordChecker: Checks if records exist in various collections
- ProgressCalculator: Calculates progress for different assignment levels
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from shared.database.mongo import db
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# PERIOD GENERATOR
# ============================================================================

class PeriodGenerator:
    """Generates reporting period strings based on frequency and date range."""
    
    @staticmethod
    def generate(
        start_date: Optional[str],
        end_date: Optional[str],
        frequency: str,
    ) -> List[str]:
        """
        Generate list of reporting periods.
        
        Returns:
            Monthly: ["2024-01", "2024-02", ...]
            Quarterly: ["2024-Q1", "2024-Q2", ...]  
            Annually: ["2024", "2025", ...]
        """
        start, end = PeriodGenerator._parse_dates(start_date, end_date)
        if not start or not end:
            return []
        
        freq = (frequency or "monthly").lower()
        
        if freq == "monthly":
            return PeriodGenerator._generate_monthly(start, end)
        elif freq == "quarterly":
            return PeriodGenerator._generate_quarterly(start, end)
        elif freq in ["annually", "yearly"]:
            return PeriodGenerator._generate_annually(start, end)
        else:
            return PeriodGenerator._generate_monthly(start, end)
    
    @staticmethod
    def _parse_dates(start_date: Optional[str], end_date: Optional[str]) -> Tuple[datetime, datetime]:
        """Parse date strings or return current FY defaults."""
        if not start_date or not end_date:
            now = datetime.now()
            if now.month >= 4:
                return (
                    datetime(now.year, 4, 1),
                    datetime(now.year + 1, 3, 31)
                )
            return (
                datetime(now.year - 1, 4, 1),
                datetime(now.year, 3, 31)
            )
        
        try:
            return (
                datetime.strptime(start_date[:10], "%Y-%m-%d"),
                datetime.strptime(end_date[:10], "%Y-%m-%d")
            )
        except (ValueError, TypeError):
            return None, None
    
    @staticmethod
    def _generate_monthly(start: datetime, end: datetime) -> List[str]:
        periods = []
        current = start
        while current <= end:
            periods.append(current.strftime("%Y-%m"))
            current += relativedelta(months=1)
        return periods
    
    @staticmethod
    def _generate_quarterly(start: datetime, end: datetime) -> List[str]:
        periods = []
        current = start
        while current <= end:
            quarter = (current.month - 1) // 3 + 1
            period_str = f"{current.year}-Q{quarter}"
            if period_str not in periods:
                periods.append(period_str)
            current += relativedelta(months=3)
        return periods
    
    @staticmethod
    def _generate_annually(start: datetime, end: datetime) -> List[str]:
        periods = []
        current = start
        while current <= end:
            year_str = str(current.year)
            if year_str not in periods:
                periods.append(year_str)
            current += relativedelta(years=1)
        return periods
    
    @staticmethod
    def get_period_due_date(period: str, due_day: int = 15) -> Optional[datetime]:
        """Calculate due date for a reporting period."""
        try:
            if "-Q" in period:
                year, q = period.split("-Q")
                quarter = int(q)
                due_month = quarter * 3 + 1
                if due_month > 12:
                    due_month = 1
                    year = int(year) + 1
                else:
                    year = int(year)
                return datetime(year, due_month, min(due_day, 28), tzinfo=timezone.utc)
            
            elif len(period) == 4:
                year = int(period)
                return datetime(year + 1, 4, min(due_day, 28), tzinfo=timezone.utc)
            
            else:
                year, month = period.split("-")
                due_date = datetime(int(year), int(month), 1, tzinfo=timezone.utc)
                due_date += relativedelta(months=1)
                return due_date.replace(day=min(due_day, 28))
        except (ValueError, TypeError):
            return None


# ============================================================================
# RECORD CHECKER
# ============================================================================

class RecordChecker:
    """Checks if ESG records exist in various collections."""
    
    COLLECTION_MAP = {
        "emission": "emission_records",
        "ghg": "emission_records",
        "social": "social_records",
        "employee": "social_records",
        "worker": "social_records",
        "health": "social_records",
        "safety": "social_records",
        "governance": "governance_records",
        "board": "governance_records",
        "ethic": "governance_records",
        "compliance": "governance_records",
    }
    
    # Month name to number mapping
    MONTH_MAP = {
        "january": 1, "february": 2, "march": 3, "april": 4,
        "may": 5, "june": 6, "july": 7, "august": 8,
        "september": 9, "october": 10, "november": 11, "december": 12,
        "jan": 1, "feb": 2, "mar": 3, "apr": 4,
        "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }
    
    @staticmethod
    def get_collection(category: str):
        """Get MongoDB collection for a category."""
        cat_lower = (category or "").lower()
        
        for keyword, collection_name in RecordChecker.COLLECTION_MAP.items():
            if keyword in cat_lower:
                return db[collection_name]
        
        return db["environment_records"]
    
    @staticmethod
    async def check_exists(
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period: str,
    ) -> Tuple[bool, Optional[datetime]]:
        """
        Check if a record exists.
        
        Args:
            period: Format "YYYY-MM" for monthly, "YYYY-Q1" for quarterly, "YYYY" for annual
        
        Returns:
            (has_data: bool, last_updated: datetime or None)
        """
        collection = RecordChecker.get_collection(category)
        
        # Build query
        query = RecordChecker._build_query(org_id, category, subcategory, facility_id, period)
        
        record = await collection.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1},
            sort=[("updated_at", -1)]
        )
        
        if record:
            updated = RecordChecker._parse_datetime(record.get("updated_at") or record.get("created_at"))
            return True, updated
        
        return False, None
    
    @staticmethod
    def _build_query(
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period: str,
    ) -> Dict:
        """
        Build MongoDB query for record lookup.
        
        Handles reporting_period as an object:
        {
            "reporting_type": "monthly",
            "year": 2026,
            "month": "6" or "June",
            ...
        }
        """
        # Parse period string to year/month/quarter
        year, month, quarter = RecordChecker._parse_period(period)
        
        # Build reporting_period query conditions
        period_conditions = RecordChecker._build_period_conditions(year, month, quarter)
        
        # Base query
        query = {
            "org_id": org_id,  # Records use org_id, not organization_id
            "is_current": True,  # Only current records
        }
        
        # Add period conditions
        if period_conditions:
            query["$and"] = period_conditions
        
        # Handle facility_id
        if facility_id:
            query["facility_id"] = facility_id
        else:
            # Org-level: no facility or null/empty facility
            query["$or"] = [
                {"facility_id": {"$exists": False}},
                {"facility_id": None},
                {"facility_id": ""},
            ]
        
        # Add category/subcategory filters
        if category:
            query["category"] = {"$regex": f"^{category}$", "$options": "i"}
        
        if subcategory:
            query["subcategory"] = {"$regex": f"^{subcategory}$", "$options": "i"}
        
        return query
    
    @staticmethod
    def _parse_period(period: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """
        Parse period string into year, month, quarter.
        
        Formats:
            "2026-07" -> (2026, 7, None)
            "2026-Q2" -> (2026, None, 2)
            "2026" -> (2026, None, None)
        """
        if not period:
            return None, None, None
        
        try:
            if "-Q" in period:
                # Quarterly: "2026-Q2"
                parts = period.split("-Q")
                return int(parts[0]), None, int(parts[1])
            elif "-" in period:
                # Monthly: "2026-07"
                parts = period.split("-")
                return int(parts[0]), int(parts[1]), None
            else:
                # Annual: "2026"
                return int(period), None, None
        except (ValueError, IndexError):
            return None, None, None
    
    @staticmethod
    def _build_period_conditions(
        year: Optional[int],
        month: Optional[int],
        quarter: Optional[int],
    ) -> List[Dict]:
        """
        Build MongoDB $and conditions for reporting_period object matching.
        
        The reporting_period in DB looks like:
        {
            "reporting_type": "monthly",
            "year": 2026,
            "month": "6" or "June" or 6,
            "quarter": "Q1" or 1,
            ...
        }
        """
        conditions = []
        
        if year:
            # Year can be int or string
            conditions.append({
                "$or": [
                    {"reporting_period.year": year},
                    {"reporting_period.year": str(year)},
                ]
            })
        
        if month:
            # Month can be: number (6), string number ("6"), or name ("June", "Jun")
            month_variants = [
                month,           # 6
                str(month),      # "6"
                f"{month:02d}",  # "06"
            ]
            
            # Add month names
            month_names = [
                "january", "february", "march", "april", "may", "june",
                "july", "august", "september", "october", "november", "december"
            ]
            if 1 <= month <= 12:
                month_variants.append(month_names[month - 1])  # "june"
                month_variants.append(month_names[month - 1].capitalize())  # "June"
                month_variants.append(month_names[month - 1][:3])  # "jun"
                month_variants.append(month_names[month - 1][:3].capitalize())  # "Jun"
            
            conditions.append({
                "reporting_period.month": {"$in": month_variants}
            })
        
        if quarter:
            # Quarter can be: 1, "1", "Q1"
            quarter_variants = [
                quarter,
                str(quarter),
                f"Q{quarter}",
            ]
            conditions.append({
                "reporting_period.quarter": {"$in": quarter_variants}
            })
        
        return conditions
    
    @staticmethod
    def _parse_datetime(value) -> Optional[datetime]:
        """Parse datetime from various formats."""
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return None
        return None


# ============================================================================
# PROGRESS RESULT
# ============================================================================

class ProgressResult:
    """Standard progress result structure."""
    
    def __init__(
        self,
        completed: int = 0,
        total: int = 0,
        pending: int = 0,
        overdue: int = 0,
        last_updated: Optional[datetime] = None,
    ):
        self.completed = completed
        self.total = total
        self.pending = pending
        self.overdue = overdue
        self.last_updated = last_updated
    
    @property
    def percentage(self) -> float:
        if self.total == 0:
            return 0
        return round((self.completed / self.total * 100), 1)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "progress_percentage": self.percentage,
            "completed_tasks": self.completed,
            "total_tasks": self.total,
            "pending_tasks": self.pending,
            "overdue_tasks": self.overdue,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
        }
    
    def merge(self, other: "ProgressResult") -> "ProgressResult":
        """Merge two progress results."""
        new_updated = self.last_updated
        if other.last_updated:
            if not new_updated or other.last_updated > new_updated:
                new_updated = other.last_updated
        
        return ProgressResult(
            completed=self.completed + other.completed,
            total=self.total + other.total,
            pending=self.pending + other.pending,
            overdue=self.overdue + other.overdue,
            last_updated=new_updated,
        )
    
    @staticmethod
    def empty() -> "ProgressResult":
        return ProgressResult()


# ============================================================================
# PROGRESS CALCULATOR
# ============================================================================

class ProgressCalculator:
    """Calculates progress for different assignment levels."""
    
    @staticmethod
    async def calculate_facility_level(
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facilities: List[Dict],
        periods: List[str],
        due_day: int = 15,
    ) -> ProgressResult:
        """
        Calculate facility-level progress.
        
        Total tasks = facilities × periods
        """
        result = ProgressResult()
        result.total = len(facilities) * len(periods)
        now = datetime.now(timezone.utc)
        
        for facility in facilities:
            fac_id = facility.get("id")
            
            for period in periods:
                has_data, record_date = await RecordChecker.check_exists(
                    org_id, category, subcategory, fac_id, period
                )
                
                if has_data:
                    result.completed += 1
                    if record_date and (not result.last_updated or record_date > result.last_updated):
                        result.last_updated = record_date
                else:
                    due_date = PeriodGenerator.get_period_due_date(period, due_day)
                    if due_date and due_date < now:
                        result.overdue += 1
                    else:
                        result.pending += 1
        
        return result
    
    @staticmethod
    async def calculate_org_level(
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facilities: List[Dict],
        periods: List[str],
        due_day: int = 15,
    ) -> ProgressResult:
        """
        Calculate organization-level progress.
        
        Each period satisfied by EITHER:
        - One org-level record, OR
        - All facility-level records
        """
        result = ProgressResult()
        now = datetime.now(timezone.utc)
        
        for period in periods:
            # Check org-level record first
            has_org_record, org_date = await RecordChecker.check_exists(
                org_id, category, subcategory, None, period
            )
            
            if has_org_record:
                result.total += 1
                result.completed += 1
                if org_date and (not result.last_updated or org_date > result.last_updated):
                    result.last_updated = org_date
            else:
                # Need all facility records
                num_facilities = max(len(facilities), 1)
                result.total += num_facilities
                
                facilities_completed = 0
                period_last_updated = None
                
                for facility in facilities:
                    has_fac_data, fac_date = await RecordChecker.check_exists(
                        org_id, category, subcategory, facility.get("id"), period
                    )
                    
                    if has_fac_data:
                        facilities_completed += 1
                        if fac_date and (not period_last_updated or fac_date > period_last_updated):
                            period_last_updated = fac_date
                
                result.completed += facilities_completed
                remaining = num_facilities - facilities_completed
                
                due_date = PeriodGenerator.get_period_due_date(period, due_day)
                if due_date and due_date < now:
                    result.overdue += remaining
                else:
                    result.pending += remaining
                
                if period_last_updated and (not result.last_updated or period_last_updated > result.last_updated):
                    result.last_updated = period_last_updated
        
        return result


# ============================================================================
# MAIN ENGINE
# ============================================================================

class ProgressCalculationEngine:
    """
    Main orchestrator for progress calculation.
    
    Usage:
        engine = ProgressCalculationEngine()
        progress = await engine.get_assignment_progress(assignment_id)
        progress = await engine.get_category_progress(org_id, category)
    """
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._facilities = db["facilities"]
    
    async def get_assignment_progress(self, assignment_id: str) -> Dict[str, Any]:
        """Get progress for a single assignment."""
        assignment = await self._assignments.find_one(
            {"id": assignment_id},
            {"_id": 0}
        )
        
        if not assignment:
            return ProgressResult.empty().to_dict()
        
        return (await self._calculate(assignment)).to_dict()
    
    async def get_category_progress(
        self,
        organization_id: str,
        category: str,
        subcategory: Optional[str] = None,
        sub_subcategory: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get aggregated progress for a category."""
        query = {
            "organization_id": organization_id,
            "category": category,
        }
        if subcategory:
            query["subcategory"] = subcategory
        if sub_subcategory:
            query["sub_subcategory"] = sub_subcategory
        
        assignments = await self._assignments.find(query, {"_id": 0}).to_list(500)
        
        if not assignments:
            return ProgressResult.empty().to_dict()
        
        combined = ProgressResult.empty()
        for assignment in assignments:
            progress = await self._calculate(assignment)
            combined = combined.merge(progress)
        
        return combined.to_dict()
    
    async def get_bulk_progress(
        self,
        organization_id: str,
        categories: List[Dict[str, str]],
    ) -> Dict[str, Dict[str, Any]]:
        """Get progress for multiple categories."""
        result = {}
        
        for cat_info in categories:
            key = "|".join(filter(None, [
                cat_info.get("category", ""),
                cat_info.get("subcategory"),
                cat_info.get("sub_subcategory"),
            ]))
            
            result[key] = await self.get_category_progress(
                organization_id=organization_id,
                category=cat_info.get("category"),
                subcategory=cat_info.get("subcategory"),
                sub_subcategory=cat_info.get("sub_subcategory"),
            )
        
        return result
    
    async def _calculate(self, assignment: Dict[str, Any]) -> ProgressResult:
        """Calculate progress for an assignment."""
        org_id = assignment.get("organization_id")
        category = assignment.get("category")
        subcategory = assignment.get("subcategory")
        level = assignment.get("assignment_level", "organization")
        frequency = assignment.get("filling_frequency", "monthly")
        due_day = assignment.get("filling_due_day", 15)
        
        # Get periods
        periods = PeriodGenerator.generate(
            assignment.get("start_date"),
            assignment.get("end_date"),
            frequency,
        )
        
        if not periods:
            return ProgressResult.empty()
        
        # Get facilities
        facilities = await self._get_facilities(assignment, org_id)
        
        # Calculate based on level
        if level == "facility":
            return await ProgressCalculator.calculate_facility_level(
                org_id, category, subcategory, facilities, periods, due_day
            )
        else:
            return await ProgressCalculator.calculate_org_level(
                org_id, category, subcategory, facilities, periods, due_day
            )
    
    async def _get_facilities(self, assignment: Dict, org_id: str) -> List[Dict]:
        """Get facilities for an assignment."""
        level = assignment.get("assignment_level", "organization")
        facility_id = assignment.get("facility_id")
        facility_ids = assignment.get("facility_ids") or []
        
        if facility_id and facility_id not in facility_ids:
            facility_ids.append(facility_id)
        
        if level == "facility" and facility_ids:
            return await self._facilities.find(
                {"id": {"$in": facility_ids}},
                {"_id": 0, "id": 1, "name": 1}
            ).to_list(500)
        
        return await self._facilities.find(
            {"organization_id": org_id},
            {"_id": 0, "id": 1, "name": 1}
        ).to_list(500)


# ============================================================================
# SINGLETON & CONVENIENCE FUNCTIONS
# ============================================================================

_engine = None

def get_progress_engine() -> ProgressCalculationEngine:
    """Get singleton engine instance."""
    global _engine
    if _engine is None:
        _engine = ProgressCalculationEngine()
    return _engine


async def get_assignment_progress(assignment_id: str) -> Dict[str, Any]:
    """Get progress for an assignment."""
    return await get_progress_engine().get_assignment_progress(assignment_id)


async def get_category_progress(
    organization_id: str,
    category: str,
    subcategory: Optional[str] = None,
) -> Dict[str, Any]:
    """Get progress for a category."""
    return await get_progress_engine().get_category_progress(
        organization_id, category, subcategory
    )


async def get_bulk_progress(
    organization_id: str,
    categories: List[Dict[str, str]],
) -> Dict[str, Dict[str, Any]]:
    """Get progress for multiple categories."""
    return await get_progress_engine().get_bulk_progress(organization_id, categories)
