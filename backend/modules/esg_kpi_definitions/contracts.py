"""
ESG KPI Definitions Module - Contracts

Configuration-driven KPI definitions for reusable ESG metrics.
Designed for future-proof extensibility without schema changes.
"""

from typing import Any, Dict, List, Optional
from enum import Enum
from pydantic import BaseModel, Field


class SourceType(str, Enum):
    """Where KPI data comes from."""
    RECORDS = "records"
    FRAMEWORK_QUESTION = "framework_question"
    MANUAL = "manual"
    CALCULATED = "calculated"
    EXTERNAL_API = "external_api"


class AggregationType(str, Enum):
    """How to aggregate values."""
    SUM = "sum"
    COUNT = "count"
    AVG = "avg"
    MIN = "min"
    MAX = "max"
    FORMULA = "formula"


class FilterOperator(str, Enum):
    """Supported filter operators."""
    EQUALS = "="
    NOT_EQUALS = "!="
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_EQUAL = ">="
    LESS_EQUAL = "<="
    IN = "in"
    NOT_IN = "not_in"
    BETWEEN = "between"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"


class OutputType(str, Enum):
    """KPI output type."""
    NUMBER = "number"
    PERCENTAGE = "percentage"
    CURRENCY = "currency"
    BOOLEAN = "boolean"
    TEXT = "text"
    RATING = "rating"


class FormulaType(str, Enum):
    """Formula execution type (for future)."""
    MANUAL = "manual"
    EXPRESSION = "expression"
    SCRIPT = "script"
    AI = "ai"


class KPIStatus(str, Enum):
    """KPI lifecycle status."""
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"
    DEPRECATED = "deprecated"


# =============================================================================
# Filter Configuration
# =============================================================================

class FilterCondition(BaseModel):
    """Single filter condition for KPI query."""
    field_key: str
    operator: FilterOperator = FilterOperator.EQUALS
    value: Any  # Can be string, number, list, etc.
    value_type: Optional[str] = None  # text, number, boolean, date, dropdown


# =============================================================================
# Source Configuration
# =============================================================================

class RecordsSourceConfig(BaseModel):
    """Configuration for Records source type."""
    section: str  # environment, social, governance
    category_id: Optional[str] = None
    value_field: str  # Field to aggregate (quantity, co2e, etc.)
    filters: List[FilterCondition] = []


class SourceConfig(BaseModel):
    """Generic source configuration - extensible for future source types."""
    records: Optional[RecordsSourceConfig] = None
    # Future: framework_question, manual, calculated, external_api configs


# =============================================================================
# Unit Configuration
# =============================================================================

class UnitConfig(BaseModel):
    """Unit configuration for KPI."""
    default_unit: Optional[str] = None
    supported_units: List[str] = []
    allow_unit_conversion: bool = False


# =============================================================================
# Display Configuration
# =============================================================================

class DisplayConfig(BaseModel):
    """Display/UI configuration for KPI."""
    display_name: Optional[str] = None
    short_name: Optional[str] = None
    display_order: int = 0
    category_order: int = 0
    icon: Optional[str] = None
    color: Optional[str] = None
    decimal_places: int = 2


# =============================================================================
# Visibility Configuration
# =============================================================================

class VisibilityConfig(BaseModel):
    """Feature visibility flags."""
    dashboard_enabled: bool = True
    reports_enabled: bool = True
    tracking_enabled: bool = True
    target_enabled: bool = True
    analytics_enabled: bool = True


# =============================================================================
# Formula Configuration (Future)
# =============================================================================

class FormulaConfig(BaseModel):
    """Formula configuration for calculated KPIs (future)."""
    formula_type: FormulaType = FormulaType.MANUAL
    formula_definition: Optional[str] = None
    dependencies: List[str] = []  # List of metric_codes this KPI depends on


# =============================================================================
# Validation Rules (Future)
# =============================================================================

class ValidationRule(BaseModel):
    """Validation rule for KPI values."""
    rule_type: str  # min, max, required, regex, custom
    value: Optional[Any] = None
    message: Optional[str] = None


