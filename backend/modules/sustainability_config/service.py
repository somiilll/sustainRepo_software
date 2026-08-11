"""
Organization Configuration — Service Layer

Single collection: organization_config
One document per organization containing only overrides.
Resolution: global esg_record_categories + org overrides → final config.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import re

from shared.database.mongo import db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _code(name: str) -> str:
    """Convert a display name to a snake_case code."""
    s = re.sub(r'[^a-z0-9]+', '_', name.lower().strip()).strip('_')
    return s or "unknown"


_coll = lambda: db["organization_config"]


# =========================================================================
# CRUD
# =========================================================================

async def get_org_config(org_id: str) -> Optional[Dict[str, Any]]:
    return await _coll().find_one(
        {"organization_id": org_id}, {"_id": 0}
    )


async def upsert_org_config(org_id: str, data: dict, user_id: str) -> Dict[str, Any]:
    """Create or update the organization config document."""
    now = _now()
    existing = await _coll().find_one({"organization_id": org_id})

    if existing:
        updates = {k: v for k, v in data.items() if v is not None}
        updates["updated_at"] = now
        updates["updated_by"] = user_id
        result = await _coll().find_one_and_update(
            {"organization_id": org_id},
            {"$set": updates},
            return_document=True,
            projection={"_id": 0},
        )
        return result
    else:
        doc = {
            "organization_id": org_id,
            "modules": data.get("modules", {"enabled": None}),
            "categories": data.get("categories", {"custom": [], "disabled": []}),
            "kpi_overrides": data.get("kpi_overrides", {}),
            "dashboard": data.get("dashboard", {"type": "standard"}),
            "features": data.get("features", {}),
            "created_at": now,
            "updated_at": now,
            "created_by": user_id,
            "updated_by": user_id,
        }
        await _coll().insert_one(doc)
        doc.pop("_id", None)
        return doc


async def delete_org_config(org_id: str) -> bool:
    result = await _coll().delete_one({"organization_id": org_id})
    return result.deleted_count > 0


# =========================================================================
# RESOLUTION: Global + Org Overrides → Final Config
# =========================================================================

async def resolve_config(org_id: str) -> Dict[str, Any]:
    """Merge global esg_record_categories with organization_config overrides.

    Returns the final configuration the org should see.
    """
    # 1. Load global categories (environment section, active only)
    global_cats = await db["esg_record_categories"].find(
        {"section": "environment", "is_active": True}, {"_id": 0}
    ).sort("order", 1).to_list(None)

    # 2. Load org config (may not exist)
    org_cfg = await get_org_config(org_id) or {}

    modules_cfg = org_cfg.get("modules") or {}
    cats_cfg = org_cfg.get("categories") or {}
    kpi_overrides = org_cfg.get("kpi_overrides") or {}
    dashboard_cfg = org_cfg.get("dashboard") or {"type": "standard"}

    enabled_modules = modules_cfg.get("enabled")  # None = all
    disabled_subcats = set(cats_cfg.get("disabled") or [])
    custom_cats = cats_cfg.get("custom") or []

    # 3. Group global categories by top-level category (module)
    modules: Dict[str, Dict] = {}
    for cat in global_cats:
        mod_name = cat.get("category", "Other")
        mod_code = _code(mod_name)

        # Filter by enabled modules
        if enabled_modules is not None and mod_code not in enabled_modules:
            continue

        if mod_code not in modules:
            modules[mod_code] = {
                "module_code": mod_code,
                "module_name": mod_name,
                "subcategories": [],
            }

        subcat_name = cat.get("subcategory") or mod_name
        subcat_code = _code(subcat_name)

        # Filter by disabled subcategories
        if subcat_code in disabled_subcats:
            continue

        # Check for KPI override
        override = kpi_overrides.get(subcat_code)
        if override and override.get("visible") is False:
            continue

        fields = cat.get("fields", [])
        if override and override.get("fields"):
            fields = override["fields"]

        display_name = subcat_name
        if override and override.get("kpi_name"):
            display_name = override["kpi_name"]

        modules[mod_code]["subcategories"].append({
            "category_id": cat.get("id"),
            "subcategory_code": subcat_code,
            "subcategory_name": display_name,
            "original_category": cat.get("category"),
            "original_subcategory": cat.get("subcategory"),
            "fields": fields,
            "has_override": bool(override and override.get("fields")),
            "order": cat.get("order", 0),
        })

    # 4. Add custom categories
    for custom in custom_cats:
        mod_code = custom.get("module_code", "other")
        if enabled_modules is not None and mod_code not in enabled_modules:
            continue

        if mod_code not in modules:
            modules[mod_code] = {
                "module_code": mod_code,
                "module_name": custom.get("module_code", "").replace("_", " ").title(),
                "subcategories": [],
            }

        modules[mod_code]["subcategories"].append({
            "category_id": None,
            "subcategory_code": custom.get("category_code"),
            "subcategory_name": custom.get("category_name"),
            "original_category": None,
            "original_subcategory": None,
            "fields": custom.get("fields", []),
            "calculation": custom.get("calculation"),
            "target_config": custom.get("target_config"),
            "has_override": False,
            "is_custom": True,
            "order": custom.get("display_order", 99),
        })

    # Sort subcategories by order
    for mod in modules.values():
        mod["subcategories"].sort(key=lambda s: s.get("order", 0))

    return {
        "organization_id": org_id,
        "modules": list(modules.values()),
        "dashboard": dashboard_cfg,
        "features": org_cfg.get("features") or {},
        "has_org_config": bool(org_cfg),
    }


# =========================================================================
# INDEXES
# =========================================================================

async def ensure_indexes():
    await _coll().create_index("organization_id", unique=True)
