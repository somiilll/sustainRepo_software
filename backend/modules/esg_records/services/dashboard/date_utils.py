"""
Shared date filter builder for dashboard services.
Generates MongoDB $or conditions that match records of ANY reporting_period type
(monthly, daily/weekly, quarterly, yearly FY/CY) within a given date range.
"""
from typing import List, Dict


def build_date_filter(start_date: str, end_date: str) -> List[Dict]:
    """
    Build date filter conditions for all reporting_period types.

    Args:
        start_date: "YYYY-MM" e.g. "2025-04"
        end_date:   "YYYY-MM" e.g. "2026-03"

    Returns:
        List of MongoDB query dicts to be used inside {"$or": conditions}
    """
    try:
        start_year, start_month = int(start_date[:4]), int(start_date[5:7])
        end_year, end_month = int(end_date[:4]), int(end_date[5:7])

        months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]

        conditions: List[Dict] = []

        # --- 1. Monthly: year + month (name or numeric string) ---
        for year in range(start_year, end_year + 1):
            for mi in range(1, 13):
                if year == start_year and mi < start_month:
                    continue
                if year == end_year and mi > end_month:
                    continue
                conditions.append({
                    "reporting_period.year": year,
                    "reporting_period.month": {"$in": [months[mi - 1], str(mi)]},
                })

        # --- 2. Daily / Weekly: date string falls within range ---
        range_start = f"{start_year}-{str(start_month).zfill(2)}-01"
        if end_month == 12:
            range_end = f"{end_year + 1}-01-01"
        else:
            range_end = f"{end_year}-{str(end_month + 1).zfill(2)}-01"
        conditions.append({
            "reporting_period.date": {"$gte": range_start, "$lt": range_end},
        })

        # --- 3. Quarterly: year + quarter where quarter overlaps range ---
        for year in range(start_year, end_year + 1):
            for q in range(1, 5):
                q_start = (q - 1) * 3 + 1   # Q1→1, Q2→4, Q3→7, Q4→10
                q_end = q * 3               # Q1→3, Q2→6, Q3→9, Q4→12
                if year == start_year and q_end < start_month:
                    continue
                if year == end_year and q_start > end_month:
                    continue
                conditions.append({
                    "reporting_period.year": year,
                    "reporting_period.quarter": f"Q{q}",
                })

        # --- 4. Yearly — Financial Year ---
        # "FY 2025-2026" or "FY 2025-26" covers Apr 2025 – Mar 2026.
        for year in range(start_year - 1, end_year + 1):
            fy_full = f"FY {year}-{year + 1}"
            fy_short = f"FY {year}-{str(year + 1)[-2:]}"
            conditions.append({
                "reporting_period.financial_year": {"$in": [fy_full, fy_short]},
            })

        # --- 5. Yearly — Calendar Year or plain year ---
        for year in range(start_year, end_year + 1):
            conditions.append({
                "reporting_period.calendar_year": f"CY {year}",
            })
            # Yearly records that only have year (no financial_year/calendar_year)
            conditions.append({
                "reporting_period.reporting_type": "yearly",
                "reporting_period.year": year,
                "reporting_period.financial_year": None,
                "reporting_period.calendar_year": None,
            })

        return conditions
    except (TypeError, ValueError, IndexError):
        return []
