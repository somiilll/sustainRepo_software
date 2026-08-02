"""
Supplier Assessment Pydantic contracts/schemas.
"""
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict, Field


# ============================================================================
# Supplier Relationship Schemas
# ============================================================================

class SupplierCreate(BaseModel):
    """Create a new supplier invitation."""
    company_name: str
    contact_person: str
    email: EmailStr
    contact_number: Optional[str] = None
    due_date: Optional[str] = None  # ISO date string
    # Module configuration
    modules_enabled: List[Literal["esg", "ghg"]] = ["esg", "ghg"]  # Default: both enabled
    ghg_scopes_enabled: List[Literal["scope1", "scope2"]] = ["scope1", "scope2"]  # Default: both scopes


class SupplierUpdate(BaseModel):
    """Update supplier details."""
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    due_date: Optional[str] = None
    is_active: Optional[bool] = None
    # Module configuration
    modules_enabled: Optional[List[Literal["esg", "ghg"]]] = None
    ghg_scopes_enabled: Optional[List[Literal["scope1", "scope2"]]] = None


class SupplierResponse(BaseModel):
    """Supplier relationship response."""
    model_config = ConfigDict(extra="ignore")
    
    id: str
    customer_org_id: str
    supplier_org_id: str
    company_name: str
    contact_person: str
    contact_email: str
    contact_number: Optional[str] = None
    revenue_percentage: Optional[float] = None
    revenue_amount: Optional[float] = None
    revenue_currency: Optional[str] = "USD"
    invitation_status: str  # pending, accepted, completed
    due_date: Optional[str] = None
    last_reminder_sent: Optional[str] = None
    reminder_count: int = 0
    is_active: bool = True
    
    # Module configuration
    modules_enabled: List[str] = ["esg", "ghg"]
    ghg_scopes_enabled: List[str] = ["scope1", "scope2"]
    
    # Progress tracking
    esg_completion_percent: float = 0.0
    ghg_completion_percent: float = 0.0
    overall_completion_percent: float = 0.0
    esg_score: Optional[float] = None
    ghg_score: Optional[float] = None
    overall_score: Optional[float] = None
    
    created_by: str
    created_at: str
    updated_at: Optional[str] = None


class SupplierListResponse(BaseModel):
    """Paginated supplier list."""
    suppliers: List[SupplierResponse]
    total: int
    page: int
    page_size: int


# ============================================================================
# Supplier Self-Service Schemas
# ============================================================================

class RevenueInfoUpdate(BaseModel):
    """Supplier updates their revenue information."""
    revenue_percentage: Optional[float] = Field(None, ge=0, le=100)
    revenue_amount: Optional[float] = Field(None, ge=0)  # Amount in currency
    revenue_currency: Optional[str] = "USD"  # Currency code


# ============================================================================
# Questionnaire Schemas
# ============================================================================

class QuestionOption(BaseModel):
    """Option for dropdown questions."""
    value: str
    label: str
    score: Optional[float] = None  # Score for this option (question-level scoring)


class QuestionCreate(BaseModel):
    """Create a questionnaire question."""
    question_text: str
    description: Optional[str] = None
    response_type: str  # yes_no, numeric, text, dropdown
    options: Optional[List[QuestionOption]] = None  # For dropdown
    required: bool = True
    weight: float = 1.0  # Question weight for scoring
    category: str  # environment, social, governance
    order: int = 0


class QuestionUpdate(BaseModel):
    """Update a question."""
    question_text: Optional[str] = None
    description: Optional[str] = None
    response_type: Optional[str] = None
    options: Optional[List[QuestionOption]] = None
    required: Optional[bool] = None
    weight: Optional[float] = None
    category: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None


class QuestionResponse(BaseModel):
    """Question response model."""
    model_config = ConfigDict(extra="ignore")
    
    id: str
    questionnaire_id: str
    question_text: str
    description: Optional[str] = None
    response_type: str
    options: Optional[List[Dict[str, Any]]] = None
    required: bool = True
    weight: float = 1.0
    category: str
    order: int = 0
    is_active: bool = True
    created_at: str


