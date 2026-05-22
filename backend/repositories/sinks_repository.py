"""Sinks repository — DB access for the `sinks` collection."""
from typing import Any, Dict, List, Optional

from shared.database.mongo import db


class SinksRepository:
    def __init__(self, database=db):
        self._db = database

    async def find_by_id(self, sink_id: str) -> Optional[Dict[str, Any]]:
        return await self._db.sinks.find_one({"id": sink_id}, {"_id": 0})

    async def list_for_org(self, org_id: str) -> List[Dict[str, Any]]:
        return await self._db.sinks.find({"organization_id": org_id}, {"_id": 0}).to_list(10000)

    async def list_for_facilities(self, facility_ids: List[str]) -> List[Dict[str, Any]]:
        return await self._db.sinks.find({"facility_id": {"$in": facility_ids}}, {"_id": 0}).to_list(10000)

    async def list_all(self) -> List[Dict[str, Any]]:
        return await self._db.sinks.find({}, {"_id": 0}).to_list(10000)

    async def insert(self, sink_dict: Dict[str, Any]) -> None:
        await self._db.sinks.insert_one(sink_dict)

    async def update(self, sink_id: str, update: Dict[str, Any]) -> None:
        await self._db.sinks.update_one({"id": sink_id}, {"$set": update})

    async def delete(self, sink_id: str) -> int:
        result = await self._db.sinks.delete_one({"id": sink_id})
        return result.deleted_count


sinks_repository = SinksRepository()
