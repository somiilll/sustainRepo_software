"""
Sustainability Module Configuration — Service Layer

Full CRUD for the 5 org-scoped configuration collections.
Every operation enforces organization_id isolation.
"""

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import uuid
import re

from shared.database.mongo import db

from .contracts import (
    ModuleCreate, ModuleUpdate,
    CategoryCreate, CategoryUpdate,
    KPICreate, KPIUpdate,
    FieldConfigCreate, FieldConfigUpdate,
    CalculationCreate, CalculationUpdate,
)

# Collection handles
_modules = lambda: db["organization_modules"]
_categories = lambda: db["org_module_categories"]
_kpis = lambda: db["org_module_kpis"]
_fields = lambda: db["org_module_kpi_fields"]
_calcs = lambda: db["org_module_kpi_calcs"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# =========================================================================
# MODULES
# =========================================================================

async def list_modules(org_id: str) -> List[Dict[str, Any]]:
    cursor = _modules().find(
        {"organization_id": org_id},
        {"_id": 0},
    ).sort("display_order", 1)
    return await cursor.to_list(None)


async def get_module(org_id: str, module_id: str) -> Optional[Dict[str, Any]]:
    return await _modules().find_one(
        {"id": module_id, "organization_id": org_id},
        {"_id": 0},
    )


async def get_module_by_code(org_id: str, module_code: str) -> Optional[Dict[str, Any]]:
    return await _modules().find_one(
        {"organization_id": org_id, "module_code": module_code},
        {"_id": 0},
    )


async def create_module(org_id: str, data: ModuleCreate, user_id: str) -> Dict[str, Any]:
    existing = await _modules().find_one(
        {"organization_id": org_id, "module_code": data.module_code}
    )
    if existing:
        raise ValueError(f"Module code '{data.module_code}' already exists for this organization")

    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "module_code": data.module_code,
        "module_name": data.module_name,
        "icon": data.icon or "Leaf",
        "enabled": data.enabled,
        "display_order": data.display_order,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user_id,
    }
    await _modules().insert_one(doc)
    doc.pop("_id", None)
    return doc


async def update_module(org_id: str, module_id: str, data: ModuleUpdate) -> Dict[str, Any]:
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if not updates:
        raise ValueError("No fields to update")
    updates["updated_at"] = _now()
    result = await _modules().find_one_and_update(
        {"id": module_id, "organization_id": org_id},
        {"$set": updates},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise ValueError("Module not found")
    return result


async def delete_module(org_id: str, module_id: str) -> bool:
    mod = await _modules().find_one({"id": module_id, "organization_id": org_id})
    if not mod:
        raise ValueError("Module not found")
    module_code = mod["module_code"]
    await _modules().delete_one({"id": module_id, "organization_id": org_id})
    await _categories().delete_many({"organization_id": org_id, "module_code": module_code})
    await _kpis().delete_many({"organization_id": org_id, "module_code": module_code})
    await _fields().delete_many({"organization_id": org_id, "module_code": module_code})
    await _calcs().delete_many({"organization_id": org_id, "module_code": module_code})
    return True


# =========================================================================
# CATEGORIES
# =========================================================================

async def list_categories(org_id: str, module_code: str) -> List[Dict[str, Any]]:
    cursor = _categories().find(
        {"organization_id": org_id, "module_code": module_code},
        {"_id": 0},
    ).sort("display_order", 1)
    return await cursor.to_list(None)


async def get_category(org_id: str, category_id: str) -> Optional[Dict[str, Any]]:
    return await _categories().find_one(
        {"id": category_id, "organization_id": org_id},
        {"_id": 0},
    )


async def create_category(
    org_id: str, module_code: str, data: CategoryCreate, user_id: str,
) -> Dict[str, Any]:
    mod = await _modules().find_one({"organization_id": org_id, "module_code": module_code})
    if not mod:
        raise ValueError(f"Module '{module_code}' not found")

    existing = await _categories().find_one(
        {"organization_id": org_id, "module_code": module_code, "category_code": data.category_code}
    )
    if existing:
        raise ValueError(f"Category code '{data.category_code}' already exists in module '{module_code}'")

    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": data.category_code,
        "category_name": data.category_name,
        "enabled": data.enabled,
        "display_order": data.display_order,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user_id,
    }
    await _categories().insert_one(doc)
    doc.pop("_id", None)
    return doc


