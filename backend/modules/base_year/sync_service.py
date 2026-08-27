import re
from calendar import month_name
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from shared.database.mongo import db
from shared.utils.emission_records import eligible_ghg_record_filter, normalize_reporting_period


def _base_year_range(base_year: str) -> Optional[tuple[bool, int, int]]:
    if not base_year:
        return None

    match = re.match(r"FY\s*(\d{4})-(\d{4})", base_year, re.IGNORECASE)
    if match:
        return True, int(match.group(1)), int(match.group(2))

    try:
        year = int(base_year)
        return False, year, year
    except (TypeError, ValueError):
        return None


def _parse_period(period: str) -> tuple[Optional[int], Optional[int]]:
    period = str(period or "")
    for month_number, month in enumerate(month_name):
        if month and month.lower() in period.lower():
            year_match = re.search(r"20\d{2}", period)
            if year_match:
                return month_number, int(year_match.group())

    match = re.match(r"(\d{4})-(\d{1,2})", period)
    if match:
        return int(match.group(2)), int(match.group(1))

    year_match = re.search(r"20\d{2}", period)
    return None, int(year_match.group()) if year_match else None


def _annual_period_month_range(period: str, allow_plain_year: bool = False) -> Optional[tuple[int, int]]:
    raw_period = str(period or "").strip()
    if allow_plain_year and re.fullmatch(r"\d{4}", raw_period):
        year = int(raw_period)
        return year * 12 + 1, year * 12 + 12

    canonical_period = normalize_reporting_period(raw_period)
    if not canonical_period:
        return None
    if canonical_period.startswith("CY "):
        year = int(canonical_period[3:])
        return year * 12 + 1, year * 12 + 12
    if canonical_period.startswith("FY "):
        start_year = int(canonical_period[3:7])
        return start_year * 12 + 4, (start_year + 1) * 12 + 3
    return None


def _yearly_overlap_factor(record_period: str, base_year: str) -> float:
    record_range = _annual_period_month_range(record_period)
    base_range = _annual_period_month_range(base_year, allow_plain_year=True)
    if not record_range or not base_range:
        return 0.0

    overlap_start = max(record_range[0], base_range[0])
    overlap_end = min(record_range[1], base_range[1])
    return max(0, overlap_end - overlap_start + 1) / 12


def _is_record_in_base_year(record: Dict[str, Any], base_year: str) -> bool:
    base_range = _base_year_range(base_year)
    if not base_range:
        return False

    is_financial_year, start_year, end_year = base_range
    month, year = _parse_period(record.get("reporting_period", ""))
    frequency = str(record.get("frequency_type") or record.get("frequency") or "monthly").lower()

    if not year:
        return False
    if frequency == "yearly":
        return _yearly_overlap_factor(record.get("reporting_period", ""), base_year) > 0
    if not month:
        return False
    if is_financial_year:
        return (month >= 4 and year == start_year) or (month <= 3 and year == end_year)
    return year == start_year


