"""Per-category emission modules — Phase B10.

Exposes the backend category registry (mirror of frontend `categoryRegistry`).
"""
from .registry import (  # noqa: F401
    category_registry,
    CategoryRegistry,
    CategoryDescriptor,
    CAP_ASSET_NAME,
    CAP_JOURNEY_LOCATIONS,
    CAP_SUBCATEGORY,
    CAP_ACTIVITY_TYPES,
    CAP_MULTI_EMPLOYEE,
)
