from typing import Any, List, Optional

from pydantic import BaseModel, Field


class ContributingKPI(BaseModel):
    kpi_id: str
    metric_name: str
    metric_code: Optional[str] = None
    value: Optional[float] = None
    unit: Optional[str] = None
    record_count: int = 0


class BRSRImportProposal(BaseModel):
    id: str
    mapping_id: str
    reporting_period: str
    question_key: str
    question_label: str
    answer_path: str
    resolved_answer_path: str
    reference: Optional[str] = None
    source_tag: str
    proposed_value: float
    current_value: Any = None
    unit: Optional[str] = None
    aggregation_rule: str
    formula_definition: Optional[str] = None
    source_fingerprint: str
    status: str
    is_stale: bool = False
    accepted_value: Any = None
    contributing_kpis: List[ContributingKPI] = Field(default_factory=list)


class BRSRImportProposalList(BaseModel):
    reporting_period: str
    proposals: List[BRSRImportProposal] = Field(default_factory=list)
    counts: dict = Field(default_factory=dict)


class ProposalDecisionRequest(BaseModel):
    action: str
    source_fingerprint: str
    edited_value: Any = None


class ProposalDecisionResponse(BaseModel):
    success: bool
    mapping_id: str
    status: str
    reporting_period: str
    saved_value: Any = None
    message: str