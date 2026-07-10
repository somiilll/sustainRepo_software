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
    
    The reporting_period field in records has structure:
    {
        "reporting_type": "monthly" | "quarterly" | "yearly" | "daily",
        "year": 2026,
        "month": 6,  # for monthly
        "quarter": 2,  # for quarterly
        "date": "2026-06-15",  # for daily records
    }
    
    Note: Daily records may not have 'year' populated - they store date in 
    'reporting_period.date'. This function handles both cases.
    
    Args:
        year: Filter by year
        month: Filter by month (1-12)
        quarter: Filter by quarter (1-4)
        start_date: Start date for range filter (ISO format)
        end_date: End date for range filter (ISO format)
        reporting_type: Filter by reporting type
        
    Returns:
        MongoDB filter dict for reporting_period
    """
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
        # For month filter, also handle daily records
        if year is not None:
            month_str = f"{month:02d}"  # Pad to 2 digits
            year_str = str(year)
            # Update $or to include month matching
            filters["$or"] = [
                {"reporting_period.year": year, "reporting_period.month": month},
                # Match daily records: date like "2026-07-*"
                {"reporting_period.date": {"$regex": f"^{year_str}-{month_str}"}}
            ]
        else:
            filters["reporting_period.month"] = month
        
    if quarter is not None:
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
    
    Args:
        record: The ESG record document
        field_key: The key to extract
        
    Returns:
        The field value, or None if not found
    """
    # First check root-level fields
    if field_key in record:
        return record.get(field_key)
    
    # Then check field_values
    field_values = record.get("field_values", {})
    if field_values:
        return field_values.get(field_key)
    
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