class QuestionnaireCreate(BaseModel):
    """Create a questionnaire template."""
    name: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    scoring_method: str = "question"  # question or section
    section_weights: Optional[Dict[str, float]] = None  # e.g., {"environment": 50, "social": 30, "governance": 20}


class QuestionnaireUpdate(BaseModel):
    """Update questionnaire."""
    name: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    scoring_method: Optional[str] = None
    section_weights: Optional[Dict[str, float]] = None
    is_active: Optional[bool] = None


class QuestionnaireResponse(BaseModel):
    """Questionnaire template response."""
    model_config = ConfigDict(extra="ignore")
    
    id: str
    organization_id: str
    name: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    scoring_method: str = "question"
    section_weights: Optional[Dict[str, float]] = None
    is_active: bool = True
    question_count: int = 0
    created_by: str
    created_at: str
    updated_at: Optional[str] = None


# ============================================================================
# Supplier Response Schemas
# ============================================================================

class SupplierAnswerSubmit(BaseModel):
    """Submit answer to a question."""
    question_id: str
    answer: Any  # Depends on response_type


class SupplierResponsesSubmit(BaseModel):
    """Submit multiple answers at once."""
    answers: List[SupplierAnswerSubmit]
    is_draft: bool = True  # False = final submission


class SupplierQuestionnaireStatusResponse(BaseModel):
    """Supplier's questionnaire status."""
    model_config = ConfigDict(extra="ignore")
    
    questionnaire_id: str
    questionnaire_name: str
    supplier_relationship_id: str
    status: str  # not_started, in_progress, submitted
    completion_percent: float = 0.0
    answered_count: int = 0
    total_questions: int = 0
    calculated_score: Optional[float] = None
    submitted_at: Optional[str] = None
    due_date: Optional[str] = None


# ============================================================================
# GHG Emission Schemas (Simplified for Suppliers)
# ============================================================================

class SupplierEmissionCreate(BaseModel):
    """Simplified emission record for suppliers."""
    reporting_period: str  # e.g., "2024-01" for monthly
    scope: str  # scope1 or scope2 only
    category: str
    sub_category: str
    fuel_type: Optional[str] = None
    
    # Dynamic field values for calculation
    dynamic_field_values: Optional[Dict[str, Dict[str, Any]]] = {}
    
    # Notes
    notes: Optional[str] = None


class SupplierEmissionResponse(BaseModel):
    """Supplier emission record response."""
    model_config = ConfigDict(extra="ignore")
    
    id: str
    supplier_relationship_id: str
    supplier_org_id: str
    customer_org_id: str
    facility_id: Optional[str] = None
    reporting_period: str
    scope: str
    category: str
    sub_category: Optional[str] = None
    fuel_type: Optional[str] = None
    
    # Calculated emissions
    co2_emissions: Optional[float] = None
    ch4_emissions: Optional[float] = None
    n2o_emissions: Optional[float] = None
    co2e_emissions: Optional[float] = None
    total_emissions: Optional[float] = None
    
    # Metadata
    status: str = "draft"  # draft, submitted
    notes: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


# ============================================================================
# Ranking Schemas
# ============================================================================

class SupplierRankingEntry(BaseModel):
    """Single supplier ranking entry."""
    rank: int
    supplier_id: str
    company_name: str
    esg_score: Optional[float] = None
    ghg_score: Optional[float] = None
    overall_score: Optional[float] = None
    completion_status: str  # not_started, in_progress, completed


class SupplierRankingResponse(BaseModel):
    """Supplier rankings response."""
    rankings: List[SupplierRankingEntry]
    total_suppliers: int
    ranked_suppliers: int


# ============================================================================
# Reminder Schemas
# ============================================================================

class ReminderSend(BaseModel):
    """Send reminder to supplier."""
    supplier_relationship_id: str
    custom_message: Optional[str] = None
