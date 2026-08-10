"""Emissions service for Internal Data AI."""
from shared.database.mongo import db
from modules.internal_data_ai.query_scope import and_filters, extract_consumption, normalize_scope, organization_scope, resolve_authorized_facilities
from modules.internal_data_ai.reporting_periods import emission_period_filter, latest_available_period, period_from_payload


async def search_records(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    resolved_facilities = await resolve_authorized_facilities(db, org_id, facility_ids, kwargs.get("facility"))
    query = organization_scope(org_id, resolved_facilities)

    scope = kwargs.get("scope")
    if scope:
        scope_num = normalize_scope(scope)
        query = and_filters(query, {"scope": {"$regex": f"^{scope_num}$", "$options": "i"}})

    category = kwargs.get("category")
    if category:
        query = and_filters(query, {"$or": [
            {"category": {"$regex": category, "$options": "i"}},
            {"sub_category": {"$regex": category, "$options": "i"}},
        ]})

    fuel_type = kwargs.get("fuel_type")
    if fuel_type:
        query = and_filters(query, {"fuel_type": {"$regex": fuel_type, "$options": "i"}})

    period = period_from_payload(kwargs.get("period"))
    if period is None:
        period = await latest_available_period(db, "emission_records", query)
    if period is None:
        return {"total_found": 0, "showing": 0, "period": "No reporting period available", "records": []}
    query = and_filters(query, emission_period_filter(period))

    records = await db.emission_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)

    # Also get facility names for context
    fac_ids = list(set(r.get("facility_id") for r in records if r.get("facility_id")))
    fac_map = {}
    if fac_ids:
        facs = await db.facilities.find({"organization_id": org_id, "id": {"$in": fac_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        fac_map = {f["id"]: f["name"] for f in facs}

    summary = []
    for r in records[:20]:
        qty_value, qty_unit = extract_consumption(r)
        summary.append({
            "id": r.get("id"),
            "facility": fac_map.get(r.get("facility_id"), r.get("facility_id")),
            "scope": r.get("scope"),
            "category": r.get("category"),
            "sub_category": r.get("sub_category"),
            "fuel_type": r.get("fuel_type"),
            "quantity": qty_value,
            "unit": qty_unit,
            "total_emissions": r.get("total_emissions"),
            "co2e_emissions": r.get("co2e_emissions"),
            "formula_id": r.get("formula_id"),
            "emission_factor": r.get("emission_factor"),
            "emission_factor_unit": r.get("emission_factor_unit"),
            "status": r.get("status"),
            "reporting_period": r.get("reporting_period"),
        })

    return {
        "total_found": len(records),
        "showing": len(summary),
        "period": period.label,
        "records": summary,
    }
