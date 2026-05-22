"""Sinks (carbon removal) Pydantic contracts."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class SinkCreate(BaseModel):
    facility_id: str
    reporting_year: str
    reporting_month: Optional[int] = None  # 0-11; null for yearly
    total_emissions_reduced: float
    description: Optional[str] = None
    evidence_urls: Optional[List[str]] = None
    evidence_files: Optional[List[Dict[str, str]]] = None
    frequency_type: Optional[str] = "monthly"  # "monthly" | "yearly"
    # Legacy fields kept for backward compat.
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    evidence_url: Optional[str] = None
    monthly_data: Optional[Dict[str, Any]] = None


class SinkResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    facility_id: str
    organization_id: Optional[str] = None
    reporting_year: Optional[str] = None
    reporting_month: Optional[int] = None
    total_emissions_reduced: float
    description: Optional[str] = None
    evidence_urls: Optional[List[str]] = None
    evidence_files: Optional[List[Dict[str, str]]] = None
    frequency_type: Optional[str] = "monthly"
    created_at: str
    updated_at: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    evidence_url: Optional[str] = None
    monthly_data: Optional[Dict[str, Any]] = None
    period_type: Optional[str] = None
    reporting_period: Optional[str] = None
