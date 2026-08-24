"""Phase B7: Dashboards router.

Two endpoints:
  - GET /dashboard/stats           -> /api/dashboard/stats
  - GET /dashboard/supplier-hotspots -> /api/dashboard/supplier-hotspots

Lifted verbatim from legacy server.py. Behaviour byte-identical:
proration logic, scope-aware queries, supplier-hotspots aggregation,
all helpers (extract_year_from_period, calculate_proration_factor,
should_include_emission, etc.) preserved as nested functions.
"""
from datetime import datetime, timezone
from typing import List, Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, Query, HTTPException

from modules.auth.dependencies import get_current_user
from modules.dashboards.contracts import DashboardStats
from modules.emissions.contracts import EmissionRecordResponse
from shared.database.mongo import db
from modules.dashboards.esg_analytics_service import get_esg_analytics
from modules.dashboards.environment_detail_service import get_environment_detail
from modules.dashboards.social_detail_service import get_social_detail
from modules.dashboards.governance_detail_service import get_governance_detail
router = APIRouter()


@router.get("/dashboard/governance-detail")
async def get_dashboard_governance_detail(
    start_date: str,
    end_date: str,
    facility_ids: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Governance KPIs and trends: AP days, breaches, violations, corruption, anti-competitive."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization")
    selected_facilities = [item.strip() for item in facility_ids.split(",") if item.strip()] if facility_ids else None
    return await get_governance_detail(db, org_id, start_date, end_date, selected_facilities)


@router.get("/dashboard/social-detail")
async def get_dashboard_social_detail(
    start_date: str,
    end_date: str,
    facility_ids: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Detailed social breakdown: workforce, diversity, training, complaints, safety."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization")
    selected_facilities = [item.strip() for item in facility_ids.split(",") if item.strip()] if facility_ids else None
    return await get_social_detail(db, org_id, start_date, end_date, selected_facilities)


@router.get("/dashboard/environment-detail")
async def get_dashboard_environment_detail(
    start_date: str,
    end_date: str,
    facility_ids: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Detailed environment breakdown: scope sub-categories, hotspots, water sources, waste types."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization")
    selected_facilities = [item.strip() for item in facility_ids.split(",") if item.strip()] if facility_ids else None
    return await get_environment_detail(db, org_id, start_date, end_date, selected_facilities)


