"""Append-only audit events for Base Year records."""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from shared.database.mongo import db


HISTORY_COLLECTION = "base_year_history_events"


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _entry_key(entry: Dict[str, Any]) -> str:
    return "|".join([
        str(entry.get("scope") or ""),
        str(entry.get("category") or ""),
        str(entry.get("subcategory") or ""),
    ])


def build_snapshot(base_year: Optional[str], emissions: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    entries = [dict(entry) for entry in (emissions or [])]
    return {
        "base_year": base_year,
        "total_emissions": round(sum(_number(entry.get("tco2e")) for entry in entries), 4),
        "entries": entries,
    }


def compare_entries(before: Optional[List[Dict[str, Any]]], after: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    before_by_key = {_entry_key(entry): entry for entry in (before or [])}
    after_by_key = {_entry_key(entry): entry for entry in (after or [])}
    changes = []

    for key in sorted(set(before_by_key) | set(after_by_key)):
        old_entry = before_by_key.get(key)
        new_entry = after_by_key.get(key)
        old_value = _number(old_entry.get("tco2e")) if old_entry else None
        new_value = _number(new_entry.get("tco2e")) if new_entry else None
        if old_entry and new_entry and old_value == new_value:
            continue
        reference = new_entry or old_entry or {}
        changes.append({
            "entry_key": key,
            "change_type": "added" if old_entry is None else "removed" if new_entry is None else "updated",
            "scope": reference.get("scope", ""),
            "category": reference.get("category", ""),
            "subcategory": reference.get("subcategory", ""),
            "old_value": old_value,
            "new_value": new_value,
        })
    return changes


def _emission_total(emission: Optional[Dict[str, Any]]) -> Optional[float]:
    if not emission:
        return None
    return _number(emission.get("total_emissions") or emission.get("co2e_emissions") or emission.get("calculated_co2e"))


def emission_reference(
    previous_emission: Optional[Dict[str, Any]],
    updated_emission: Optional[Dict[str, Any]],
    action: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    emission = updated_emission or previous_emission
    if not emission:
        return None
    return {
        "id": emission.get("id"),
        "scope": emission.get("scope"),
        "category": emission.get("category"),
        "subcategory": emission.get("scope3_activity") or emission.get("sub_category") or "",
        "reporting_period": emission.get("reporting_period"),
        "action": action,
        "old_emissions": _emission_total(previous_emission),
        "new_emissions": _emission_total(updated_emission),
    }


async def record_base_year_event(
    *,
    base_year_record: Dict[str, Any],
    event_type: str,
    before: Optional[Dict[str, Any]],
    after: Optional[Dict[str, Any]],
    actor: Dict[str, Any],
    reason: Optional[str] = None,
    entry_changes: Optional[List[Dict[str, Any]]] = None,
    source_before: Optional[Dict[str, Any]] = None,
    source_after: Optional[Dict[str, Any]] = None,
    source_action: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist one human-readable, immutable Base Year audit event."""
    event = {
        "id": str(uuid.uuid4()),
        "base_year_record_id": base_year_record.get("id"),
        "organization_id": base_year_record.get("organization_id"),
        "facility_id": base_year_record.get("facility_id"),
        "scope_group": base_year_record.get("scope_group", "scope12"),
        "version": base_year_record.get("version", 1),
        "event_type": event_type,
        "before": before,
        "after": after,
        "reason": reason,
        "entry_changes": entry_changes or [],
        "source_emission": emission_reference(source_before, source_after, source_action),
        "actor": {
            "id": actor.get("id"),
            "name": actor.get("full_name") or actor.get("name") or actor.get("email") or "Unknown",
            "email": actor.get("email"),
        },
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    await db[HISTORY_COLLECTION].insert_one(event)
    event.pop("_id", None)
    return event


async def get_base_year_events(entity_type: str, entity_id: str, scope_group: Optional[str] = None) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"facility_id": entity_id} if entity_type == "facility" else {
        "organization_id": entity_id,
        "facility_id": None,
    }
    if scope_group:
        query["scope_group"] = scope_group
    return await db[HISTORY_COLLECTION].find(query, {"_id": 0}).sort("occurred_at", -1).to_list(500)