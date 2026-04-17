"""
Dynamic scopes and emission categories module.

- SuperAdmin manages scopes (e.g. Scope 1, Scope 2, Scope 3, Biogenic) and the
  categories under each scope (e.g. Stationary Combustion, Mobile Combustion).
- Soft delete only: if ANY emission record, emission factor, fuel or formula
  references the scope/category, deletion is blocked until those are migrated.
- Active=True records are exposed to all users; is_active=False hides an item
  from new entries while keeping historical records intact.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict

logger = logging.getLogger(__name__)


# ---------- Models ----------


class ScopeCreate(BaseModel):
    name: str  # "Scope 1", "Biogenic", etc.
    code: Optional[str] = None  # "scope1", "biogenic" - used as the DB value
    description: Optional[str] = None
    display_order: Optional[int] = 0


class ScopeUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class ScopeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    code: str
    description: Optional[str] = None
    display_order: int = 0
    is_active: bool = True
    is_system: bool = False
    created_at: str


class CategoryCreate(BaseModel):
    scope_id: str
    name: str  # "Stationary Combustion"
    code: Optional[str] = None  # "stationary_combustion"
    description: Optional[str] = None
    display_order: Optional[int] = 0


class CategoryUpdate(BaseModel):
    scope_id: Optional[str] = None
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    scope_id: str
    scope_name: Optional[str] = None
    scope_code: Optional[str] = None
    name: str
    code: str
    description: Optional[str] = None
    display_order: int = 0
    is_active: bool = True
    is_system: bool = False
    created_at: str


# ---------- Seed data (matches historical hardcoded values) ----------

DEFAULT_SCOPES = [
    {"name": "Scope 1", "code": "scope1", "description": "Direct emissions from owned or controlled sources", "display_order": 1},
    {"name": "Scope 2", "code": "scope2", "description": "Indirect emissions from purchased electricity, steam, heating and cooling", "display_order": 2},
    {"name": "Scope 3", "code": "scope3", "description": "Indirect value-chain emissions (upstream and downstream)", "display_order": 3},
    {"name": "Biogenic", "code": "biogenic", "description": "Biogenic CO2 emissions reported separately", "display_order": 4},
]

DEFAULT_CATEGORIES = {
    "scope1": [
        {"name": "Stationary Combustion", "code": "stationary_combustion", "display_order": 1},
        {"name": "Mobile Combustion", "code": "mobile_combustion", "display_order": 2},
        {"name": "Process Emissions", "code": "process_emissions", "display_order": 3},
        {"name": "Fugitive Emissions", "code": "fugitive_emissions", "display_order": 4},
    ],
    "scope2": [
        {"name": "Purchased Electricity", "code": "purchased_electricity", "display_order": 1},
        {"name": "Purchased Heat/Steam", "code": "purchased_heat_steam", "display_order": 2},
        {"name": "Purchased Cooling", "code": "purchased_cooling", "display_order": 3},
        {"name": "Renewable Electricity", "code": "renewable_electricity", "display_order": 4},
    ],
    "scope3": [],
    "biogenic": [
        {"name": "Biogenic CO2", "code": "biogenic_co2", "display_order": 1},
    ],
}


def _slugify(name: str) -> str:
    return "".join(c.lower() if c.isalnum() else "_" for c in name.strip()).strip("_")


async def seed_scopes_and_categories(db):
    """Idempotently seed default scopes + categories. Called on backend startup."""
    now = datetime.now(timezone.utc).isoformat()

    for scope in DEFAULT_SCOPES:
        existing = await db.scopes.find_one({"code": scope["code"]}, {"_id": 0})
        if not existing:
            doc = {
                "id": str(uuid.uuid4()),
                "name": scope["name"],
                "code": scope["code"],
                "description": scope.get("description"),
                "display_order": scope.get("display_order", 0),
                "is_active": True,
                "is_system": True,
                "created_at": now,
            }
            await db.scopes.insert_one(doc)
            logger.info(f"Seeded scope: {scope['name']}")

    for scope_code, categories in DEFAULT_CATEGORIES.items():
        scope = await db.scopes.find_one({"code": scope_code}, {"_id": 0})
        if not scope:
            continue
        for cat in categories:
            existing = await db.emission_categories.find_one(
                {"scope_id": scope["id"], "code": cat["code"]}, {"_id": 0}
            )
            if not existing:
                doc = {
                    "id": str(uuid.uuid4()),
                    "scope_id": scope["id"],
                    "name": cat["name"],
                    "code": cat["code"],
                    "description": cat.get("description"),
                    "display_order": cat.get("display_order", 0),
                    "is_active": True,
                    "is_system": True,
                    "created_at": now,
                }
                await db.emission_categories.insert_one(doc)
                logger.info(f"Seeded category: {cat['name']} under {scope_code}")


# ---------- Router ----------


def build_scopes_router(db, get_current_user, get_super_admin_user) -> APIRouter:
    router = APIRouter()

    # ----- Read endpoints: visible to all authenticated users -----

    @router.get("/scopes", response_model=List[ScopeResponse])
    async def list_scopes(
        include_inactive: bool = Query(False),
        current_user: dict = Depends(get_current_user),
    ):
        query = {} if include_inactive else {"is_active": {"$ne": False}}
        scopes = await db.scopes.find(query, {"_id": 0}).sort("display_order", 1).to_list(1000)
        return [ScopeResponse(**s) for s in scopes]

    @router.get("/categories", response_model=List[CategoryResponse])
    async def list_categories(
        scope_id: Optional[str] = Query(None),
        scope_code: Optional[str] = Query(None),
        include_inactive: bool = Query(False),
        current_user: dict = Depends(get_current_user),
    ):
        query = {} if include_inactive else {"is_active": {"$ne": False}}
        if scope_code and not scope_id:
            s = await db.scopes.find_one({"code": scope_code}, {"_id": 0, "id": 1})
            if s:
                scope_id = s["id"]
        if scope_id:
            query["scope_id"] = scope_id
        categories = await db.emission_categories.find(query, {"_id": 0}).sort("display_order", 1).to_list(10000)

        # Enrich with scope_name/scope_code for easy UI rendering
        scope_ids = {c["scope_id"] for c in categories if c.get("scope_id")}
        scopes = {}
        if scope_ids:
            scope_docs = await db.scopes.find(
                {"id": {"$in": list(scope_ids)}}, {"_id": 0, "id": 1, "name": 1, "code": 1}
            ).to_list(1000)
            scopes = {s["id"]: s for s in scope_docs}
        for c in categories:
            s = scopes.get(c.get("scope_id"))
            if s:
                c["scope_name"] = s.get("name")
                c["scope_code"] = s.get("code")
        return [CategoryResponse(**c) for c in categories]

    # ----- Scope CRUD: SuperAdmin only -----

    @router.post("/super-admin/scopes", response_model=ScopeResponse)
    async def create_scope(
        payload: ScopeCreate,
        current_user: dict = Depends(get_super_admin_user),
    ):
        code = (payload.code or _slugify(payload.name)).strip()
        if not code:
            raise HTTPException(status_code=400, detail="Scope code is required")

        existing = await db.scopes.find_one({"code": code}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail=f"Scope with code '{code}' already exists")
        existing_name = await db.scopes.find_one({"name": payload.name}, {"_id": 0})
        if existing_name:
            raise HTTPException(status_code=400, detail=f"Scope with name '{payload.name}' already exists")

        doc = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "code": code,
            "description": payload.description,
            "display_order": payload.display_order or 0,
            "is_active": True,
            "is_system": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.scopes.insert_one(doc)
        return ScopeResponse(**doc)

    @router.put("/super-admin/scopes/{scope_id}", response_model=ScopeResponse)
    async def update_scope(
        scope_id: str,
        payload: ScopeUpdate,
        current_user: dict = Depends(get_super_admin_user),
    ):
        scope = await db.scopes.find_one({"id": scope_id}, {"_id": 0})
        if not scope:
            raise HTTPException(status_code=404, detail="Scope not found")

        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k == "is_active"}
        # Prevent system scope from changing its code (would break historical data)
        if scope.get("is_system") and "code" in updates and updates["code"] != scope["code"]:
            raise HTTPException(
                status_code=400,
                detail="Cannot change the code of a system scope (would break historical emission records)",
            )

        # Uniqueness checks
        if "code" in updates:
            clash = await db.scopes.find_one({"code": updates["code"], "id": {"$ne": scope_id}}, {"_id": 0})
            if clash:
                raise HTTPException(status_code=400, detail=f"Scope code '{updates['code']}' already in use")
        if "name" in updates:
            clash = await db.scopes.find_one({"name": updates["name"], "id": {"$ne": scope_id}}, {"_id": 0})
            if clash:
                raise HTTPException(status_code=400, detail=f"Scope name '{updates['name']}' already in use")

        if updates:
            await db.scopes.update_one({"id": scope_id}, {"$set": updates})
        updated = await db.scopes.find_one({"id": scope_id}, {"_id": 0})
        return ScopeResponse(**updated)

    @router.delete("/super-admin/scopes/{scope_id}")
    async def delete_scope(
        scope_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Soft-delete a scope. Blocked if any active categories/emissions reference it."""
        scope = await db.scopes.find_one({"id": scope_id}, {"_id": 0})
        if not scope:
            raise HTTPException(status_code=404, detail="Scope not found")

        # Check active categories
        active_cats = await db.emission_categories.count_documents(
            {"scope_id": scope_id, "is_active": {"$ne": False}}
        )
        if active_cats > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete scope: {active_cats} active categor{'y' if active_cats == 1 else 'ies'} still belong to it. Delete or move them first.",
            )

        # Check emission records using this scope's code
        em_count = await db.emission_records.count_documents({"scope": scope["code"]})
        if em_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete scope: {em_count} emission record(s) reference it. Scope will be soft-deleted (hidden from new entries) instead.",
            )

        await db.scopes.update_one({"id": scope_id}, {"$set": {"is_active": False}})
        return {"message": f"Scope '{scope['name']}' deactivated (soft-deleted)"}

    # ----- Category CRUD: SuperAdmin only -----

    @router.post("/super-admin/categories", response_model=CategoryResponse)
    async def create_category(
        payload: CategoryCreate,
        current_user: dict = Depends(get_super_admin_user),
    ):
        scope = await db.scopes.find_one({"id": payload.scope_id}, {"_id": 0})
        if not scope:
            raise HTTPException(status_code=404, detail="Parent scope not found")

        code = (payload.code or _slugify(payload.name)).strip()
        if not code:
            raise HTTPException(status_code=400, detail="Category code is required")

        existing = await db.emission_categories.find_one(
            {"scope_id": payload.scope_id, "code": code}, {"_id": 0}
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Category with code '{code}' already exists under this scope",
            )

        doc = {
            "id": str(uuid.uuid4()),
            "scope_id": payload.scope_id,
            "name": payload.name,
            "code": code,
            "description": payload.description,
            "display_order": payload.display_order or 0,
            "is_active": True,
            "is_system": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.emission_categories.insert_one(doc)
        doc["scope_name"] = scope.get("name")
        doc["scope_code"] = scope.get("code")
        return CategoryResponse(**doc)

    @router.put("/super-admin/categories/{category_id}", response_model=CategoryResponse)
    async def update_category(
        category_id: str,
        payload: CategoryUpdate,
        current_user: dict = Depends(get_super_admin_user),
    ):
        cat = await db.emission_categories.find_one({"id": category_id}, {"_id": 0})
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")

        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k == "is_active"}

        if cat.get("is_system") and "code" in updates and updates["code"] != cat["code"]:
            raise HTTPException(
                status_code=400,
                detail="Cannot change the code of a system category (would break historical emission records)",
            )

        if "scope_id" in updates:
            new_scope = await db.scopes.find_one({"id": updates["scope_id"]}, {"_id": 0})
            if not new_scope:
                raise HTTPException(status_code=404, detail="Target scope not found")

        if "code" in updates:
            target_scope = updates.get("scope_id", cat["scope_id"])
            clash = await db.emission_categories.find_one(
                {"scope_id": target_scope, "code": updates["code"], "id": {"$ne": category_id}},
                {"_id": 0},
            )
            if clash:
                raise HTTPException(
                    status_code=400,
                    detail=f"Category code '{updates['code']}' already in use under that scope",
                )

        if updates:
            await db.emission_categories.update_one({"id": category_id}, {"$set": updates})
        updated = await db.emission_categories.find_one({"id": category_id}, {"_id": 0})
        scope = await db.scopes.find_one({"id": updated["scope_id"]}, {"_id": 0, "name": 1, "code": 1})
        if scope:
            updated["scope_name"] = scope.get("name")
            updated["scope_code"] = scope.get("code")
        return CategoryResponse(**updated)

    @router.delete("/super-admin/categories/{category_id}")
    async def delete_category(
        category_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        """Soft-delete a category. Blocked if emissions reference it."""
        cat = await db.emission_categories.find_one({"id": category_id}, {"_id": 0})
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")

        # Block if any emission records reference it (by name or code)
        # Historical records use the display name (e.g. "Stationary Combustion") in `category`
        query = {
            "$or": [
                {"category": cat["name"]},
                {"category": cat["code"]},
            ]
        }
        em_count = await db.emission_records.count_documents(query)
        if em_count > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete category: {em_count} emission record(s) reference it. Soft-deleting instead (it will be hidden from new entries).",
            )

        # No emissions -> soft delete
        await db.emission_categories.update_one({"id": category_id}, {"$set": {"is_active": False}})
        return {"message": f"Category '{cat['name']}' deactivated (soft-deleted)"}

    @router.post("/super-admin/categories/{category_id}/restore", response_model=CategoryResponse)
    async def restore_category(
        category_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        cat = await db.emission_categories.find_one({"id": category_id}, {"_id": 0})
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")
        await db.emission_categories.update_one({"id": category_id}, {"$set": {"is_active": True}})
        updated = await db.emission_categories.find_one({"id": category_id}, {"_id": 0})
        scope = await db.scopes.find_one({"id": updated["scope_id"]}, {"_id": 0, "name": 1, "code": 1})
        if scope:
            updated["scope_name"] = scope.get("name")
            updated["scope_code"] = scope.get("code")
        return CategoryResponse(**updated)

    @router.post("/super-admin/scopes/{scope_id}/restore", response_model=ScopeResponse)
    async def restore_scope(
        scope_id: str,
        current_user: dict = Depends(get_super_admin_user),
    ):
        scope = await db.scopes.find_one({"id": scope_id}, {"_id": 0})
        if not scope:
            raise HTTPException(status_code=404, detail="Scope not found")
        await db.scopes.update_one({"id": scope_id}, {"$set": {"is_active": True}})
        updated = await db.scopes.find_one({"id": scope_id}, {"_id": 0})
        return ScopeResponse(**updated)

    return router
