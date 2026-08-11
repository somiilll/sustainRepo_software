"""
Sustainability Module Configuration — Contracts / Pydantic Models

Organization-scoped configuration hierarchy:
  Organization → Module → Category → KPI → Fields → Calculations
"""

from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field
from enum import Enum


# =============================================================================
# Enums
# =============================================================================

class ResponseType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    INTEGER = "integer"
    DECIMAL = "decimal"
    PERCENTAGE = "percentage"
    CURRENCY = "currency"
    YES_NO = "yes_no"
    DROPDOWN = "dropdown"
    MULTI_SELECT = "multi_select"
    DATE = "date"
    MONTH = "month"
    FACILITY = "facility"
    FILE = "file"


class FieldType(str, Enum):
    INPUT = "input"
    CALCULATED = "calculated"


class CalculationType(str, Enum):
    QUANTITY_FACTOR = "quantity_factor"       # qty × factor
    DIFFERENCE = "difference"                 # a - b
    SUM = "sum"                               # a + b + c
    RATIO = "ratio"                           # a / b
    PERCENTAGE_OF = "percentage_of"           # (a / b) * 100
    CUSTOM_EXPRESSION = "custom_expression"   # controlled expression string


# =============================================================================
# Module
# =============================================================================

class ModuleCreate(BaseModel):
    module_code: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-z][a-z0-9_]*$')
    module_name: str = Field(..., min_length=1, max_length=100)
    icon: Optional[str] = "Leaf"
    enabled: bool = True
    display_order: int = 0


class ModuleUpdate(BaseModel):
    module_name: Optional[str] = None
    icon: Optional[str] = None
    enabled: Optional[bool] = None
    display_order: Optional[int] = None


# =============================================================================
# Category
# =============================================================================

class CategoryCreate(BaseModel):
    category_code: str = Field(..., min_length=1, max_length=50, pattern=r'^[a-z][a-z0-9_]*$')
    category_name: str = Field(..., min_length=1, max_length=100)
    enabled: bool = True
    display_order: int = 0


class CategoryUpdate(BaseModel):
    category_name: Optional[str] = None
    enabled: Optional[bool] = None
    display_order: Optional[int] = None


# =============================================================================
# KPI
# =============================================================================

class KPICreate(BaseModel):
    kpi_code: str = Field(..., min_length=1, max_length=80, pattern=r'^[a-z][a-z0-9_]*$')
    kpi_name: str = Field(..., min_length=1, max_length=150)
    unit: Optional[str] = None
    description: Optional[str] = None
    enabled: bool = True
    display_order: int = 0


class KPIUpdate(BaseModel):
    kpi_name: Optional[str] = None
    unit: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    display_order: Optional[int] = None


# =============================================================================
# Field / Question
# =============================================================================

class FieldValidation(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None
    decimal_precision: Optional[int] = None
    pattern: Optional[str] = None
    max_file_size_mb: Optional[float] = None
    allowed_file_types: Optional[List[str]] = None


class FieldDefinition(BaseModel):
    field_code: str = Field(..., min_length=1, max_length=80)
    label: str = Field(..., min_length=1, max_length=200)
    field_type: FieldType = FieldType.INPUT
    response_type: ResponseType = ResponseType.TEXT
    unit: Optional[str] = None
    required: bool = False
    help_text: Optional[str] = None
    validation: Optional[FieldValidation] = None
    options: Optional[List[str]] = None
    default_value: Optional[Any] = None
    display_order: int = 0
    enabled: bool = True
    evidence_required: bool = False


class FieldConfigCreate(BaseModel):
    """Create a new field configuration version for a KPI."""
    fields: List[FieldDefinition]
    effective_from: Optional[str] = None  # ISO date, defaults to now


class FieldConfigUpdate(BaseModel):
    """Update fields in the current active version."""
    fields: List[FieldDefinition]


# =============================================================================
# Calculation
# =============================================================================

class CalculationCreate(BaseModel):
    calculation_code: str = Field(..., min_length=1, max_length=80, pattern=r'^[a-z][a-z0-9_]*$')
    calculation_name: str = Field(..., min_length=1, max_length=150)
    calculation_type: CalculationType
    inputs: Dict[str, str]  # role → field_code mapping, e.g. {"quantity": "electricity_consumed", "factor": "grid_ef"}
    expression: Optional[str] = None  # for custom_expression type only
    output_field_code: str
    output_label: str
    output_unit: Optional[str] = None
    enabled: bool = True
    display_order: int = 0


class CalculationUpdate(BaseModel):
    calculation_name: Optional[str] = None
    calculation_type: Optional[CalculationType] = None
    inputs: Optional[Dict[str, str]] = None
    expression: Optional[str] = None
    output_field_code: Optional[str] = None
    output_label: Optional[str] = None
    output_unit: Optional[str] = None
    enabled: Optional[bool] = None
    display_order: Optional[int] = None
