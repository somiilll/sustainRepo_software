"""
Platform Users Module

Re-exports from modules/users for backward compatibility.
Also provides the abstract user repository that supports configurable collections.
"""

from modules.users.router import router
from modules.users.contracts import UserCreateRequest
from core_platform.users.repository import AbstractUserRepository, create_user_repository

__all__ = [
    "router",
    "UserCreateRequest",
    "AbstractUserRepository",
    "create_user_repository",
]
