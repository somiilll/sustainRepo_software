"""
Universal Calculation Engine - Data Models

This module defines all Pydantic models for the calculation engine.
All configurations are stored in MongoDB and managed by SuperAdmin.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from enum import Enum


# ============================================
# ENUMS - For type safety (not hardcoding!)
# ============================================

class MethodType(str, Enum):
    """Supported calculation method types"""
    FACTOR_BASED = "factor_based"           # Traditional EF-based: qty × NCV × EF
    FUGITIVE = "fugitive"                   # Refrigerants: charge × leakage_rate × GWP
    PROCESS_BASED = "process_based"         # Stoichiometric: activity × conversion_factor
    DIRECT_CO2E = "direct_co2e"            # Direct: qty × ef_co2e
    ELECTRICITY = "electricity"             # Scope 2: qty × grid_ef (location/market based)
    CUSTOM = "custom"                       # User-defined formula


class ParameterSource(str, Enum):
    """Where parameter values come from"""
    USER_INPUT = "user_input"               # User provides value
    FUEL_DATABASE = "fuel_database"         # From fuel_database collection
    GWP_CONFIG = "gwp_config"               # From active gwp_config
    ORGANIZATION = "organization"           # Org-level override
    FACILITY = "facility"                   # Facility-level override
    DERIVED = "derived"                     # Calculated from other params
    CONSTANT = "constant"                   # Fixed value
    REGIONAL = "regional"                   # Region-specific value


class OutputGas(str, Enum):
    """Supported output gases"""
    CO2 = "co2"
    CH4 = "ch4"
    N2O = "n2o"
    CO2E = "co2e"


# ============================================
# INPUT FIELD TEMPLATES
# ============================================

class InputFieldCreate(BaseModel):
    """Definition of a reusable input field"""
    field_key: str                          # e.g., "fuel_quantity", "charge", "spend"
    field_name: str                         # e.g., "Fuel Quantity"
    description: Optional[str] = None
    data_type: str = "number"               # number, text, select, percentage
    default_unit: Optional[str] = None      # e.g., "kg", "L", "kWh"
    allowed_units: List[str] = []           # Units user can choose from
    is_required: bool = True
    validation_min: Optional[float] = None
    validation_max: Optional[float] = None
    display_order: int = 0
    applicable_scopes: List[str] = []       # ["scope1", "scope2"]
    applicable_categories: List[str] = []


class InputFieldResponse(InputFieldCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


# ============================================
# INPUT TEMPLATES (Group of fields)
# ============================================

class InputTemplateCreate(BaseModel):
    """Template grouping input fields for specific emission types"""
    template_key: str                       # e.g., "stationary_combustion", "fugitive"
    template_name: str
    description: Optional[str] = None
    field_keys: List[str] = []              # References to input_fields
    applicable_scopes: List[str] = []
    applicable_categories: List[str] = []
    applicable_method_types: List[str] = [] # Which method types use this template
    is_active: bool = True
    display_order: int = 0


class InputTemplateResponse(InputTemplateCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    fields: Optional[List[InputFieldResponse]] = []  # Populated on fetch
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


# ============================================
# PARAMETER VALUES (Context-aware)
# ============================================

class ParameterValueCreate(BaseModel):
    """
    Context-aware parameter value.
    Multiple values can exist for same parameter with different conditions.
    """
    parameter_key: str                      # e.g., "density", "ef_co2", "cv"
    value: float
    unit: Optional[str] = None
    
    # Context conditions - more specific = higher priority
    conditions: Dict[str, Any] = {}         # {"fuel_type": "diesel", "region": "India"}
    
    # Priority (lower = higher priority)
    priority: int = 100                     # 1=user input, 10=org, 20=regional, 100=global
    
    # Source tracking
    source: str = "global_default"          # "user_input", "org_override", "regional_db", "fuel_database"
    source_reference: Optional[str] = None  # ID reference to source record
    
    # Validity
    is_active: bool = True
    valid_from: Optional[str] = None        # ISO date
    valid_to: Optional[str] = None
    
    notes: Optional[str] = None


class ParameterValueResponse(ParameterValueCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


# ============================================
# CALCULATION METHODS
# ============================================

class MethodStepCreate(BaseModel):
    """Single step in multi-step calculation"""
    step_order: int
    output_key: str                         # Variable name for result
    formula: str                            # Expression: "quantity * ncv"
    description: Optional[str] = None


class CalculationMethodCreate(BaseModel):
    """
    Defines a calculation method (computation model).
    This is the core of the engine - completely dynamic.
    """
    method_key: str                         # e.g., "fuel_combustion", "fugitive_gwp"
    method_name: str
    method_type: str                        # MethodType enum value
    description: Optional[str] = None
    
    # Required parameters for this method
    required_parameters: List[str] = []     # ["fuel_quantity", "cv", "ef_co2"]
    optional_parameters: List[str] = []
    
    # Formula definition
    # For simple methods: single formula
    formula: Optional[str] = None           # "quantity * cv * ef_co2 / 1000000"
    
    # For complex methods: multi-step
    steps: List[Dict[str, Any]] = []        # [{"step_order": 1, "output_key": "energy_tj", ...}]
    
    # Output configuration
    outputs: List[str] = ["co2e"]           # ["co2", "ch4", "n2o", "co2e"]
    output_unit: str = "kg"                 # Base unit for outputs
    supports_gas_split: bool = False        # Whether method calculates individual gases
    
    # Method selection criteria
    applicable_scopes: List[str] = []       # ["scope1", "scope2"]
    applicable_categories: List[str] = []
    applicable_method_types: List[str] = [] # For filtering
    
    # Conditions for auto-selection
    selection_conditions: Dict[str, Any] = {}  # {"has_cv": True, "has_ef": True}
    
    # Priority for method selection (lower = preferred)
    rank: int = 100
    
    # Unit conversion rules
    unit_conversions: Dict[str, Any] = {}
    
    is_active: bool = True
    display_order: int = 0


class CalculationMethodResponse(CalculationMethodCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


# ============================================
# CALCULATION RULES (Method Selection)
# ============================================

class CalculationRuleCreate(BaseModel):
    """
    Rules for selecting which method to use.
    SuperAdmin defines conditions -> method mapping.
    """
    rule_key: str                           # e.g., "scope1_combustion_with_cv"
    rule_name: str
    description: Optional[str] = None
    
    # Matching conditions
    scope: Optional[str] = None             # "scope1", "scope2"
    category: Optional[str] = None
    sub_category: Optional[str] = None
    industry: Optional[str] = None
    
    # Additional conditions
    conditions: Dict[str, Any] = {}         # {"has_cv": True, "fuel_type": "diesel"}
    
    # Method to use when rule matches
    method_id: str                          # Reference to calculation_methods
    
    # Rule priority (lower = evaluated first)
    priority: int = 100
    
    is_active: bool = True


class CalculationRuleResponse(CalculationRuleCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    method_name: Optional[str] = None       # Populated from calculation_methods
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


# ============================================
# CONTEXT OBJECT (for calculations)
# ============================================

class CalculationContext(BaseModel):
    """
    Context passed to every calculation.
    Drives parameter resolution and method selection.
    """
    scope: str                              # "scope1", "scope2"
    category: str
    sub_category: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    region: Optional[str] = None
    year: Optional[int] = None
    organization_id: Optional[str] = None
    facility_id: Optional[str] = None
    fuel_type: Optional[str] = None
    fuel_database_id: Optional[str] = None
    
    # Additional context for method selection
    extra: Dict[str, Any] = {}


# ============================================
# CALCULATION REQUEST/RESPONSE
# ============================================

class CalculationRequest(BaseModel):
    """Request for emission calculation"""
    context: CalculationContext
    
    # User inputs
    inputs: Dict[str, Any] = {}             # {"quantity": 1000, "quantity_unit": "kg"}
    
    # Optional overrides
    overrides: Dict[str, Any] = {}          # {"density": 0.85, "cv": 45.5}
    override_justifications: Dict[str, str] = {}
    
    # Optional: force specific method
    force_method_id: Optional[str] = None


class ParameterResolution(BaseModel):
    """How a parameter was resolved"""
    parameter_key: str
    value: float
    unit: Optional[str] = None
    source: str                             # "user_input", "fuel_database", "org_override"
    source_reference: Optional[str] = None  # ID of source record
    priority: int
    conditions_matched: Dict[str, Any] = {}
    is_override: bool = False


class CalculationAudit(BaseModel):
    """Audit trail for calculation"""
    method_id: str
    method_name: str
    method_type: str
    parameters_resolved: List[ParameterResolution]
    formula_used: str
    intermediate_values: Dict[str, Any] = {}  # Can contain floats, strings, or errors
    gwp_source: Optional[str] = None
    gwp_values_used: Dict[str, float] = {}


class CalculationResult(BaseModel):
    """Result of emission calculation"""
    # Primary outputs
    co2e: float                             # Total CO2 equivalent
    
    # Gas breakdown (if supported)
    co2: Optional[float] = None
    ch4: Optional[float] = None
    n2o: Optional[float] = None
    
    # Output units
    output_unit: str = "kg"
    
    # Audit trail (basic)
    audit: CalculationAudit
    
    # Calculation status
    success: bool = True
    error: Optional[str] = None
    warnings: List[str] = []


# ============================================
# ORGANIZATION/FACILITY OVERRIDES
# ============================================

class ParameterOverrideCreate(BaseModel):
    """
    Organization or Facility level parameter override.
    Allows orgs/facilities to customize default values.
    """
    parameter_key: str                      # e.g., "density", "cv", "ef_co2"
    value: float
    unit: Optional[str] = None
    
    # Scope of override
    organization_id: Optional[str] = None   # If set, org-level override
    facility_id: Optional[str] = None       # If set, facility-level override
    
    # Conditions (optional - for specific fuels, etc.)
    conditions: Dict[str, Any] = {}         # {"fuel_type": "diesel"}
    
    # Documentation
    justification: str                      # Required for audit
    source_document: Optional[str] = None   # Reference to evidence
    
    # Validity
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    is_active: bool = True


class ParameterOverrideResponse(ParameterOverrideCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[str] = None


# ============================================
# UNIT CONVERSION
# ============================================

class UnitConversionCreate(BaseModel):
    """Unit conversion definition"""
    from_unit: str
    to_unit: str
    conversion_type: str                    # "multiply", "divide", "formula"
    factor: Optional[float] = None          # For multiply/divide
    formula: Optional[str] = None           # For complex conversions
    requires_parameter: Optional[str] = None  # e.g., "density" for L -> kg
    parameter_unit: Optional[str] = None
    is_active: bool = True


class UnitConversionResponse(UnitConversionCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
