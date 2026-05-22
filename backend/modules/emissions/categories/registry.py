"""
Phase B10: Backend Category Registry
=====================================

Backend mirror of the frontend `categoryRegistry`. Provides a single source
of truth for category metadata (Scope 1 stationary/mobile/fugitive, Scope 2
generic, Scope 3 C1–C15) and allows other modules (calculations, reports,
dashboards, validators) to look up category-aware behaviour at runtime.

Phase B10 SCOPE:
- Read-only registry seeded with canonical category descriptors.
- No business logic changes. Routes that resolve scope/category continue to
  use their existing inline logic — they may *optionally* consult this
  registry, but adoption is incremental.
- Pure-Python, no DB calls. Future phases can hydrate dynamic categories
  from `emission_categories` collection if needed.

Public API:
    from modules.emissions.categories.registry import category_registry

    descriptor = category_registry.get("c7")
    descriptor.scope            -> "scope3"
    descriptor.requires_asset_name -> False (per scope3-definitions)
    descriptor.capabilities     -> {"multi-employee", "subcategory"}

The descriptors are intentionally a thin shape — they capture what backend
code actually needs (scope, capabilities). Frontend keeps richer renderer
metadata.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, FrozenSet, Iterable, List, Optional


@dataclass(frozen=True)
class CategoryDescriptor:
    """Backend-side descriptor for an emission category."""
    id: str                          # canonical lower-snake id (e.g. 'c7')
    scope: str                       # 'scope1' | 'scope2' | 'scope3' | 'biogenic'
    name: str                        # display name
    capabilities: FrozenSet[str] = field(default_factory=frozenset)
    aliases: FrozenSet[str] = field(default_factory=frozenset)

    def has_capability(self, cap: str) -> bool:
        return cap in self.capabilities


# ---------------------------------------------------------------------------
# Canonical capabilities (mirror frontend scope3-definitions semantics).
# ---------------------------------------------------------------------------
CAP_ASSET_NAME = "asset-name"
CAP_JOURNEY_LOCATIONS = "journey-locations"
CAP_SUBCATEGORY = "subcategory"
CAP_ACTIVITY_TYPES = "activity-types"
CAP_MULTI_EMPLOYEE = "multi-employee"


def _s3(cid: str, name: str, *caps: str, aliases: Iterable[str] = ()) -> CategoryDescriptor:
    return CategoryDescriptor(
        id=cid,
        scope="scope3",
        name=name,
        capabilities=frozenset(caps),
        aliases=frozenset(aliases),
    )


# Canonical seed list (kept in lock-step with frontend scope3-definitions).
_SEED: List[CategoryDescriptor] = [
    # Scope 1
    CategoryDescriptor(id="stationary_combustion", scope="scope1", name="Stationary Combustion"),
    CategoryDescriptor(id="mobile_combustion", scope="scope1", name="Mobile Combustion"),
    CategoryDescriptor(id="fugitive_emissions", scope="scope1", name="Fugitive Emissions"),
    CategoryDescriptor(id="process_emissions", scope="scope1", name="Process Emissions"),
    # Scope 2
    CategoryDescriptor(id="purchased_electricity", scope="scope2", name="Purchased Electricity"),
    CategoryDescriptor(id="purchased_steam", scope="scope2", name="Purchased Steam"),
    CategoryDescriptor(id="purchased_heating", scope="scope2", name="Purchased Heating"),
    CategoryDescriptor(id="purchased_cooling", scope="scope2", name="Purchased Cooling"),
    # Scope 3 (C1–C15) — capabilities mirror frontend scope3-definitions.
    _s3("c1", "Purchased Goods and Services"),
    _s3("c2", "Capital Goods"),
    _s3("c3", "Fuel and Energy Related Activities"),
    _s3("c4", "Upstream Transportation and Distribution", CAP_JOURNEY_LOCATIONS),
    _s3("c5", "Waste Generated in Operations"),
    _s3("c6", "Business Travel", CAP_JOURNEY_LOCATIONS),
    _s3("c7", "Employee Commuting", CAP_MULTI_EMPLOYEE, CAP_SUBCATEGORY),
    _s3("c8", "Upstream Leased Assets", CAP_ASSET_NAME),
    _s3("c9", "Downstream Transportation and Distribution", CAP_JOURNEY_LOCATIONS),
    _s3("c10", "Processing of Sold Products"),
    _s3("c11", "Use of Sold Products"),
    _s3("c12", "End of Life Treatment of Sold Products"),
    _s3("c13", "Downstream Leased Assets", CAP_ASSET_NAME),
    _s3("c14", "Franchises", CAP_ASSET_NAME),
    _s3("c15", "Investments", CAP_ASSET_NAME),
    # Biogenic
    CategoryDescriptor(id="biogenic_scope1", scope="biogenic", name="Biogenic Direct (Scope 1)"),
    CategoryDescriptor(id="biogenic_scope3", scope="biogenic", name="Biogenic Indirect (Scope 3)"),
]


def _normalize(cid: str) -> str:
    if not cid:
        return ""
    return cid.strip().lower().replace(" ", "_").replace("-", "_")


class CategoryRegistry:
    """In-memory registry. Module-level singleton seeded at import time."""

    def __init__(self) -> None:
        self._by_key: Dict[str, CategoryDescriptor] = {}
        for d in _SEED:
            self._register(d)

    def _register(self, d: CategoryDescriptor) -> None:
        self._by_key[_normalize(d.id)] = d
        self._by_key[_normalize(d.name)] = d
        for alias in d.aliases:
            self._by_key[_normalize(alias)] = d

    # Public API
    def get(self, cid: Optional[str]) -> Optional[CategoryDescriptor]:
        if not cid:
            return None
        return self._by_key.get(_normalize(cid))

    def has(self, cid: Optional[str]) -> bool:
        return self.get(cid) is not None

    def all(self) -> List[CategoryDescriptor]:
        # Deduplicate (we register a descriptor under multiple keys).
        seen: Dict[str, CategoryDescriptor] = {}
        for d in self._by_key.values():
            seen[d.id] = d
        return list(seen.values())

    def by_scope(self, scope: str) -> List[CategoryDescriptor]:
        return [d for d in self.all() if d.scope == scope]

    def has_capability(self, cid: Optional[str], cap: str) -> bool:
        d = self.get(cid)
        return bool(d and d.has_capability(cap))


# Singleton — import this everywhere.
category_registry = CategoryRegistry()

__all__ = [
    "category_registry",
    "CategoryRegistry",
    "CategoryDescriptor",
    "CAP_ASSET_NAME",
    "CAP_JOURNEY_LOCATIONS",
    "CAP_SUBCATEGORY",
    "CAP_ACTIVITY_TYPES",
    "CAP_MULTI_EMPLOYEE",
]