async def sync_base_year_emissions_for_entity(
    entity_type: str,
    entity_id: str,
    scope_group: str,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    query: Dict[str, Any] = {"scope_group": scope_group}
    if entity_type == "facility":
        query["facility_id"] = entity_id
    else:
        query["organization_id"] = entity_id
        query["facility_id"] = None

    base_year_record = await db.base_year_emissions.find_one(query, {"_id": 0})
    if not base_year_record:
        return {"message": "No base year record found for this entity", "synced": False}

    base_year = base_year_record.get("base_year", "")
    if not _base_year_range(base_year):
        return {"message": "Invalid base year format", "synced": False}
    if entity_type == "facility":
        emissions_query: Dict[str, Any] = {"facility_id": entity_id}
    else:
        facilities = await db.facilities.find(
            {"organization_id": entity_id, "is_active": True},
            {"_id": 0, "id": 1},
        ).to_list(1000)
        emissions_query = {"facility_id": {"$in": [facility["id"] for facility in facilities]}}

    if scope_group == "scope12":
        emissions_query["$or"] = [
            {"scope": {"$in": ["scope1", "scope2"]}},
            {"scope": "biogenic", "biogenic_scope_selection": {"$in": [None, "scope1"]}},
        ]
    else:
        emissions_query["$or"] = [
            {"scope": "scope3"},
            {"scope": "biogenic", "biogenic_scope_selection": "scope3"},
        ]

    emissions_query.update(eligible_ghg_record_filter())
    emissions = await db.emission_records.find(
        emissions_query,
        {
            "_id": 0,
            "scope": 1,
            "category": 1,
            "sub_category": 1,
            "reporting_period": 1,
            "co2e_emissions": 1,
            "calculated_co2e": 1,
            "total_emissions": 1,
            "frequency": 1,
            "frequency_type": 1,
        },
    ).to_list(10000)

    grouped: Dict[tuple[str, str, str], list[Dict[str, Any]]] = {}
    for emission in emissions:
        key = (emission.get("scope", ""), emission.get("category", ""), emission.get("sub_category", ""))
        grouped.setdefault(key, []).append(emission)

    new_emissions_data = []
    for key, records in grouped.items():
        total_tco2e = 0.0
        for record in records:
            month, year = _parse_period(record.get("reporting_period", ""))
            if not year:
                continue

            frequency = str(record.get("frequency_type") or record.get("frequency") or "monthly").lower()
            tco2e = record.get("total_emissions") or record.get("co2e_emissions") or record.get("calculated_co2e") or 0
            try:
                tco2e = float(tco2e)
            except (TypeError, ValueError):
                continue

            if frequency == "yearly":
                total_tco2e += tco2e * _yearly_overlap_factor(record.get("reporting_period", ""), base_year)
            elif _is_record_in_base_year(record, base_year):
                total_tco2e += tco2e

        if total_tco2e > 0:
            new_emissions_data.append({
                "scope": key[0],
                "category": key[1],
                "subcategory": key[2],
                "tco2e": round(total_tco2e, 4),
            })

    existing_emissions = base_year_record.get("emissions_data", [])
    manual_entries = [entry for entry in existing_emissions if entry.get("isManuallyAdded")]
    synced_keys = {(entry["scope"], entry["category"], entry.get("subcategory", "")) for entry in new_emissions_data}
    for manual_entry in manual_entries:
        key = (manual_entry["scope"], manual_entry["category"], manual_entry.get("subcategory", ""))
        if key not in synced_keys:
            new_emissions_data.append(manual_entry)

    current_version = base_year_record.get("version", 1)
    version_history = base_year_record.get("version_history", [])
    version_history.append({
        "version": current_version,
        "emissions_data": existing_emissions,
        "updated_at": base_year_record.get("updated_at"),
        "updated_by": base_year_record.get("updated_by"),
        "change_type": "auto_sync",
    })

    now = datetime.now(timezone.utc).isoformat()
    await db.base_year_emissions.update_one(
        {"id": base_year_record["id"]},
        {"$set": {
            "emissions_data": new_emissions_data,
            "version": current_version + 1,
            "version_history": version_history,
            "updated_at": now,
            "updated_by": current_user.get("email"),
            "last_synced_at": now,
        }},
    )

    return {
        "message": "Base year emissions synced successfully",
        "synced": True,
        "new_version": current_version + 1,
        "entries_count": len(new_emissions_data),
    }


async def sync_deleted_emission_base_years(
    emission: Dict[str, Any],
    current_user: Dict[str, Any],
) -> list[Dict[str, Any]]:
    return await sync_changed_emission_base_years(emission, None, current_user)


def _scope_group_for_emission(emission: Dict[str, Any]) -> str:
    scope = str(emission.get("scope") or "").lower()
    return "scope12" if scope in {"scope1", "scope2"} or (
        scope == "biogenic" and emission.get("biogenic_scope_selection") != "scope3"
    ) else "scope3"


async def sync_changed_emission_base_years(
    previous_emission: Optional[Dict[str, Any]],
    updated_emission: Optional[Dict[str, Any]],
    current_user: Dict[str, Any],
) -> list[Dict[str, Any]]:
    candidates: Dict[tuple[str, str, str], list[Dict[str, Any]]] = {}
    for emission in (previous_emission, updated_emission):
        if not emission:
            continue
        scope_group = _scope_group_for_emission(emission)
        entity_pairs = [("facility", emission.get("facility_id"))]
        if emission.get("organization_id"):
            entity_pairs.append(("organization", emission["organization_id"]))
        for entity_type, entity_id in entity_pairs:
            if entity_id:
                candidates.setdefault((entity_type, entity_id, scope_group), []).append(emission)

    results = []
    for (entity_type, entity_id, scope_group), emissions in candidates.items():
        base_year_query: Dict[str, Any] = {"scope_group": scope_group}
        if entity_type == "facility":
            base_year_query["facility_id"] = entity_id
        else:
            base_year_query.update({"organization_id": entity_id, "facility_id": None})
        base_year_record = await db.base_year_emissions.find_one(base_year_query, {"_id": 0, "base_year": 1})
        if base_year_record and any(
            _is_record_in_base_year(emission, base_year_record.get("base_year", ""))
            for emission in emissions
        ):
            results.append(await sync_base_year_emissions_for_entity(entity_type, entity_id, scope_group, current_user))

    return results