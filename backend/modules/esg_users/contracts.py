"""
ESG Users Contracts

Pydantic models for ESG user management.
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, EmailStr


class ESGUserBase(BaseModel):
    """Base ESG user fields."""
    email: EmailStr
    full_name: str = Field(..., min_length=2)
    role: str = Field(default="user", pattern="^(super_admin|admin|user)$")


class ESGUserCreate(ESGUserBase):
    """Create request for ESG user."""
    password: str = Field(..., min_length=8)
    organization_id: Optional[str] = None
    assigned_facilities: List[str] = Field(default_factory=list)


class ESGUserUpdate(BaseModel):
    """Update request for ESG user - all fields optional."""
    full_name: Optional[str] = Field(None, min_length=2)
    role: Optional[str] = Field(None, pattern="^(super_admin|admin|user)$")
    organization_id: Optional[str] = None
    assigned_facilities: Optional[List[str]] = None
    is_active: Optional[bool] = None


class ESGUserResponse(BaseModel):
    """API response model for ESG user."""
    id: str
    email: str
    full_name: str
    role: str
    organization_id: Optional[str] = None
    assigned_facilities: List[str] = Field(default_factory=list)
    is_active: bool = True
    is_deleted: bool = False
    requires_password_change: bool = False
    created_at: str
    updated_at: Optional[str] = None
