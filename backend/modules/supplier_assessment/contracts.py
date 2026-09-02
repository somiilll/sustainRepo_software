"""
Supplier Assessment Pydantic contracts/schemas.
"""
from typing import List, Optional, Dict, Any, Literal
from datetime import datetime
from pydantic import AliasChoices, BaseModel, EmailStr, ConfigDict, Field, field_validator, model_validator

from shared.utils.emission_records import normalize_reporting_period_for_storage


# ============================================================================
# Supplier Relationship Schemas
# ============================================================================

class SupplierCreate(BaseModel):
    """Create a new supplier invitation."""
    company_name: str
    contact_person: str
    email: EmailStr
    contact_number: Optional[str] = None
    access_revoke_date: Optional[str] = Field(default=None, validation_alias=AliasChoices("access_revoke_date", "due_date"))
    reporting_period: Optional[str] = None
    revenue_required: bool = False
    # Module configuration
    modules_enabled: Optional[List[Literal["esg", "ghg", "documents", "training"]]] = None
    ghg_scopes_enabled: Optional[List[Literal["scope1", "scope2"]]] = None
    ghg_submission_frequency: Literal["monthly", "quarterly", "yearly"] = "yearly"
    questionnaire_ids: List[str] = Field(default_factory=list)
    document_requirement_ids: List[str] = Field(default_factory=list)
    training_requirement_ids: List[str] = Field(default_factory=list)


class SupplierUpdate(BaseModel):
    """Update supplier details."""
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    contact_number: Optional[str] = None
    access_revoke_date: Optional[str] = Field(default=None, validation_alias=AliasChoices("access_revoke_date", "due_date"))
    reporting_period: Optional[str] = None
    is_active: Optional[bool] = None
    # Module configuration
    modules_enabled: Optional[List[Literal["esg", "ghg", "documents", "training"]]] = None
    ghg_scopes_enabled: Optional[List[Literal["scope1", "scope2"]]] = None
    ghg_submission_frequency: Optional[Literal["monthly", "quarterly", "yearly"]] = None
    questionnaire_ids: Optional[List[str]] = None
    document_requirement_ids: Optional[List[str]] = None
    training_requirement_ids: Optional[List[str]] = None
    revenue_required: Optional[bool] = None


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
    revenue_required: bool = False
    invitation_status: str  # pending, accepted, completed
    access_revoke_date: Optional[str] = None
    reporting_period: Optional[str] = None
    last_reminder_sent: Optional[str] = None
    reminder_count: int = 0
    is_active: bool = True
    
    # Module configuration
    modules_enabled: List[str] = ["esg", "ghg"]
    ghg_scopes_enabled: List[str] = ["scope1", "scope2"]
    ghg_submission_frequency: Literal["monthly", "quarterly", "yearly"] = "yearly"
    questionnaire_ids: List[str] = []
    document_requirement_ids: List[str] = []
    training_requirement_ids: List[str] = []
    questionnaire_assignment_is_implicit: bool = False
    
    # Progress tracking
    esg_completion_percent: float = 0.0
    ghg_completion_percent: float = 0.0
    documents_completion_percent: float = 0.0
    training_completion_percent: float = 0.0
    overall_completion_percent: float = 0.0
    esg_score: Optional[float] = None
    overall_score: Optional[float] = None
    canonical_score_snapshot: Optional[Dict[str, Any]] = None
    revenue_submission_status: str = "not_started"
    
    created_by: str
    created_at: str
    updated_at: Optional[str] = None
    assessment_program_id: Optional[str] = None
    assessment_program_version: Optional[int] = None


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
    revenue_percentage: float = Field(ge=0, le=100)
    revenue_amount: Optional[float] = Field(None, ge=0)  # Amount in currency
    revenue_currency: Optional[str] = "USD"  # Currency code


class ManualScoreUpdate(BaseModel):
    score: float = Field(ge=0, le=100)
    note: Optional[str] = Field(default=None, max_length=2000)


class SupplierDocumentResponse(BaseModel):
    """Supplier-facing organization document requirement."""
    id: str
    title: str
    original_filename: str
    content_type: str
    file_size: int
    document_version_id: str
    version_number: int
    accepted: bool
    accepted_at: Optional[str] = None
    response_mode: Literal["ACCEPTANCE", "STATUS"] = "ACCEPTANCE"
    response_options: List[str] = []
    selected_response: Optional[str] = None
    responded_at: Optional[str] = None
    submission_status: Optional[str] = None
    has_been_viewed: bool = False
    created_at: str


class SupplierDocumentStatusSubmit(BaseModel):
    response_value: str


