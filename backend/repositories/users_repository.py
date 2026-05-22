"""
Users repository — DB access abstraction for the `users` collection.

All DB queries that touch the `users` collection should funnel through
this repository so:
  - tests can mock a single dependency
  - field projections (excluding `_id`, `password_hash`) are consistent
  - "soft-delete + active" filtering rules are centralized
"""
from typing import Any, Dict, List, Optional

from shared.database.mongo import db


class UsersRepository:
    """Thin async wrapper over the `users` Mongo collection."""

    def __init__(self, database=db):
        self._db = database

    async def find_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a user by id (excludes Mongo `_id`)."""
        return await self._db.users.find_one({"id": user_id}, {"_id": 0})

    async def find_by_email(self, email: str, exclude_deleted: bool = True) -> Optional[Dict[str, Any]]:
        """Fetch a user by email; by default excludes soft-deleted accounts so the email can be reused."""
        query: Dict[str, Any] = {"email": email}
        if exclude_deleted:
            query["is_deleted"] = {"$ne": True}
        return await self._db.users.find_one(query, {"_id": 0})

    async def find_by_email_any(self, email: str) -> Optional[Dict[str, Any]]:
        """Fetch a user by email regardless of soft-delete state (used during login)."""
        return await self._db.users.find_one({"email": email}, {"_id": 0})

    async def insert(self, user_dict: Dict[str, Any]) -> None:
        await self._db.users.insert_one(user_dict)

    async def update(self, user_id: str, update: Dict[str, Any]) -> None:
        await self._db.users.update_one({"id": user_id}, {"$set": update})

    async def delete(self, user_id: str) -> None:
        """Hard delete — used by the admin route. Soft-delete uses `update`."""
        await self._db.users.delete_one({"id": user_id})

    async def list_active_users_in_org(self, org_id: str) -> List[Dict[str, Any]]:
        """Return non-deleted role='user' members of an organization."""
        query = {"organization_id": org_id, "role": "user", "is_deleted": {"$ne": True}}
        return await self._db.users.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)

    async def count_active_users_in_org(self, org_id: str) -> int:
        return await self._db.users.count_documents({
            "organization_id": org_id,
            "role": "user",
            "is_deleted": {"$ne": True},
        })


# Module-level default instance — Phase B2 callers (auth + users routers)
# import this singleton. Tests can construct their own with a mock db.
users_repository = UsersRepository()
