"""Persist the canonical GHG-derived Energy view as locked ESG Energy records."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from .ghg_integration import get_ghg_integration_service


DERIVED_SOURCE_TYPE = "ghg_derived"
DERIVED_SOURCE_MODULE = "ghg"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _manual_energy_fields(imported: Dict[str, Any]) -> Dict[str, Any]:
    """Use the same `quantity`/`quantity_unit` contract as manual Energy entry."""
    source_fields = imported.get("field_values") or {}
    quantity = source_fields.get("total_energy")
    unit = source_fields.get("energy_unit")
    fields = {
        "quantity": quantity,
        "quantity_unit": unit,
        "source_records_count": source_fields.get("source_records_count", 0),
        "source_record_ids": source_fields.get("source_record_ids", []),
    }
    subcategory = imported.get("subcategory")
    renewable_type = imported.get("sub_subcategory")
    if subcategory == "Electricity Within Organization":
        fields["renewable_electricity" if renewable_type == "Renewable" else "grid_electricity"] = quantity
    elif subcategory == "Heating Within Organization":
        fields["non_renewable_heating"] = quantity
    return {key: value for key, value in fields.items() if value is not None}


class GHGEnergySyncService:
    """Idempotently upsert GHG-derived Energy records and remove stale derived rows."""

    def __init__(self, db):
        self.db = db

    async def sync_organization(self, org_id: str) -> Dict[str, int]:
        integration = get_ghg_integration_service(self.db)
        imported_records = await integration.get_energy_from_ghg(org_id=org_id)
        now = _now()
        desired_ids = {record["id"] for record in imported_records}
        existing_records = await self.db.environment_records.find(
            {"org_id": org_id, "source_type": DERIVED_SOURCE_TYPE}, {"_id": 0}
        ).to_list(10000)
        existing_by_id = {record["id"]: record for record in existing_records}
        created = updated = deleted = 0

        for imported in imported_records:
            record_id = imported["id"]
            source_ids = (imported.get("field_values") or {}).get("source_record_ids", [])
            persisted = {
                "id": record_id,
                "org_id": org_id,
                "facility_id": imported.get("facility_id"),
                "record_level": imported.get("record_level", "facility"),
                "section": "environment",
                "category": "Energy",
                "subcategory": imported.get("subcategory"),
                "sub_subcategory": imported.get("sub_subcategory"),
                "reporting_period": imported.get("reporting_period") or {},
                "field_values": _manual_energy_fields(imported),
                "source_type": DERIVED_SOURCE_TYPE,
                "source_module": DERIVED_SOURCE_MODULE,
                "is_locked": True,
                "source_of_information": "GHG Module",
                "notes": imported.get("notes"),
                "status": "completed",
                "approval_status": "not_required",
                "is_current": True,
                "provenance": {
                    "source_module": DERIVED_SOURCE_MODULE,
                    "source_record_ids": source_ids,
                    "sync_key": record_id,
                    "sync_strategy": imported.get("import_strategy"),
                    "synced_at": now,
                },
                "updated_at": now,
            }
            existing = existing_by_id.get(record_id)
            if not existing:
                persisted.update({"version": 1, "created_at": now, "created_by": None, "updated_by": None})
                await self.db.environment_records.insert_one(persisted)
                await self._write_history("created", persisted, now)
                created += 1
                continue

            changed = any(existing.get(key) != persisted.get(key) for key in (
                "subcategory", "sub_subcategory", "reporting_period", "field_values", "notes", "provenance"
            ))
            if changed:
                persisted["version"] = int(existing.get("version") or 1) + 1
                await self.db.environment_records.update_one({"id": record_id}, {"$set": persisted})
                await self._write_history("updated", persisted, now, previous=existing)
                updated += 1

        for existing in existing_records:
            if existing["id"] not in desired_ids:
                await self._write_history("deleted", existing, now)
                await self.db.environment_records.delete_one({"id": existing["id"]})
                deleted += 1

        return {"created": created, "updated": updated, "deleted": deleted, "total": len(imported_records)}

    async def _write_history(self, action: str, record: Dict[str, Any], now: str, previous: Dict[str, Any] | None = None) -> None:
        await self.db.ghg_energy_sync_history.insert_one({
            "id": str(uuid.uuid4()),
            "action": action,
            "energy_record_id": record["id"],
            "org_id": record.get("org_id"),
            "source_record_ids": (record.get("provenance") or {}).get("source_record_ids", []),
            "previous": previous,
            "snapshot": record,
            "created_at": now,
        })


def get_ghg_energy_sync_service(db) -> GHGEnergySyncService:
    return GHGEnergySyncService(db)