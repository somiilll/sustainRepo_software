"""
Scoring Data Models

Defines the data structures for scoring configuration and results.
All models are designed to be serializable and auditable.
"""

from typing import Dict, List, Optional, Any, Union
from pydantic import BaseModel, Field, validator
from enum import Enum


class ScoringRuleType(str, Enum):
    """Supported scoring rule types."""
    HIGHER_IS_BETTER = "higher_is_better"
    LOWER_IS_BETTER = "lower_is_better"
    BOOLEAN = "boolean"
    CHOICE_MAPPING = "choice_mapping"
    MANUAL = "manual"


class ResponseType(str, Enum):
    """Supported response types for questions."""
    YES_NO = "yes_no"
    NUMBER = "number"
    PERCENTAGE = "percentage"
    CURRENCY = "currency"
    DROPDOWN = "dropdown"
    MULTI_SELECT = "multi_select"
    TEXT = "text"
    DATE = "date"


class Section(str, Enum):
    """ESG sections."""
    ENVIRONMENT = "environment"
    SOCIAL = "social"
    GOVERNANCE = "governance"


class ScoringConfig(BaseModel):
    """
    Configuration for how a question should be scored.
    
    Examples:
        Higher is better (e.g., Renewable Energy %):
        {
            "rule": "higher_is_better",
            "target": 100,
            "min": 0,
            "max": 100,
            "max_score": 100
        }
        
        Boolean (e.g., ISO 14001):
        {
            "rule": "boolean",
            "true_score": 100,
            "false_score": 0
        }
        
        Choice mapping (e.g., Carbon Target):
        {
            "rule": "choice_mapping",
            "choices": {
                "SBTi Approved": 100,
                "Net Zero Target": 80,
                "No Target": 0
            }
        }
    """
    rule: ScoringRuleType
    
    # For higher_is_better and lower_is_better
    target: Optional[float] = None
    min: Optional[float] = 0
    max: Optional[float] = 100
    max_score: float = 100
    
    # For lower_is_better
    max_acceptable: Optional[float] = None
    
    # For boolean
    true_score: float = 100
    false_score: float = 0
    
    # For choice_mapping
    choices: Optional[Dict[str, float]] = None
    
    # For manual scoring
    requires_manual_review: bool = False
    
    class Config:
        use_enum_values = True


class QuestionConfig(BaseModel):
    """Complete question configuration including scoring."""
    question_id: str
    question_text: str
    section: Section
    response_type: ResponseType
    weight: float = Field(default=1.0, gt=0)
    scoring: ScoringConfig
    options: Optional[List[str]] = None  # For dropdown/multi-select
    required: bool = True
    
    class Config:
        use_enum_values = True


class QuestionScore(BaseModel):
    """Score result for a single question."""
    question_id: str
    question_text: str
    section: str
    
    # Response data
    raw_response: Any
    response_type: str
    
    # Scoring details
    scoring_rule: str
    raw_score: float  # 0-100 normalized score
    weight: float
    weighted_score: float  # raw_score * weight
    importance: Optional[str] = None
    weight_source: str = "importance"
    
    # Audit trail
    calculation_details: Dict[str, Any] = Field(default_factory=dict)
    
    @property
    def is_scored(self) -> bool:
        """Whether this question contributed to scoring."""
        return self.raw_score is not None


class SectionScore(BaseModel):
    """Aggregated score for an ESG section."""
    section: str
    questions: List[QuestionScore]
    
    # Calculated values
    total_weight: float
    weighted_sum: float
    score: float  # 0-100
    
    # Section weight in overall ESG
    esg_weight: float
    weighted_esg_contribution: float


class ESGScore(BaseModel):
    """Overall ESG score with section breakdown."""
    environment: Optional[SectionScore] = None
    social: Optional[SectionScore] = None
    governance: Optional[SectionScore] = None
    
    overall_score: float  # Weighted average of section scores
    
    # Configuration used
    section_weights: Dict[str, float]


class SupplierScore(BaseModel):
    """Final supplier score combining all components."""
    supplier_id: str
    questionnaire_id: str
    
    # Component scores
    esg_score: Optional[ESGScore] = None
    ghg_score: Optional[float] = None
    revenue_score: Optional[float] = None
    ghg_intensity_tco2e_per_million_revenue: Optional[float] = None
    ghg_total_emissions: Optional[float] = None
    
    # Final score
    overall_score: float
    
    # Configuration used
    component_weights: Dict[str, float]
    
    # Audit
    calculated_at: str
    calculation_version: str = "2.0"


class ScoreBreakdown(BaseModel):
    """
    Complete audit trail for a supplier's score calculation.
    Designed for transparency and auditability.
    """
    supplier_id: str
    supplier_name: Optional[str] = None
    questionnaire_id: str
    questionnaire_title: Optional[str] = None
    
    # Detailed breakdown
    question_scores: List[QuestionScore]
    section_scores: Dict[str, SectionScore]
    esg_score: ESGScore
    supplier_score: SupplierScore
    
    # Configuration snapshot
    esg_section_weights: Dict[str, float]
    overall_weights: Dict[str, float]
    
    # Metadata
    calculated_at: str
    notes: List[str] = Field(default_factory=list)


class ESGSectionWeights(BaseModel):
    """ESG section weight configuration."""
    environment: float = 33.33
    social: float = 33.33
    governance: float = 33.34
    
    @validator('governance')
    def weights_must_total_100(cls, v, values):
        total = values.get('environment', 0) + values.get('social', 0) + v
        if abs(total - 100) > 0.01:
            raise ValueError(f'ESG section weights must total 100, got {total}')
        return v
    
    def to_dict(self) -> Dict[str, float]:
        return {
            "environment": self.environment,
            "social": self.social,
            "governance": self.governance
        }


class OverallSupplierWeights(BaseModel):
    """Overall supplier score component weights."""
    esg: float = 40
    ghg: float = 40
    revenue: float = 20
    
    @validator('revenue')
    def weights_must_total_100(cls, v, values):
        total = values.get('esg', 0) + values.get('ghg', 0) + v
        if abs(total - 100) > 0.01:
            raise ValueError(f'Overall weights must total 100, got {total}')
        return v
    
    def to_dict(self) -> Dict[str, float]:
        return {
            "esg": self.esg,
            "ghg": self.ghg,
            "revenue": self.revenue
        }
