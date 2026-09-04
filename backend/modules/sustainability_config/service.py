"""
Organization Configuration — Service Layer

Single collection: organization_config
One document per organization containing only overrides.
Resolution: global esg_record_categories + org overrides → final config.
Supports all three ESG sections: environment, social, governance.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import re

from shared.database.mongo import db
from modules.entitlements.service import DEFAULT_ENTITLEMENT_CONFIG, normalize_entitlement_config, normalize_entitlements, sync_legacy_entitlement_mirror


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _code(name: str) -> str:
    """Convert a display name to a snake_case code."""
    s = re.sub(r'[^a-z0-9]+', '_', name.lower().strip()).strip('_')
    return s or "unknown"


def _normalized(value: Any) -> str:
    return re.sub(r'[^a-z0-9]+', '', str(value or '').lower())


def _alias_values(alias_rules: list, section: str, category: str, subcategory: str = None, field_key: str = None) -> list:
    values = []
    for rule in alias_rules:
        if rule.get("section") != section or _normalized(rule.get("category")) != _normalized(category):
            continue
        if _normalized(rule.get("subcategory")) != _normalized(subcategory):
            continue
        if _normalized(rule.get("field_key")) != _normalized(field_key):
            continue
        values.extend(rule.get("aliases") or [])
    return list(dict.fromkeys(value.strip() for value in values if isinstance(value, str) and value.strip()))


_coll = lambda: db["organization_config"]


DEFAULT_SUPPLIER_ASSESSMENT_CONFIG = {
    "modules": {
        "esg": {"enabled": True, "display_name": "ESG Questionnaire"},
        "ghg": {
            "enabled": True,
            "display_name": "GHG Emissions",
            "scopes": ["scope1", "scope2"],
            "allow_custom_fuels": False,
            "allow_process_emissions": False,
            "allow_flaring": False,
        },
        "documents": {"enabled": False, "display_name": "Documents"},
        "training": {"enabled": False, "display_name": "Training"},
    }
}

DEFAULT_ORGANIZATION_SETTINGS = {
    "approval_workflow_enabled": False,
    "multi_level_approval_enabled": False,
    "esg_frameworks_enabled": [],
}


def normalize_organization_settings(value: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    supplied = value or {}
    return {
        "approval_workflow_enabled": bool(supplied.get("approval_workflow_enabled", False)),
        "multi_level_approval_enabled": bool(supplied.get("multi_level_approval_enabled", False)),
        "esg_frameworks_enabled": [framework for framework in (supplied.get("esg_frameworks_enabled") or []) if framework in {"BRSR", "GRI"}],
    }


async def resolve_organization_settings(org_id: str, *, migrate: bool = False) -> Dict[str, Any]:
    """Resolve Org Config settings, using deprecated organization fields only for migration."""
    config = await _coll().find_one({"organization_id": org_id}, {"_id": 0, "organization_settings": 1})
    configured = (config or {}).get("organization_settings")
    if configured is not None:
        return normalize_organization_settings(configured)

    organization = await db["organizations"].find_one(
        {"id": org_id}, {"_id": 0, "approval_workflow_enabled": 1, "multi_level_approval_enabled": 1, "esg_frameworks_enabled": 1},
    )
    settings = normalize_organization_settings(organization)
    if migrate:
        now = _now()
        await _coll().update_one(
            {"organization_id": org_id},
            {"$set": {"organization_settings": settings, "updated_at": now, "updated_by": "legacy_organization_settings_migration"},
             "$setOnInsert": {"organization_id": org_id, "created_at": now, "created_by": "legacy_organization_settings_migration"}},
            upsert=True,
        )
    return settings


async def sync_legacy_organization_settings_mirror(org_id: str, settings: Dict[str, Any]) -> None:
    """Retain legacy organization fields for older consumers while Org Config is authoritative."""
    await db["organizations"].update_one(
        {"id": org_id}, {"$set": normalize_organization_settings(settings)},
    )


def resolve_supplier_assessment_config_from_org_config(org_cfg: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Resolve the supplier-assessment module shape without creating another config store."""
    resolved = {
        "modules": {
            code: dict(module_config)
            for code, module_config in DEFAULT_SUPPLIER_ASSESSMENT_CONFIG["modules"].items()
        }
    }
    configured_modules = ((org_cfg or {}).get("supplier_assessment") or {}).get("modules") or {}
    for code, module_config in configured_modules.items():
        if code in resolved["modules"] and isinstance(module_config, dict):
            resolved["modules"][code].update(module_config)
    return resolved


