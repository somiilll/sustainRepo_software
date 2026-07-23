"""
Assignment Progress Calculation Engine

A clean, modular engine for calculating real progress based on actual data collection tasks.

Supports:
- Multiple reporting_period formats (object, string, FY format)
- Both org_id and organization_id keys
- Flexible is_current handling (None treated as current)
- Category mapping for emissions (Scope 1/2/3 → granular categories)
"""

from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from shared.database.mongo import db
import logging
import re

logger = logging.getLogger(__name__)


# ============================================================================
# CONSTANTS
# ============================================================================

MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
]

MONTH_ABBREV = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

# Map GHG Emissions subcategories to actual emission record categories
SCOPE_CATEGORY_MAP = {
    "scope 1": ["Stationary Combustion", "Mobile Combustion", "Fugitive Emissions", "Process Emissions"],
    "scope 2": ["Purchased Electricity", "Purchased Heat", "Purchased Steam", "Purchased Cooling"],
    "scope 3": [
        "C1 - Purchased Goods and Services",
        "C2 - Capital Goods",
        "C3 - Fuel and Energy Related Activities Not Included in Scope 1 or Scope 2",
        "C4 - Upstream Transportation and Distribution",
        "C5 - Waste Generated in Operations",
        "C6 - Business Travel",
        "C7 - Employee Commuting",
        "C8 - Upstream Leased Assets",
        "C9 - Downstream Transportation and Distribution",
        "C10 - Processing of Sold Products",
        "C11 - Use of Sold Products",
        "C12 - End-of-Life Treatment of Sold Products",
        "C13 - Downstream Leased Assets",
        "C14 - Franchises",
        "C15 - Investments",
    ],
}


# ============================================================================
# PERIOD GENERATOR
# ============================================================================

