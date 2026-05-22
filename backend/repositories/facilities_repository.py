"""
Facilities repository — DB access for the `facilities` collection.

Mirrors the `users_repository` pattern. Routes still use raw `db` access
in Phase B3 to preserve byte-identical behaviour; adoption deferred.
"""
from typing import Any, Dict, List, Optional

from shared.database.mongo import db


class FacilitiesRepository:
    def __init__(self, database=db):
        self._db = database

    async def find_by_id(self, facility_id: str) -> Optional[Dict[str, Any]]:
        return await self._db.facilities.find_one({"id": facility_id}, {"_id": 0})

    async def list_for_org(self, org_id: str) -> List[Dict[str, Any]]:
        return await self._db.facilities.find({"organization_id": org_id}, {"_id": 0}).to_list(1000)

    async def list_for_user(self, facility_ids: List[str]) -> List[Dict[str, Any]]:
        return await self._db.facilities.find({"id": {"$in": facility_ids}}, {"_id": 0}).to_list(1000)

    async def list_all(self) -> List[Dict[str, Any]]:
        return await self._db.facilities.find({}, {"_id": 0}).to_list(1000)

    async def count_for_org(self, org_id: str) -> int:
        return await self._db.facilities.count_documents({"organization_id": org_id})

    async def find_by_name_in_org(self, name: str, org_id: str) -> Optional[Dict[str, Any]]:
        return await self._db.facilities.find_one({"name": name, "organization_id": org_id})

    async def insert(self, facility_dict: Dict[str, Any]) -> None:
        await self._db.facilities.insert_one(facility_dict)

    async def update(self, facility_id: str, update: Dict[str, Any]) -> None:
        await self._db.facilities.update_one({"id": facility_id}, {"$set": update})


facilities_repository = FacilitiesRepository()
