"""
Auth contracts — Pydantic request/response schemas.

These models live here (instead of inline in server.py) so any module
that needs to validate or document auth payloads has a single import
path. server.py re-exports them at the top of the file for the legacy
inline routes that still reference the bare class names.
"""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "user"


class UserCreate(UserBase):
    password: str
    organization_id: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class PasswordReset(BaseModel):
    email: EmailStr
    recovery_contact: str  # mobile or recovery email


class ProfileUpdate(BaseModel):
    full_name: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    full_name: str
    role: str
    organization_id: Optional[str] = None
    assigned_facilities: List[str] = []
    requires_password_change: bool = False
    recovery_email: Optional[str] = None
    recovery_mobile: Optional[str] = None
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    user: UserResponse
