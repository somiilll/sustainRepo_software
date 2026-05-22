"""Targets Pydantic contracts.

`target_mode` is open-ended (validated at the service layer) so future
modes (net-zero, sbt, intensity, milestone) can be added without a
schema migration. The `target_configuration` blob carries mode-specific
fields and is stored as-is.
"""
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field


class TargetCreate(BaseModel):
    """Body for POST /api/targets."""
    name: str
    target_mode: str  # "total" | "scope" | "category" (extensible)
    target_configuration: Dict[str, Any] = Field(default_factory=dict)


class TargetUpdate(BaseModel):
    """Body for PUT /api/targets/{id}.

    All fields optional so callers can partially update — the service layer
    handles 'value cleared' semantics by replacing target_configuration
    wholesale when provided.
    """
    name: Optional[str] = None
    target_mode: Optional[str] = None
    target_configuration: Optional[Dict[str, Any]] = None


class TargetResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    organization_id: str
    name: str
    target_mode: str
    target_configuration: Dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[str] = None
    created_by_email: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None
    updated_by_name: Optional[str] = None