class TrainingUpdate(BaseModel):
    """Customer-admin changes allowed for an existing training requirement."""
    due_date: Optional[str] = None
    is_active: Optional[bool] = None


class DueDateUpdate(BaseModel):
    due_date: Optional[str] = None


class TrainingConsumptionEvent(BaseModel):
    event_type: Literal["page_view", "media_progress"]
    unit_index: Optional[int] = Field(default=None, ge=1)
    position_seconds: Optional[float] = Field(default=None, ge=0)


# ============================================================================
# Questionnaire Schemas
# ============================================================================

class QuestionOption(BaseModel):
    """Option for dropdown questions."""
    value: str
    label: str
    score: Optional[float] = None  # Score for this option (question-level scoring)


class QuestionScoringConfig(BaseModel):
    """
    Scoring configuration for a question.
    
    Supported rules:
    - higher_is_better: Linear scale where higher values = higher scores
    - lower_is_better: Inverted scale where lower values = higher scores
    - boolean: Yes/No mapping with configurable scores
    - choice_mapping: Map discrete choices to specific scores
    - manual: Requires human review/scoring
    """
    rule: Literal[
        "higher_is_better",
        "lower_is_better", 
        "boolean",
        "choice_mapping",
        "manual"
    ]
    
    # For higher_is_better and lower_is_better
    target: Optional[float] = None  # Target value to achieve
    min: Optional[float] = 0  # Minimum value
    max: Optional[float] = 100  # Maximum value (for higher_is_better)
    max_score: float = 100  # Maximum score possible
    
    # For lower_is_better
    max_acceptable: Optional[float] = None  # Maximum acceptable value (above = 0 score)
    
    # For boolean
    true_score: float = 100  # Score when answer is Yes/True
    false_score: float = 0  # Score when answer is No/False
    
    # For choice_mapping
    choices: Optional[Dict[str, float]] = None  # Map of choice value to score
    
    # For manual
    requires_manual_review: bool = False

    @model_validator(mode="after")
    def validate_rule_configuration(self):
        if not 0 < self.max_score <= 100:
            raise ValueError("max_score must be greater than 0 and no more than 100")

        if self.rule == "higher_is_better":
            if self.min is None or self.target is None:
                raise ValueError("higher_is_better requires a lowest value and target value")
            if self.target <= self.min:
                raise ValueError("higher_is_better target must be greater than its lowest value")

        if self.rule == "lower_is_better":
            if self.min is None or self.max_acceptable is None:
                raise ValueError("lower_is_better requires a best value and zero-score threshold")
            if self.max_acceptable <= self.min:
                raise ValueError("lower_is_better zero-score threshold must be greater than its best value")

        if self.rule == "boolean" and (not 0 <= self.true_score <= 100 or not 0 <= self.false_score <= 100):
            raise ValueError("boolean scores must be between 0 and 100")

        if self.rule == "choice_mapping":
            if not self.choices:
                raise ValueError("choice_mapping requires at least one choice score")
            for choice, score in self.choices.items():
                if not choice.strip():
                    raise ValueError("choice_mapping values cannot be blank")
                if not 0 <= score <= 100:
                    raise ValueError("choice_mapping scores must be between 0 and 100")
        return self


class QuestionCreate(BaseModel):
    """Create a questionnaire question."""
    question_text: str
    description: Optional[str] = None
    response_type: str  # yes_no, numeric, text, dropdown, percentage, currency
    options: Optional[List[QuestionOption]] = None  # For dropdown
    required: bool = True
    evidence_requirement: Literal["not_required", "optional", "required"] = "not_required"
    # `weight` is retained for older API clients. New clients use importance or
    # an exact override; the service persists the effective value in `weight`.
    weight: Optional[float] = None
    importance: Literal["low", "medium", "high"] = "medium"
    exact_numerical_weight: Optional[float] = Field(default=None, gt=0)
    category: str  # environment, social, governance
    order: int = 0
    # New: Scoring configuration
    scoring: Optional[QuestionScoringConfig] = None

    @model_validator(mode="after")
    def validate_choice_mapping_options(self):
        if not self.scoring or self.scoring.rule != "choice_mapping":
            return self
        if self.response_type != "dropdown":
            raise ValueError("choice_mapping can only be used with dropdown responses")
        option_values = [option.value.strip() for option in self.options or []]
        if not option_values or any(not value for value in option_values) or len(set(option_values)) != len(option_values):
            raise ValueError("dropdown options must have unique, non-empty values")
        if set(self.scoring.choices or {}) != set(option_values):
            raise ValueError("choice mappings must match the configured dropdown options")
        return self