async def update_category(org_id: str, category_id: str, data: CategoryUpdate) -> Dict[str, Any]:
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if not updates:
        raise ValueError("No fields to update")
    updates["updated_at"] = _now()
    result = await _categories().find_one_and_update(
        {"id": category_id, "organization_id": org_id},
        {"$set": updates},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise ValueError("Category not found")
    return result


async def delete_category(org_id: str, category_id: str) -> bool:
    cat = await _categories().find_one({"id": category_id, "organization_id": org_id})
    if not cat:
        raise ValueError("Category not found")
    module_code = cat["module_code"]
    category_code = cat["category_code"]
    await _categories().delete_one({"id": category_id, "organization_id": org_id})
    await _kpis().delete_many({"organization_id": org_id, "module_code": module_code, "category_code": category_code})
    await _fields().delete_many({"organization_id": org_id, "module_code": module_code, "category_code": category_code})
    await _calcs().delete_many({"organization_id": org_id, "module_code": module_code, "category_code": category_code})
    return True


# =========================================================================
# KPIs
# =========================================================================

async def list_kpis(org_id: str, module_code: str, category_code: str) -> List[Dict[str, Any]]:
    cursor = _kpis().find(
        {"organization_id": org_id, "module_code": module_code, "category_code": category_code},
        {"_id": 0},
    ).sort("display_order", 1)
    return await cursor.to_list(None)


async def get_kpi(org_id: str, kpi_id: str) -> Optional[Dict[str, Any]]:
    return await _kpis().find_one(
        {"id": kpi_id, "organization_id": org_id},
        {"_id": 0},
    )


async def create_kpi(
    org_id: str, module_code: str, category_code: str,
    data: KPICreate, user_id: str,
) -> Dict[str, Any]:
    cat = await _categories().find_one(
        {"organization_id": org_id, "module_code": module_code, "category_code": category_code}
    )
    if not cat:
        raise ValueError(f"Category '{category_code}' not found in module '{module_code}'")

    existing = await _kpis().find_one({
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": category_code,
        "kpi_code": data.kpi_code,
    })
    if existing:
        raise ValueError(f"KPI code '{data.kpi_code}' already exists")

    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": category_code,
        "kpi_code": data.kpi_code,
        "kpi_name": data.kpi_name,
        "unit": data.unit,
        "description": data.description,
        "enabled": data.enabled,
        "display_order": data.display_order,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user_id,
    }
    await _kpis().insert_one(doc)
    doc.pop("_id", None)
    return doc


