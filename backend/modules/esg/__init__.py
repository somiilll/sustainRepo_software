"""
ESG Organization Configuration Module

Provides organization-level ESG settings including:
- Enabled ESG scopes (scope_1, scope_2, scope_3)
- Approval workflow settings
- Enabled frameworks (BRSR, GRI, SBTi)
- Enabled ESG modules (ghg, social, governance, compliance)

Collection: esg_org_configs
"""

from modules.esg.contracts import (
    ESGOrgConfig,
    ESGOrgConfigCreate,
    ESGOrgConfigUpdate,
    ESGOrgConfigResponse,
)
from modules.esg.router import router
from modules.esg.service import ESGConfigService

__all__ = [
    "ESGOrgConfig",
    "ESGOrgConfigCreate",
    "ESGOrgConfigUpdate",
    "ESGOrgConfigResponse",
    "router",
    "ESGConfigService",
]
