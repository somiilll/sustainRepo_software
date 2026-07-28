"""
Materiality Assessment - Data Models

Future-ready architecture supporting:
- Multiple score sources (MANUAL, SURVEY, IMPORT, API)
- Stakeholder categories and weightage
- Custom/sector-specific topics
- Disclosure-level materiality
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


# =============================================================================
# ENUMS
# =============================================================================

class ScoreSource(str, Enum):
    """Source of the materiality score - extensible for future sources"""
    MANUAL = "manual"
    # Future: SURVEY = "survey", IMPORT = "import", API = "api", SYSTEM = "system"


class MaterialityStatus(str, Enum):
    """Auto-calculated materiality status"""
    MATERIAL = "material"
    NON_MATERIAL = "non_material"
    MONITOR = "monitor"  # Above one cutoff but not both


class AssessmentStatus(str, Enum):
    """Assessment lifecycle status"""
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class TopicCategory(str, Enum):
    """ESG category for material topics"""
    ENVIRONMENTAL = "Environmental"
    SOCIAL = "Social"
    GOVERNANCE = "Governance"


# =============================================================================
# INPUT MODELS
# =============================================================================

class MaterialTopicCreate(BaseModel):
    """Create a new material topic in the master list"""
    topic_code: str = Field(..., description="Topic code e.g. '301'")
    topic_name: str = Field(..., description="Topic name e.g. 'Materials'")
    description: Optional[str] = None
    framework: str = Field(default="GRI", description="Framework e.g. GRI, BRSR")
    category: TopicCategory
    is_active: bool = True
    is_custom: bool = False  # Future: org-specific custom topics
    sector_tags: List[str] = Field(default_factory=list)  # Future: sector-specific


class MaterialTopicUpdate(BaseModel):
    """Update a material topic"""
    topic_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[TopicCategory] = None
    is_active: Optional[bool] = None


class AssessmentCreate(BaseModel):
    """Create a new materiality assessment"""
    reporting_year: str = Field(..., description="e.g. 'FY 2024-2025' or '2024'")
    name: Optional[str] = None
    description: Optional[str] = None


class AssessmentUpdate(BaseModel):
    """Update assessment metadata"""
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[AssessmentStatus] = None
    business_cutoff: Optional[float] = None
    stakeholder_cutoff: Optional[float] = None
    scale_min: Optional[float] = None
    scale_max: Optional[float] = None


class TopicScoreInput(BaseModel):
    """Input for scoring a topic - source-agnostic design"""
    topic_id: str
    business_score: float = Field(..., ge=0, le=10)
    stakeholder_score: float = Field(..., ge=0, le=10)
    source: ScoreSource = ScoreSource.MANUAL
    comment: Optional[str] = None
    # Future fields for survey/import sources:
    # stakeholder_category: Optional[str] = None
    # source_reference: Optional[str] = None


class ManualOverrideInput(BaseModel):
    """Manual override for final materiality decision"""
    is_material: bool
    override_reason: Optional[str] = None


class BulkTopicSelectionInput(BaseModel):
    """Add multiple topics to an assessment"""
    topic_ids: List[str]


# =============================================================================
# RESPONSE MODELS
# =============================================================================

class MaterialTopicResponse(BaseModel):
    """Material topic from master list"""
    id: str
    topic_code: str
    topic_name: str
    description: Optional[str]
    framework: str
    category: str
    is_active: bool
    is_custom: bool
    sector_tags: List[str]
    created_at: Optional[str]


class TopicScoreResponse(BaseModel):
    """Score details for an assessment topic"""
    id: str
    assessment_id: str
    topic_id: str
    topic_code: str
    topic_name: str
    category: str
    description: Optional[str]
    
    # Scores (source-agnostic)
    business_score: Optional[float]
    stakeholder_score: Optional[float]
    score_source: str
    
    # Auto-calculated
    auto_status: Optional[str]  # material, non_material, monitor
    
    # Manual override
    has_override: bool
    override_is_material: Optional[bool]
    override_reason: Optional[str]
    
    # Final result (used by reports)
    final_status: Optional[str]
    is_material: bool
    
    updated_at: Optional[str]
    updated_by: Optional[str]


class AssessmentResponse(BaseModel):
    """Materiality assessment summary"""
    id: str
    organization_id: str
    reporting_year: str
    name: Optional[str]
    description: Optional[str]
    status: str
    
    # Cutoff configuration
    business_cutoff: float
    stakeholder_cutoff: float
    scale_min: float
    scale_max: float
    
    # Stats
    total_topics: int
    scored_topics: int
    material_topics: int
    
    created_by: str
    created_at: str
    updated_at: Optional[str]


class AssessmentDetailResponse(AssessmentResponse):
    """Full assessment with all topic scores"""
    topics: List[TopicScoreResponse]


class MatrixDataPoint(BaseModel):
    """Single point for the materiality matrix chart"""
    id: str
    topic_code: str
    topic_name: str
    category: str
    x: float  # business_score
    y: float  # stakeholder_score
    auto_status: str
    final_status: str
    is_material: bool
    has_override: bool
