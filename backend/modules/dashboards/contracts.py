"""Phase B7: Dashboard contracts.

Pydantic response models for dashboard endpoints. Lifted verbatim from
server.py — behaviour byte-identical.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from modules.emissions.contracts import EmissionRecordResponse


class DashboardStats(BaseModel):
    total_facilities: int
    total_emissions: float
    scope1_emissions: float
    scope2_emissions: float
    scope3_emissions: float = 0  # NEW: Scope 3 emissions
    biogenic_emissions: float
    biogenic_direct: float = 0  # Biogenic from Scope 1 activities (e.g., biomass combustion)
    biogenic_indirect: float = 0  # Biogenic from Scope 3 activities (e.g., C8 upstream)
    recent_records: List[EmissionRecordResponse]
    emissions_by_facility: List[Dict[str, Any]]
    emissions_trend: List[Dict[str, Any]]
    emissions_by_category: List[Dict[str, Any]]  # Category analysis
    emissions_by_fuel: List[Dict[str, Any]]  # Fuel analysis
    yearly_fuel_analysis: List[Dict[str, Any]]  # Year-wise fuel analysis
    yearly_facility_analysis: List[Dict[str, Any]]  # Year-wise facility analysis
    monthly_comparison: List[Dict[str, Any]]  # Month-over-month comparison
    sinks_total: float = 0  # Total carbon sinks
    sinks_by_facility: List[Dict[str, Any]] = []  # Sinks breakdown by facility
    # NEW: Scope 3 specific analytics
    scope3_by_category: List[Dict[str, Any]] = []  # Scope 3 emissions breakdown by category
    scope3_by_methodology: List[Dict[str, Any]] = []  # Scope 3 methodology split (activity/spend/supplier)
    scope3_categories_reported: int = 0  # Number of Scope 3 categories with data
    # NEW: Year-over-year comparison
    previous_year_emissions: Optional[Dict[str, float]] = None  # Previous year totals for YoY comparison
    # NEW: Base year comparison
    base_year_comparison: Optional[Dict[str, Any]] = None  # Base year data for comparison