async def resolve_supplier_assessment_config(org_id: str) -> Dict[str, Any]:
    """Return the effective supplier-assessment configuration for an organization."""
    return resolve_supplier_assessment_config_from_org_config(await get_org_config(org_id))


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
        if "entitlements" in updates:
            await sync_legacy_entitlement_mirror(org_id, updates["entitlements"])
        if "organization_settings" in updates:
            await sync_legacy_organization_settings_mirror(org_id, updates["organization_settings"])
        return result
    else:
        doc = {
            "organization_id": org_id,
            "modules": data.get("modules", {"enabled": None}),
            "categories": data.get("categories", {"custom": [], "disabled": []}),
            "kpi_overrides": data.get("kpi_overrides", {}),
            "target_overrides": data.get("target_overrides", {}),
            "dashboard": data.get("dashboard", {"type": "standard"}),
            "features": data.get("features", {}),
            "ai_query_aliases": data.get("ai_query_aliases", []),
            "ghg_overrides": data.get("ghg_overrides", {}),
            "supplier_assessment": data.get("supplier_assessment", DEFAULT_SUPPLIER_ASSESSMENT_CONFIG),
            "entitlements": normalize_entitlement_config(data.get("entitlements", DEFAULT_ENTITLEMENT_CONFIG)),
            "ai_credits": data.get("ai_credits", 0),
            "organization_settings": normalize_organization_settings(data.get("organization_settings", DEFAULT_ORGANIZATION_SETTINGS)),
            "created_at": now,
            "updated_at": now,
            "created_by": user_id,
            "updated_by": user_id,
        }
        await _coll().insert_one(doc)
        doc.pop("_id", None)
        await sync_legacy_entitlement_mirror(org_id, doc["entitlements"])
        await sync_legacy_organization_settings_mirror(org_id, doc["organization_settings"])
        return doc


async def delete_org_config(org_id: str) -> bool:
    result = await _coll().delete_one({"organization_id": org_id})
    return result.deleted_count > 0


# =========================================================================
# RESOLUTION: Global + Org Overrides → Final Config (all sections)
# =========================================================================

