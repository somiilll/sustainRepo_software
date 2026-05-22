"""Organizations repository — DB access for the `organizations` collection."""
from typing import Any, Dict, Optional

from shared.database.mongo import db


class OrganizationsRepository:
    def __init__(self, database=db):
        self._db = database

    async def find_by_id(self, org_id: str) -> Optional[Dict[str, Any]]:
        return await self._db.organizations.find_one({"id": org_id}, {"_id": 0})

    async def update(self, org_id: str, update: Dict[str, Any]) -> None:
        await self._db.organizations.update_one({"id": org_id}, {"$set": update})


organizations_repository = OrganizationsRepository()
