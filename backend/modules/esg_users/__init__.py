"""
ESG Users Module

User management for the ESG platform using the `users_esg` collection.
Reuses the platform auth infrastructure but with a separate user store.
"""

from modules.esg_users.contracts import (
    ESGUserCreate,
    ESGUserResponse,
    ESGUserUpdate,
)
from modules.esg_users.router import router
from modules.esg_users.service import ESGUserService, esg_user_service

__all__ = [
    "ESGUserCreate",
    "ESGUserResponse",
    "ESGUserUpdate",
    "router",
    "ESGUserService",
    "esg_user_service",
]
