"""
Emissions repository — DB access for `emission_records` and
`emission_history` collections.
"""
from typing import Any, Dict, List, Optional

from shared.database.mongo import db


class EmissionsRepository:
    def __init__(self, database=db):
        self._db = database

    # ---- emission_records ------------------------------------------------
    async def find_by_id(self, record_id: str) -> Optional[Dict[str, Any]]:
        return await self._db.emission_records.find_one({"id": record_id}, {"_id": 0})

    async def list_for_facilities(self, facility_ids: List[str]) -> List[Dict[str, Any]]:
        return await self._db.emission_records.find(
            {"facility_id": {"$in": facility_ids}}, {"_id": 0}
        ).to_list(10000)

    async def list_for_org(self, org_id: str) -> List[Dict[str, Any]]:
        return await self._db.emission_records.find(
            {"organization_id": org_id}, {"_id": 0}
        ).to_list(10000)

    async def list_all(self) -> List[Dict[str, Any]]:
        return await self._db.emission_records.find({}, {"_id": 0}).to_list(10000)

    async def insert(self, record_dict: Dict[str, Any]) -> None:
        await self._db.emission_records.insert_one(record_dict)

    async def update(self, record_id: str, update: Dict[str, Any]) -> None:
        await self._db.emission_records.update_one({"id": record_id}, {"$set": update})

    async def delete(self, record_id: str) -> int:
        result = await self._db.emission_records.delete_one({"id": record_id})
        return result.deleted_count

    # ---- emission_history -------------------------------------------------
    async def history_for_record(self, record_id: str) -> List[Dict[str, Any]]:
        cursor = self._db.emission_history.find({"emission_id": record_id}, {"_id": 0}).sort("changed_at", -1)
        return await cursor.to_list(1000)

    async def insert_history(self, history_dict: Dict[str, Any]) -> None:
        await self._db.emission_history.insert_one(history_dict)


emissions_repository = EmissionsRepository()
