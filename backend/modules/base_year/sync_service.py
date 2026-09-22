import re
from calendar import month_name
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from shared.database.mongo import db
from shared.utils.emission_records import eligible_ghg_record_filter, normalize_reporting_period
from .history_service import build_snapshot, compare_entries, record_base_year_event


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


def _is_sink_entry(entry: Dict[str, Any]) -> bool:
    return bool(entry.get("isSink")) or str(entry.get("scope") or "").strip().lower() == "sinks"


def _preserved_sink_entries(base_year_record: Dict[str, Any], existing_emissions: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    """Keep the Base Year sink snapshot; sink records are not GHG log records."""
    current_sinks = [entry for entry in existing_emissions if _is_sink_entry(entry)]
    if current_sinks:
        return current_sinks

    # Recover sinks lost by the historic auto-sync behaviour from the most recent snapshot.
    for version in reversed(base_year_record.get("version_history") or []):
        snapshot_entries = version.get("emissions_data") or version.get("previous_emissions_data") or []
        historical_sinks = [entry for entry in snapshot_entries if _is_sink_entry(entry)]
        if historical_sinks:
            return historical_sinks
    return []


def _sink_entries_for_base_year(sinks: list[Dict[str, Any]], base_year: str) -> list[Dict[str, Any]]:
    grouped: Dict[tuple[str, str], float] = {}
    for sink in sinks:
        if not _is_record_in_base_year(sink, base_year):
            continue
        try:
            reduction = float(sink.get("total_emissions_reduced") or 0)
        except (TypeError, ValueError):
            continue
        if str(sink.get("frequency_type") or "monthly").lower() == "yearly":
            reduction *= _yearly_overlap_factor(sink.get("reporting_period", ""), base_year)
        key = (sink.get("description") or sink.get("sink_type") or "Carbon Sink", sink.get("description") or "")
        grouped[key] = grouped.get(key, 0) + reduction

    return [
        {
            "scope": "Sinks",
            "category": category,
            "subcategory": description,
            "tco2e": round(-abs(total), 4),
            "isSink": True,
        }
        for (category, description), total in grouped.items()
    ]


async def sync_base_year_sinks_for_entity(
    entity_type: str,
    entity_id: str,
    current_user: Dict[str, Any],
    source_before: Optional[Dict[str, Any]] = None,
    source_after: Optional[Dict[str, Any]] = None,
    source_action: Optional[str] = None,
) -> Dict[str, Any]:
    query: Dict[str, Any] = {"scope_group": "scope12"}
    if entity_type == "facility":
        query["facility_id"] = entity_id
    else:
        query.update({"organization_id": entity_id, "facility_id": None})
    base_year_record = await db.base_year_emissions.find_one(query, {"_id": 0})
    if not base_year_record or not _base_year_range(base_year_record.get("base_year", "")):
        return {"message": "No valid Scope 1 & 2 base year found", "synced": False}

    sink_query = {"facility_id": entity_id} if entity_type == "facility" else {"organization_id": entity_id}
    sinks = await db.sinks.find(sink_query, {"_id": 0}).to_list(10000)
    existing_emissions = base_year_record.get("emissions_data", [])
    new_sink_entries = _sink_entries_for_base_year(sinks, base_year_record["base_year"])
    new_emissions_data = [entry for entry in existing_emissions if not _is_sink_entry(entry)] + new_sink_entries
    entry_changes = compare_entries(existing_emissions, new_emissions_data)
    if not entry_changes:
        return {"message": "Base year sinks already match source data", "synced": False}

    current_version = base_year_record.get("version", 1)
    version_history = base_year_record.get("version_history", [])
    version_history.append({
        "version": current_version,
        "emissions_data": existing_emissions,
        "updated_at": base_year_record.get("updated_at"),
        "updated_by": base_year_record.get("updated_by"),
        "change_type": "sink_sync",
    })
    now = datetime.now(timezone.utc).isoformat()
    await db.base_year_emissions.update_one(
        {"id": base_year_record["id"]},
        {"$set": {
            "emissions_data": new_emissions_data,
            "version": current_version + 1,
            "version_history": version_history,
            "updated_at": now,
            "updated_by": current_user.get("id"),
            "updated_by_email": current_user.get("email"),
            "updated_by_name": current_user.get("full_name") or current_user.get("name"),
            "last_synced_at": now,
        }},
    )
    updated_record = {**base_year_record, "version": current_version + 1, "emissions_data": new_emissions_data}
    await record_base_year_event(
        base_year_record=updated_record,
        event_type="sinks_recalculated",
        before=build_snapshot(base_year_record.get("base_year"), existing_emissions),
        after=build_snapshot(base_year_record.get("base_year"), new_emissions_data),
        actor=current_user,
        reason="Recalculated automatically after a linked Sinks entry changed.",
        entry_changes=entry_changes,
        source_before=source_before,
        source_after=source_after,
        source_action=source_action,
        source_type="sink",
    )
    return {"message": "Base year sinks synced successfully", "synced": True, "new_version": current_version + 1}


async def sync_changed_sink_base_years(
    previous_sink: Optional[Dict[str, Any]],
    updated_sink: Optional[Dict[str, Any]],
    current_user: Dict[str, Any],
) -> list[Dict[str, Any]]:
    candidates: set[tuple[str, str]] = set()
    for sink in (previous_sink, updated_sink):
        if not sink:
            continue
        if sink.get("facility_id"):
            candidates.add(("facility", sink["facility_id"]))
        if sink.get("organization_id"):
            candidates.add(("organization", sink["organization_id"]))

    results = []
    for entity_type, entity_id in candidates:
        query: Dict[str, Any] = {"scope_group": "scope12"}
        if entity_type == "facility":
            query["facility_id"] = entity_id
        else:
            query.update({"organization_id": entity_id, "facility_id": None})
        base_year_record = await db.base_year_emissions.find_one(query, {"_id": 0, "base_year": 1})
        if base_year_record and any(
            _is_record_in_base_year(sink, base_year_record.get("base_year", ""))
            for sink in (previous_sink, updated_sink) if sink
        ):
            action = "added" if previous_sink is None else "removed" if updated_sink is None else "updated"
            results.append(await sync_base_year_sinks_for_entity(
                entity_type,
                entity_id,
                current_user,
                source_before=previous_sink,
                source_after=updated_sink,
                source_action=action,
            ))
    return results


async def sync_base_year_emissions_for_entity(
    entity_type: str,
    entity_id: str,
    scope_group: str,
    current_user: Dict[str, Any],
    source_before: Optional[Dict[str, Any]] = None,
    source_after: Optional[Dict[str, Any]] = None,
    source_action: Optional[str] = None,
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
    manual_entries = [entry for entry in existing_emissions if entry.get("isManuallyAdded") and not _is_sink_entry(entry)]
    sink_entries = _preserved_sink_entries(base_year_record, existing_emissions)
    preserved_entries = [*manual_entries, *sink_entries]
    synced_keys = {(entry["scope"], entry["category"], entry.get("subcategory", "")) for entry in new_emissions_data}
    for preserved_entry in preserved_entries:
        key = (preserved_entry["scope"], preserved_entry["category"], preserved_entry.get("subcategory", ""))
        if key not in synced_keys:
            new_emissions_data.append(preserved_entry)

    entry_changes = compare_entries(existing_emissions, new_emissions_data)
    if not entry_changes:
        return {"message": "Base year emissions already match source data", "synced": False}

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

    updated_record = {**base_year_record, "version": current_version + 1, "emissions_data": new_emissions_data}
    await record_base_year_event(
        base_year_record=updated_record,
        event_type="recalculated",
        before=build_snapshot(base_year_record.get("base_year"), existing_emissions),
        after=build_snapshot(base_year_record.get("base_year"), new_emissions_data),
        actor=current_user,
        reason="Recalculated automatically after a linked GHG entry changed.",
        entry_changes=entry_changes,
        source_before=source_before,
        source_after=source_after,
        source_action=source_action,
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
            source_action = "added" if previous_emission is None else "removed" if updated_emission is None else "updated"
            results.append(await sync_base_year_emissions_for_entity(
                entity_type,
                entity_id,
                scope_group,
                current_user,
                source_before=previous_emission,
                source_after=updated_emission,
                source_action=source_action,
            ))

    return results