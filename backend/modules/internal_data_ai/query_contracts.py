"""Closed, non-executable contracts for Internal Data AI query planning."""
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class QueryType(str, Enum):
    CONSUMPTION_LOOKUP = "consumption_lookup"
    EMISSION_LOOKUP = "emission_lookup"
    METHODOLOGY_LOOKUP = "methodology_lookup"
    FORMULA_LOOKUP = "formula_lookup"
    FORMULA_VERSION_HISTORY = "formula_version_history"
    RECORD_VERSION_HISTORY = "record_version_history"
    CALCULATION_AUDIT_LOOKUP = "calculation_audit_lookup"
    EMISSION_FACTOR_LOOKUP = "emission_factor_lookup"
    CALCULATION_PROPERTY_LOOKUP = "calculation_property_lookup"
    BRSR_LOOKUP = "brsr_lookup"
    APPROVAL_STATUS_LOOKUP = "approval_status_lookup"
    EVIDENCE_LOOKUP = "evidence_lookup"
    RECORD_LOOKUP = "record_lookup"
    ANALYTICS_LOOKUP = "analytics_lookup"
    TARGET_LOOKUP = "target_lookup"
    APPROVAL_HISTORY = "approval_history"
    ASSIGNMENT_HISTORY = "assignment_history"
    UNKNOWN = "unknown"


class EvidenceState(str, Enum):
    PENDING = "PENDING"
    FOUND = "FOUND"
    FOUND_PARTIAL = "FOUND_PARTIAL"
    FOUND_BUT_PERIOD_MISMATCH = "FOUND_BUT_PERIOD_MISMATCH"
    NOT_FOUND = "NOT_FOUND"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    AMBIGUOUS = "AMBIGUOUS"
    RELATIONSHIP_MISSING = "RELATIONSHIP_MISSING"


class QueryEntity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str
    raw_value: Optional[str] = None
    canonical_value: Optional[str] = None
    resolution: str = "UNRESOLVED"


class QueryPeriod(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = "unspecified"
    start_month: Optional[str] = None
    end_month: Optional[str] = None
    label: Optional[str] = None
    source: Optional[str] = None
    fiscal_start_month: Optional[int] = Field(default=None, ge=1, le=12)


class StructuredQueryPlan(BaseModel):
    """Validated semantic request only; never contains executable filters or authorization scope."""
    model_config = ConfigDict(extra="forbid")

    query_type: QueryType
    entity: Optional[QueryEntity] = None
    period: QueryPeriod = Field(default_factory=QueryPeriod)
    facility: Optional[str] = None
    scope: Optional[str] = None
    category: Optional[str] = None
    record_type: Optional[str] = None
    requested_metric: Optional[str] = None
    sources_required: list[str] = Field(default_factory=list)
    evidence_state: EvidenceState = EvidenceState.PENDING
    legacy_intent: Optional[str] = None
    resolution_notes: list[str] = Field(default_factory=list)