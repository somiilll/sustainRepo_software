"""
Universal Calculation Engine - Data Models

This module defines all Pydantic models for the calculation engine.
All configurations are stored in MongoDB and managed by SuperAdmin.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from enum import Enum


# ============================================
# ENUMS - For type safety
# ============================================

class ParameterSource(str, Enum):
    """Where parameter values come from"""
    USER_INPUT = "user_input"               # User provides value
    FUEL_DATABASE = "fuel_database"         # From fuel_database collection
    GWP_CONFIG = "gwp_config"               # From active gwp_config
    ORGANIZATION = "organization"           # Org-level override
    FACILITY = "facility"                   # Facility-level override
    DERIVED = "derived"                     # Calculated from other params
    CONSTANT = "constant"                   # Fixed value


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

class ParameterSourceConfig(BaseModel):
    """
    Defines where a parameter value comes from.
    This is the key to understanding how parameters are resolved.
    """
    parameter_key: str                      # e.g., "ncv", "ef_co2"
    source_type: str                        # "user_input", "fuel_database", "gwp_config", "derived", "constant"
    
    # For fuel_database source
    fuel_db_field: Optional[str] = None     # e.g., "calorific_value", "emission_factor_co2"
    
    # For gwp_config source
    gwp_field: Optional[str] = None         # e.g., "ch4_fossil_gwp", "n2o_gwp"
    
    # For constant source
    constant_value: Optional[float] = None
    
    # For derived source (calculated from other params)
    derived_formula: Optional[str] = None   # e.g., "quantity * density"
    
    # Default value (fallback if not found in database/config)
    default_value: Optional[float] = None
    
    # Whether user can override this value
    allow_override: bool = True
    
    # Override field key (if different from parameter_key)
    override_field_key: Optional[str] = None  # e.g., "custom_ncv" for "ncv"


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
    description: Optional[str] = None
    
    # Parameters and their sources
    # This is the KEY configuration - defines where each parameter comes from
    parameter_sources: List[Dict[str, Any]] = []  # List of ParameterSourceConfig
    
    # Required parameters (must be resolvable)
    required_parameters: List[str] = []     # ["quantity", "ncv", "ef_co2"]
    optional_parameters: List[str] = []     # ["density", "ef_ch4", "ef_n2o"]
    
    # Formula definition
    # For simple methods: single formula
    formula: Optional[str] = None           # "quantity * ncv * ef_co2"
    
    # For multi-output: use dict format
    # "{co2: quantity * ncv * ef_co2, ch4: quantity * ncv * ef_ch4}"
    
    # For complex methods: multi-step
    steps: List[Dict[str, Any]] = []        # [{"step_order": 1, "output_key": "energy_tj", ...}]
    
    # Output configuration
    outputs: List[str] = ["co2e"]           # ["co2", "ch4", "n2o", "co2e"]
    output_unit: str = "kg"                 # Base unit for outputs
    supports_gas_split: bool = False        # Whether method calculates individual gases
    
    # Method selection criteria
    applicable_scopes: List[str] = []       # ["scope1", "scope2"]
    applicable_categories: List[str] = []
    
    # Conditions for auto-selection
    selection_conditions: Dict[str, Any] = {}  # {"has_fuel": True}
    
    # Priority for method selection (lower = preferred)
    rank: int = 100
    
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
    model_config = ConfigDict(extra="allow")  # Allow extra fields to be stored in the model
    
    scope: str                              # "scope1", "scope2"
    category: str
    sub_category: Optional[str] = None
    industry: Optional[str] = None
    industry_sector: Optional[str] = None   # Alias for industry
    country: Optional[str] = None
    region: Optional[str] = None
    year: Optional[int] = None
    organization_id: Optional[str] = None
    facility_id: Optional[str] = None
    fuel_type: Optional[str] = None
    fuel: Optional[str] = None              # Alias for fuel_type (user-friendly name)
    fuel_id: Optional[str] = None           # Alias for fuel_database_id
    fuel_database_id: Optional[str] = None
    input_unit: Optional[str] = None        # Unit of input quantity (e.g., "L", "kg", "gal")
    
    # Additional context for method selection
    extra: Dict[str, Any] = {}
    
    def __init__(self, **data):
        super().__init__(**data)
        # Normalize fuel_type: use fuel if fuel_type not set
        if not self.fuel_type and self.fuel:
            object.__setattr__(self, 'fuel_type', self.fuel)
        # Normalize fuel_database_id: use fuel_id if fuel_database_id not set
        if not self.fuel_database_id and self.fuel_id:
            object.__setattr__(self, 'fuel_database_id', self.fuel_id)


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
    parameters_resolved: List[ParameterResolution]
    formula_used: str = ""  # Default to empty string to avoid validation errors
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
    from_unit: str                          # Unit symbol (from units collection)
    to_unit: str                            # Unit symbol (from units collection)
    conversion_type: str                    # "multiply", "divide", "formula"
    factor: Optional[float] = None          # For multiply/divide
    formula: Optional[str] = None           # For complex conversions (use 'value' for input)
    
    # Parameter configuration (for formula-based conversions needing fuel properties)
    requires_parameter: Optional[str] = None      # e.g., "density" for L -> kg
    parameter_source: Optional[str] = "fuel_database"  # "fuel_database", "user_input", "constant"
    parameter_source_field: Optional[str] = None  # Field in fuel_database, e.g., "density"
    parameter_default_value: Optional[float] = None  # Default if not found
    allow_parameter_override: bool = True         # Whether user can override
    
    is_active: bool = True


class UnitConversionResponse(UnitConversionCreate):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None
