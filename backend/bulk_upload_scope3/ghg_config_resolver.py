"""
GHG Configuration Resolver for Bulk Upload

Consumes the same org-level configuration that the manual GHG form uses,
providing a single source of truth for what categories/scopes/capabilities
are available to an organization.

Pipeline:
  Organization Config
      ↓
  Resolve GHG Configuration
      ↓
  Resolve GHG Capabilities
      ↓
  Build Bulk Upload Schema
      ↓
  Validate / Generate Template

The canonical identity mapping between `disabledCategories` codes (stored in
organization_config.ghg_overrides) and bulk upload sheet/category codes lives
exclusively in DISABLED_CATEGORY_MAP below.  No other file should duplicate
this knowledge.
"""

from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field


# ─────────────────────────────────────────────────────────────────────────────
# Canonical mapping: disabledCategories code → bulk upload identifiers
# ─────────────────────────────────────────────────────────────────────────────
DISABLED_CATEGORY_MAP: Dict[str, Dict] = {
    # Scope 3 categories  →  bulk upload sheet code
    "purchased_goods_and_services": {"scope": "scope3", "sheet": "C1"},
    "capital_goods": {"scope": "scope3", "sheet": "C2"},
    "fuel_and_energy_related_activities_not_included_in_scope_1_or_scope_2": {"scope": "scope3", "sheet": "C3"},
    "upstream_transportation_distribution": {"scope": "scope3", "sheet": "C4"},
    "waste_generated_in_operations": {"scope": "scope3", "sheet": "C5"},
    "business_travel": {"scope": "scope3", "sheet": "C6"},
    "employee_commuting": {"scope": "scope3", "sheet": "C7"},
    "upstream_leased_assets": {"scope": "scope3", "sheet": "C8"},
    "downstream_transportation_and_distribution": {"scope": "scope3", "sheet": "C9"},
    "processing_of_sold_products": {"scope": "scope3", "sheet": "C10"},
    "use_of_sold_products": {"scope": "scope3", "sheet": "C11"},
    "end_of_life_treatment_of_sold_products": {"scope": "scope3", "sheet": "C12"},
    "downstream_leased_assets": {"scope": "scope3", "sheet": "C13"},
    "franchises": {"scope": "scope3", "sheet": "C14"},
    "investments": {"scope": "scope3", "sheet": "C15"},
    # Scope 1 special categories
    "flaring__stationary_combustion": {"scope": "scope1", "category": "flaring"},
    "process_emissions": {"scope": "scope1", "category": "process_emissions"},
}


@dataclass
class ResolvedGhgCapabilities:
    """Resolved GHG capabilities for an organization.

    Consumed by both template generation (which sheets/dropdowns to show) and
    upload validation (which rows to accept).  One object, one source of truth.
    """

    # Scope-level access
    scope1_enabled: bool = True
    scope2_enabled: bool = True
    scope3_enabled: bool = True

    # Disabled Scope 3 sheet codes, e.g. {"C1", "C5", "C15"}
    disabled_scope3_sheets: Set[str] = field(default_factory=set)

    # Scope 1 category access
    scope1_stationary_combustion_enabled: bool = True
    scope1_mobile_combustion_enabled: bool = True
    scope1_fugitive_emissions_enabled: bool = True
    scope1_flaring_enabled: bool = True
    scope1_process_emissions_enabled: bool = True

    # Process type options for fugitive / process emissions decision tree.
    # None → all standard types allowed; list → only these types.
    process_type_options: Optional[List[str]] = None

    # Custom fuel capability
    custom_fuel_enabled: bool = True

    # ── Convenience helpers ──────────────────────────────────────────────

    def is_scope3_sheet_enabled(self, sheet_code: str) -> bool:
        """Return True if the Scope 3 sheet code (e.g. 'C4') is allowed."""
        return self.scope3_enabled and sheet_code not in self.disabled_scope3_sheets

    def is_scope1_category_enabled(self, category_key: str) -> bool:
        """Return True if a Scope 1 internal category key is allowed."""
        flags = {
            "stationary_combustion": self.scope1_stationary_combustion_enabled,
            "mobile_combustion": self.scope1_mobile_combustion_enabled,
            "fugitive_emissions": self.scope1_fugitive_emissions_enabled,
            "flaring": self.scope1_flaring_enabled,
            "process_emissions": self.scope1_process_emissions_enabled,
        }
        return self.scope1_enabled and flags.get(category_key, True)

    def enabled_scope1_categories(self) -> List[str]:
        """Return the list of enabled Scope 1 category keys."""
        if not self.scope1_enabled:
            return []
        all_cats = [
            ("stationary_combustion", self.scope1_stationary_combustion_enabled),
            ("mobile_combustion", self.scope1_mobile_combustion_enabled),
            ("fugitive_emissions", self.scope1_fugitive_emissions_enabled),
            ("flaring", self.scope1_flaring_enabled),
            ("process_emissions", self.scope1_process_emissions_enabled),
        ]
        return [key for key, enabled in all_cats if enabled]

    def is_process_type_allowed(self, process_type: str) -> bool:
        """Check if a specific process type value is allowed by the org."""
        if self.process_type_options is None:
            return True  # None = all standard types allowed
        return process_type in self.process_type_options


async def resolve_ghg_capabilities(db, organization_id: str) -> ResolvedGhgCapabilities:
    """Resolve the canonical GHG capabilities for an organization.

    Reads from ``organization_config`` and returns what categories, scopes,
    and capabilities are available.  This is the backend equivalent of the
    frontend's ``resolveGhgCategoryOptions`` + ``resolveGhgOrganizationUiConfig``.
    """
    caps = ResolvedGhgCapabilities()

    org_config = await db.organization_config.find_one(
        {"organization_id": organization_id},
        {"_id": 0, "ghg_overrides": 1, "entitlements": 1},
    )

    if not org_config:
        return caps  # No config → everything enabled (safe default)

    # 1. Scope-level access from entitlements
    entitlements = org_config.get("entitlements") or {}
    env_ent = entitlements.get("environment") or {}
    ghg_ent = env_ent.get("ghg") or {}

    if not ghg_ent.get("enabled", True):
        caps.scope1_enabled = False
        caps.scope2_enabled = False
        caps.scope3_enabled = False
        return caps

    coverage = ghg_ent.get("coverage", "scope_1_2_3")
    if coverage == "scope_1_2":
        caps.scope3_enabled = False
    elif coverage == "scope_3":
        caps.scope1_enabled = False
        caps.scope2_enabled = False
    # "scope_1_2_3" → all enabled (default)

    # 2. Disabled categories from ghg_overrides
    ghg_overrides = org_config.get("ghg_overrides") or {}
    for disabled_code in ghg_overrides.get("disabledCategories", []):
        mapping = DISABLED_CATEGORY_MAP.get(disabled_code)
        if not mapping:
            continue

        if mapping["scope"] == "scope3":
            caps.disabled_scope3_sheets.add(mapping["sheet"])
        elif mapping["scope"] == "scope1":
            cat = mapping.get("category")
            if cat == "flaring":
                caps.scope1_flaring_enabled = False
            elif cat == "process_emissions":
                caps.scope1_process_emissions_enabled = False

    # 3. Process type options
    process_type_opts = ghg_overrides.get("processTypeOptions")
    if process_type_opts is not None:
        caps.process_type_options = list(process_type_opts)

    # 4. Custom fuel capability
    capability_overrides = ghg_overrides.get("capabilityOverrides") or {}
    if capability_overrides.get("customFuel") is False:
        caps.custom_fuel_enabled = False

    return caps
