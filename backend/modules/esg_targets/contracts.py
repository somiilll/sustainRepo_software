"""
ESG Targets Module - Contracts

Flexible, configuration-driven target definitions for any ESG KPI/Metric.
Designed to support future expansion without schema changes.
"""

from typing import Any, Dict, List, Optional
from enum import Enum
from pydantic import BaseModel, Field


class TargetType(str, Enum):
    """Type of target measurement."""
    ABSOLUTE = "absolute"
    PERCENTAGE = "percentage"
    INTENSITY = "intensity"


class GoalType(str, Enum):
    """How the target value should be interpreted."""
    UPPER_LIMIT = "upper_limit"      # ≤ value
    LOWER_LIMIT = "lower_limit"      # ≥ value
    RANGE = "range"                   # between min and max
    EXACT = "exact"                   # = value


class TrackingMode(str, Enum):
    """Frequency of target tracking."""
    STATIC = "static"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    HALF_YEARLY = "half_yearly"
    YEARLY = "yearly"


class Trajectory(str, Enum):
    """Target progression strategy."""
    MANUAL = "manual"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    FRONT_LOADED = "front_loaded"
    BACK_LOADED = "back_loaded"
    CUSTOM = "custom"


class ScopeType(str, Enum):
    """Where the target applies."""
    ORGANIZATION = "organization"
    FACILITY = "facility"
    # Future: BUSINESS_UNIT, DEPARTMENT, SUPPLIER, COUNTRY


class TargetStatus(str, Enum):
    """Target lifecycle status."""
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ARCHIVED = "archived"


class ThresholdConfig(BaseModel):
    """Optional warning thresholds for dashboards."""
    green: Optional[float] = None
    amber: Optional[float] = None
    red: Optional[float] = None


class BaselineConfig(BaseModel):
    """Baseline reference for progress calculations."""
    period: Optional[str] = None      # e.g., "FY 2024-25"
    value: Optional[float] = None


class ESGTargetCreate(BaseModel):
    """Request body for creating an ESG target."""
    # Basic Information
    target_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    
    # KPI Linkage (hierarchical)
    section: str  # environment, social, governance
    category: str
    subcategory: str
    sub_subcategory: Optional[str] = None
    metric_key: str  # From field_definitions
    metric_label: Optional[str] = None  # Display name for convenience
    
    # Scope
    scope_type: ScopeType = ScopeType.ORGANIZATION
    facility_ids: Optional[List[str]] = None  # Required if scope_type is FACILITY
    
    # Reporting Period
    reporting_type: str  # "FY" or "CY"
    reporting_period: str  # e.g., "FY 2025-26"
    
    # Target Definition
    target_type: TargetType
    goal_type: GoalType
    target_value: Optional[float] = None       # For UPPER_LIMIT, LOWER_LIMIT, EXACT
    minimum_value: Optional[float] = None      # For RANGE
    maximum_value: Optional[float] = None      # For RANGE
    unit: Optional[str] = None                 # Inherited from KPI, stored for display
    
    # Baseline
    baseline: Optional[BaselineConfig] = None
    
    # Tracking
    tracking_mode: TrackingMode = TrackingMode.STATIC
    tracking_values: Optional[Dict[str, float]] = None  # Key = period string, Value = target
    start_period: Optional[str] = None         # For STATIC mode
    end_period: Optional[str] = None           # For STATIC mode
    trajectory: Trajectory = Trajectory.MANUAL
    
    # Thresholds
    thresholds: Optional[ThresholdConfig] = None
    
    # Status
    status: TargetStatus = TargetStatus.DRAFT
    
    # Extensibility - any future fields
    metadata: Optional[Dict[str, Any]] = None


class ESGTargetUpdate(BaseModel):
    """Request body for updating an ESG target. All fields optional."""
    target_name: Optional[str] = None
    description: Optional[str] = None
    
    section: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    metric_key: Optional[str] = None
    metric_label: Optional[str] = None
    
    scope_type: Optional[ScopeType] = None
    facility_ids: Optional[List[str]] = None
    
    reporting_type: Optional[str] = None
    reporting_period: Optional[str] = None
    
    target_type: Optional[TargetType] = None
    goal_type: Optional[GoalType] = None
    target_value: Optional[float] = None
    minimum_value: Optional[float] = None
    maximum_value: Optional[float] = None
    unit: Optional[str] = None
    
    baseline: Optional[BaselineConfig] = None
    
    tracking_mode: Optional[TrackingMode] = None
    tracking_values: Optional[Dict[str, float]] = None
    start_period: Optional[str] = None
    end_period: Optional[str] = None
    trajectory: Optional[Trajectory] = None
    
    thresholds: Optional[ThresholdConfig] = None
    
    status: Optional[TargetStatus] = None
    
    metadata: Optional[Dict[str, Any]] = None


class ESGTargetResponse(BaseModel):
    """Response model for ESG target."""
    id: str
    organization_id: str
    
    target_name: str
    description: Optional[str] = None
    
    section: str
    category: str
    subcategory: str
    sub_subcategory: Optional[str] = None
    metric_key: str
    metric_label: Optional[str] = None
    
    scope_type: str
    facility_ids: Optional[List[str]] = None
    facility_names: Optional[List[str]] = None  # Populated on read
    
    reporting_type: str
    reporting_period: str
    
    target_type: str
    goal_type: str
    target_value: Optional[float] = None
    minimum_value: Optional[float] = None
    maximum_value: Optional[float] = None
    unit: Optional[str] = None
    
    baseline: Optional[Dict[str, Any]] = None
    
    tracking_mode: str
    tracking_values: Optional[Dict[str, float]] = None
    start_period: Optional[str] = None
    end_period: Optional[str] = None
    trajectory: str
    
    thresholds: Optional[Dict[str, Any]] = None
    
    status: str
    
    metadata: Optional[Dict[str, Any]] = None
    
    version: int = 1
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None
    updated_at: Optional[str] = None
    
    class Config:
        extra = "ignore"


class ESGTargetListFilters(BaseModel):
    """Query filters for listing targets."""
    section: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    facility_id: Optional[str] = None
    reporting_period: Optional[str] = None
    status: Optional[str] = None
    search: Optional[str] = None