async def _resolve_section(section: str, org_cfg: dict) -> List[Dict]:
    """Resolve a single section (environment/social/governance)."""
    modules_cfg = org_cfg.get("modules") or {}
    cats_cfg = org_cfg.get("categories") or {}
    kpi_overrides = org_cfg.get("kpi_overrides") or {}
    custom_cats = cats_cfg.get("custom") or []
    alias_rules = org_cfg.get("ai_query_aliases") or []
    disabled_subcats = set(cats_cfg.get("disabled") or [])
    mode = modules_cfg.get("mode")  # "default" | "default_custom" | "custom"

    # Section-specific enabled modules
    section_key = f"{section}_enabled" if section != "environment" else "enabled"
    enabled_modules = modules_cfg.get(section_key)
    # For environment, fall back to "enabled"; for others, None means "show all"
    if enabled_modules is None and section == "environment":
        enabled_modules = modules_cfg.get("enabled")

    modules: Dict[str, Dict] = {}

    # Include global categories unless mode is explicitly "custom"
    if mode != "custom":
        global_cats = await db["esg_record_categories"].find(
            {"section": section, "is_active": True}, {"_id": 0}
        ).sort("order", 1).to_list(None)

        for cat in global_cats:
            mod_name = cat.get("category", "Other")
            mod_code = _code(mod_name)

            if enabled_modules is not None and mod_code not in enabled_modules:
                continue

            if mod_code not in modules:
                modules[mod_code] = {
                    "module_code": mod_code,
                    "module_name": mod_name,
                    "aliases": _alias_values(alias_rules, section, mod_name),
                    "subcategories": [],
                }

            subcat_name = cat.get("subcategory") or mod_name
            subcat_code = _code(subcat_name)

            if subcat_code in disabled_subcats:
                continue

            override = kpi_overrides.get(subcat_code)
            if override and override.get("visible") is False:
                continue

            fields = [dict(field) for field in cat.get("fields", [])]
            if override and override.get("fields"):
                fields = [dict(field) for field in override["fields"]]

            for field in fields:
                configured_aliases = _alias_values(alias_rules, section, mod_name, subcat_name, field.get("field_key") or field.get("field_code"))
                field["aliases"] = list(dict.fromkeys([*(field.get("aliases") or []), *configured_aliases]))

            display_name = subcat_name
            if override and override.get("kpi_name"):
                display_name = override["kpi_name"]

            modules[mod_code]["subcategories"].append({
                "category_id": cat.get("id"),
                "subcategory_code": subcat_code,
                "subcategory_name": display_name,
                "original_category": cat.get("category"),
                "original_subcategory": cat.get("subcategory"),
                "aliases": _alias_values(alias_rules, section, mod_name, subcat_name),
                "fields": fields,
                "has_override": bool(override and override.get("fields")),
                "order": cat.get("order", 0),
            })

    # Add custom categories unless mode is explicitly "default"
    if mode != "default":
        for custom in custom_cats:
            cat_section = custom.get("section", "environment")
            if cat_section != section:
                continue

            mod_code = custom.get("module_code", "other")
            if enabled_modules is not None and mod_code not in enabled_modules:
                continue

            if mod_code not in modules:
                modules[mod_code] = {
                    "module_code": mod_code,
                    "module_name": (custom.get("module_name") or custom.get("module_code", "")).replace("_", " ").title(),
                    "aliases": _alias_values(alias_rules, section, custom.get("module_name") or custom.get("module_code", "")),
                    "subcategories": [],
                }

            custom_module_name = custom.get("module_name") or custom.get("module_code", "")
            custom_fields = [dict(field) for field in custom.get("fields", [])]
            for field in custom_fields:
                configured_aliases = _alias_values(alias_rules, section, custom_module_name, custom.get("category_name"), field.get("field_key") or field.get("field_code"))
                field["aliases"] = list(dict.fromkeys([*(field.get("aliases") or []), *configured_aliases]))

            modules[mod_code]["subcategories"].append({
                "category_id": None,
                "subcategory_code": custom.get("category_code"),
                "subcategory_name": custom.get("category_name"),
                "fields": custom_fields,
                "aliases": _alias_values(alias_rules, section, custom_module_name, custom.get("category_name")),
                "calculation": custom.get("calculation"),
                "target_config": custom.get("target_config"),
                "has_override": False,
                "is_custom": True,
                "order": custom.get("display_order", 99),
            })

    for mod in modules.values():
        mod["subcategories"].sort(key=lambda s: s.get("order", 0))
        # Mark module as custom if ALL its subcategories are custom
        mod["is_custom"] = all(s.get("is_custom") for s in mod["subcategories"]) if mod["subcategories"] else False

    return list(modules.values())


async def resolve_config(org_id: str) -> Dict[str, Any]:
    """Merge global esg_record_categories with organization_config overrides.

    Returns the final configuration across all three sections.
    """
    org_cfg = await get_org_config(org_id) or {}
    dashboard_cfg = org_cfg.get("dashboard") or {"type": "standard"}

    env_modules = await _resolve_section("environment", org_cfg)
    social_modules = await _resolve_section("social", org_cfg)
    governance_modules = await _resolve_section("governance", org_cfg)

    modules_cfg = org_cfg.get("modules") or {}
    cats_cfg = org_cfg.get("categories") or {}
    disabled_subcats = list(cats_cfg.get("disabled") or [])
    return {
        "organization_id": org_id,
        "modules": env_modules,
        "social_modules": social_modules,
        "governance_modules": governance_modules,
        "dashboard": dashboard_cfg,
        "features": org_cfg.get("features") or {},
        "has_org_config": bool(org_cfg),
        "modules_mode": modules_cfg.get("mode", "default"),
        "has_enabled_filter": modules_cfg.get("enabled") is not None,
        "disabled_modules": disabled_subcats,
        "ai_query_aliases": org_cfg.get("ai_query_aliases") or [],
        "ghg_overrides": org_cfg.get("ghg_overrides") or {},
        "supplier_assessment": resolve_supplier_assessment_config_from_org_config(org_cfg),
        "entitlements": normalize_entitlements(org_cfg.get("entitlements")),
        "entitlement_config": normalize_entitlement_config(org_cfg.get("entitlements")),
        "ai_credits": org_cfg.get("ai_credits", 0),
        "organization_settings": normalize_organization_settings(org_cfg.get("organization_settings")),
    }


# =========================================================================
# INDEXES
# =========================================================================

async def ensure_indexes():
    await _coll().create_index("organization_id", unique=True)
    cmr = db["configured_metric_records"]
    await cmr.create_index([("organization_id", 1), ("feature_type", 1), ("category", 1)])
    await cmr.create_index([("organization_id", 1), ("feature_type", 1), ("created_at", -1)])
