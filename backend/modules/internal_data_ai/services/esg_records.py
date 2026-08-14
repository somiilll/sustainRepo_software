"""Authorized ESG record retrieval for Internal Data AI."""
import calendar
import re

from shared.database.mongo import db
from modules.internal_data_ai.query_scope import and_filters, no_access_filter, resolve_authorized_facilities
from modules.internal_data_ai.reporting_periods import esg_period_filter, period_from_payload


_SECTIONS = {"environment", "social", "governance"}
_APPROVAL_STATES = {
    "pending_approval": "PENDING",
    "approved": "APPROVED",
}


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


async def _facility_names(org_id: str, records: list[dict]) -> dict[str, str]:
    facility_ids = [record.get("facility_id") for record in records if record.get("facility_id")]
    if not facility_ids:
        return {}
    facilities = await db.facilities.find(
        {"organization_id": org_id, "id": {"$in": facility_ids}},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(200)
    return {facility["id"]: facility["name"] for facility in facilities if facility.get("id") and facility.get("name")}


async def search_records(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    section = (kwargs.get("section") or kwargs.get("record_type") or "environment").lower()
    collection_map = {
        "environment": "environment_records",
        "social": "social_records",
        "governance": "governance_records",
    }
    if section not in _SECTIONS:
        return {"section": section, "state": "NOT_FOUND", "records_found": 0, "records": []}
    coll_name = collection_map[section]
    coll = db[coll_name]

    resolved_facilities = await resolve_authorized_facilities(db, org_id, facility_ids, kwargs.get("facility"))
    query = and_filters(
        {"$or": [{"organization_id": org_id}, {"org_id": org_id}]},
        {"facility_id": {"$in": resolved_facilities}} if resolved_facilities is not None else None,
    )
    if resolved_facilities == []:
        query = and_filters(query, no_access_filter())

    category = kwargs.get("category")
    if category:
        query = and_filters(query, {"category": {"$regex": f"^{re.escape(category)}$", "$options": "i"}})

    requested_metric = (kwargs.get("requested_metric") or kwargs.get("metric") or "").strip()
    if requested_metric and requested_metric.lower() not in {"water", category.lower() if category else ""}:
        query = and_filters(query, {"subcategory": {"$regex": re.escape(requested_metric), "$options": "i"}})

    period = period_from_payload(kwargs.get("period"))
    if period is not None:
        query = and_filters(query, esg_period_filter(period))

    records = await coll.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    facility_names = await _facility_names(org_id, records)
    approval_filter = kwargs.get("approval_status_filter")
    mapped_records = [
        {
            "metric": record.get("subcategory") or record.get("category"),
            "category": record.get("category"),
            "facility": facility_names.get(record.get("facility_id"), "Organization level"),
            "reporting_period": _period_label(record.get("reporting_period")),
            "field_values": record.get("field_values") or {},
            "value_state": _value_state(record.get("field_values")),
            "operational_status": record.get("status") or "unavailable",
            "approval_status": record.get("approval_status"),
            "state": _approval_state(record),
        }
        for record in records
    ]
    status_counts = {
        "PENDING": sum(record["state"] == "PENDING" for record in mapped_records),
        "APPROVED": sum(record["state"] == "APPROVED" for record in mapped_records),
        "STATUS_UNAVAILABLE": sum(record["state"] == "STATUS_UNAVAILABLE" for record in mapped_records),
        "OTHER": sum(record["state"] == "FOUND" for record in mapped_records),
    }
    requested_state = _APPROVAL_STATES.get(approval_filter)
    displayed_records = [record for record in mapped_records if not requested_state or record["state"] == requested_state]
    if not mapped_records:
        state = "NOT_FOUND"
    elif requested_state and displayed_records:
        state = requested_state
    elif status_counts["STATUS_UNAVAILABLE"] == len(mapped_records):
        state = "STATUS_UNAVAILABLE"
    else:
        state = "FOUND"

    return {
        "section": section,
        "category": category,
        "requested_metric": requested_metric or None,
        "period": period.label if period else "All reporting periods",
        "approval_status_filter": approval_filter,
        "state": state,
        "records_found": len(mapped_records),
        "matching_status_records": len(displayed_records),
        "approval_status_summary": status_counts,
        "records": displayed_records[:20],
    }


async def get_kpis(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    metric = kwargs.get("metric") or kwargs.get("entity_name") or ""
    section = kwargs.get("record_type") or ""

    kpi_query = {"$or": [{"organization_id": org_id}, {"organization_id": {"$exists": False}}, {"organization_id": None}]}
    if metric:
        kpi_query = and_filters(kpi_query, {"$or": [
            {"metric_name": {"$regex": metric, "$options": "i"}},
            {"short_name": {"$regex": metric, "$options": "i"}},
            {"metric_code": {"$regex": metric, "$options": "i"}},
            {"category_name": {"$regex": metric, "$options": "i"}},
        ]})
    if section:
        kpi_query = and_filters(kpi_query, {"section": {"$regex": section, "$options": "i"}})

    kpis = await db.esg_kpi_definitions.find(kpi_query, {"_id": 0}).to_list(20)

    return {
        "total_found": len(kpis),
        "kpis": [
            {
                "name": k.get("metric_name") or k.get("short_name"),
                "code": k.get("metric_code"),
                "section": k.get("section"),
                "category": k.get("category_name"),
                "subcategory": k.get("subcategory"),
                "description": k.get("description"),
                "unit": k.get("unit"),
                "source_type": k.get("source_type"),
            }
            for k in kpis
        ],
    }
