"""SBTi Targets — Pydantic contracts."""
from typing import Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel


class TermType(str, Enum):
    SHORT_TERM = "short_term"
    LONG_TERM = "long_term"


class SBTiTargetType(str, Enum):
    PERCENTAGE = "percentage"
    INTENSITY_REVENUE = "intensity_revenue"
    INTENSITY_PRODUCTION = "intensity_production"


class SBTiTargetCreate(BaseModel):
    term_type: TermType
    kpi_id: str
    kpi_name: Optional[str] = None
    target_name: str
    description: Optional[str] = None
    base_year: str  # e.g. "FY 2025-2026"
    target_year: str
    target_type: SBTiTargetType
    growth_rate: Optional[float] = None  # % for percentage targets
    reduction_percentage: Optional[float] = None  # % for percentage targets
    base_year_value: Optional[float] = None  # absolute for percentage
    base_year_intensity: Optional[float] = None  # for intensity
    target_value: Optional[float] = None  # computed for percentage
    target_intensity: Optional[float] = None  # manual for intensity
    unit: Optional[str] = None


class SBTiTargetUpdate(BaseModel):
    target_name: Optional[str] = None
    description: Optional[str] = None
    base_year: Optional[str] = None
    target_year: Optional[str] = None
    target_type: Optional[SBTiTargetType] = None
    growth_rate: Optional[float] = None
    reduction_percentage: Optional[float] = None
    base_year_value: Optional[float] = None
    base_year_intensity: Optional[float] = None
    target_value: Optional[float] = None
    target_intensity: Optional[float] = None
    unit: Optional[str] = None