async def update_kpi(org_id: str, kpi_id: str, data: KPIUpdate) -> Dict[str, Any]:
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if not updates:
        raise ValueError("No fields to update")
    updates["updated_at"] = _now()
    result = await _kpis().find_one_and_update(
        {"id": kpi_id, "organization_id": org_id},
        {"$set": updates},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise ValueError("KPI not found")
    return result


async def delete_kpi(org_id: str, kpi_id: str) -> bool:
    kpi = await _kpis().find_one({"id": kpi_id, "organization_id": org_id})
    if not kpi:
        raise ValueError("KPI not found")
    module_code = kpi["module_code"]
    category_code = kpi["category_code"]
    kpi_code = kpi["kpi_code"]
    await _kpis().delete_one({"id": kpi_id, "organization_id": org_id})
    await _fields().delete_many({
        "organization_id": org_id, "module_code": module_code,
        "category_code": category_code, "kpi_code": kpi_code,
    })
    await _calcs().delete_many({
        "organization_id": org_id, "module_code": module_code,
        "category_code": category_code, "kpi_code": kpi_code,
    })
    return True


# =========================================================================
# FIELD CONFIGURATIONS (Versioned)
# =========================================================================

async def get_active_field_config(
    org_id: str, module_code: str, category_code: str, kpi_code: str,
) -> Optional[Dict[str, Any]]:
    """Get the current active field config for a KPI."""
    return await _fields().find_one(
        {
            "organization_id": org_id,
            "module_code": module_code,
            "category_code": category_code,
            "kpi_code": kpi_code,
            "is_active": True,
        },
        {"_id": 0},
    )


async def list_field_versions(
    org_id: str, module_code: str, category_code: str, kpi_code: str,
) -> List[Dict[str, Any]]:
    """List all field config versions for a KPI (newest first)."""
    cursor = _fields().find(
        {
            "organization_id": org_id,
            "module_code": module_code,
            "category_code": category_code,
            "kpi_code": kpi_code,
        },
        {"_id": 0},
    ).sort("config_version", -1)
    return await cursor.to_list(None)


async def create_field_config(
    org_id: str, module_code: str, category_code: str, kpi_code: str,
    data: FieldConfigCreate, user_id: str,
) -> Dict[str, Any]:
    """Create a new field configuration version. Deactivates previous active version."""
    kpi = await _kpis().find_one({
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": category_code,
        "kpi_code": kpi_code,
    })
    if not kpi:
        raise ValueError("KPI not found")

    # Get next version number
    latest = await _fields().find_one(
        {
            "organization_id": org_id,
            "module_code": module_code,
            "category_code": category_code,
            "kpi_code": kpi_code,
        },
        sort=[("config_version", -1)],
    )
    next_version = (latest["config_version"] + 1) if latest else 1

    # Deactivate previous active version
    await _fields().update_many(
        {
            "organization_id": org_id,
            "module_code": module_code,
            "category_code": category_code,
            "kpi_code": kpi_code,
            "is_active": True,
        },
        {"$set": {"is_active": False, "updated_at": _now()}},
    )

    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": category_code,
        "kpi_code": kpi_code,
        "config_version": next_version,
        "effective_from": data.effective_from or _now()[:10],
        "fields": [f.model_dump() for f in data.fields],
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user_id,
    }
    await _fields().insert_one(doc)
    doc.pop("_id", None)
    return doc


async def update_field_config(
    org_id: str, field_config_id: str, data: FieldConfigUpdate, user_id: str,
) -> Dict[str, Any]:
    """Update fields in a config version (only if it's the active version)."""
    existing = await _fields().find_one(
        {"id": field_config_id, "organization_id": org_id},
    )
    if not existing:
        raise ValueError("Field config not found")
    if not existing.get("is_active"):
        raise ValueError("Cannot modify an inactive (historical) field config version. Create a new version instead.")

    result = await _fields().find_one_and_update(
        {"id": field_config_id, "organization_id": org_id},
        {"$set": {
            "fields": [f.model_dump() for f in data.fields],
            "updated_at": _now(),
            "updated_by": user_id,
        }},
        return_document=True,
        projection={"_id": 0},
    )
    return result


# =========================================================================
# CALCULATIONS
# =========================================================================

async def list_calculations(
    org_id: str, module_code: str, category_code: str, kpi_code: str,
) -> List[Dict[str, Any]]:
    cursor = _calcs().find(
        {
            "organization_id": org_id,
            "module_code": module_code,
            "category_code": category_code,
            "kpi_code": kpi_code,
        },
        {"_id": 0},
    ).sort("display_order", 1)
    return await cursor.to_list(None)


