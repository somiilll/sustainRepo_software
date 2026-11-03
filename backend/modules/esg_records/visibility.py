"""Record visibility for non-admin users: list pages and dashboards share one rule.

Workflow org      -> records in the (sub)categories assigned to the user.
Non-workflow org  -> records the user created/edited, plus all records of their assigned facilities.
"""
from typing import Any, Dict, Optional

from shared.database.mongo import db as _db

ADMIN_ROLES = {"admin", "super_admin", "org_admin"}
NO_RECORDS: Dict[str, Any] = {"id": {"$in": []}}
ESG_COLLECTIONS = ("environment_records", "social_records", "governance_records")


async def is_workflow_org(org_id: str) -> bool:
    from modules.sustainability_config.service import resolve_organization_settings
    settings = await resolve_organization_settings(org_id)
    return bool(settings.get("approval_workflow_enabled"))


async def user_assigned_categories(org_id: str, user_id: str) -> list:
    assignee_rows = await _db.esg_assignment_assignees.find(
        {"user_id": user_id, "organization_id": org_id, "$or": [{"removed_at": None}, {"removed_at": {"$exists": False}}]},
        {"_id": 0, "assignment_id": 1},
    ).to_list(500)
    assignment_ids = [row["assignment_id"] for row in assignee_rows]
    if not assignment_ids:
        return []
    assignments = await _db.esg_assignments.find(
        {"id": {"$in": assignment_ids}, "organization_id": org_id, "entity_type": "record_category"},
        {"_id": 0, "category": 1, "subcategory": 1, "sub_subcategory": 1},
    ).to_list(500)
    return [(a.get("category"), a.get("subcategory"), a.get("sub_subcategory")) for a in assignments]


def own_or_facility_clause(user: dict) -> Dict[str, Any]:
    user_id = user.get("id")
    return {"$or": [
        {"created_by": user_id},
        {"updated_by": user_id},
        {"facility_id": {"$in": list(user.get("assigned_facilities") or [])}},
    ]}


def category_clause(categories: list) -> Dict[str, Any]:
    conditions = []
    for category, subcategory, sub_subcategory in categories:
        condition = {"category": category}
        if subcategory:
            condition["subcategory"] = subcategory
        if sub_subcategory:
            condition["sub_subcategory"] = sub_subcategory
        conditions.append(condition)
    return {"$or": conditions} if conditions else NO_RECORDS


async def resolve_record_visibility(user: dict) -> Optional[Dict[str, Any]]:
    """Mongo clause limiting ESG records for a non-admin user; None means unrestricted."""
    if user.get("role") in ADMIN_ROLES:
        return None
    org_id = user.get("organization_id")
    if not org_id:
        return NO_RECORDS
    if await is_workflow_org(org_id):
        return category_clause(await user_assigned_categories(org_id, user.get("id")))
    return own_or_facility_clause(user)


class ScopedCollection:
    def __init__(self, collection, clause: Dict[str, Any]):
        self._collection = collection
        self._clause = clause

    def _scoped(self, query: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        return {"$and": [query or {}, self._clause]}

    def find(self, query=None, *args, **kwargs):
        return self._collection.find(self._scoped(query), *args, **kwargs)

    def find_one(self, query=None, *args, **kwargs):
        return self._collection.find_one(self._scoped(query), *args, **kwargs)

    def count_documents(self, query=None, *args, **kwargs):
        return self._collection.count_documents(self._scoped(query), *args, **kwargs)

    def distinct(self, key, query=None, *args, **kwargs):
        return self._collection.distinct(key, self._scoped(query), *args, **kwargs)

    def aggregate(self, pipeline, *args, **kwargs):
        return self._collection.aggregate([{"$match": self._clause}, *pipeline], *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._collection, name)


class ScopedDB:
    """Database handle whose scoped collections only return rows the user may see."""

    def __init__(self, database, clauses: Dict[str, Dict[str, Any]]):
        self._database = database
        self._clauses = clauses

    def __getitem__(self, name):
        collection = self._database[name]
        return ScopedCollection(collection, self._clauses[name]) if name in self._clauses else collection

    def __getattr__(self, name):
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]


async def scoped_dashboard_db(database, user: dict):
    """Dashboard database handle: unchanged for admins, visibility-scoped for everyone else."""
    clause = await resolve_record_visibility(user)
    if clause is None:
        return database
    from modules.emissions.access_policy import resolve_ghg_access_scope
    ghg_scope = await resolve_ghg_access_scope(user)
    clauses = {name: clause for name in ESG_COLLECTIONS}
    clauses["emission_records"] = ghg_scope.emission_query()
    return ScopedDB(database, clauses)