class QuestionUpdate(BaseModel):
    """Update a question."""
    question_text: Optional[str] = None
    description: Optional[str] = None
    response_type: Optional[str] = None
    options: Optional[List[QuestionOption]] = None
    required: Optional[bool] = None
    evidence_requirement: Optional[Literal["not_required", "optional", "required"]] = None
    weight: Optional[float] = None
    importance: Optional[Literal["low", "medium", "high"]] = None
    exact_numerical_weight: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None
    # New: Scoring configuration
    scoring: Optional[QuestionScoringConfig] = None

    @model_validator(mode="after")
    def validate_choice_mapping_options(self):
        if not self.scoring or self.scoring.rule != "choice_mapping":
            return self
        if self.response_type is not None and self.response_type != "dropdown":
            raise ValueError("choice_mapping can only be used with dropdown responses")
        if self.options is not None:
            option_values = [option.value.strip() for option in self.options]
            if not option_values or any(not value for value in option_values) or len(set(option_values)) != len(option_values):
                raise ValueError("dropdown options must have unique, non-empty values")
            if set(self.scoring.choices or {}) != set(option_values):
                raise ValueError("choice mappings must match the configured dropdown options")
        return self


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
    evidence_requirement: Literal["not_required", "optional", "required"] = "not_required"
    weight: float = 1.0
    importance: str = "medium"
    exact_numerical_weight: Optional[float] = None
    category: str
    order: int = 0
    is_active: bool = True
    created_at: str
    # New: Scoring configuration
    scoring: Optional[Dict[str, Any]] = None


class ESGSectionWeightsConfig(BaseModel):
    """ESG section weight configuration for questionnaire."""
    environment: float = 33.33
    social: float = 33.33
    governance: float = 33.34


class OverallSupplierWeightsConfig(BaseModel):
    """Overall supplier score component weights."""
    esg: float = 40  # ESG questionnaire score weight
    ghg: float = 40  # GHG emissions score weight
    revenue: float = 20  # Revenue contribution weight


class QuestionnaireCreate(BaseModel):
    """Create a questionnaire template."""
    name: str
    description: Optional[str] = None
    due_date: Optional[str] = None
    # Legacy field (kept for backward compatibility)
    scoring_method: Optional[str] = "question"  # Deprecated - use per-question scoring
    section_weights: Optional[Dict[str, float]] = None  # Deprecated - use esg_section_weights
    # New: Explicit weight configurations
    esg_section_weights: Optional[ESGSectionWeightsConfig] = None
    overall_supplier_weights: Optional[OverallSupplierWeightsConfig] = None
    assignment_mode: Literal["all", "selected"] = "all"
    supplier_relationship_ids: List[str] = Field(default_factory=list)
    assignment_reporting_period: Optional[str] = None


class QuestionnaireUpdate(BaseModel):
    """Update questionnaire."""
    name: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    scoring_method: Optional[str] = None  # Deprecated
    section_weights: Optional[Dict[str, float]] = None  # Deprecated
    is_active: Optional[bool] = None
    # New: Explicit weight configurations
    esg_section_weights: Optional[ESGSectionWeightsConfig] = None
    overall_supplier_weights: Optional[OverallSupplierWeightsConfig] = None


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
    esg_section_weights: Optional[Dict[str, float]] = None
    overall_supplier_weights: Optional[Dict[str, float]] = None
    assignment_mode: Optional[str] = None
    assigned_supplier_ids: List[str] = []
    assignment_reporting_period: Optional[str] = None
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
    data_verified: bool = False

    @model_validator(mode="after")
    def require_final_submission_verification(self):
        if not self.is_draft and not self.data_verified:
            raise ValueError("Confirm that the submitted data has been reviewed and verified")
        return self


class SupplierDataVerificationSubmit(BaseModel):
    """Required acknowledgement for a final supplier submission."""
    data_verified: Literal[True]


class SupplierGhgSubmissionPeriodSubmit(SupplierDataVerificationSubmit):
    """Required acknowledgement for one supplier GHG reporting period."""


class SupplierGhgUnlockRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000)
    supplier_instructions: Optional[str] = Field(default=None, max_length=4000)


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
    """Emission record for suppliers - same structure as main GHG emissions."""
    reporting_period: str  # e.g., "2024-01" for monthly or "FY2024" for yearly
    frequency_type: Optional[str] = "monthly"  # monthly or yearly
    scope: str  # scope1 or scope2 only for suppliers
    category: str
    category_id: Optional[str] = None  # For CalcEngine formula resolution
    sub_category: Optional[str] = None
    fuel_type: Optional[str] = None
    fuel_database_id: Optional[str] = None  # For emission factor lookup
    is_custom_fuel: bool = False
    custom_fuel_name: Optional[str] = None
    
    # Dynamic field values for calculation (same format as main emissions)
    dynamic_field_values: Optional[Dict[str, Dict[str, Any]]] = {}
    
    # Decision inputs for formula resolution
    decision_inputs: Optional[Dict[str, Any]] = {}
    
    # Notes
    notes: Optional[str] = None

    @field_validator("reporting_period")
    @classmethod
    def normalize_reporting_period(cls, value: str) -> str:
        normalized = normalize_reporting_period_for_storage(value)
        if not normalized:
            raise ValueError("reporting_period must be a valid YYYY-MM, CYyyyy, or FY yyyy-yyyy value")
        return normalized


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


class SupplierEmissionTotalResponse(BaseModel):
    """Raw and revenue-attributed GHG totals for one supplier."""
    supplier_relationship_id: str
    supplier_name: str
    raw_scope1: float = 0.0
    raw_scope2: float = 0.0
    raw_total: float = 0.0
    scope1: Optional[float] = None
    scope2: Optional[float] = None
    total: Optional[float] = None
    total_intensity: Optional[float] = None
    revenue_percentage: Optional[float] = None
    annual_revenue_amount: Optional[float] = None
    revenue_currency: Optional[str] = None
    revenue_submitted: bool = False
    attribution_available: bool = False


class SupplierEmissionAggregationResponse(BaseModel):
    scope: Optional[str] = None
    category: str
    entry_count: int = 0
    total_emissions: Optional[float] = None


class ParentSupplierEmissionsResponse(BaseModel):
    """Parent-facing submitted supplier GHG emissions view."""
    emissions: List[Dict[str, Any]]
    supplier_totals: List[SupplierEmissionTotalResponse]
    grand_total: float = 0.0
    aggregations: List[SupplierEmissionAggregationResponse]


class SupplierEmissionRevisionResponse(BaseModel):
    """Supplier-facing immutable revision metadata for one emission entry."""
    id: str
    lineage_id: str
    revision_number: int
    is_current_revision: bool
    status: str
    reporting_period: str
    scope: str
    category: str
    total_emissions: float = 0.0
    submitted_at: Optional[str] = None
    reopened_at: Optional[str] = None
    revised_from_record_id: Optional[str] = None
    created_at: Optional[str] = None


class SupplierEmissionRevisionHistoryResponse(BaseModel):
    """All immutable revisions belonging to one supplier emission lineage."""
    lineage_id: str
    current_revision_id: Optional[str] = None
    revisions: List[SupplierEmissionRevisionResponse]


# ============================================================================
# Ranking Schemas
# ============================================================================

class SupplierRankingEntry(BaseModel):
    """Single supplier ranking entry."""
    rank: Optional[int] = None
    supplier_id: str
    company_name: str
    esg_score: Optional[float] = None
    environment_score: Optional[float] = None
    social_score: Optional[float] = None
    governance_score: Optional[float] = None
    ghg_score: Optional[float] = None
    overall_score: Optional[float] = None
    completion_status: str
    status_label: Optional[str] = None
    question_progress: Optional[str] = None
    attention_reasons: List[str] = []
    overdue_modules: List[str] = []
    module_progress: Dict[str, float] = {}
    due_date: Optional[str] = None
    revenue_percentage: Optional[float] = None
    revenue_amount: Optional[float] = None
    revenue_currency: Optional[str] = None
    document_statuses: List[Dict[str, str]] = []
    training_statuses: List[Dict[str, str]] = []


class ScoreDistribution(BaseModel):
    """Score distribution buckets."""
    excellent: int = 0
    good: int = 0
    average: int = 0
    poor: int = 0


class AverageScores(BaseModel):
    """Average scores across suppliers."""
    esg: Optional[float] = None
    environment: Optional[float] = None
    social: Optional[float] = None
    governance: Optional[float] = None


class SupplierRankingResponse(BaseModel):
    """Supplier rankings response."""
    rankings: List[SupplierRankingEntry]
    total_suppliers: int
    ranked_suppliers: int
    score_distribution: Optional[ScoreDistribution] = None
    averages: Optional[AverageScores] = None
    module_summary: Dict[str, Dict[str, Any]] = {}


# ============================================================================
# Reminder Schemas
# ============================================================================

class ReminderSend(BaseModel):
    """Send reminder to supplier."""
    custom_message: Optional[str] = None
    modules: List[Literal["all", "esg", "ghg", "documents", "training", "revenue"]] = Field(default_factory=lambda: ["all"])
    reporting_period: Optional[str] = None
