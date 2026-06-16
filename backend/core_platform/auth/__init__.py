"""
Platform Auth Module

Re-exports from modules/auth for backward compatibility.
The actual implementation remains in modules/auth to avoid breaking existing imports.
"""

from modules.auth.router import router
from modules.auth.contracts import (
    UserCreate,
    UserLogin,
    PasswordChange,
    PasswordReset,
    ProfileUpdate,
    ResetPasswordRequest,
    UserResponse,
    TokenResponse,
)
from modules.auth.dependencies import (
    get_current_user,
    get_admin_user,
    get_super_admin_user,
    security,
)
from modules.auth.email_templates import (
    password_reset_email,
    user_invite_email,
)

__all__ = [
    "router",
    "UserCreate",
    "UserLogin", 
    "PasswordChange",
    "PasswordReset",
    "ProfileUpdate",
    "ResetPasswordRequest",
    "UserResponse",
    "TokenResponse",
    "get_current_user",
    "get_admin_user",
    "get_super_admin_user",
    "security",
    "password_reset_email",
    "user_invite_email",
]
