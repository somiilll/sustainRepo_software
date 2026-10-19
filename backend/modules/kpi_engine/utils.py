"""
KPI Engine - Utility Functions

Helper functions for the KPI calculation engine.
"""

from typing import Any, Dict, Optional
from datetime import datetime


# Collection mapping by section
SECTION_COLLECTIONS = {
    "environment": "environment_records",
    "social": "social_records",
    "governance": "governance_records",
}


def get_collection_for_section(section: str) -> str:
    """
    Get the MongoDB collection name for a given ESG section.
    
    Args:
        section: ESG section (environment, social, governance)
        
    Returns:
        Collection name string
        
    Raises:
        ValueError: If section is not recognized
    """
    section_lower = section.lower()
    if section_lower not in SECTION_COLLECTIONS:
        raise ValueError(f"Unknown section: {section}. Must be one of: {list(SECTION_COLLECTIONS.keys())}")
    return SECTION_COLLECTIONS[section_lower]


def build_period_filter(
    year: Optional[int] = None,
    month: Optional[int] = None,
    quarter: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    reporting_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a MongoDB filter for reporting period.
    
    The reporting_period field in records has varying structures:
    - Monthly: {reporting_type: "monthly", year: 2026, month: "June" (STRING)}
    - Quarterly: {reporting_type: "quarterly", year: 2026, quarter: 2}
    - Yearly: {reporting_type: "yearly", year: 2026}
    - Daily: {reporting_type: "daily", date: "2026-07-05", year: null, month: null}
    
    This function handles all variations including:
    - Daily records that don't populate year/month fields
    - Monthly records that store month as string name instead of integer
    
    Args:
        year: Filter by year (integer)
        month: Filter by month (1-12 integer)
        quarter: Filter by quarter (1-4)
        start_date: Start date for range filter (ISO format)
        end_date: End date for range filter (ISO format)
        reporting_type: Filter by reporting type
        
    Returns:
        MongoDB filter dict for reporting_period
    """
    # Month number to name mapping
    MONTH_NAMES = {
        1: "January", 2: "February", 3: "March", 4: "April",
        5: "May", 6: "June", 7: "July", 8: "August",
        9: "September", 10: "October", 11: "November", 12: "December"
    }
    
    # Quarter to months mapping
    QUARTER_MONTHS = {
        1: [1, 2, 3],
        2: [4, 5, 6],
        3: [7, 8, 9],
        4: [10, 11, 12]
    }
    
    filters = {}
    
    # Handle year filter - must also match daily records where year is in date field
    if year is not None:
        year_str = str(year)
        # Match either:
        # 1. reporting_period.year = 2026 (monthly/quarterly/yearly records)
        # 2. reporting_period.date starts with "2026" (daily records)
        filters["$or"] = [
            {"reporting_period.year": year},
            {"reporting_period.date": {"$regex": f"^{year_str}"}}
        ]
        
    if month is not None:
        month_str = f"{month:02d}"  # Pad to 2 digits for date matching
        month_name = MONTH_NAMES.get(month, "")
        
        if year is not None:
            year_str = str(year)
            # Match:
            # 1. Monthly records with month as integer
            # 2. Monthly records with month as string name
            # 3. Daily records with date matching year-month pattern
            filters["$or"] = [
                {"reporting_period.year": year, "reporting_period.month": month},
                {"reporting_period.year": year, "reporting_period.month": month_name},
                {"reporting_period.date": {"$regex": f"^{year_str}-{month_str}"}}
            ]
        else:
            # Match month as integer or string name
            filters["$or"] = [
                {"reporting_period.month": month},
                {"reporting_period.month": month_name}
            ]
        
    if quarter is not None:
        if year is not None:
            year_str = str(year)
            quarter_months = QUARTER_MONTHS.get(quarter, [])
            month_names = [MONTH_NAMES[m] for m in quarter_months]
            month_strs = [f"{m:02d}" for m in quarter_months]
            
            # Match:
            # 1. Quarterly records with quarter number
            # 2. Monthly records with month in that quarter (integer)
            # 3. Monthly records with month in that quarter (string name)
            # 4. Daily records with date in that quarter
            or_conditions = [
                {"reporting_period.year": year, "reporting_period.quarter": quarter},
                {"reporting_period.year": year, "reporting_period.month": {"$in": quarter_months}},
                {"reporting_period.year": year, "reporting_period.month": {"$in": month_names}},
            ]
            # Add daily record patterns for each month in quarter
            for ms in month_strs:
                or_conditions.append({"reporting_period.date": {"$regex": f"^{year_str}-{ms}"}})
            
            # Merge with existing $or if present
            if "$or" in filters:
                # Create an $and to combine year filter with quarter filter
                filters = {"$and": [{"$or": filters["$or"]}, {"$or": or_conditions}]}
            else:
                filters["$or"] = or_conditions
        else:
            filters["reporting_period.quarter"] = quarter
        
    if reporting_type is not None:
        filters["reporting_period.reporting_type"] = reporting_type
        
    # Date range filtering
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date
        if date_filter:
            filters["reporting_period.date"] = date_filter
            
    return filters


def build_scope_filter(
    org_id: str,
    scope_type: str = "organization",
    facility_ids: Optional[list] = None,
) -> Dict[str, Any]:
    """
    Build a MongoDB filter for scope (organization or facility level).
    
    Args:
        org_id: Organization ID (required)
        scope_type: "organization" or "facility"
        facility_ids: List of facility IDs (required if scope_type is "facility")
        
    Returns:
        MongoDB filter dict
    """
    filters = {"org_id": org_id, "is_current": True}
    
    if scope_type == "facility" and facility_ids:
        if len(facility_ids) == 1:
            filters["facility_id"] = facility_ids[0]
        else:
            filters["facility_id"] = {"$in": facility_ids}
    elif scope_type == "organization":
        # Organization level - can include records with or without facility
        pass
        
    return filters


def extract_field_value(record: Dict[str, Any], field_key: str) -> Any:
    """
    Extract a field value from a record.
    
    Checks in this order:
    1. Root-level record fields (category, subcategory, facility_id, etc.)
    2. field_values nested object
    """
    if field_key in record:
        return record.get(field_key)
    field_values = record.get("field_values", {})
    if field_values:
        return field_values.get(field_key)
    return None


def extract_field_unit(record: Dict[str, Any], field_key: str) -> Optional[str]:
    """
    Extract the unit for a field from a record.
    Looks for {field_key}_unit in field_values.
    """
    field_values = record.get("field_values", {})
    if field_values:
        return field_values.get(f"{field_key}_unit")
    return None


def parse_numeric_value(value: Any) -> Optional[float]:
    """
    Parse a value to a numeric float.
    Handles strings, integers, floats.
    
    Args:
        value: The value to parse
        
    Returns:
        Float value or None if not parseable
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            # Remove commas and whitespace
            cleaned = value.replace(",", "").strip()
            return float(cleaned)
        except (ValueError, TypeError):
            return None
    return None


def format_result(
    value: Any,
    unit: Optional[str] = None,
    record_count: int = 0,
    aggregation_type: str = "sum",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Format a calculation result in a standard structure.
    
    Args:
        value: The calculated value
        unit: Unit of measurement
        record_count: Number of records used in calculation
        aggregation_type: Type of aggregation performed
        metadata: Additional metadata
        
    Returns:
        Standardized result dict
    """
    return {
        "value": value,
        "unit": unit,
        "record_count": record_count,
        "aggregation_type": aggregation_type,
        "calculated_at": datetime.utcnow().isoformat(),
        "metadata": metadata or {},
    }
