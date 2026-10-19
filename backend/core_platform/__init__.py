"""
Platform Core Module

This module contains cross-cutting platform services that are reused across all ESG domains:
- auth: Authentication, JWT tokens, password management
- users: User management with configurable collection support
- organizations: Organization management
- approvals: Approval workflow engine
- notifications: Notification system (future)
- audit_logs: Audit logging infrastructure

These services are designed to be collection-agnostic where appropriate,
allowing different ESG implementations to use their own user stores.
"""

from core_platform.auth import router as auth_router
from core_platform.users import router as users_router
from core_platform.organizations import router as organizations_router

__all__ = [
    "auth_router",
    "users_router", 
    "organizations_router",
]
