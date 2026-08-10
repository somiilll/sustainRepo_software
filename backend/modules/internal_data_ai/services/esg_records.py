"""ESG Records & KPI service for Internal Data AI."""
from shared.database.mongo import db
from modules.internal_data_ai.query_scope import and_filters, organization_scope, resolve_authorized_facilities
from modules.internal_data_ai.reporting_periods import esg_period_filter, latest_available_period, period_from_payload


async def search_records(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    section = kwargs.get("section") or kwargs.get("record_type") or "environment"
    collection_map = {
        "environment": "environment_records",
        "social": "social_records",
        "governance": "governance_records",
    }
    coll_name = collection_map.get(section, "environment_records")
    coll = db[coll_name]

    resolved_facilities = await resolve_authorized_facilities(db, org_id, facility_ids, kwargs.get("facility"))
    query = and_filters(
        {"$or": [{"organization_id": org_id}, {"org_id": org_id}]},
        organization_scope(org_id, resolved_facilities, organization_field="org_id"),
    )

    category = kwargs.get("category")
    if category:
        query = and_filters(query, {"$or": [
            {"category": {"$regex": category, "$options": "i"}},
            {"subcategory": {"$regex": category, "$options": "i"}},
        ]})

    period = period_from_payload(kwargs.get("period"))
    if period is None:
        period = await latest_available_period(db, coll_name, query)
    if period is None:
        return {"section": section, "total_found": 0, "period": "No reporting period available", "records": []}
    query = and_filters(query, esg_period_filter(period))

    records = await coll.find(query, {"_id": 0}).sort("created_at", -1).to_list(30)

    return {
        "section": section,
        "period": period.label,
        "total_found": len(records),
        "records": [
            {
                "id": r.get("id"),
                "category": r.get("category"),
                "subcategory": r.get("subcategory"),
                "sub_subcategory": r.get("sub_subcategory"),
                "field_values": r.get("field_values"),
                "reporting_period": r.get("reporting_period"),
                "status": r.get("status"),
                "facility_id": r.get("facility_id"),
            }
            for r in records[:20]
        ],
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