@router.get("/dashboard/esg-analytics")
async def get_dashboard_esg_analytics(
    start_date: str,
    end_date: str,
    facility_ids: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Return live, filter-aware time series for the Executive ESG dashboard."""
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization")
    selected_facilities = [item.strip() for item in facility_ids.split(",") if item.strip()] if facility_ids else None
    return await get_esg_analytics(db, org_id, start_date, end_date, selected_facilities)


# Dashboard endpoints
@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    start_period: Optional[str] = None,
    end_period: Optional[str] = None,
    facility_id: List[str] = Query(default=[])
):
    can_view_scope3 = current_user.get("role") == "super_admin"
    # Track organization for equity share calculations
    organization = None
    use_equity_share = False
    facility_equity_map = {}  # facility_id -> equity percentage (as decimal)
    org_id = None  # Initialize org_id for all user types
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
        emissions_query = {"facility_id": {"$in": facility_ids}}
        # For super_admin, try to get org_id from first facility
        if facilities:
            org_id = facilities[0].get("organization_id")
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            # Admin without organization - return empty stats
            return DashboardStats(
                total_facilities=0,
                total_emissions=0,
                scope1_emissions=0,
                scope2_emissions=0,
                biogenic_emissions=0,
                recent_records=[],
                emissions_by_facility=[],
                emissions_trend=[],
                emissions_by_category=[],
                emissions_by_fuel=[],
                yearly_fuel_analysis=[],
                yearly_facility_analysis=[],
                monthly_comparison=[],
                sinks_total=0,
                sinks_by_facility=[]
            )
        
        # Get organization to check for equity share approach
        organization = await db.organizations.find_one({"id": org_id}, {"_id": 0})
        from modules.entitlements.service import entitlement_access_map, resolve_entitlement_config
        can_view_scope3 = entitlement_access_map(
            await resolve_entitlement_config(org_id, migrate=True)
        ).get("environment.ghg.scope_3", False)
        if organization and organization.get("org_boundaries_approach") == "equity_share":
            use_equity_share = True
        
        facilities = await db.facilities.find(
            {"organization_id": org_id},
            {"_id": 0}
        ).to_list(1000)
        
        # Build facility equity map
        for f in facilities:
            equity_pct = f.get("equity_share_percentage", 100.0) or 100.0
            facility_equity_map[f["id"]] = equity_pct / 100.0  # Convert to decimal
        
        facility_ids = [f["id"] for f in facilities]
        emissions_query = {"facility_id": {"$in": facility_ids}}
    else:  # user - Dashboards use KPI access; for now return empty for users without KPI assignments
        # Users access dashboards through KPI-based filtering, not assigned_facilities
        # Return empty data - frontend should handle this appropriately
        return DashboardStats(
            total_facilities=0,
            total_emissions=0,
            scope1_emissions=0,
            scope2_emissions=0,
            biogenic_emissions=0,
            recent_records=[],
            emissions_by_facility=[],
            emissions_trend=[],
            emissions_by_category=[],
            emissions_by_fuel=[],
            yearly_fuel_analysis=[],
            yearly_facility_analysis=[],
            monthly_comparison=[],
            sinks_total=0,
            sinks_by_facility=[]
        )
    
    # Apply date range filter if provided
    # We need to handle both monthly (YYYY-MM) and yearly (FY YYYY-YY, CY YYYY) formats
    # For MongoDB query, we'll fetch all records first and then filter in Python
    # to properly handle yearly records that fall within the date range
    date_filter_start = start_period  # e.g., "2025-04"
    date_filter_end = end_period      # e.g., "2026-03"
    
    # For MongoDB query, only apply filter for monthly format records
    # Yearly records will be filtered after fetching
    if start_period or end_period:
        # Create an OR condition to include:
        # 1. Monthly records in the date range
        # 2. All yearly records (we'll filter them in Python)
        monthly_filter = {}
        if start_period:
            monthly_filter["$gte"] = start_period
        if end_period:
            monthly_filter["$lte"] = end_period
        
        # Query: (monthly records in range) OR (yearly records - filtered later)
        emissions_query["$or"] = [
            {"reporting_period": monthly_filter},
            {"reporting_period": {"$regex": "^(FY |CY)"}},  # Include all yearly records
        ]
    
    # Apply facility filter if provided (supports multiple facility IDs)
    if facility_id and len(facility_id) > 0:
        emissions_query["facility_id"] = {"$in": facility_id}
        # Also filter the facilities list for the response
        facilities = [f for f in facilities if f["id"] in facility_id]
    all_emissions = await db.emission_records.find(emissions_query, {"_id": 0}).to_list(10000)

    # ===========================================
    # Platform Access is the only source for whether Scope 3 is aggregated.
    # ===========================================
    # Super admins see all; for other users check org's enabled_access
    if current_user["role"] != "super_admin" and organization:
        if not can_view_scope3:
            all_emissions = [
                e for e in all_emissions
                if e.get("scope") != "scope3" and not (e.get("scope") == "biogenic" and e.get("biogenic_scope_selection") == "scope3")
            ]
    
    def extract_year_from_period(period: str) -> str:
        """Extract year from reporting_period (handles CY2025, FY 2025-2026, 2025-01, etc.)"""
        if not period:
            return None
        period = period.strip()
        # CY2025 format
        if period.startswith("CY"):
            return period[2:6]
        # FY 2025-2026 format
        if period.startswith("FY ") or period.startswith("FY"):
            parts = period.replace("FY ", "FY").replace("FY", "").split("-")
            return parts[0].strip() if parts else None
        # YYYY-MM format
        if "-" in period and len(period) >= 7:
            return period[:4]
        return period[:4] if len(period) >= 4 else None
    
    def is_yearly_period_in_range(period: str, start: str, end: str) -> bool:
        """Check if a yearly period (FY 2025-26, CY2025) falls within a monthly date range (2025-04, 2026-03)"""
        if not period or not (start or end):
            return True  # No filter, include all
        
        # Extract start and end years from the filter range
        filter_start_year = int(start[:4]) if start else 0
        filter_start_month = int(start[5:7]) if start and len(start) >= 7 else 1
        filter_end_year = int(end[:4]) if end else 9999
        filter_end_month = int(end[5:7]) if end and len(end) >= 7 else 12
        
        period = period.strip()
        
        # Handle FY 2025-26 format (Financial Year April-March)
        if period.startswith("FY "):
            # FY 2025-26 means April 2025 to March 2026
            fy_parts = period[3:].split("-")
            if len(fy_parts) >= 1:
                fy_start_year = int(fy_parts[0].strip())
                # Handle both "FY 2025-2026" and "FY 2025-26" formats
                if len(fy_parts) >= 2:
                    fy_end_str = fy_parts[1].strip()
                    if len(fy_end_str) == 2:
                        # Short year format like "26" -> 2026
                        fy_end_year = int(str(fy_start_year)[:2] + fy_end_str)
                    else:
                        fy_end_year = int(fy_end_str)
                else:
                    fy_end_year = fy_start_year + 1
                # FY covers fy_start_year-04 to fy_end_year-03
                # Check if there's any overlap with the filter range
                fy_start = (fy_start_year, 4)  # April of start year
                fy_end = (fy_end_year, 3)      # March of end year
                filter_range_start = (filter_start_year, filter_start_month)
                filter_range_end = (filter_end_year, filter_end_month)
                # Check overlap: FY overlaps filter if FY_start <= filter_end AND FY_end >= filter_start
                return fy_start <= filter_range_end and fy_end >= filter_range_start
        
        # Handle CY2025 format (Calendar Year Jan-Dec)
        if period.startswith("CY"):
            cy_year = int(period[2:6])
            # CY covers cy_year-01 to cy_year-12
            cy_start = (cy_year, 1)
            cy_end = (cy_year, 12)
            filter_range_start = (filter_start_year, filter_start_month)
            filter_range_end = (filter_end_year, filter_end_month)
            return cy_start <= filter_range_end and cy_end >= filter_range_start
        
        return True  # Unknown format, include by default
    
    def calculate_proration_factor(period: str, start: str, end: str) -> float:
        """
        Calculate the proration factor for a reporting period based on overlap with filter range.
        Returns a value between 0 and 1 representing the proportion of the period that falls within the filter.
        
        - Monthly entries: 1.0 if within range, 0.0 if outside
        - FY entries: overlapping_months / 12
        - CY entries: overlapping_months / 12
        """
        if not period:
            return 1.0
        
        if not (start or end):
            return 1.0  # No filter, include 100%
        
        # Extract filter range as (year, month) tuples
        filter_start_year = int(start[:4]) if start else 0
        filter_start_month = int(start[5:7]) if start and len(start) >= 7 else 1
        filter_end_year = int(end[:4]) if end else 9999
        filter_end_month = int(end[5:7]) if end and len(end) >= 7 else 12
        
        period = period.strip()
        
        # Helper to calculate months between two (year, month) tuples (inclusive)
        def months_between(start_ym, end_ym):
            return (end_ym[0] - start_ym[0]) * 12 + (end_ym[1] - start_ym[1]) + 1
        
        # Helper to get overlap months count
        def get_overlap_months(period_start, period_end, filter_start, filter_end):
            # Find the overlap range
            overlap_start = max(period_start, filter_start, key=lambda x: x[0] * 12 + x[1])
            overlap_end = min(period_end, filter_end, key=lambda x: x[0] * 12 + x[1])
            
            # Check if there's actual overlap
            if overlap_start[0] * 12 + overlap_start[1] > overlap_end[0] * 12 + overlap_end[1]:
                return 0  # No overlap
            
            return months_between(overlap_start, overlap_end)
        
        filter_start = (filter_start_year, filter_start_month)
        filter_end = (filter_end_year, filter_end_month)
        
        # Handle FY format (Financial Year April-March)
        if period.startswith("FY "):
            fy_parts = period[3:].split("-")
            if len(fy_parts) >= 1:
                fy_start_year = int(fy_parts[0].strip())
                # Handle both "FY 2025-2026" and "FY 2025-26" formats
                if len(fy_parts) >= 2:
                    fy_end_str = fy_parts[1].strip()
                    if len(fy_end_str) == 2:
                        # Short year format like "26" -> 2026
                        fy_end_year = int(str(fy_start_year)[:2] + fy_end_str)
                    else:
                        fy_end_year = int(fy_end_str)
                else:
                    fy_end_year = fy_start_year + 1
                
                period_start = (fy_start_year, 4)   # April of start year
                period_end = (fy_end_year, 3)       # March of end year
                
                overlap_months = get_overlap_months(period_start, period_end, filter_start, filter_end)
                return overlap_months / 12.0
        
        # Handle CY format (Calendar Year Jan-Dec)
        # Supports both 'CY2025' and 'CY 2025' formats
        if period.startswith("CY"):
            cy_str = period[2:].strip()  # Remove 'CY' prefix and strip whitespace
            cy_year = int(cy_str[:4])    # Extract first 4 digits as year
            period_start = (cy_year, 1)   # January
            period_end = (cy_year, 12)    # December
            
            overlap_months = get_overlap_months(period_start, period_end, filter_start, filter_end)
            return overlap_months / 12.0
        
        # Handle monthly format (YYYY-MM) - no proration needed, just check if within range
        if len(period) >= 7 and period[4] == '-':
            try:
                month_year = int(period[:4])
                month_num = int(period[5:7])
                period_ym = month_year * 12 + month_num
                filter_start_ym = filter_start[0] * 12 + filter_start[1]
                filter_end_ym = filter_end[0] * 12 + filter_end[1]
                
                if period_ym >= filter_start_ym and period_ym <= filter_end_ym:
                    return 1.0
                else:
                    return 0.0
            except ValueError:
                pass
        
        return 1.0  # Unknown format, include 100%
    
    # Filter yearly records that fall outside the date range and calculate proration factors
    proration_factors = {}  # emission_id -> proration factor
    if date_filter_start or date_filter_end:
        filtered_emissions = []
        for e in all_emissions:
            period = e.get("reporting_period", "")
            emission_id = e.get("id", id(e))  # Use object id as fallback
            
            # Calculate proration factor for this emission
            proration = calculate_proration_factor(period, date_filter_start, date_filter_end)
            
            if proration > 0:
                proration_factors[emission_id] = proration
                filtered_emissions.append(e)
        all_emissions = filtered_emissions
    else:
        # No filter, all emissions have factor of 1.0
        for e in all_emissions:
            emission_id = e.get("id", id(e))
            proration_factors[emission_id] = 1.0
    
    # # Build a set of yearly record keys: (facility_id, category, scope, year)
    # yearly_keys = set()
    # for e in all_emissions:
    #     if e.get("frequency_type") == "yearly":
    #         year = extract_year_from_period(e.get("reporting_period"))
    #         if year:
    #             key = (e.get("facility_id"), e.get("category"), e.get("scope"), year)
    #             yearly_keys.add(key)
    
    # # Filter out monthly records that conflict with yearly records
    # def should_include_emission(e):
    #     """Returns True if emission should be included in aggregations"""
    #     freq = e.get("frequency_type", "monthly")
    #     # Always include yearly records
    #     if freq == "yearly":
    #         return True
    #     # For monthly records, check if a yearly record exists for the same combination
    #     year = extract_year_from_period(e.get("reporting_period"))
    #     print("YEAR", year)
    #     if year:
    #         key = (e.get("facility_id"), e.get("category"), e.get("scope"), year)
    #         print("key", key)
    #         if key in yearly_keys:
    #             # Monthly record conflicts with yearly - exclude to prevent double counting
    #             return False
    #     return True
    
    # Apply deduplication filter
    # deduplicated_emissions = [e for e in all_emissions if should_include_emission(e)]
    deduplicated_emissions = all_emissions
    
    # Helper function to get emission value with fallback to co2e_emissions
    def get_emission_value(emission):
        """Get emission value, falling back to co2e_emissions if total_emissions is null"""
        total = emission.get("total_emissions")
        if total is not None:
            return total
        # Fallback to co2e_emissions for bulk upload records that may not have total_emissions
        return emission.get("co2e_emissions", 0) or 0
    
    # Helper function to get equity-adjusted AND prorated emission value
    def get_adjusted_emission(emission, emission_value=None):
        """Apply equity share adjustment and proration if applicable"""
        # If no value provided, get it from the emission record with fallback
        if emission_value is None:
            emission_value = get_emission_value(emission)
        
        emission_id = emission.get("id", id(emission))
        proration = proration_factors.get(emission_id, 1.0)
        adjusted_value = emission_value * proration
        
        if use_equity_share:
            fac_id = emission.get("facility_id")
            equity_factor = facility_equity_map.get(fac_id, 1.0)
            adjusted_value = adjusted_value * equity_factor
        
        return adjusted_value

    # Calculate totals with equity share adjustment and proration (using deduplicated emissions)
    total_emissions = sum(get_adjusted_emission(e) for e in deduplicated_emissions)
    scope1_emissions = sum(get_adjusted_emission(e) for e in deduplicated_emissions if e["scope"] == "scope1")
    scope2_emissions = sum(get_adjusted_emission(e) for e in deduplicated_emissions if e["scope"] == "scope2")
    scope3_emissions = sum(get_adjusted_emission(e) for e in deduplicated_emissions if e["scope"] == "scope3")
    biogenic_emissions = sum(get_adjusted_emission(e) for e in deduplicated_emissions if e["scope"] == "biogenic")
    
    # Helper function to check if biogenic is direct (Scope 1) or indirect (Scope 3)
    def is_indirect_biogenic(emission):
        """Biogenic is indirect if category starts with 'C' followed by number (Scope 3 category)"""
        category = emission.get("category", "")
        if not category:
            return False
        # Scope 3 categories start with C1, C2, ..., C15
        return category.startswith("C") and len(category) > 1 and (category[1].isdigit() or (len(category) > 2 and category[1:3].strip()[0].isdigit()))
    
    # Split biogenic into direct (Scope 1) and indirect (Scope 3)
    biogenic_direct = sum(get_adjusted_emission(e) for e in deduplicated_emissions 
                         if e["scope"] == "biogenic" and not is_indirect_biogenic(e))
    biogenic_indirect = sum(get_adjusted_emission(e) for e in deduplicated_emissions 
                           if e["scope"] == "biogenic" and is_indirect_biogenic(e))
    
    # NEW: Scope 3 category breakdown
    scope3_category_map = {}
    scope3_methodology_map = {"activity_basis": 0.0, "spend_basis": 0.0, "supplier_basis": 0.0, "other": 0.0}
    scope3_categories_set = set()
    
    for emission in deduplicated_emissions:
        if emission.get("scope") == "scope3":
            category = emission.get("category", "Unknown")
            adjusted_value = get_adjusted_emission(emission)
            
            # Track unique categories
            scope3_categories_set.add(category)
            
            # Category breakdown
            if category not in scope3_category_map:
                scope3_category_map[category] = {"category": category, "total_emissions": 0.0, "record_count": 0}
            scope3_category_map[category]["total_emissions"] += adjusted_value
            scope3_category_map[category]["record_count"] += 1
            
            # Methodology breakdown
            method = (emission.get("calculation_method_scope3") or "other").lower()
            if "activity" in method:
                scope3_methodology_map["activity_basis"] += adjusted_value
            elif "spend" in method:
                scope3_methodology_map["spend_basis"] += adjusted_value
            elif "supplier" in method:
                scope3_methodology_map["supplier_basis"] += adjusted_value
            else:
                scope3_methodology_map["other"] += adjusted_value
    
    # Convert to sorted list
    scope3_by_category = sorted(scope3_category_map.values(), key=lambda x: -x["total_emissions"])
    
    # Add percentage to each category
    if scope3_emissions > 0:
        for cat in scope3_by_category:
            cat["percentage"] = round((cat["total_emissions"] / scope3_emissions) * 100, 1)
    
    # Methodology split with percentages
    scope3_by_methodology = []
    method_labels = {"activity_basis": "Activity-Based", "spend_basis": "Spend-Based", "supplier_basis": "Supplier-Specific", "other": "Other"}
    for method_key, total in scope3_methodology_map.items():
        if total > 0:
            scope3_by_methodology.append({
                "methodology": method_labels[method_key],
                "total_emissions": round(total, 2),
                "percentage": round((total / scope3_emissions) * 100, 1) if scope3_emissions > 0 else 0
            })
    scope3_by_methodology.sort(key=lambda x: -x["total_emissions"])
    
    recent_records = sorted(all_emissions, key=lambda x: x["created_at"], reverse=True)[:5]
    
    emissions_by_facility = []
    for facility in facilities:
        # Use deduplicated emissions for aggregations to prevent double counting
        facility_emissions = [e for e in deduplicated_emissions if e["facility_id"] == facility["id"]]
        
        # Get equity factor for this facility
        equity_factor = facility_equity_map.get(facility["id"], 1.0) if use_equity_share else 1.0
        
        total = sum(get_emission_value(e) for e in facility_emissions) * equity_factor
        scope1 = sum(get_emission_value(e) for e in facility_emissions if e["scope"] == "scope1") * equity_factor
        scope2 = sum(get_emission_value(e) for e in facility_emissions if e["scope"] == "scope2") * equity_factor
        scope3 = sum(get_emission_value(e) for e in facility_emissions if e["scope"] == "scope3") * equity_factor
        biogenic = sum(get_emission_value(e) for e in facility_emissions if e["scope"] == "biogenic") * equity_factor
        
        emissions_by_facility.append({
            "facility_id": facility["id"],
            "facility_name": facility["name"],
            "total_emissions": round(total, 2),
            "scope1_emissions": round(scope1, 2),
            "scope2_emissions": round(scope2, 2),
            "scope3_emissions": round(scope3, 2),
            "biogenic_emissions": round(biogenic, 2),
            "equity_share_percentage": round(equity_factor * 100, 1) if use_equity_share else 100.0
        })
    
    # Emissions trend - use deduplicated emissions
    # Only include monthly (YYYY-MM) periods for trend chart to avoid mixing granularities
    period_map = {}
    for emission in deduplicated_emissions:
        period = emission.get("reporting_period", "")
        # Only include monthly format periods (YYYY-MM) for trend chart
        # Exclude yearly periods (FY, CY) to prevent duplication and mixed granularity
        if not period or not (len(period) == 7 and "-" in period and period[:4].isdigit()):
            continue  # Skip non-monthly periods
        adjusted_value = get_adjusted_emission(emission)
        if period not in period_map:
            period_map[period] = {"period": period, "scope1": 0, "scope2": 0, "scope3": 0, "biogenic": 0, "total": 0}
        period_map[period]["scope1"] += adjusted_value if emission["scope"] == "scope1" else 0
        period_map[period]["scope2"] += adjusted_value if emission["scope"] == "scope2" else 0
        period_map[period]["scope3"] += adjusted_value if emission["scope"] == "scope3" else 0
        period_map[period]["biogenic"] += adjusted_value if emission["scope"] == "biogenic" else 0
        period_map[period]["total"] += adjusted_value
    
    emissions_trend = sorted(period_map.values(), key=lambda x: x["period"])
    
    # Category analysis (Stationary Combustion vs Mobile Combustion vs Fugitive vs Process)
    # Normalize category names (raw DB names to display names)
    # Use deduplicated emissions for category analysis
    category_display_map = {
        'stationary_combustion': 'Stationary Combustion',
        'mobile_combustion': 'Mobile Combustion',
        'fugitive': 'Fugitive Emissions',
        'fugitive_emissions': 'Fugitive Emissions',
        'process': 'Process Emissions',
        'process_emissions': 'Process Emissions',
        'electricity': 'Purchased Electricity',
        'purchased_electricity': 'Purchased Electricity',
        'biomass': 'Biomass',
    }
    category_map = {}
    for emission in deduplicated_emissions:
        raw_category = emission.get("category", "Unknown")
        category = category_display_map.get(raw_category.lower().replace(' ', '_'), raw_category)
        adjusted_value = get_adjusted_emission(emission, emission.get("total_emissions", 0) or 0)
        if category not in category_map:
            category_map[category] = {"category": category, "total_emissions": 0, "scope1": 0, "scope2": 0}
        category_map[category]["total_emissions"] += adjusted_value
        if emission["scope"] == "scope1":
            category_map[category]["scope1"] += adjusted_value
        elif emission["scope"] == "scope2":
            category_map[category]["scope2"] += adjusted_value
    emissions_by_category = sorted(category_map.values(), key=lambda x: -x["total_emissions"])
    
    # Fuel analysis - use deduplicated emissions
    fuel_map = {}
    for emission in deduplicated_emissions:
        fuel = emission.get("fuel_type", "")
        scope = emission.get("scope", "")
        
        # Handle empty/null fuel types based on scope
        if not fuel or not fuel.strip():
            # For Scope 1 and 2, fuel_type should exist - use category as last resort
            if scope in ("scope1", "scope2"):
                fuel = emission.get("category") or "Not Specified"
            # For Scope 3, use sub_category as fallback
            elif scope == "scope3":
                fuel = emission.get("sub_category") or "N/A (Scope 3)"
            elif scope == "biogenic":
                fuel = emission.get("sub_category") or "Biogenic Source"
            else:
                fuel = "Not Specified"
        
        adjusted_value = get_adjusted_emission(emission)
        if fuel not in fuel_map:
            fuel_map[fuel] = {"fuel_type": fuel, "total_emissions": 0, "count": 0}
        fuel_map[fuel]["total_emissions"] += adjusted_value
        fuel_map[fuel]["count"] += 1
    emissions_by_fuel = sorted(fuel_map.values(), key=lambda x: -x["total_emissions"])
    
    # Year-wise fuel analysis - aggregate by year, show top fuels per year
    # Use deduplicated emissions - store raw periods for later normalization
    yearly_fuel_map = {}
    for emission in deduplicated_emissions:
        period = emission.get("reporting_period", "")
        adjusted_value = get_adjusted_emission(emission)
        fuel = emission.get("fuel_type", "")
        scope = emission.get("scope", "")
        
        # Handle empty/null fuel types based on scope
        if not fuel or not fuel.strip():
            # For Scope 1 and 2, fuel_type should exist - use category as last resort
            if scope in ("scope1", "scope2"):
                fuel = emission.get("category") or "Not Specified"
            # For Scope 3, use sub_category as fallback
            elif scope == "scope3":
                fuel = emission.get("sub_category") or "N/A (Scope 3)"
            elif scope == "biogenic":
                fuel = emission.get("sub_category") or "Biogenic Source"
            else:
                fuel = "Not Specified"
        
        # Use period directly as key - will be normalized later
        key = f"{period}_{fuel}"
        if key not in yearly_fuel_map:
            yearly_fuel_map[key] = {"year": period, "fuel_type": fuel, "total_emissions": 0}
        yearly_fuel_map[key]["total_emissions"] += adjusted_value
    
    # Group by year and aggregate fuels into a stacked format
    # First, get org's reporting year type
    org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "reporting_year_type": 1}) if org_id else None
    reporting_year_type = org.get("reporting_year_type", "calendar_year") if org else "calendar_year"
    is_fy_reporting = reporting_year_type == "financial_year"
    
    def normalize_year_label(period: str, is_financial_year: bool) -> str:
        """
        Normalize period to consistent year label for chart display.
        For Financial Year orgs: FY 2025-26, FY 2024-25 (always short format)
        For Calendar Year orgs: CY 2025, CY 2026
        """
        if not period:
            return "Unknown"
        period = period.strip()
        
        # Already yearly format - normalize to short format
        if period.startswith("FY "):
            # FY 2025-26 or FY 2025-2026 -> FY 2025-26 (short format)
            if is_financial_year:
                # Normalize to short format (FY YYYY-YY)
                parts = period[3:].replace(" ", "").split("-")
                if len(parts) == 2:
                    start_year = parts[0].strip()
                    end_part = parts[1].strip()
                    # Convert full year to short (2026 -> 26)
                    if len(end_part) == 4:
                        end_part = end_part[-2:]
                    return f"FY {start_year}-{end_part}"
                return period
            else:
                # Convert FY to CY (use start year)
                parts = period[3:].split("-")
                if parts:
                    return f"CY {parts[0].strip()}"
        
        if period.startswith("CY"):
            # CY2026 or CY 2026
            cy_year = period.replace("CY", "").strip()
            if is_financial_year:
                # Convert CY to FY - CY 2026 belongs to FY 2025-26 (if Jan-Mar) or FY 2026-27 (if Apr-Dec)
                # For simplicity, map to the FY that contains most of the CY
                return f"FY {cy_year}-{str(int(cy_year)+1)[-2:]}"
            else:
                return f"CY {cy_year}"
        
        # Monthly format YYYY-MM
        if len(period) >= 7 and "-" in period and period[:4].isdigit():
            year = int(period[:4])
            month = int(period[5:7]) if len(period) >= 7 else 1
            if is_financial_year:
                # April onwards = current FY, Jan-Mar = previous FY
                fy_year = year if month >= 4 else year - 1
                return f"FY {fy_year}-{str(fy_year+1)[-2:]}"
            else:
                return f"CY {year}"
        
        # Year only (2025)
        if len(period) == 4 and period.isdigit():
            year = int(period)
            if is_financial_year:
                return f"FY {year}-{str(year+1)[-2:]}"
            else:
                return f"CY {year}"
        
        return "Unknown"
    
    # Aggregate emissions by normalized year
    years_fuel_data = {}
    for item in yearly_fuel_map.values():
        year_label = normalize_year_label(item["year"], is_fy_reporting)
        if year_label == "Unknown":
            continue
        if year_label not in years_fuel_data:
            years_fuel_data[year_label] = {"year": year_label, "fuels": {}, "total": 0}
        years_fuel_data[year_label]["fuels"][item["fuel_type"]] = years_fuel_data[year_label]["fuels"].get(item["fuel_type"], 0) + item["total_emissions"]
        years_fuel_data[year_label]["total"] += item["total_emissions"]
    
    # Sort years properly (FY 2024-25 < FY 2025-26, CY 2024 < CY 2025)
    def sort_year_key(year_label):
        if year_label.startswith("FY "):
            return int(year_label[3:7])  # Extract start year
        elif year_label.startswith("CY "):
            return int(year_label[3:])
        return 0
    
    # Determine the selected year label from the filter period
    # If filter is FY 2025-2026 (2025-04 to 2026-03), the selected year is "FY 2025-26"
    selected_year_label = None
    if start_period and end_period:
        selected_year_label = normalize_year_label(start_period, is_fy_reporting)
    
    # Convert to list format with fuel breakdown
    # Only include years that match the filter period (if a filter is set)
    yearly_fuel_analysis = []
    for year_label in sorted(years_fuel_data.keys(), key=sort_year_key):
        # If filter is set, only include the selected year
        if selected_year_label and year_label != selected_year_label:
            continue
        data = years_fuel_data[year_label]
        entry = {"year": year_label, "total_emissions": round(data["total"], 2)}
        # Add top fuels as separate fields for stacked bar chart
        sorted_fuels = sorted(data["fuels"].items(), key=lambda x: -x[1])
        for i, (fuel, emissions) in enumerate(sorted_fuels[:5]):  # Top 5 fuels
            entry[fuel] = round(emissions, 2)
        yearly_fuel_analysis.append(entry)
    
    # Year-wise facility analysis - aggregate by year using normalized year labels
    # Use deduplicated emissions
    yearly_facility_map = {}
    facility_name_map = {f["id"]: f["name"] for f in facilities}
    for emission in deduplicated_emissions:
        period = emission.get("reporting_period", "")
        adjusted_value = get_adjusted_emission(emission, emission.get("total_emissions", 0) or 0)
        year_label = normalize_year_label(period, is_fy_reporting)
        if year_label == "Unknown":
            continue
        fac_id = emission.get("facility_id", "")
        fac_name = facility_name_map.get(fac_id, "Unknown")
        key = f"{year_label}_{fac_id}"
        if key not in yearly_facility_map:
            yearly_facility_map[key] = {"year": year_label, "facility_id": fac_id, "facility_name": fac_name, "total_emissions": 0, "scope1": 0, "scope2": 0, "biogenic": 0}
        yearly_facility_map[key]["total_emissions"] += adjusted_value
        if emission["scope"] == "scope1":
            yearly_facility_map[key]["scope1"] += adjusted_value
        elif emission["scope"] == "scope2":
            yearly_facility_map[key]["scope2"] += adjusted_value
        elif emission["scope"] == "biogenic":
            yearly_facility_map[key]["biogenic"] += adjusted_value
    
    # Group by year for facility analysis
    years_facility_data = {}
    for item in yearly_facility_map.values():
        year_label = item["year"]
        if year_label not in years_facility_data:
            years_facility_data[year_label] = {"year": year_label, "facilities": [], "total": 0, "scope1": 0, "scope2": 0, "biogenic": 0}
        years_facility_data[year_label]["facilities"].append(item)
        years_facility_data[year_label]["total"] += item["total_emissions"]
        years_facility_data[year_label]["scope1"] += item["scope1"]
        years_facility_data[year_label]["scope2"] += item["scope2"]
        years_facility_data[year_label]["biogenic"] += item["biogenic"]
    
    # Convert to list - one entry per year with aggregated data, sorted by year
    # Only include years that match the filter period (if a filter is set)
    yearly_facility_analysis = []
    for year_label in sorted(years_facility_data.keys(), key=sort_year_key):
        # If filter is set, only include the selected year
        if selected_year_label and year_label != selected_year_label:
            continue
        data = years_facility_data[year_label]
        yearly_facility_analysis.append({
            "year": year_label,
            "total_emissions": round(data["total"], 2),
            "scope1": round(data["scope1"], 2),
            "scope2": round(data["scope2"], 2),
            "biogenic": round(data["biogenic"], 2),
            "facility_count": len(data["facilities"])
        })
    
    # Monthly comparison (current vs previous month) - only use single month periods (YYYY-MM format)
    monthly_comparison = []
    # Filter to only include single month periods (YYYY-MM format, not ranges)
    single_month_periods = {k: v for k, v in period_map.items() if len(k) == 7 and "-" in k and " to " not in k}
    sorted_periods = sorted(single_month_periods.keys())
    
    if sorted_periods:
        # Fill in missing months between first and last period
        from dateutil.relativedelta import relativedelta
        first = datetime.strptime(sorted_periods[0], "%Y-%m")
        last = datetime.strptime(sorted_periods[-1], "%Y-%m")
        all_months = []
        current_month = first
        while current_month <= last:
            all_months.append(current_month.strftime("%Y-%m"))
            current_month += relativedelta(months=1)
        
        prev_total = 0
        for period in all_months:
            current_total = round(single_month_periods.get(period, {}).get("total", 0), 2)
            change_pct = abs(((current_total - prev_total) / prev_total * 100)) if prev_total > 0 else 0
            monthly_comparison.append({
                "period": period,
                "total": current_total,
                "previous_total": round(prev_total, 2),
                "change_percent": round(change_pct, 2)
            })
            prev_total = current_total
    
    # Sinks analysis - apply same filters
    sinks_query = {}
    if facility_id and len(facility_id) > 0:
        sinks_query["facility_id"] = {"$in": facility_id}
    else:
        sinks_query["facility_id"] = {"$in": facility_ids}
    
    # Apply date filtering to sinks using start_date (YYYY-MM-DD format, present on all sinks)
    if start_period or end_period:
        date_filter = {}
        if start_period:
            date_filter["$gte"] = f"{start_period}-01"
        if end_period:
            date_filter["$lte"] = f"{end_period}-31"
        # if date_filter:
        #     sinks_query["start_date"] = date_filter
        if start_period:
            # The record must end AFTER the requested start period begins
            sinks_query["end_date"] = {"$gte": f"{start_period}-01"}
        if end_period:
            # The record must start BEFORE the requested end period finishes
            sinks_query["start_date"] = {"$lte": f"{end_period}-31"}
    
    all_sinks = await db.sinks.find(sinks_query, {"_id": 0}).to_list(10000)
    
    # Calculate sink proportion based on overlap with filter period
    def calculate_sink_proportion(sink, filter_start: str, filter_end: str) -> float:
        """
        Calculate the proportion of sink that falls within the dashboard filter period.
        sink has start_date/end_date in YYYY-MM-DD format
        filter_start/filter_end are in YYYY-MM format
        """
        if not filter_start and not filter_end:
            return 1.0
        
        try:
            from datetime import datetime
            sink_start_str = sink.get('start_date', '')
            sink_end_str = sink.get('end_date', '')
            
            if not sink_start_str or not sink_end_str:
                return 1.0
            
            sink_start = datetime.strptime(sink_start_str, '%Y-%m-%d')
            sink_end = datetime.strptime(sink_end_str, '%Y-%m-%d')
            
            # Convert filter period (YYYY-MM) to dates
            if filter_start:
                filter_start_dt = datetime.strptime(f"{filter_start}-01", '%Y-%m-%d')
            else:
                filter_start_dt = sink_start
            
            if filter_end:
                # Get last day of the filter end month
                filter_end_year = int(filter_end[:4])
                filter_end_month = int(filter_end[5:7])
                import calendar
                last_day = calendar.monthrange(filter_end_year, filter_end_month)[1]
                filter_end_dt = datetime.strptime(f"{filter_end}-{last_day:02d}", '%Y-%m-%d')
            else:
                filter_end_dt = sink_end
            
            # Calculate overlap
            overlap_start = max(sink_start, filter_start_dt)
            overlap_end = min(sink_end, filter_end_dt)
            
            if overlap_start > overlap_end:
                return 0.0  # No overlap
            
            # Calculate proportion based on days
            sink_total_days = (sink_end - sink_start).days + 1
            overlap_days = (overlap_end - overlap_start).days + 1
            
            if sink_total_days <= 0:
                return 1.0
            
            return overlap_days / sink_total_days
        except (ValueError, TypeError):
            return 1.0  # If parsing fails, include full value
    
    # Apply equity share and proportion adjustment to sinks
    sinks_total = 0
    for s in all_sinks:
        proportion = calculate_sink_proportion(s, start_period, end_period)
        sink_value = s.get("total_emissions_reduced", 0) * proportion
        if use_equity_share:
            fac_id = s.get("facility_id")
            equity_factor = facility_equity_map.get(fac_id, 1.0)
            sink_value = sink_value * equity_factor
        s['_proportion'] = proportion  # Store for later use
        sinks_total += sink_value
    
    # Sinks by facility (with proportion)
    sinks_by_facility_map = {}
    for sink in all_sinks:
        fac_id = sink.get("facility_id", "")
        fac_name = facility_name_map.get(fac_id, "Unknown")
        proportion = sink.get('_proportion', 1.0)
        sink_value = sink.get("total_emissions_reduced", 0) * proportion
        
        # Apply equity share adjustment
        if use_equity_share:
            equity_factor = facility_equity_map.get(fac_id, 1.0)
            sink_value = sink_value * equity_factor
        
        if fac_id not in sinks_by_facility_map:
            sinks_by_facility_map[fac_id] = {"facility_id": fac_id, "facility_name": fac_name, "total_reduced": 0}
        sinks_by_facility_map[fac_id]["total_reduced"] += sink_value
    sinks_by_facility = list(sinks_by_facility_map.values())
    
    return DashboardStats(
        total_facilities=len(facilities),
        total_emissions=round(total_emissions, 2),
        scope1_emissions=round(scope1_emissions, 2),
        scope2_emissions=round(scope2_emissions, 2),
        scope3_emissions=round(scope3_emissions, 2),
        biogenic_emissions=round(biogenic_emissions, 2),
        biogenic_direct=round(biogenic_direct, 2),
        biogenic_indirect=round(biogenic_indirect, 2),
        recent_records=[EmissionRecordResponse(**r) for r in recent_records],
        emissions_by_facility=emissions_by_facility,
        emissions_trend=emissions_trend,
        emissions_by_category=emissions_by_category,
        emissions_by_fuel=emissions_by_fuel,
        yearly_fuel_analysis=yearly_fuel_analysis,
        yearly_facility_analysis=yearly_facility_analysis,
        monthly_comparison=monthly_comparison,
        sinks_total=round(sinks_total, 2),
        sinks_by_facility=sinks_by_facility,
        scope3_by_category=scope3_by_category,
        scope3_by_methodology=scope3_by_methodology,
        scope3_categories_reported=len(scope3_categories_set)
    )


# Supplier Hotspot Heatmap - Scope 3 Analysis
@router.get("/dashboard/supplier-hotspots")
async def get_supplier_hotspots(
    current_user: dict = Depends(get_current_user),
    start_period: Optional[str] = None,
    end_period: Optional[str] = None,
    facility_id: List[str] = Query(default=[])
):
    if current_user.get("role") != "super_admin":
        from modules.entitlements.dependencies import assert_entitlement
        await assert_entitlement(current_user.get("organization_id"), "environment.ghg.scope_3")
    """
    Get aggregated Scope 3 emissions by supplier for heatmap visualization.
    Returns hierarchical data: Category -> Supplier -> Emissions
    """
    # Build base query based on user role
    if current_user["role"] == "super_admin":
        facilities = await db.facilities.find({}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
    elif current_user["role"] == "admin":
        org_id = current_user.get("organization_id")
        if not org_id:
            return {"categories": [], "suppliers": [], "total_scope3_emissions": 0}
        facilities = await db.facilities.find({"organization_id": org_id}, {"_id": 0}).to_list(1000)
        facility_ids = [f["id"] for f in facilities]
    else:  # user - Return empty data for users; dashboards use KPI-based access
        facility_ids = []
    
    # Build emissions query for Scope 3 only
    emissions_query = {
        "facility_id": {"$in": facility_ids},
        "scope": "scope3"
    }
    
    # Apply date range filter
    if start_period:
        emissions_query["reporting_period"] = emissions_query.get("reporting_period", {})
        emissions_query["reporting_period"]["$gte"] = start_period
    if end_period:
        emissions_query["reporting_period"] = emissions_query.get("reporting_period", {})
        emissions_query["reporting_period"]["$lte"] = end_period
    
    # Apply facility filter
    if facility_id and len(facility_id) > 0:
        emissions_query["facility_id"] = {"$in": facility_id}
    
    # Get all Scope 3 emissions
    emissions = await db.emission_records.find(emissions_query, {"_id": 0}).to_list(10000)
    
    # Aggregate by category and supplier
    category_data = {}
    supplier_data = {}
    total_scope3 = 0
    
    for emission in emissions:
        category = emission.get("category", "Unknown")
        supplier_name = emission.get("supplier_name") or "Unspecified Supplier"
        supplier_code = emission.get("supplier_code", "")
        
        # Get total emissions (from outputs or legacy fields)
        outputs = emission.get("outputs", {})
        co2e = 0
        if outputs and "total" in outputs:
            co2e = outputs["total"].get("value", 0) or 0
        elif outputs and "co2e" in outputs:
            co2e = outputs["co2e"].get("value", 0) or 0
        else:
            co2e = emission.get("co2e_emissions") or emission.get("total_emissions") or 0
        
        total_scope3 += co2e
        
        # Aggregate by category
        if category not in category_data:
            category_data[category] = {
                "name": category,
                "total_emissions": 0,
                "suppliers": {},
                "record_count": 0
            }
        category_data[category]["total_emissions"] += co2e
        category_data[category]["record_count"] += 1
        
        # Aggregate by supplier within category
        supplier_key = f"{supplier_name}|{supplier_code}"
        if supplier_key not in category_data[category]["suppliers"]:
            category_data[category]["suppliers"][supplier_key] = {
                "name": supplier_name,
                "code": supplier_code,
                "total_emissions": 0,
                "records": [],
                "monthly_trend": {}
            }
        
        category_data[category]["suppliers"][supplier_key]["total_emissions"] += co2e
        category_data[category]["suppliers"][supplier_key]["records"].append({
            "id": emission.get("id"),
            "reporting_period": emission.get("reporting_period"),
            "activity": emission.get("scope3_activity", ""),
            "emissions": round(co2e, 4),
            "facility_id": emission.get("facility_id")
        })
        
        # Build monthly trend
        period = emission.get("reporting_period", "")
        if period:
            month_key = period[:7]  # YYYY-MM
            if month_key not in category_data[category]["suppliers"][supplier_key]["monthly_trend"]:
                category_data[category]["suppliers"][supplier_key]["monthly_trend"][month_key] = 0
            category_data[category]["suppliers"][supplier_key]["monthly_trend"][month_key] += co2e
        
        # Global supplier aggregation
        if supplier_key not in supplier_data:
            supplier_data[supplier_key] = {
                "name": supplier_name,
                "code": supplier_code,
                "total_emissions": 0,
                "categories": set()
            }
        supplier_data[supplier_key]["total_emissions"] += co2e
        supplier_data[supplier_key]["categories"].add(category)
    
    # Format response - convert to lists and sort
    categories_list = []
    for cat_name, cat_data in category_data.items():
        suppliers_list = []
        for sup_key, sup_data in cat_data["suppliers"].items():
            # Convert monthly trend to sorted list
            monthly_trend = [
                {"month": k, "emissions": round(v, 4)}
                for k, v in sorted(sup_data["monthly_trend"].items())
            ]
            suppliers_list.append({
                "name": sup_data["name"],
                "code": sup_data["code"],
                "total_emissions": round(sup_data["total_emissions"], 4),
                "record_count": len(sup_data["records"]),
                "records": sup_data["records"][-10:],  # Last 10 records
                "monthly_trend": monthly_trend
            })
        
        # Sort suppliers by emissions (descending)
        suppliers_list.sort(key=lambda x: x["total_emissions"], reverse=True)
        
        categories_list.append({
            "name": cat_name,
            "total_emissions": round(cat_data["total_emissions"], 4),
            "record_count": cat_data["record_count"],
            "suppliers": suppliers_list
        })
    
    # Sort categories by emissions (descending)
    categories_list.sort(key=lambda x: x["total_emissions"], reverse=True)
    
    # Top suppliers across all categories
    top_suppliers = [
        {
            "name": v["name"],
            "code": v["code"],
            "total_emissions": round(v["total_emissions"], 4),
            "categories": list(v["categories"])
        }
        for k, v in sorted(supplier_data.items(), key=lambda x: x[1]["total_emissions"], reverse=True)
    ][:20]  # Top 20 suppliers
    
    return {
        "categories": categories_list,
        "top_suppliers": top_suppliers,
        "total_scope3_emissions": round(total_scope3, 4)
    }




@router.get("/dashboard/esg-summary")
async def get_esg_summary(
    current_user: dict = Depends(get_current_user),
    year: Optional[int] = None,
):
    """
    Aggregated ESG KPI summary for the executive dashboard.
    Returns 12 KPIs with current values, previous year values, and monthly trends.
    """
    org_id = current_user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization")

    now = datetime.now(timezone.utc)
    curr_year = year or now.year
    prev_year = curr_year - 1

    # Get all facilities for this org
    fac_ids = [f["id"] async for f in db.facilities.find({"organization_id": org_id}, {"id": 1})]

    async def sum_emissions(yr, scope=None):
        q = {"facility_id": {"$in": fac_ids}, "reporting_period": {"$regex": f"^{yr}-"}}
        if scope:
            q["scope"] = scope
        total = 0.0
        async for rec in db.emission_records.find(q, {"total_emissions": 1}):
            total += rec.get("total_emissions") or 0
        return round(total, 2)

    async def monthly_emissions(yr, scope=None):
        months = {}
        for m in range(1, 13):
            q = {"facility_id": {"$in": fac_ids}, "reporting_period": f"{yr}-{m:02d}"}
            if scope:
                q["scope"] = scope
            total = 0.0
            async for rec in db.emission_records.find(q, {"total_emissions": 1}):
                total += rec.get("total_emissions") or 0
            months[m] = round(total, 2)
        return months

    from modules.esg_records.services.dashboard.date_utils import build_date_filter

    # Build period filter for current FY (Apr curr_year - Mar curr_year+1)
    fy_start = f"{curr_year}-04"
    fy_end = f"{curr_year + 1}-03"
    period_conditions = build_date_filter(fy_start, fy_end)

    async def get_social_value(field_key):
        """Get social record field value within the current FY reporting period."""
        base_q = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "approval_status": {"$in": ["approved", "not_required", None]},
            f"field_values.{field_key}": {"$exists": True, "$ne": None},
        }
        if period_conditions:
            query = {"$and": [base_q, {"$or": period_conditions}]}
        else:
            query = base_q
        rec = await db.social_records.find_one(query, {"field_values": 1}, sort=[("created_at", -1)])
        if rec and rec.get("field_values"):
            v = rec["field_values"].get(field_key)
            if v is not None:
                try:
                    return float(v)
                except (ValueError, TypeError):
                    pass
        return None

    # Compute all KPIs
    s1_curr = await sum_emissions(curr_year, "scope1")
    s2_curr = await sum_emissions(curr_year, "scope2")
    s3_curr = await sum_emissions(curr_year, "scope3")
    total_curr = s1_curr + s2_curr + s3_curr

    s1_prev = await sum_emissions(prev_year, "scope1")
    s2_prev = await sum_emissions(prev_year, "scope2")
    s3_prev = await sum_emissions(prev_year, "scope3")
    total_prev = s1_prev + s2_prev + s3_prev

    # Monthly trend for current year
    s1_monthly = await monthly_emissions(curr_year, "scope1")
    s2_monthly = await monthly_emissions(curr_year, "scope2")
    s3_monthly = await monthly_emissions(curr_year, "scope3")

    monthly_trend = []
    for m in range(1, 13):
        monthly_trend.append({
            "month": m,
            "scope1": s1_monthly[m],
            "scope2": s2_monthly[m],
            "scope3": s3_monthly[m],
            "total": round(s1_monthly[m] + s2_monthly[m] + s3_monthly[m], 2),
        })

    # Production quantity for intensity
    from shared.utils.period_utils import period_variants
    prod_val = None
    for pv in period_variants(curr_year, "FY"):
        prod = await db.production_quantities.find_one(
            {"organization_id": org_id, "facility_id": None, "reporting_period": pv, "is_deleted": {"$ne": True}},
            {"quantity": 1, "unit": 1}
        )
        if prod:
            prod_val = prod.get("quantity")
            break

    ghg_intensity = round((s1_curr + s2_curr) / prod_val, 4) if prod_val else None

    # Social KPIs
    total_employees = await get_social_value("no_of_employees")
    female_employees = await get_social_value("no_of_female")
    male_employees = await get_social_value("no_of_male")
    diversity_pct = round((female_employees / total_employees) * 100, 1) if total_employees and female_employees else None

    # Employee Turnover
    emp_start = await get_social_value("employees_at_the_start_of_the_year")
    emp_end = await get_social_value("employees_at_the_end_of_the_year")
    emp_left = await get_social_value("employees_who_left_during_the_reporting_period")
    avg_employees = ((emp_start or 0) + (emp_end or 0)) / 2 if emp_start and emp_end else None
    turnover_pct = round((emp_left / avg_employees) * 100, 1) if emp_left and avg_employees else None

    # Age breakdown
    emp_under30 = await get_social_value("no_of_employees_under_30")
    emp_3050 = await get_social_value("no_of_employees_30_50")
    emp_over50 = await get_social_value("no_of_employees_over_50")
    emp_minority = await get_social_value("no_of_employees_minority")
    emp_vulnerable = await get_social_value("no_of_employees_vulnerable_groups")

    async def get_governance_value(field_key):
        """Get governance record field value within the current FY reporting period."""
        base_q = {
            "org_id": org_id,
            "is_current": {"$ne": False},
            "status": {"$ne": "draft"},
            "approval_status": {"$in": ["approved", "not_required", None]},
            f"field_values.{field_key}": {"$exists": True, "$ne": None},
        }
        if period_conditions:
            query = {"$and": [base_q, {"$or": period_conditions}]}
        else:
            query = base_q
        rec = await db.governance_records.find_one(query, {"field_values": 1}, sort=[("created_at", -1)])
        if rec and rec.get("field_values"):
            v = rec["field_values"].get(field_key)
            if v is not None:
                try:
                    return float(v)
                except (ValueError, TypeError):
                    pass
        return None

    data_breaches = await get_governance_value("no_of_incidents_of_data_breach")
    accounts_payable = await get_governance_value("accounts_payable")
    cogs = await get_governance_value("cost_of_goods_services_procured")
    ap_days = round((accounts_payable * 365) / cogs, 1) if accounts_payable and cogs else None

    # LTIFR = Lost Time Injuries × 1,000,000 / Total Hours Worked
    lost_time_injuries = await get_social_value("no_of_loss_time_injuries")
    total_hours_worked = await get_social_value("total_hours_worked")
    ltifr = round((lost_time_injuries * 1000000) / total_hours_worked, 2) if lost_time_injuries and total_hours_worked else None

    # Safety incidents count
    safety_count = await db.governance_records.count_documents({
        "org_id": org_id,
        "subcategory": "Health & Safety Incidents",
        "approval_status": {"$in": ["approved", "not_required", None]},
    })

    def yoy_change(curr, prev):
        if prev and prev != 0:
            return round(((curr - prev) / prev) * 100, 1)
        return None

    return {
        "year": curr_year,
        "kpis": {
            "total_emissions": {"value": total_curr, "prev": total_prev, "change": yoy_change(total_curr, total_prev), "unit": "tCO₂e"},
            "ghg_intensity": {"value": ghg_intensity, "prev": None, "change": None, "unit": "tCO₂e/unit"},
            "scope1": {"value": s1_curr, "prev": s1_prev, "change": yoy_change(s1_curr, s1_prev), "unit": "tCO₂e"},
            "scope2": {"value": s2_curr, "prev": s2_prev, "change": yoy_change(s2_curr, s2_prev), "unit": "tCO₂e"},
            "scope3": {"value": s3_curr, "prev": s3_prev, "change": yoy_change(s3_curr, s3_prev), "unit": "tCO₂e"},
            "total_employees": {"value": total_employees, "prev": None, "change": None, "unit": ""},
            "diversity_pct": {"value": diversity_pct, "prev": None, "change": None, "unit": "%"},
            "turnover_pct": {"value": turnover_pct, "prev": None, "change": None, "unit": "%"},
            "data_breaches": {"value": data_breaches, "prev": None, "change": None, "unit": "incidents"},
            "ap_days": {"value": ap_days, "prev": None, "change": None, "unit": "days"},
            "safety_incidents": {"value": safety_count, "prev": None, "change": None, "unit": "incidents"},
            "ltifr": {"value": ltifr, "prev": None, "change": None, "unit": ""},
        },
        "scope_breakdown": {"scope1": s1_curr, "scope2": s2_curr, "scope3": s3_curr},
        "monthly_trend": monthly_trend,
        "diversity_breakdown": {
            "female": female_employees,
            "male": male_employees,
            "under_30": emp_under30,
            "age_30_50": emp_3050,
            "over_50": emp_over50,
            "minority": emp_minority,
            "vulnerable": emp_vulnerable,
        },
        "turnover": {
            "start": emp_start,
            "end": emp_end,
            "left": emp_left,
            "rate": turnover_pct,
        },
    }
