"""
Framework Details Module

Stores framework-specific organization details in a modular way.
Each framework (BRSR, GRI, SBTi) can have its own set of fields.

Collection: organization_framework_details
"""

from modules.framework_details.contracts import (
    BRSRDetails,
    BRSRDetailsCreate,
    BRSRDetailsUpdate,
    FrameworkDetailsResponse,
)
from modules.framework_details.router import router
from modules.framework_details.service import FrameworkDetailsService

__all__ = [
    "BRSRDetails",
    "BRSRDetailsCreate",
    "BRSRDetailsUpdate",
    "FrameworkDetailsResponse",
    "router",
    "FrameworkDetailsService",
]
