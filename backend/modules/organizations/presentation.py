"""Canonical organization response enrichment shared by organization APIs."""
from typing import Any, Dict

from modules.entitlements.service import entitlement_access_map, resolve_entitlement_config, resolve_entitlements


async def enrich_organization_response(organization: Dict[str, Any]) -> Dict[str, Any]:
    """Attach canonical entitlement and GHG coverage fields to an organization response."""
    enriched = dict(organization)
    org_id = enriched["id"]
    detailed_entitlements = await resolve_entitlement_config(org_id, migrate=True)
    permissions = entitlement_access_map(detailed_entitlements)
    enriched["entitlements"] = await resolve_entitlements(org_id, migrate=True)
    enriched["permissions"] = permissions
    enriched["enabled_access"] = [
        *( ["scope1_2"] if permissions.get("environment.ghg.scope_1_2") else [] ),
        *( ["scope3", "scope1_2_3"] if permissions.get("environment.ghg.scope_3") else [] ),
    ]
    return enriched