async def create_calculation(
    org_id: str, module_code: str, category_code: str, kpi_code: str,
    data: CalculationCreate, user_id: str,
) -> Dict[str, Any]:
    kpi = await _kpis().find_one({
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": category_code,
        "kpi_code": kpi_code,
    })
    if not kpi:
        raise ValueError("KPI not found")

    existing = await _calcs().find_one({
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": category_code,
        "kpi_code": kpi_code,
        "calculation_code": data.calculation_code,
    })
    if existing:
        raise ValueError(f"Calculation code '{data.calculation_code}' already exists for this KPI")

    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": org_id,
        "module_code": module_code,
        "category_code": category_code,
        "kpi_code": kpi_code,
        "calculation_code": data.calculation_code,
        "calculation_name": data.calculation_name,
        "calculation_type": data.calculation_type.value,
        "inputs": data.inputs,
        "expression": data.expression,
        "output_field_code": data.output_field_code,
        "output_label": data.output_label,
        "output_unit": data.output_unit,
        "enabled": data.enabled,
        "display_order": data.display_order,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": user_id,
    }
    await _calcs().insert_one(doc)
    doc.pop("_id", None)
    return doc


async def update_calculation(org_id: str, calc_id: str, data: CalculationUpdate) -> Dict[str, Any]:
    updates = {}
    for k, v in data.model_dump(exclude_none=True).items():
        if k == "calculation_type" and v is not None:
            updates[k] = v.value if hasattr(v, "value") else v
        else:
            updates[k] = v
    if not updates:
        raise ValueError("No fields to update")
    updates["updated_at"] = _now()
    result = await _calcs().find_one_and_update(
        {"id": calc_id, "organization_id": org_id},
        {"$set": updates},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise ValueError("Calculation not found")
    return result


async def delete_calculation(org_id: str, calc_id: str) -> bool:
    result = await _calcs().delete_one({"id": calc_id, "organization_id": org_id})
    if result.deleted_count == 0:
        raise ValueError("Calculation not found")
    return True


# =========================================================================
# INDEXES (call once at startup)
# =========================================================================

async def ensure_indexes():
    await _modules().create_index(
        [("organization_id", 1), ("module_code", 1)], unique=True
    )
    await _modules().create_index([("organization_id", 1), ("display_order", 1)])

    await _categories().create_index(
        [("organization_id", 1), ("module_code", 1), ("category_code", 1)], unique=True
    )
    await _categories().create_index([("organization_id", 1), ("module_code", 1), ("display_order", 1)])

    await _kpis().create_index(
        [("organization_id", 1), ("module_code", 1), ("category_code", 1), ("kpi_code", 1)], unique=True
    )

    await _fields().create_index(
        [("organization_id", 1), ("module_code", 1), ("category_code", 1), ("kpi_code", 1), ("config_version", 1)],
        unique=True,
    )
    await _fields().create_index(
        [("organization_id", 1), ("module_code", 1), ("category_code", 1), ("kpi_code", 1), ("is_active", 1)]
    )

    await _calcs().create_index(
        [("organization_id", 1), ("module_code", 1), ("category_code", 1), ("kpi_code", 1), ("calculation_code", 1)],
        unique=True,
    )


# =========================================================================
# FULL CONFIG TREE (read-only convenience)
# =========================================================================

async def get_full_config_tree(org_id: str) -> Dict[str, Any]:
    """Return the full configuration tree for an organization."""
    modules = await list_modules(org_id)
    tree = []
    for mod in modules:
        mc = mod["module_code"]
        cats = await list_categories(org_id, mc)
        cat_list = []
        for cat in cats:
            cc = cat["category_code"]
            kpis = await list_kpis(org_id, mc, cc)
            kpi_list = []
            for kpi in kpis:
                kc = kpi["kpi_code"]
                field_cfg = await get_active_field_config(org_id, mc, cc, kc)
                calcs = await list_calculations(org_id, mc, cc, kc)
                kpi_list.append({
                    **kpi,
                    "fields": field_cfg["fields"] if field_cfg else [],
                    "config_version": field_cfg["config_version"] if field_cfg else None,
                    "calculations": calcs,
                })
            cat_list.append({**cat, "kpis": kpi_list})
        tree.append({**mod, "categories": cat_list})
    return {"organization_id": org_id, "modules": tree}
