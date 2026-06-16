"""
ESG Users Service

Business logic for ESG user management using the users_esg collection.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from shared.database.mongo import db
from shared.helpers.passwords import get_password_hash, verify_password
from core_platform.users.repository import AbstractUserRepository
from modules.esg_users.contracts import ESGUserCreate, ESGUserUpdate


class ESGUserService:
    """
    Service for managing ESG platform users.
    Uses the `users_esg` collection separate from legacy GHG users.
    """

    COLLECTION_NAME = "users_esg"

    def __init__(self, database=None):
        self._db = database or db
        self._repository = AbstractUserRepository(
            collection_name=self.COLLECTION_NAME,
            database=self._db
        )

    async def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get ESG user by ID."""
        return await self._repository.find_by_id(user_id)

    async def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get ESG user by email."""
        return await self._repository.find_by_email(email)

    async def create(self, user_data: ESGUserCreate) -> Dict[str, Any]:
        """Create a new ESG user."""
        # Check if email already exists
        existing = await self._repository.find_by_email(user_data.email)
        if existing:
            raise ValueError("Email already registered")

        user_dict = {
            "id": str(uuid.uuid4()),
            "email": user_data.email,
            "full_name": user_data.full_name,
            "role": user_data.role,
            "password_hash": get_password_hash(user_data.password),
            "organization_id": user_data.organization_id,
            "assigned_facilities": user_data.assigned_facilities,
            "is_active": True,
            "is_deleted": False,
            "requires_password_change": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": None,
        }

        await self._repository.insert(user_dict)
        
        # Return without password_hash
        user_dict.pop("password_hash", None)
        return user_dict

    async def update(self, user_id: str, update: ESGUserUpdate) -> Optional[Dict[str, Any]]:
        """Update an ESG user."""
        existing = await self._repository.find_by_id(user_id)
        if not existing:
            return None

        update_dict = update.model_dump(exclude_unset=True)
        update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

        await self._repository.update(user_id, update_dict)
        
        updated = await self._repository.find_by_id(user_id)
        updated.pop("password_hash", None)
        return updated

    async def delete(self, user_id: str, soft: bool = True) -> bool:
        """Delete an ESG user."""
        existing = await self._repository.find_by_id(user_id)
        if not existing:
            return False

        if soft:
            await self._repository.soft_delete(user_id)
        else:
            await self._repository.delete(user_id)
        
        return True

    async def change_password(self, user_id: str, old_password: str, new_password: str) -> bool:
        """Change user password."""
        user = await self._db[self.COLLECTION_NAME].find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise ValueError("User not found")

        if not verify_password(old_password, user.get("password_hash", "")):
            raise ValueError("Incorrect old password")

        await self._repository.update(user_id, {
            "password_hash": get_password_hash(new_password),
            "requires_password_change": False,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        
        return True

    async def list_by_organization(self, org_id: str, role: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all ESG users in an organization."""
        users = await self._repository.list_active_users_in_org(org_id, role)
        return users

    async def list_all(self) -> List[Dict[str, Any]]:
        """List all active ESG users."""
        return await self._repository.list_all_active()

    async def assign_facilities(self, user_id: str, facility_ids: List[str]) -> bool:
        """Assign facilities to a user."""
        existing = await self._repository.find_by_id(user_id)
        if not existing:
            return False

        await self._repository.update(user_id, {
            "assigned_facilities": facility_ids,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        
        return True

    async def authenticate(self, email: str, password: str) -> Optional[Dict[str, Any]]:
        """
        Authenticate an ESG user.
        Returns user dict (without password_hash) if credentials are valid, None otherwise.
        """
        user = await self._db[self.COLLECTION_NAME].find_one({"email": email}, {"_id": 0})
        if not user:
            return None

        if not verify_password(password, user.get("password_hash", "")):
            return None

        if user.get("is_deleted", False):
            return None

        if not user.get("is_active", True):
            return None

        user.pop("password_hash", None)
        return user


# Default service instance
esg_user_service = ESGUserService()
