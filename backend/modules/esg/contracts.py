"""
ESG Organization Configuration Contracts

Pydantic models for ESG organization configuration.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class ESGOrgConfigBase(BaseModel):
    """Base ESG configuration fields."""
    enabled_scopes: List[str] = Field(
        default_factory=lambda: ["scope_1", "scope_2"],
        description="List of enabled emission scopes: scope_1, scope_2, scope_3"
    )
    approval_workflow_enabled: bool = Field(
        default=False,
        description="Whether approval workflow is enabled for this organization"
    )
    enabled_frameworks: List[str] = Field(
        default_factory=lambda: ["BRSR"],
        description="List of enabled ESG frameworks: BRSR, GRI, SBTi"
    )
    enabled_modules: List[str] = Field(
        default_factory=lambda: ["ghg"],
        description="List of enabled ESG modules: ghg, social, governance, compliance"
    )


class ESGOrgConfigCreate(ESGOrgConfigBase):
    """Create request for ESG org config."""
    org_id: str = Field(..., description="Organization ID this config belongs to")


class ESGOrgConfigUpdate(BaseModel):
    """Update request for ESG org config - all fields optional."""
    enabled_scopes: Optional[List[str]] = None
    approval_workflow_enabled: Optional[bool] = None
    enabled_frameworks: Optional[List[str]] = None
    enabled_modules: Optional[List[str]] = None


class ESGOrgConfig(ESGOrgConfigBase):
    """Full ESG org config document."""
    id: str
    org_id: str
    created_at: str
    updated_at: Optional[str] = None


class ESGOrgConfigResponse(ESGOrgConfig):
    """API response model for ESG org config."""
    pass


# Valid values for validation
VALID_SCOPES = ["scope_1", "scope_2", "scope_3"]
VALID_FRAMEWORKS = ["BRSR", "GRI", "SBTi"]
VALID_MODULES = ["ghg", "social", "governance", "compliance"]
