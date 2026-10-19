"""Read-only contracts for BRSR/GRI question response timelines."""
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class TimelineEvidenceState(str, Enum):
    FOUND = "FOUND"
    FOUND_PARTIAL = "FOUND_PARTIAL"
    NOT_FOUND = "NOT_FOUND"


class TimelineActor(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    email: Optional[str] = None


class QuestionTimelineEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_type: str
    timestamp: Optional[str] = None
    requester: Optional[TimelineActor] = None
    approver: Optional[TimelineActor] = None
    submitted_value: Any = None
    final_value: Any = None
    rejection_reason: Optional[str] = None
    approver_edited: bool = False
    source: str
    evidence_state: TimelineEvidenceState = TimelineEvidenceState.FOUND


class QuestionResponseTimeline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    framework: str
    question_key: str
    reporting_year: str
    evidence_state: TimelineEvidenceState
    current_response: dict[str, Any] = Field(default_factory=dict)
    events: list[QuestionTimelineEvent] = Field(default_factory=list)
    sources_used: list[str] = Field(default_factory=list)
    excluded_unscoped_events: int = 0