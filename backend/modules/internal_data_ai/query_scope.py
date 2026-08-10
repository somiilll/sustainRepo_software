"""Server-owned MongoDB scope helpers for Internal Data AI retrieval."""
import re
from typing import Any, Dict, Iterable, Optional


def no_access_filter(identifier_field: str = "id") -> Dict[str, Any]:
    return {identifier_field: {"$in": []}}


def and_filters(*filters: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    active = [item for item in filters if item]
    if not active:
        return {}
    if len(active) == 1:
        return active[0]
    return {"$and": active}


def organization_scope(
    organization_id: str,
    facility_ids: Optional[Iterable[str]] = None,
    *,
    organization_field: str = "organization_id",
    facility_field: str = "facility_id",
) -> Dict[str, Any]:
    """Build a mandatory organization predicate plus an optional facility predicate.

    ``None`` means the authenticated user has organization-wide access. An empty
    iterable is deliberately fail-closed and returns no records.
    """
    if not organization_id:
        return no_access_filter()
    scope: Dict[str, Any] = {organization_field: organization_id}
    if facility_ids is not None:
        scope[facility_field] = {"$in": list(facility_ids)}
    return scope


async def resolve_authorized_facilities(db, organization_id: str, facility_ids: Optional[list], facility_name: Optional[str]) -> Optional[list]:
    """Resolve a facility name to authorized IDs; names are never final filters."""
    if not facility_name:
        return facility_ids
    facilities = await db.facilities.find(
        {"organization_id": organization_id, "name": {"$regex": facility_name, "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(50)
    resolved = [facility["id"] for facility in facilities if facility.get("id")]
    if facility_ids is not None:
        allowed = set(facility_ids)
        resolved = [facility_id for facility_id in resolved if facility_id in allowed]
    return resolved


async def scoped_record_ids(
    db,
    collection_name: str,
    organization_id: str,
    facility_ids: Optional[list] = None,
    *,
    organization_field: str = "organization_id",
    record_id_field: str = "id",
) -> list:
    scope = organization_scope(organization_id, facility_ids, organization_field=organization_field)
    records = await db[collection_name].find(scope, {"_id": 0, record_id_field: 1}).to_list(1000)
    return [record[record_id_field] for record in records if record.get(record_id_field)]


def normalize_scope(scope: Any) -> str:
    """Normalize user/LLM scope text to the stored canonical scope value."""
    value = str(scope or "").strip().lower()
    numeric = re.search(r"\b([1-3])\b", value)
    if numeric:
        return numeric.group(1)
    return re.sub(r"^scope\s*", "", value).strip()


def extract_consumption(record: dict) -> tuple:
    """Extract (quantity, unit) from ``dynamic_field_values.qty``.

    Returns ``(None, None)`` when the data is absent or malformed.
    Numeric strings are coerced to their numeric equivalent.
    """
    dfv = record.get("dynamic_field_values") or {}
    qty_data = dfv.get("qty") or {}
    value = qty_data.get("value")
    unit = qty_data.get("unit")
    if isinstance(value, str):
        try:
            value = float(value)
            if value == int(value):
                value = int(value)
        except (ValueError, TypeError):
            value = None
    return value, unit