# =============================================================================
# Main KPI Definition Models
# =============================================================================

class KPIDefinitionCreate(BaseModel):
    """Request body for creating a KPI definition."""
    # Basic Information
    metric_name: str = Field(..., min_length=1, max_length=255)
    short_name: Optional[str] = None
    metric_code: Optional[str] = None  # Auto-generated if not provided
    description: Optional[str] = None
    
    # Hierarchy
    section: str  # environment, social, governance
    category_name: Optional[str] = None
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    
    # Source
    source_type: SourceType = SourceType.RECORDS
    source_config: Optional[Dict[str, Any]] = None
    
    # Aggregation
    aggregation_type: AggregationType = AggregationType.SUM
    value_field: Optional[str] = None  # Field to aggregate
    
    # Filters
    filters: List[FilterCondition] = []
    
    # Dimensions (for grouping in dashboards)
    dimensions: List[str] = []  # facility, month, source, gender, region, etc.
    
    # Scope
    supported_scopes: List[str] = ["organization", "facility"]
    
    # Output
    output_type: OutputType = OutputType.NUMBER
    
    # Units
    unit_config: Optional[UnitConfig] = None
    
    # Formula (future)
    formula_config: Optional[FormulaConfig] = None
    
    # Validation (future)
    validation_rules: List[ValidationRule] = []
    
    # Display
    display_config: Optional[DisplayConfig] = None
    
    # Visibility
    visibility: Optional[VisibilityConfig] = None
    
    # Status
    status: KPIStatus = KPIStatus.DRAFT
    
    # Future-ready fields
    tags: List[str] = []
    metadata: Optional[Dict[str, Any]] = None


class KPIDefinitionUpdate(BaseModel):
    """Request body for updating a KPI definition. All fields optional."""
    metric_name: Optional[str] = None
    short_name: Optional[str] = None
    description: Optional[str] = None
    
    section: Optional[str] = None
    category_name: Optional[str] = None
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    
    source_type: Optional[SourceType] = None
    source_config: Optional[Dict[str, Any]] = None
    
    aggregation_type: Optional[AggregationType] = None
    value_field: Optional[str] = None
    
    filters: Optional[List[FilterCondition]] = None
    dimensions: Optional[List[str]] = None
    supported_scopes: Optional[List[str]] = None
    
    output_type: Optional[OutputType] = None
    unit_config: Optional[UnitConfig] = None
    
    formula_config: Optional[FormulaConfig] = None
    validation_rules: Optional[List[ValidationRule]] = None
    
    display_config: Optional[DisplayConfig] = None
    visibility: Optional[VisibilityConfig] = None
    
    status: Optional[KPIStatus] = None
    
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class KPIDefinitionResponse(BaseModel):
    """Response model for KPI definition."""
    id: str
    
    metric_name: str
    short_name: Optional[str] = None
    metric_code: str
    description: Optional[str] = None
    
    section: str
    category_name: Optional[str] = None
    subcategory: Optional[str] = None
    sub_subcategory: Optional[str] = None
    
    source_type: str
    source_config: Optional[Dict[str, Any]] = None
    
    aggregation_type: str
    value_field: Optional[str] = None
    
    filters: List[Dict[str, Any]] = []
    dimensions: List[str] = []
    supported_scopes: List[str] = []
    
    output_type: str
    unit_config: Optional[Dict[str, Any]] = None
    
    formula_config: Optional[Dict[str, Any]] = None
    validation_rules: List[Dict[str, Any]] = []
    
    display_config: Optional[Dict[str, Any]] = None
    visibility: Optional[Dict[str, Any]] = None
    
    status: str
    
    tags: List[str] = []
    metadata: Optional[Dict[str, Any]] = None
    
    # References (for orphan check)
    target_count: int = 0
    dashboard_count: int = 0
    
    version: int = 1
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_by: Optional[str] = None
    updated_by_name: Optional[str] = None
    updated_at: Optional[str] = None
    
    class Config:
        extra = "ignore"
