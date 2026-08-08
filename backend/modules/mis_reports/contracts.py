"""Pydantic response contracts for the MIS Reports catalog foundation."""
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator


class MISReportTemplateResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    status: str
    available: bool
    action_label: Optional[str] = None
    required_modules: List[str] = Field(default_factory=list)


class MISReportCatalogResponse(BaseModel):
    can_generate_reports: bool
    organization_name: Optional[str] = None
    templates: List[MISReportTemplateResponse]


class MISFacilityFilterOption(BaseModel):
    id: str
    name: str


class MISReportFilterSchemaResponse(BaseModel):
    reporting_period_format: str
    supports_financial_year: bool
    supports_calendar_year: bool
    facilities: List[MISFacilityFilterOption]
    available_scopes: List[str]
    categories: List[str]


class MISReportHistoryItemResponse(BaseModel):
    id: str
    template_id: str
    template_name: str
    status: str
    generated_at: str
    generated_by_email: Optional[str] = None


class MISReportHistoryResponse(BaseModel):
    items: List[MISReportHistoryItemResponse]


class EmissionsSummaryRequest(BaseModel):
    reporting_period_start: str
    reporting_period_end: str
    facility_ids: List[str] = Field(default_factory=list)
    scopes: List[str] = Field(default_factory=lambda: ["scope1", "scope2", "scope3", "biogenic"])
    categories: List[str] = Field(default_factory=list)


class MISRecipientInput(BaseModel):
    id: Optional[str] = None
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr


class MISReportContent(BaseModel):
    sections: List[str] = Field(default_factory=list)


SCHEDULE_FREQUENCIES = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]


class EmissionsSummaryResponse(BaseModel):
    run_id: str
    generated_at: str
    filters: Dict[str, Any]
    total_emissions: float
    unit: str
    record_count: int
    scope_breakdown: List[Dict[str, Any]]
    category_breakdown: List[Dict[str, Any]]
    facility_breakdown: List[Dict[str, Any]]
    period_breakdown: List[Dict[str, Any]]


class MISScheduleCreate(BaseModel):
    name: str
    frequency: SCHEDULE_FREQUENCIES
    recipient_emails: List[EmailStr] = Field(default_factory=list)
    recipients: List[MISRecipientInput] = Field(default_factory=list)
    filters: EmissionsSummaryRequest
    is_enabled: bool = True
    content: MISReportContent = Field(default_factory=MISReportContent)
    facility_mode: Literal["all", "specific"] = "all"
    run_time: str = "09:00"
    run_day: Optional[int] = None
    timezone: str = "UTC"
    reporting_period_label: Optional[str] = None

    @model_validator(mode="after")
    def require_recipients(self):
        if not self.recipients and not self.recipient_emails:
            raise ValueError("At least one recipient is required")
        return self


class MISScheduleUpdate(BaseModel):
    name: Optional[str] = None
    frequency: Optional[SCHEDULE_FREQUENCIES] = None
    recipient_emails: Optional[List[EmailStr]] = None
    recipients: Optional[List[MISRecipientInput]] = None
    filters: Optional[EmissionsSummaryRequest] = None
    is_enabled: Optional[bool] = None
    content: Optional[MISReportContent] = None
    facility_mode: Optional[Literal["all", "specific"]] = None
    run_time: Optional[str] = None
    run_day: Optional[int] = None
    timezone: Optional[str] = None
    reporting_period_label: Optional[str] = None


class MISScheduleResponse(BaseModel):
    id: str
    name: str
    frequency: str
    recipient_emails: List[str]
    filters: Dict[str, Any]
    is_enabled: bool
    next_run_at: Optional[str] = None
    last_run_at: Optional[str] = None
    created_at: str
    recipients: List[Dict[str, str]] = Field(default_factory=list)
    content: Dict[str, Any] = Field(default_factory=dict)
    facility_mode: str = "all"
    run_time: str = "09:00"
    run_day: Optional[int] = None
    timezone: str = "UTC"
    reporting_period_label: Optional[str] = None


class MISDeliveryResponse(BaseModel):
    id: str
    schedule_id: str
    recipient_email: str
    status: str
    sent_at: str
    error: Optional[str] = None


class MISDeliveryArtifactResponse(BaseModel):
    format: str
    filename: str
    content_type: str
    file_size: int


class MISDeliveryHistoryResponse(BaseModel):
    id: str
    schedule_id: Optional[str] = None
    schedule_name: str
    organization_id: Optional[str] = None
    status: str
    generated_at: str
    reporting_period_label: Optional[str] = None
    filters: Dict[str, Any]
    recipients: List[Dict[str, str]] = Field(default_factory=list)
    content: Dict[str, Any] = Field(default_factory=dict)
    facility_mode: str = "all"
    facility_names: List[str] = Field(default_factory=list)
    artifacts: List[MISDeliveryArtifactResponse] = Field(default_factory=list)
    failure_reason: Optional[str] = None


class MISOverviewResponse(BaseModel):
    active_schedules: int
    reports_delivered: int
    recipients: int
    success_rate: float
    recent_deliveries: List[MISDeliveryHistoryResponse] = Field(default_factory=list)