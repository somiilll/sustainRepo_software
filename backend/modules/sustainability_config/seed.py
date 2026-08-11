"""
Sustainability Config — Migration / Seed Script

Reads existing esg_record_categories for the environment section and
creates equivalent organization_modules, org_module_categories,
org_module_kpis, and org_module_kpi_fields entries.

This is additive only: it never deletes or modifies existing records,
environment_records, esg_assignments, or esg_targets.
"""

import re
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any

from shared.database.mongo import db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _code(name: str) -> str:
    """Convert a display name to a snake_case code."""
    s = re.sub(r'[^a-z0-9]+', '_', name.lower().strip())
    s = s.strip('_')
    return s or "unknown"


# Icon mapping for common environment categories
_ICON_MAP = {
    "energy": "Zap",
    "water": "Droplets",
    "waste": "Trash2",
    "ghg_emissions": "Cloud",
    "biodiversity": "TreeDeciduous",
    "other_emissions": "Wind",
    "climate_change": "Thermometer",
    "material": "Package",
}


async def seed_from_existing_categories(org_id: str, user_id: str) -> Dict[str, Any]:
    """Seed org sustainability config from global esg_record_categories.
    
    Only processes section='environment' categories.
    Skips any module/category/kpi that already exists (idempotent).
    """
    _modules = db["organization_modules"]
    _categories = db["org_module_categories"]
    _kpis = db["org_module_kpis"]
    _fields = db["org_module_kpi_fields"]

    stats = {"modules_created": 0, "categories_created": 0, "kpis_created": 0, "field_configs_created": 0, "skipped": 0}

    # Read all active environment categories
    cats = await db["esg_record_categories"].find(
        {"section": "environment", "is_active": True},
        {"_id": 0},
    ).sort("order", 1).to_list(None)

    if not cats:
        return {"status": "no_categories_found", **stats}

    # Group by top-level category (Energy, Water, Waste, etc.)
    grouped: Dict[str, List[Dict]] = {}
    for cat in cats:
        top = cat.get("category", "Other")
        grouped.setdefault(top, []).append(cat)

    module_order = 0
    for module_name, subcats in grouped.items():
        module_code = _code(module_name)
        module_order += 1

        # Check if module already exists
        existing_mod = await _modules.find_one(
            {"organization_id": org_id, "module_code": module_code}
        )
        if not existing_mod:
            await _modules.insert_one({
                "id": str(uuid.uuid4()),
                "organization_id": org_id,
                "module_code": module_code,
                "module_name": module_name,
                "icon": _ICON_MAP.get(module_code, "Leaf"),
                "enabled": True,
                "display_order": module_order,
                "created_at": _now(),
                "updated_at": _now(),
                "created_by": user_id,
                "seeded_from": "esg_record_categories",
            })
            stats["modules_created"] += 1
        else:
            stats["skipped"] += 1

        cat_order = 0
        for subcat_doc in subcats:
            subcat_name = subcat_doc.get("subcategory") or module_name
            category_code = _code(subcat_name)
            cat_order += 1

            existing_cat = await _categories.find_one({
                "organization_id": org_id,
                "module_code": module_code,
                "category_code": category_code,
            })
            if not existing_cat:
                await _categories.insert_one({
                    "id": str(uuid.uuid4()),
                    "organization_id": org_id,
                    "module_code": module_code,
                    "category_code": category_code,
                    "category_name": subcat_name,
                    "enabled": True,
                    "display_order": cat_order,
                    "created_at": _now(),
                    "updated_at": _now(),
                    "created_by": user_id,
                    "seeded_from_category_id": subcat_doc.get("id"),
                })
                stats["categories_created"] += 1
            else:
                stats["skipped"] += 1

            # Create a default KPI for this category
            kpi_code = _code(subcat_name)
            kpi_name = subcat_name

            existing_kpi = await _kpis.find_one({
                "organization_id": org_id,
                "module_code": module_code,
                "category_code": category_code,
                "kpi_code": kpi_code,
            })
            if not existing_kpi:
                await _kpis.insert_one({
                    "id": str(uuid.uuid4()),
                    "organization_id": org_id,
                    "module_code": module_code,
                    "category_code": category_code,
                    "kpi_code": kpi_code,
                    "kpi_name": kpi_name,
                    "unit": None,
                    "description": f"Auto-seeded from existing {module_name} > {subcat_name} category",
                    "enabled": True,
                    "display_order": 1,
                    "created_at": _now(),
                    "updated_at": _now(),
                    "created_by": user_id,
                })
                stats["kpis_created"] += 1
            else:
                stats["skipped"] += 1

            # Create field config from existing category fields
            src_fields = subcat_doc.get("fields", [])
            if src_fields:
                existing_fc = await _fields.find_one({
                    "organization_id": org_id,
                    "module_code": module_code,
                    "category_code": category_code,
                    "kpi_code": kpi_code,
                })
                if not existing_fc:
                    mapped_fields = []
                    for idx, f in enumerate(src_fields):
                        rt = _map_field_type(f.get("type", "text"))
                        mapped_fields.append({
                            "field_code": f.get("field_key", f"field_{idx}"),
                            "label": f.get("label", f"Field {idx}"),
                            "field_type": "input",
                            "response_type": rt,
                            "unit": None,
                            "required": f.get("required", False),
                            "help_text": f.get("placeholder"),
                            "validation": _map_validation(f.get("validation")),
                            "options": f.get("options"),
                            "default_value": f.get("default_value"),
                            "display_order": idx + 1,
                            "enabled": True,
                            "evidence_required": False,
                        })

                    await _fields.insert_one({
                        "id": str(uuid.uuid4()),
                        "organization_id": org_id,
                        "module_code": module_code,
                        "category_code": category_code,
                        "kpi_code": kpi_code,
                        "config_version": 1,
                        "effective_from": _now()[:10],
                        "fields": mapped_fields,
                        "is_active": True,
                        "created_at": _now(),
                        "updated_at": _now(),
                        "created_by": user_id,
                    })
                    stats["field_configs_created"] += 1
                else:
                    stats["skipped"] += 1

    return {"status": "completed", **stats}


def _map_field_type(esg_type: str) -> str:
    """Map existing esg_record field types to sustainability config response types."""
    mapping = {
        "text": "text",
        "textarea": "text",
        "number": "number",
        "dropdown": "dropdown",
        "yes_no": "yes_no",
        "date": "date",
        "file_upload": "file",
        "unit_selector": "dropdown",
        "table": "text",
        "radio": "dropdown",
        "checkbox_group": "multi_select",
    }
    return mapping.get(esg_type, "text")


def _map_validation(val: Any) -> Any:
    """Map existing validation rules."""
    if not val or not isinstance(val, dict):
        return None
    result = {}
    if "min" in val:
        result["min"] = val["min"]
    if "max" in val:
        result["max"] = val["max"]
    return result if result else None
