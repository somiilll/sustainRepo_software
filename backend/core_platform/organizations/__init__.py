"""
Platform Organizations Module

Re-exports from modules/organizations for backward compatibility.
"""

from modules.organizations.router import router
from modules.organizations.contracts import OrganizationCreate, OrganizationResponse

__all__ = [
    "router",
    "OrganizationCreate",
    "OrganizationResponse",
]
