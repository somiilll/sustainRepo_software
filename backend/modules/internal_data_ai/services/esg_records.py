"""Authorized, deterministic ESG metric retrieval for Internal Data AI."""
import calendar
import re
from collections import defaultdict

from shared.database.mongo import db
from shared.unit_registry import convert_to_base, detect_unit_type
from modules.internal_data_ai.metric_resolver import (
    MetricResolution, configured_field_candidates, configured_semantic_field_candidates, water_primary_metric,
)
from modules.internal_data_ai.query_scope import and_filters, no_access_filter, resolve_authorized_facilities
from modules.internal_data_ai.reporting_periods import esg_period_filter, period_from_payload


_SECTIONS = {"environment", "social", "governance"}
_APPROVAL_STATES = {"pending_approval": "PENDING", "approved": "APPROVED"}


def _approval_state(record: dict) -> str:
    value = record.get("approval_status")
    if value is None or str(value).strip() == "":
        return "STATUS_UNAVAILABLE"
    return _APPROVAL_STATES.get(str(value).lower(), "FOUND")


def _period_label(period: object) -> str:
    if not isinstance(period, dict):
        return str(period or "Unavailable")
    if period.get("date"):
        return str(period["date"])
    year, month = period.get("year"), period.get("month")
    if year and month:
        if str(month).isdigit() and 1 <= int(month) <= 12:
            month = calendar.month_name[int(month)]
        return f"{month} {year}"
    if period.get("quarter") and year:
        return f"{period['quarter']} {year}"
    return str(period.get("financial_year") or period.get("calendar_year") or year or "Unavailable")


def _value_state(field_values: object) -> str:
    return "AVAILABLE" if isinstance(field_values, dict) and any(value not in (None, "", [], {}) for value in field_values.values()) else "MISSING"


def _active_record_filter() -> dict:
    """Exclude soft-deleted and superseded records unless an explicit history route is added."""
    return {
        "$and": [
            {"is_current": {"$ne": False}},
            {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]},
        ]
    }


def _metric_value(field_values: dict, candidates: list[dict]) -> dict:
    for candidate in candidates:
        key = candidate["key"]
        value = field_values.get(key)
        if value not in (None, "", [], {}):
            return {
                "field_key": key,
                "field_label": candidate["label"],
                "value": value,
                "unit": field_values.get(f"{key}_unit") or (field_values.get("unit") if key == "quantity" else None),
                "state": "AVAILABLE",
            }
    return {
        "field_key": candidates[0]["key"] if candidates else None,
        "field_label": candidates[0]["label"] if candidates else None,
        "value": None,
        "unit": None,
        "state": "MISSING",
    }