class PeriodGenerator:
    """Generates reporting period identifiers based on frequency and date range."""
    
    @staticmethod
    def generate(
        start_date: Optional[str],
        end_date: Optional[str],
        frequency: str,
    ) -> List[Dict[str, Any]]:
        """
        Generate list of reporting periods with metadata.
        
        Returns list of dicts with year, month, quarter info for flexible matching.
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
                return datetime(now.year, 4, 1), datetime(now.year + 1, 3, 31)
            return datetime(now.year - 1, 4, 1), datetime(now.year, 3, 31)
        
        try:
            start = datetime.strptime(str(start_date)[:10], "%Y-%m-%d")
            end = datetime.strptime(str(end_date)[:10], "%Y-%m-%d")
            return start, end
        except (ValueError, TypeError):
            return None, None
    
    @staticmethod
    def _generate_monthly(start: datetime, end: datetime) -> List[Dict]:
        periods = []
        current = start
        while current <= end:
            periods.append({
                "type": "monthly",
                "year": current.year,
                "month": current.month,
                "string": current.strftime("%Y-%m"),
            })
            current += relativedelta(months=1)
        return periods
    
    @staticmethod
    def _generate_quarterly(start: datetime, end: datetime) -> List[Dict]:
        periods = []
        current = start
        seen = set()
        while current <= end:
            quarter = (current.month - 1) // 3 + 1
            key = f"{current.year}-Q{quarter}"
            if key not in seen:
                seen.add(key)
                periods.append({
                    "type": "quarterly",
                    "year": current.year,
                    "quarter": quarter,
                    "string": key,
                })
            current += relativedelta(months=3)
        return periods
    
    @staticmethod
    def _generate_annually(start: datetime, end: datetime) -> List[Dict]:
        periods = []
        seen = set()
        current = start
        while current <= end:
            if current.year not in seen:
                seen.add(current.year)
                periods.append({
                    "type": "annual",
                    "year": current.year,
                    "string": str(current.year),
                })
            current += relativedelta(years=1)
        return periods
    
    @staticmethod
    def get_due_date(period: Dict, due_day: int = 15) -> Optional[datetime]:
        """Calculate due date for a reporting period."""
        try:
            ptype = period.get("type", "monthly")
            year = period.get("year")
            
            if ptype == "quarterly":
                quarter = period.get("quarter", 1)
                due_month = quarter * 3 + 1
                if due_month > 12:
                    due_month = 1
                    year += 1
                return datetime(year, due_month, min(due_day, 28), tzinfo=timezone.utc)
            
            elif ptype == "annual":
                return datetime(year + 1, 4, min(due_day, 28), tzinfo=timezone.utc)
            
            else:  # monthly
                month = period.get("month", 1)
                due_date = datetime(year, month, 1, tzinfo=timezone.utc)
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
        # emission_records
        "emission": "emission_records",
        "ghg": "emission_records",
        "scope": "emission_records",
        
        # social_records
        "social": "social_records",
        "employee": "social_records",
        "worker": "social_records",
        "health": "social_records",
        "safety": "social_records",
        "complaint": "social_records",
        "training": "social_records",
        
        # governance_records
        "governance": "governance_records",
        "board": "governance_records",
        "ethic": "governance_records",
        "compliance": "governance_records",
        "corruption": "governance_records",
        "anti-corruption": "governance_records",
        "competitive": "governance_records",
        "financial": "governance_records",
        "procurement": "governance_records",
        "incident": "governance_records",
        
        # environment_records (explicit mappings)
        "energy": "environment_records",
        "waste": "environment_records",
        "water": "environment_records",
    }
    
    # Map scope names to emission_records scope field values
    SCOPE_FIELD_MAP = {
        "scope 1": "scope1",
        "scope 2": "scope2", 
        "scope 3": "scope3",
    }
    
    @staticmethod
    def get_collection_name(category: str, subcategory: Optional[str] = None) -> str:
        """Get MongoDB collection name for a category."""
        cat_lower = (category or "").lower()
        sub_lower = (subcategory or "").lower()
        
        # Check subcategory first (more specific)
        for keyword, collection_name in RecordChecker.COLLECTION_MAP.items():
            if keyword in sub_lower:
                return collection_name
        
        # Then check category
        for keyword, collection_name in RecordChecker.COLLECTION_MAP.items():
            if keyword in cat_lower:
                return collection_name
        
        return "environment_records"
    
    @staticmethod
    def get_collection(category: str, subcategory: Optional[str] = None):
        """Get MongoDB collection for a category."""
        return db[RecordChecker.get_collection_name(category, subcategory)]
    
    @staticmethod
    def _is_emission_collection(category: str, subcategory: Optional[str] = None) -> bool:
        """Check if the category maps to emission_records collection."""
        return RecordChecker.get_collection_name(category, subcategory) == "emission_records"
    
    @staticmethod
    def _get_scope_value(subcategory: Optional[str]) -> Optional[str]:
        """Extract scope field value from subcategory (e.g., 'GHG Emissions - Scope 1' -> 'scope1')."""
        if not subcategory:
            return None
        sub_lower = subcategory.lower()
        for scope_name, scope_value in RecordChecker.SCOPE_FIELD_MAP.items():
            if scope_name in sub_lower:
                return scope_value
        return None
    
    @staticmethod
    async def check_exists(
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period: Dict[str, Any],
    ) -> Tuple[bool, Optional[datetime]]:
        """
        Check if a record exists for the given criteria.
        
        Returns:
            (has_data: bool, last_updated: datetime or None)
        """
        collection_name = RecordChecker.get_collection_name(category, subcategory)
        collection = db[collection_name]
        
        # Use specialized query builder for emission_records vs other collections
        if collection_name == "emission_records":
            query = await RecordChecker._build_emission_query(
                org_id, category, subcategory, facility_id, period
            )
        else:
            # Standard records have separate category and subcategory fields
            query = RecordChecker._build_standard_query_with_subcategory(
                org_id, category, subcategory, facility_id, period
            )
        
        record = await collection.find_one(
            query,
            {"_id": 0, "updated_at": 1, "created_at": 1},
            sort=[("updated_at", -1), ("created_at", -1)]
        )
        
        if record:
            updated = RecordChecker._parse_datetime(record.get("updated_at") or record.get("created_at"))
            return True, updated
        
        return False, None
    
    @staticmethod
    async def _build_emission_query(
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period: Dict[str, Any],
    ) -> Dict:
        """
        Build query specifically for emission_records collection.
        
        Key differences from standard records:
        - NO org_id/organization_id field - must query by facility_id
        - NO is_current field
        - Uses 'scope' field (scope1, scope2, scope3) 
        - Uses string reporting_period format (e.g., "2026-07")
        - Categories are case-sensitive Title Case (e.g., "Stationary Combustion")
        """
        conditions = []
        
        # Facility filter - emission_records ALWAYS requires facility_id
        if facility_id:
            conditions.append({"facility_id": facility_id})
        else:
            # For org-level check, we need to find ALL facilities for this org
            # and check if ANY facility has data
            org_facilities = await db["facilities"].find(
                {"organization_id": org_id},
                {"_id": 0, "id": 1}
            ).to_list(500)
            
            if org_facilities:
                facility_ids = [f["id"] for f in org_facilities]
                conditions.append({"facility_id": {"$in": facility_ids}})
            else:
                # No facilities found - query will return empty
                return {"facility_id": "__NO_MATCH__"}
        
        # Period filter - emission_records uses string format like "2026-07"
        period_filter = RecordChecker._build_emission_period_filter(period)
        if period_filter:
            conditions.append(period_filter)
        
        # Scope filter - use the 'scope' field (scope1, scope2, scope3)
        scope_value = RecordChecker._get_scope_value(subcategory)
        if scope_value:
            conditions.append({"scope": scope_value})
        
        # Category filter - get granular categories for scope
        search_categories = RecordChecker._get_search_categories(category, subcategory)
        if search_categories:
            category_filter = RecordChecker._build_category_filter(search_categories)
            if category_filter:
                conditions.append(category_filter)
        
        if not conditions:
            return {}
        
        return {"$and": conditions}
    
    @staticmethod
    def _build_emission_period_filter(period: Dict[str, Any]) -> Optional[Dict]:
        """
        Build period filter specifically for emission_records.
        emission_records uses string format: "2026-07", "2025-12"
        """
        year = period.get("year")
        month = period.get("month")
        period_string = period.get("string", "")
        
        variants = []
        
        # Add the string representation directly
        if period_string:
            variants.append(period_string)
        
        # Add year-month variants
        if year and month:
            variants.extend([
                f"{year}-{month:02d}",
                f"{year}-{month}",
            ])
        
        if not variants:
            return None
        
        # Remove duplicates
        variants = list(set(variants))
        return {"reporting_period": {"$in": variants}}
    
    @staticmethod
    def _build_standard_query_with_subcategory(
        org_id: str,
        category: str,
        subcategory: Optional[str],
        facility_id: Optional[str],
        period: Dict[str, Any],
    ) -> Dict:
        """Build MongoDB query for standard records (environment, social, governance).
        
        Standard records have separate 'category' and 'subcategory' fields.
        For example: category='Water', subcategory='Discharge'
        """
        
        # Organization filter - handle both org_id and organization_id
        org_filter = {
            "$or": [
                {"org_id": org_id},
                {"organization_id": org_id},
            ]
        }
        
        # Current record filter - handle None as current
        current_filter = {
            "$or": [
                {"is_current": True},
                {"is_current": {"$exists": False}},
                {"is_current": None},
            ]
        }
        
        # Period filter
        period_filter = RecordChecker._build_standard_period_filter(period)
        
        # Category and Subcategory filters - search actual fields, not mapped categories
        # Standard records have: category='Water', subcategory='Discharge'
        category_filter = {"category": {"$regex": f"^{re.escape(category)}$", "$options": "i"}} if category else None
        subcategory_filter = {"subcategory": {"$regex": f"^{re.escape(subcategory)}$", "$options": "i"}} if subcategory else None
        
        # Facility filter
        if facility_id:
            facility_filter = {"facility_id": facility_id}
        else:
            facility_filter = {
                "$or": [
                    {"facility_id": {"$exists": False}},
                    {"facility_id": None},
                    {"facility_id": ""},
                ]
            }
        
        # Combine all filters
        query = {"$and": [org_filter, current_filter, facility_filter]}
        
        if period_filter:
            query["$and"].append(period_filter)
        
        if category_filter:
            query["$and"].append(category_filter)
        
        if subcategory_filter:
            query["$and"].append(subcategory_filter)
        
        return query
    
    @staticmethod
    def _get_search_categories(category: str, subcategory: Optional[str]) -> List[str]:
        """
        Get list of categories to search for.
        Maps GHG Emissions subcategories to actual emission record categories.
        """
        sub_lower = (subcategory or "").lower()
        
        # Check for Scope mappings
        for scope_key, scope_categories in SCOPE_CATEGORY_MAP.items():
            if scope_key in sub_lower:
                return scope_categories
        
        # Return original category/subcategory
        if subcategory:
            return [subcategory]
        return [category] if category else []
    
    @staticmethod
    def _build_standard_period_filter(period: Dict[str, Any]) -> Optional[Dict]:
        """
        Build period filter for standard records (environment, social, governance).
        These use object format: {year: 2026, month: "October"}
        """
        year = period.get("year")
        month = period.get("month")
        quarter = period.get("quarter")
        period_string = period.get("string", "")
        
        conditions = []
        
        # String format match (fallback)
        if period_string:
            string_variants = [period_string]
            if month:
                string_variants.extend([
                    f"{year}-{month:02d}",
                    f"{year}-{month}",
                ])
            if year:
                next_year = year + 1
                string_variants.extend([
                    f"FY {year}-{str(next_year)[-2:]}",
                    f"FY{year}-{str(next_year)[-2:]}",
                    f"FY {year-1}-{str(year)[-2:]}",
                ])
            conditions.append({"reporting_period": {"$in": string_variants}})
        
        # Object format match (primary for environment_records)
        if year:
            year_variants = [year, str(year)]
            year_condition = {"reporting_period.year": {"$in": year_variants}}
            
            if month:
                month_variants = RecordChecker._get_month_variants(month)
                month_condition = {"reporting_period.month": {"$in": month_variants}}
                conditions.append({"$and": [year_condition, month_condition]})
            elif quarter:
                quarter_variants = [quarter, str(quarter), f"Q{quarter}"]
                quarter_condition = {"reporting_period.quarter": {"$in": quarter_variants}}
                conditions.append({"$and": [year_condition, quarter_condition]})
            else:
                conditions.append(year_condition)
        
        if not conditions:
            return None
        
        return {"$or": conditions}
    
    @staticmethod
    def _get_month_variants(month: int) -> List:
        """Get all possible representations of a month number."""
        variants = [month, str(month), f"{month:02d}"]
        
        if 1 <= month <= 12:
            variants.append(MONTH_NAMES[month - 1])
            variants.append(MONTH_NAMES[month - 1].capitalize())
            variants.append(MONTH_ABBREV[month - 1])
            variants.append(MONTH_ABBREV[month - 1].capitalize())
        
        return variants
    
    @staticmethod
    def _build_category_filter(categories: List[str]) -> Optional[Dict]:
        """Build category filter with regex for case-insensitive matching."""
        if not categories:
            return None
        
        if len(categories) == 1:
            return {"category": {"$regex": f"^{re.escape(categories[0])}$", "$options": "i"}}
        
        # Multiple categories (for Scope mappings)
        return {
            "$or": [
                {"category": {"$regex": f"^{re.escape(cat)}$", "$options": "i"}}
                for cat in categories
            ]
        }
    
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
        periods: List[Dict],
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
                    due_date = PeriodGenerator.get_due_date(period, due_day)
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
        periods: List[Dict],
        due_day: int = 15,
    ) -> ProgressResult:
        """
        Calculate organization-level progress.
        
        Logic:
        - If org-level record exists for a period → 1 task completed
        - If NO org-level record exists:
          - Check if ANY facility-level records exist for this category/subcategory
          - If NO facility records exist → count as 1 task (pending org-level entry)
          - If facility records DO exist → expand to facility count
        """
        result = ProgressResult()
        now = datetime.now(timezone.utc)
        
        # First, check if ANY facility-level records exist for this category/subcategory
        # This determines whether we should use facility-level counting when org record is missing
        has_any_facility_records = False
        for facility in facilities:
            for period in periods:
                has_fac_data, _ = await RecordChecker.check_exists(
                    org_id, category, subcategory, facility.get("id"), period
                )
                if has_fac_data:
                    has_any_facility_records = True
                    break
            if has_any_facility_records:
                break
        
        for period in periods:
            # Check org-level record first
            has_org_record, org_date = await RecordChecker.check_exists(
                org_id, category, subcategory, None, period
            )
            
            if has_org_record:
                # Org-level record exists - count as 1 task completed
                result.total += 1
                result.completed += 1
                if org_date and (not result.last_updated or org_date > result.last_updated):
                    result.last_updated = org_date
            elif has_any_facility_records:
                # No org record, but facility-level reporting is being used
                # Expand to require all facilities
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
                
                due_date = PeriodGenerator.get_due_date(period, due_day)
                if due_date and due_date < now:
                    result.overdue += remaining
                else:
                    result.pending += remaining
                
                if period_last_updated and (not result.last_updated or period_last_updated > result.last_updated):
                    result.last_updated = period_last_updated
            else:
                # No org record and no facility records exist - just 1 pending org-level task
                result.total += 1
                due_date = PeriodGenerator.get_due_date(period, due_day)
                if due_date and due_date < now:
                    result.overdue += 1
                else:
                    result.pending += 1
        
        return result


# ============================================================================
# MAIN ENGINE
# ============================================================================

class ProgressCalculationEngine:
    """Main orchestrator for progress calculation."""
    
    def __init__(self):
        self._assignments = db["esg_assignments"]
        self._facilities = db["facilities"]
    
    async def get_assignment_progress(self, assignment_id: str) -> Dict[str, Any]:
        """Get progress for a single assignment."""
        assignment = await self._assignments.find_one({"id": assignment_id}, {"_id": 0})
        
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
        query = {"organization_id": organization_id, "category": category}
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
    return await get_progress_engine().get_category_progress(organization_id, category, subcategory)


async def get_bulk_progress(
    organization_id: str,
    categories: List[Dict[str, str]],
) -> Dict[str, Dict[str, Any]]:
    """Get progress for multiple categories."""
    return await get_progress_engine().get_bulk_progress(organization_id, categories)
