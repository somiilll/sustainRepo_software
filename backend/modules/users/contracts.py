"""
User-management contracts — admin-side user creation request.
"""
from typing import List

from pydantic import BaseModel, EmailStr


class UserCreateRequest(BaseModel):
    """Admin → 'invite a new user' request body."""
    email: EmailStr
    full_name: str
    assigned_facilities: List[str] = []