def _numeric(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _aggregate(records: list[dict], include_period: bool) -> list[dict]:
    """Aggregate only values with a stored, compatible unit through the central registry."""
    grouped = {}
    for record in records:
        metric = record.get("metric_value") or {}
        value, unit = _numeric(metric.get("value")), metric.get("unit")
        unit_type = detect_unit_type(unit) if unit else None
        if value is None or not unit_type:
            continue
        period = record.get("reporting_period") if include_period else None
        key = (period, unit_type)
        item = grouped.setdefault(key, {"period": period, "unit_type": unit_type, "value": 0.0, "records": 0, "facilities": set()})
        converted, base_unit = convert_to_base(value, unit)
        item["value"] += converted
        item["unit"] = base_unit
        item["records"] += 1
        item["facilities"].add(record.get("facility") or "Organization level")
    return [
        {
            "period": item["period"],
            "value": round(item["value"], 6),
            "unit": item["unit"],
            "records": item["records"],
            "facilities": sorted(item["facilities"]),
        }
        for item in grouped.values()
    ]


def _water_recycling_percent(records: list[dict]) -> list[dict]:
    grouped = defaultdict(lambda: {"recycle": [], "withdrawal": []})
    for record in records:
        metric = record.get("metric_value") or {}
        value, unit = _numeric(metric.get("value")), metric.get("unit")
        if value is None or detect_unit_type(unit or "") != "volume":
            continue
        base_value, base_unit = convert_to_base(value, unit)
        bucket = "recycle" if record.get("subcategory") == "Recycle" else "withdrawal"
        grouped[record.get("reporting_period")][bucket].append((base_value, base_unit))

    results = []
    for period, values in grouped.items():
        recycled = sum(value for value, _ in values["recycle"])
        withdrawn = sum(value for value, _ in values["withdrawal"])
        unit = (values["recycle"] or values["withdrawal"])[0][1] if (values["recycle"] or values["withdrawal"]) else None
        if not values["recycle"] or not values["withdrawal"]:
            state, percentage = "MISSING_VALUE", None
        elif withdrawn == 0:
            state, percentage = "ZERO_DENOMINATOR", None
        else:
            state, percentage = "FOUND", round((recycled / withdrawn) * 100, 6)
        results.append({
            "period": period,
            "recycled_value": round(recycled, 6) if values["recycle"] else None,
            "withdrawal_value": round(withdrawn, 6) if values["withdrawal"] else None,
            "unit": unit,
            "percentage": percentage,
            "state": state,
        })
    return results


async def _facility_names(org_id: str, records: list[dict]) -> dict[str, str]:
    facility_ids = [record.get("facility_id") for record in records if record.get("facility_id")]
    if not facility_ids:
        return {}
    facilities = await db.facilities.find(
        {"organization_id": org_id, "id": {"$in": facility_ids}},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(200)
    return {facility["id"]: facility["name"] for facility in facilities if facility.get("id") and facility.get("name")}


async def _field_candidates(org_id: str, kwargs: dict, subcategory: str | None = None) -> list[dict]:
    key, label = kwargs.get("metric_field_key"), kwargs.get("metric_field_label")
    if subcategory and subcategory != kwargs.get("subcategory"):
        definition = water_primary_metric(subcategory)
        return await configured_field_candidates(org_id, definition)
    if not key:
        return []
    definition = MetricResolution(
        section=kwargs.get("record_type") or "environment",
        category=kwargs.get("category") or "",
        subcategory=kwargs.get("subcategory"),
        field_key=key,
        field_label=label,
        field_aliases=tuple(kwargs.get("metric_field_aliases") or ()),
    )
    return await configured_field_candidates(org_id, definition)


def _semantic_candidates_for_subcategory(candidates_by_subcategory: dict, subcategory: str | None) -> list[dict]:
    if not subcategory:
        return []
    target = re.sub(r"[^a-z0-9]+", "", subcategory.lower())
    for candidate_subcategory, candidates in candidates_by_subcategory.items():
        if re.sub(r"[^a-z0-9]+", "", candidate_subcategory.lower()) == target:
            return candidates
    return []


async def search_records(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    section = (kwargs.get("section") or kwargs.get("record_type") or "environment").lower()
    collection_map = {"environment": "environment_records", "social": "social_records", "governance": "governance_records"}
    if section not in _SECTIONS:
        return {"section": section, "state": "NOT_FOUND", "records_found": 0, "records": []}

    resolved_facilities = await resolve_authorized_facilities(db, org_id, facility_ids, kwargs.get("facility"))
    query = and_filters(
        {"$or": [{"organization_id": org_id}, {"org_id": org_id}]},
        _active_record_filter(),
        {"facility_id": {"$in": resolved_facilities}} if resolved_facilities is not None else None,
    )
    if resolved_facilities == []:
        query = and_filters(query, no_access_filter())

    category = kwargs.get("category")
    if category:
        query = and_filters(query, {"category": {"$regex": f"^{re.escape(category)}$", "$options": "i"}})

    for field_key, expected_value in (kwargs.get("field_value_filter") or {}).items():
        if expected_value:
            query = and_filters(query, {f"field_values.{field_key}": {"$regex": re.escape(expected_value), "$options": "i"}})

    subcategory = kwargs.get("subcategory")
    derived_metric = kwargs.get("derived_metric")
    if derived_metric == "water_recycling_percentage":
        query = and_filters(query, {"subcategory": {"$in": ["Recycle", "Withdrawal"]}})
    elif subcategory:
        query = and_filters(query, {"subcategory": {"$regex": f"^{re.escape(subcategory)}$", "$options": "i"}})
    else:
        requested_metric = (kwargs.get("requested_metric") or kwargs.get("metric") or "").strip()
        if requested_metric and requested_metric.lower() not in {"water", category.lower() if category else ""}:
            query = and_filters(query, {"subcategory": {"$regex": re.escape(requested_metric), "$options": "i"}})

    period = period_from_payload(kwargs.get("period"))
    if period is not None:
        query = and_filters(query, esg_period_filter(period))

    raw_records = await db[collection_map[section]].find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    facility_names = await _facility_names(org_id, raw_records)
    regular_candidates = await _field_candidates(org_id, kwargs)
    semantic_candidates = await configured_semantic_field_candidates(
        org_id=org_id,
        section=section,
        category=category,
        subcategory=subcategory,
        terms=kwargs.get("metric_terms") or [],
    ) if not regular_candidates and category else {}
    withdrawal_candidates = await _field_candidates(org_id, kwargs, "Withdrawal") if derived_metric else []
    mapped_records = []
    for record in raw_records:
        record_subcategory = record.get("subcategory")
        candidates = withdrawal_candidates if derived_metric and record_subcategory == "Withdrawal" else regular_candidates
        if not candidates:
            candidates = _semantic_candidates_for_subcategory(semantic_candidates, record_subcategory)
        selected_value = _metric_value(record.get("field_values") or {}, candidates)
        mapped_records.append({
            "metric": record_subcategory or record.get("category"),
            "category": record.get("category"),
            "subcategory": record_subcategory,
            "facility": facility_names.get(record.get("facility_id"), "Organization level"),
            "reporting_period": _period_label(record.get("reporting_period")),
            "metric_value": selected_value,
            "value_state": selected_value["state"] if candidates else _value_state(record.get("field_values")),
            "operational_status": record.get("status") or "unavailable",
            "approval_status": record.get("approval_status"),
            "state": _approval_state(record),
        })

    approval_filter = kwargs.get("approval_status_filter")
    requested_state = _APPROVAL_STATES.get(approval_filter)
    displayed_records = [record for record in mapped_records if not requested_state or record["state"] == requested_state]
    status_counts = {
        "PENDING": sum(record["state"] == "PENDING" for record in mapped_records),
        "APPROVED": sum(record["state"] == "APPROVED" for record in mapped_records),
        "STATUS_UNAVAILABLE": sum(record["state"] == "STATUS_UNAVAILABLE" for record in mapped_records),
        "OTHER": sum(record["state"] == "FOUND" for record in mapped_records),
    }
    if not mapped_records:
        state = "NOT_FOUND"
    elif requested_state and displayed_records:
        state = requested_state
    elif status_counts["STATUS_UNAVAILABLE"] == len(mapped_records):
        state = "STATUS_UNAVAILABLE"
    else:
        state = "FOUND"

    include_period = period is None
    return {
        "section": section,
        "category": category,
        "subcategory": subcategory,
        "metric_field_label": kwargs.get("metric_field_label"),
        "source_path": " → ".join(item for item in [section.title(), category, subcategory, kwargs.get("metric_field_label")] if item),
        "period": period.label if period else "All reporting periods",
        "approval_status_filter": approval_filter,
        "derived_metric": derived_metric,
        "state": state,
        "records_found": len(mapped_records),
        "matching_status_records": len(displayed_records),
        "approval_status_summary": status_counts,
        "aggregates": _aggregate(displayed_records, include_period),
        "derived_results": _water_recycling_percent(displayed_records) if derived_metric else [],
        "records": displayed_records[:40],
    }


async def get_kpis(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    metric = kwargs.get("metric") or kwargs.get("entity_name") or ""
    section = kwargs.get("record_type") or ""
    kpi_query = {"$or": [{"organization_id": org_id}, {"organization_id": {"$exists": False}}, {"organization_id": None}]}
    if metric:
        kpi_query = and_filters(kpi_query, {"$or": [
            {"metric_name": {"$regex": metric, "$options": "i"}}, {"short_name": {"$regex": metric, "$options": "i"}},
            {"metric_code": {"$regex": metric, "$options": "i"}}, {"category_name": {"$regex": metric, "$options": "i"}},
        ]})
    if section:
        kpi_query = and_filters(kpi_query, {"section": {"$regex": section, "$options": "i"}})
    kpis = await db.esg_kpi_definitions.find(kpi_query, {"_id": 0}).to_list(20)
    return {"total_found": len(kpis), "kpis": [
        {"name": k.get("metric_name") or k.get("short_name"), "code": k.get("metric_code"), "section": k.get("section"),
         "category": k.get("category_name"), "subcategory": k.get("subcategory"), "description": k.get("description"),
         "unit": k.get("unit"), "source_type": k.get("source_type")} for k in kpis
    ]}