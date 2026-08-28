"""
Data Coverage Service for ESG Records

Tracks which reporting periods have data submitted vs missing
based on filling frequency assignments.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from enum import Enum
from motor.motor_asyncio import AsyncIOMotorDatabase


class FillingFrequency(str, Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    HALF_YEARLY = "half_yearly"
    YEARLY = "yearly"
    ONE_TIME = "one_time"


class PeriodStatus(str, Enum):
    COMPLETE = "complete"       # Has data submitted
    MISSING = "missing"         # Past due, no data
    OVERDUE = "overdue"         # Past due date, no data
    DUE_SOON = "due_soon"       # Due within 7 days
    UPCOMING = "upcoming"       # Future period
    NOT_STARTED = "not_started" # Current period, no data yet


def generate_periods_for_frequency(
    frequency: str,
    reporting_year: str,
    year_type: str = "financial_year",
    assignment_start_date: Optional[datetime] = None,
    assignment_end_date: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """
    Generate list of periods based on filling frequency for a reporting year.
    
    Args:
        frequency: daily, weekly, monthly, quarterly, half_yearly, yearly
        reporting_year: e.g., "FY 2025-2026", "CY 2026", "2026"
        year_type: financial_year or calendar_year
        assignment_start_date: Optional custom start date (overrides reporting year start)
        assignment_end_date: Optional custom end date (must not exceed reporting year end)
    
    Returns:
        List of period dicts with: period_key, period_label, start_date, end_date, due_date
    """
    periods = []
    
    # Parse reporting year to get start/end dates
    if reporting_year.startswith("FY"):
        # Financial Year: FY 2025-2026 -> Apr 2025 to Mar 2026
        parts = reporting_year.replace("FY ", "").split("-")
        start_year = int(parts[0])
        ry_start_date = datetime(start_year, 4, 1)  # April 1
        ry_end_date = datetime(start_year + 1, 3, 31)  # March 31
    elif reporting_year.startswith("CY"):
        # Calendar Year: CY 2026 -> Jan 2026 to Dec 2026
        year = int(reporting_year.replace("CY ", "").replace("CY", ""))
        ry_start_date = datetime(year, 1, 1)
        ry_end_date = datetime(year, 12, 31)
    else:
        # Assume calendar year
        year = int(reporting_year)
        ry_start_date = datetime(year, 1, 1)
        ry_end_date = datetime(year, 12, 31)
    
    # Apply custom start/end dates if provided
    start_date = ry_start_date
    end_date = ry_end_date
    
    if assignment_start_date:
        # Use assignment start date but not before reporting year start
        if isinstance(assignment_start_date, str):
            try:
                assignment_start_date = datetime.fromisoformat(assignment_start_date.replace('Z', '+00:00')).replace(tzinfo=None)
            except (TypeError, ValueError):
                assignment_start_date = None
        if assignment_start_date:
            start_date = max(ry_start_date, assignment_start_date)
    
    if assignment_end_date:
        # Use assignment end date but not after reporting year end
        if isinstance(assignment_end_date, str):
            try:
                assignment_end_date = datetime.fromisoformat(assignment_end_date.replace('Z', '+00:00')).replace(tzinfo=None)
            except (TypeError, ValueError):
                assignment_end_date = None
        if assignment_end_date:
            end_date = min(ry_end_date, assignment_end_date)
    
    if frequency == FillingFrequency.YEARLY or frequency == FillingFrequency.ONE_TIME:
        periods.append({
            "period_key": reporting_year,
            "period_label": reporting_year,
            "start_date": start_date,
            "end_date": end_date,
            "due_date": end_date + timedelta(days=15),  # 15 days after year end
        })
    
    elif frequency == FillingFrequency.HALF_YEARLY:
        # H1 and H2
        mid_date = start_date + timedelta(days=182)
        periods.append({
            "period_key": f"{reporting_year}-H1",
            "period_label": "H1 (Apr-Sep)" if reporting_year.startswith("FY") else "H1 (Jan-Jun)",
            "start_date": start_date,
            "end_date": mid_date - timedelta(days=1),
            "due_date": mid_date + timedelta(days=15),
        })
        periods.append({
            "period_key": f"{reporting_year}-H2",
            "period_label": "H2 (Oct-Mar)" if reporting_year.startswith("FY") else "H2 (Jul-Dec)",
            "start_date": mid_date,
            "end_date": end_date,
            "due_date": end_date + timedelta(days=15),
        })
    
    elif frequency == FillingFrequency.QUARTERLY:
        # Q1, Q2, Q3, Q4
        if reporting_year.startswith("FY"):
            quarters = [
                ("Q1", 4, 6, "Apr-Jun"),
                ("Q2", 7, 9, "Jul-Sep"),
                ("Q3", 10, 12, "Oct-Dec"),
                ("Q4", 1, 3, "Jan-Mar"),
            ]
            for q_name, start_month, end_month, label in quarters:
                if q_name == "Q4":
                    q_start = datetime(start_date.year + 1, start_month, 1)
                    q_end = datetime(start_date.year + 1, end_month, 31)
                else:
                    q_start = datetime(start_date.year, start_month, 1)
                    # Get last day of end month
                    if end_month == 12:
                        q_end = datetime(start_date.year, 12, 31)
                    else:
                        q_end = datetime(start_date.year, end_month + 1, 1) - timedelta(days=1)
                
                periods.append({
                    "period_key": f"{reporting_year}-{q_name}",
                    "period_label": f"{q_name} ({label})",
                    "start_date": q_start,
                    "end_date": q_end,
                    "due_date": q_end + timedelta(days=15),
                })
        else:
            # Calendar year quarters
            year = start_date.year
            quarters = [
                ("Q1", 1, 3, "Jan-Mar"),
                ("Q2", 4, 6, "Apr-Jun"),
                ("Q3", 7, 9, "Jul-Sep"),
                ("Q4", 10, 12, "Oct-Dec"),
            ]
            for q_name, start_month, end_month, label in quarters:
                q_start = datetime(year, start_month, 1)
                if end_month == 12:
                    q_end = datetime(year, 12, 31)
                else:
                    q_end = datetime(year, end_month + 1, 1) - timedelta(days=1)
                
                periods.append({
                    "period_key": f"{reporting_year}-{q_name}",
                    "period_label": f"{q_name} ({label})",
                    "start_date": q_start,
                    "end_date": q_end,
                    "due_date": q_end + timedelta(days=15),
                })
    
    elif frequency == FillingFrequency.MONTHLY:
        # 12 months
        if reporting_year.startswith("FY"):
            # FY: Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar
            months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
            year = start_date.year
            for i, month in enumerate(months):
                if month <= 3:
                    m_year = year + 1
                else:
                    m_year = year
                
                m_start = datetime(m_year, month, 1)
                if month == 12:
                    m_end = datetime(m_year, 12, 31)
                else:
                    m_end = datetime(m_year, month + 1, 1) - timedelta(days=1)
                
                month_name = m_start.strftime("%b %Y")
                periods.append({
                    "period_key": f"{m_year}-{month:02d}",
                    "period_label": month_name,
                    "start_date": m_start,
                    "end_date": m_end,
                    "due_date": m_end + timedelta(days=10),  # 10 days after month end
                })
        else:
            # Calendar year: Jan to Dec
            year = start_date.year
            for month in range(1, 13):
                m_start = datetime(year, month, 1)
                if month == 12:
                    m_end = datetime(year, 12, 31)
                else:
                    m_end = datetime(year, month + 1, 1) - timedelta(days=1)
                
                month_name = m_start.strftime("%b %Y")
                periods.append({
                    "period_key": f"{year}-{month:02d}",
                    "period_label": month_name,
                    "start_date": m_start,
                    "end_date": m_end,
                    "due_date": m_end + timedelta(days=10),
                })
    
    elif frequency == FillingFrequency.WEEKLY:
        # Generate weeks (limit to reasonable number)
        current = start_date
        week_num = 1
        while current <= end_date and week_num <= 53:
            week_end = min(current + timedelta(days=6), end_date)
            periods.append({
                "period_key": f"{reporting_year}-W{week_num:02d}",
                "period_label": f"Week {week_num} ({current.strftime('%d %b')} - {week_end.strftime('%d %b')})",
                "start_date": current,
                "end_date": week_end,
                "due_date": week_end + timedelta(days=3),  # 3 days after week end
            })
            current = week_end + timedelta(days=1)
            week_num += 1
    
    elif frequency == FillingFrequency.DAILY:
        # Generate daily periods from start_date to min(end_date, today)
        today = datetime.now()
        current = start_date
        # Limit to today (don't show future days as overdue)
        effective_end = min(end_date, today)
        
        while current <= effective_end:
            periods.append({
                "period_key": current.strftime("%Y-%m-%d"),
                "period_label": current.strftime("%d %b"),
                "start_date": current,
                "end_date": current,
                "due_date": current + timedelta(days=1),
            })
            current += timedelta(days=1)
    
    return periods


async def get_data_coverage(
    db: AsyncIOMotorDatabase,
    organization_id: str,
    category: str,
    subcategory: Optional[str],
    sub_subcategory: Optional[str],
    filling_frequency: str,
    reporting_year: str,
    year_type: str = "financial_year",
    facility_id: Optional[str] = None,
    assignment_start_date: Optional[str] = None,
    assignment_end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get data coverage for a category assignment.
    
    Returns which periods have data submitted vs missing.
    
    Args:
        assignment_start_date: Custom start date for period generation (ISO format)
        assignment_end_date: Custom end date for period generation (ISO format)
    """
    # Generate expected periods with custom date range if provided
    periods = generate_periods_for_frequency(
        filling_frequency, 
        reporting_year, 
        year_type,
        assignment_start_date=assignment_start_date,
        assignment_end_date=assignment_end_date,
    )
    
    if not periods:
        return {
            "periods": [],
            "summary": {
                "total": 0,
                "complete": 0,
                "missing": 0,
                "overdue": 0,
                "upcoming": 0,
            }
        }
    
    # Build query for existing records
    query = {
        "organization_id": organization_id,
        "category": category,
    }
    if subcategory:
        query["subcategory"] = subcategory
    if sub_subcategory:
        query["sub_subcategory"] = sub_subcategory
    if facility_id:
        query["facility_id"] = facility_id
    
    # Get all records for this category
    records = await db["esg_records"].find(
        query,
        {"_id": 0, "reporting_period": 1, "reporting_type": 1, "record_date": 1, "created_at": 1}
    ).to_list(1000)
    
    # Build a set of periods that have data
    # Records can have various reporting_period formats
    existing_periods = set()
    for record in records:
        rp = record.get("reporting_period", "")
        rt = record.get("reporting_type", "")
        rd = record.get("record_date")
        
        # Try to match record to a period
        if rt == "monthly" and rd:
            if isinstance(rd, str):
                try:
                    rd = datetime.fromisoformat(rd.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    pass
            if isinstance(rd, datetime):
                existing_periods.add(f"{rd.year}-{rd.month:02d}")
        elif rt == "quarterly":
            existing_periods.add(rp)
        elif rt == "yearly":
            existing_periods.add(rp)
        elif rp:
            existing_periods.add(rp)
    
    # Determine status for each period
    now = datetime.now()
    result_periods = []
    summary = {
        "total": len(periods),
        "complete": 0,
        "missing": 0,
        "overdue": 0,
        "due_soon": 0,
        "upcoming": 0,
    }
    
    for period in periods:
        period_key = period["period_key"]
        due_date = period["due_date"]
        end_date = period["end_date"]
        
        has_data = period_key in existing_periods
        
        if has_data:
            status = PeriodStatus.COMPLETE
            summary["complete"] += 1
        elif end_date > now:
            status = PeriodStatus.UPCOMING
            summary["upcoming"] += 1
        elif due_date < now:
            status = PeriodStatus.OVERDUE
            summary["overdue"] += 1
            summary["missing"] += 1
        elif (due_date - now).days <= 7:
            status = PeriodStatus.DUE_SOON
            summary["missing"] += 1
        else:
            status = PeriodStatus.MISSING
            summary["missing"] += 1
        
        result_periods.append({
            "period_key": period_key,
            "period_label": period["period_label"],
            "start_date": period["start_date"].isoformat(),
            "end_date": period["end_date"].isoformat(),
            "due_date": due_date.isoformat(),
            "has_data": has_data,
            "status": status.value,
            "days_until_due": (due_date - now).days if due_date > now else -(now - due_date).days,
        })
    
    return {
        "periods": result_periods,
        "summary": summary,
        "filling_frequency": filling_frequency,
        "reporting_year": reporting_year,
    }
