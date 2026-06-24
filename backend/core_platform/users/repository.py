"""
Abstract User Repository

Provides a collection-agnostic user repository that can work with different
MongoDB collections (e.g., 'users' for legacy GHG, 'users' for ESG platform).

This abstraction allows:
- Multiple user stores for different platform contexts
- Easy testing with mock databases
- Consistent field projections and query patterns
"""

from typing import Any, Dict, List, Optional
from shared.database.mongo import db


class AbstractUserRepository:
    """
    Collection-agnostic user repository.
    
    Usage:
        # For legacy GHG platform
        legacy_repo = AbstractUserRepository(collection_name="users")
        
        # For ESG platform
        esg_repo = AbstractUserRepository(collection_name="users")
    """

    def __init__(self, collection_name: str = "users", database=None):
        if database is not None:
            self._db = database
        else:
            self._db = db
        self._collection_name = collection_name
        self._collection = self._db[collection_name]

    @property
    def collection_name(self) -> str:
        return self._collection_name

    async def find_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a user by id (excludes Mongo `_id`)."""
        return await self._collection.find_one({"id": user_id}, {"_id": 0})

    async def find_by_email(self, email: str, exclude_deleted: bool = True) -> Optional[Dict[str, Any]]:
        """Fetch a user by email; by default excludes soft-deleted accounts."""
        query: Dict[str, Any] = {"email": email}
        if exclude_deleted:
            query["is_deleted"] = {"$ne": True}
        return await self._collection.find_one(query, {"_id": 0})

    async def find_by_email_any(self, email: str) -> Optional[Dict[str, Any]]:
        """Fetch a user by email regardless of soft-delete state."""
        return await self._collection.find_one({"email": email}, {"_id": 0})

    async def insert(self, user_dict: Dict[str, Any]) -> None:
        await self._collection.insert_one(user_dict)

    async def update(self, user_id: str, update: Dict[str, Any]) -> None:
        await self._collection.update_one({"id": user_id}, {"$set": update})

    async def delete(self, user_id: str) -> None:
        """Hard delete."""
        await self._collection.delete_one({"id": user_id})

    async def soft_delete(self, user_id: str) -> None:
        """Soft delete - marks user as deleted."""
        from datetime import datetime, timezone
        await self._collection.update_one(
            {"id": user_id},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}}
        )

    async def list_active_users_in_org(self, org_id: str, role: Optional[str] = None) -> List[Dict[str, Any]]:
        """Return non-deleted users of an organization."""
        query: Dict[str, Any] = {
            "organization_id": org_id,
            "is_deleted": {"$ne": True}
        }
        if role:
            query["role"] = role
        return await self._collection.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)

    async def count_active_users_in_org(self, org_id: str, role: Optional[str] = None) -> int:
        query: Dict[str, Any] = {
            "organization_id": org_id,
            "is_deleted": {"$ne": True}
        }
        if role:
            query["role"] = role
        return await self._collection.count_documents(query)

    async def list_all_active(self) -> List[Dict[str, Any]]:
        """Return all non-deleted users."""
        return await self._collection.find(
            {"is_deleted": {"$ne": True}},
            {"_id": 0, "password_hash": 0}
        ).to_list(10000)

    async def find_by_role(self, role: str, exclude_deleted: bool = True) -> List[Dict[str, Any]]:
        """Find all users with a specific role."""
        query: Dict[str, Any] = {"role": role}
        if exclude_deleted:
            query["is_deleted"] = {"$ne": True}
        return await self._collection.find(query, {"_id": 0, "password_hash": 0}).to_list(1000)


def create_user_repository(collection_name: str = "users", database=None) -> AbstractUserRepository:
    """
    Factory function to create a user repository for a specific collection.
    
    Args:
        collection_name: MongoDB collection name (default: "users")
        database: Optional database override for testing
        
    Returns:
        AbstractUserRepository instance configured for the specified collection
    """
    return AbstractUserRepository(collection_name=collection_name, database=database)


# Pre-configured repository instances
legacy_users_repository = AbstractUserRepository(collection_name="users")
esg_users_repository = AbstractUserRepository(collection_name="users")
