"""
ESG Questionnaire Contracts

Pydantic models for config-driven ESG questionnaire system.
Supports framework-based questions with reusable question types.
"""

from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field


# =============================================================================
# Question Types
# =============================================================================

QUESTION_TYPES = Literal[
    "text",
    "textarea", 
    "yes_no",
    "url",
    "number",
    "table",
    "select",
    "multi_select",
    "date",
    "principle_toggle_with_description",
    "principle_text",
    "conditional_yes_no_table",
    "principle_mode_table",
    "reasons_checklist",
    "fixed_row_table",
    "multi_table",
    "conditional_yes_no_text",
    "fy_comparison_table",
    "grouped_matrix_table",
    "structured_group",
    "comparison_table",
    "yes_no_detail_matrix",
    "dual_conditional_yes_no",
    # Environment Q70-74 Renderer Types
    "yes_no_with_dynamic_table",
    "historical_material_percentage_table",
    "historical_reclaim_percentage_table",
    "historical_waste_management_matrix",
    # Environment Q75-94 Renderer Types (Resource Management, Emissions & Compliance)
    "historical_environmental_metrics_matrix",  # Q75 Energy
    "yes_no_with_nested_details",               # Q76 PAT Scheme
    "historical_water_metrics_matrix",          # Q77 Water Withdrawal
    "historical_water_discharge_matrix",        # Q78 Water Discharge
    "yes_no_with_description",                  # Q79, Q82 ZLD, GHG Reduction
    "historical_emissions_table",               # Q80 Air Emissions
    "linked_ghg_metrics_matrix",                # Q81 Scope 1&2 (linked)
    "historical_waste_management_master_matrix", # Q83 Waste
    "long_text_response",                       # Q84, Q90, Q93
    "dynamic_table",                            # Q85, Q86, Q91
    "historical_water_stress_matrix",           # Q88 Water Stress
    "linked_scope3_metrics_matrix",             # Q89 Scope 3 (linked)
    "text_with_optional_weblink",               # Q92 Business Continuity
    "percentage_with_description"               # Q94 Value Chain Assessment
]

ESG_SECTIONS = Literal["environment", "social", "governance"]
FRAMEWORKS = Literal["BRSR", "GRI", "SBTi"]

# P1-P9 NGRBC Principles
NGRBC_PRINCIPLES = [
    {"key": "P1", "name": "Ethics, Transparency and Accountability"},
    {"key": "P2", "name": "Sustainable and Safe Products/Services"},
    {"key": "P3", "name": "Employee Wellbeing"},
    {"key": "P4", "name": "Stakeholder Responsiveness"},
    {"key": "P5", "name": "Human Rights"},
    {"key": "P6", "name": "Environment Protection"},
    {"key": "P7", "name": "Policy Advocacy"},
    {"key": "P8", "name": "Inclusive Growth"},
    {"key": "P9", "name": "Customer Value"},
]


# =============================================================================
# Question Config Models
# =============================================================================

class TableColumnConfig(BaseModel):
    """Configuration for table column."""
    key: str = Field(..., description="Column key")
    label: str = Field(..., description="Column header label")
    type: Literal["text", "number", "yes_no", "select"] = Field(default="text")
    options: Optional[List[str]] = Field(default=None, description="Options for select type")
    width: Optional[str] = Field(default=None, description="Column width")


class QuestionConfig(BaseModel):
    """Configuration for a single ESG question."""
    question_key: str = Field(..., description="Unique question identifier")
    section: ESG_SECTIONS = Field(..., description="ESG section: environment, social, governance")
    frameworks: List[str] = Field(..., description="Applicable frameworks: BRSR, GRI, SBTi")
    question: str = Field(..., description="Question text")
    type: QUESTION_TYPES = Field(..., description="Question type for rendering")
    required: bool = Field(default=False, description="Is this question mandatory")
    description: Optional[str] = Field(default=None, description="Help text or description")
    placeholder: Optional[str] = Field(default=None, description="Placeholder text for input")
    options: Optional[List[str]] = Field(default=None, description="Options for select/multi_select")
    table_columns: Optional[List[TableColumnConfig]] = Field(default=None, description="Column config for table type")
    validation: Optional[Dict[str, Any]] = Field(default=None, description="Validation rules")
    order: int = Field(default=0, description="Display order within section")
    group: Optional[str] = Field(default=None, description="Question group/subsection")
    conditional: Optional[Dict[str, Any]] = Field(default=None, description="Conditional display rules")


class QuestionConfigCreate(QuestionConfig):
    """Create request for question config."""
    pass


class QuestionConfigUpdate(BaseModel):
    """Update request for question config - all fields optional."""
    question: Optional[str] = None
    type: Optional[QUESTION_TYPES] = None
    required: Optional[bool] = None
    description: Optional[str] = None
    placeholder: Optional[str] = None
    options: Optional[List[str]] = None
    table_columns: Optional[List[TableColumnConfig]] = None
    validation: Optional[Dict[str, Any]] = None
    order: Optional[int] = None
    group: Optional[str] = None
    conditional: Optional[Dict[str, Any]] = None


class QuestionConfigResponse(QuestionConfig):
    """Response model for question config."""
    id: str
    created_at: str
    updated_at: Optional[str] = None


# =============================================================================
# Response Models
# =============================================================================

class PrincipleResponse(BaseModel):
    """Response for a single NGRBC principle."""
    enabled: bool = Field(default=False, description="Is this principle applicable")
    description: str = Field(default="", description="Description/justification")


class PrincipleToggleResponse(BaseModel):
    """Response for principle_toggle_with_description type."""
    mode: Literal["all_together", "principle_wise"] = Field(default="all_together")
    # For "all_together" mode
    all_enabled: Optional[bool] = Field(default=None)
    all_description: Optional[str] = Field(default=None)
    # For "principle_wise" mode
    principles: Optional[Dict[str, PrincipleResponse]] = Field(
        default=None,
        description="P1-P9 individual responses"
    )


class ESGResponseCreate(BaseModel):
    """Create/Update ESG questionnaire responses."""
    responses: Dict[str, Any] = Field(..., description="Question key to answer mapping")


class ESGResponseDocument(BaseModel):
    """Full ESG response document."""
    id: str
    org_id: str
    framework: str
    reporting_year: str
    section: ESG_SECTIONS
    responses: Dict[str, Any]
    created_at: str
    updated_at: Optional[str] = None


class ESGResponseSummary(BaseModel):
    """Summary of ESG responses."""
    org_id: str
    framework: str
    reporting_year: str
    section: ESG_SECTIONS
    total_questions: int
    answered_questions: int
    completion_percentage: float
