"""Emissions service for Internal Data AI."""
from shared.database.mongo import db
from modules.internal_data_ai.data_normalization import resolve_emission_unit, resolve_record_quantity
from modules.internal_data_ai.query_scope import and_filters, normalize_scope, organization_scope, resolve_authorized_facilities, scope_filter
from modules.internal_data_ai.reporting_periods import annual_record_allocation, emission_period_filter, latest_available_period, period_from_payload


async def search_records(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    resolved_facilities = await resolve_authorized_facilities(db, org_id, facility_ids, kwargs.get("facility"))
    query = organization_scope(org_id, resolved_facilities)

    scope = kwargs.get("scope")
    if scope:
        query = and_filters(query, scope_filter(scope))

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

    raw_records = await db.emission_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(50)
    records = [record for record in raw_records if annual_record_allocation(record.get("reporting_period"), period) > 0]

    # Also get facility names for context
    fac_ids = list(set(r.get("facility_id") for r in records if r.get("facility_id")))
    fac_map = {}
    if fac_ids:
        facs = await db.facilities.find({"organization_id": org_id, "id": {"$in": fac_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
        fac_map = {f["id"]: f["name"] for f in facs}

    summary = []
    totals_by_unit = {}
    total_emissions = 0.0
    emission_record_count = 0
    emissions_by_facility = {}
    consumption_by_facility = {}
    allocation_notes = []
    for r in records[:20]:
        quantity_evidence = resolve_record_quantity(r)
        qty_value, qty_unit = quantity_evidence["value"], quantity_evidence["unit"]
        allocation_factor = annual_record_allocation(r.get("reporting_period"), period)
        allocated_quantity = round(qty_value * allocation_factor, 6) if isinstance(qty_value, (int, float)) else qty_value
        raw_emissions = r.get("co2e_emissions") if r.get("co2e_emissions") is not None else r.get("total_emissions")
        allocated_emissions = round(float(raw_emissions) * allocation_factor, 6) if isinstance(raw_emissions, (int, float)) else None
        if isinstance(allocated_quantity, (int, float)) and qty_unit:
            totals_by_unit[qty_unit] = totals_by_unit.get(qty_unit, 0) + allocated_quantity
            facility_id = r.get("facility_id")
            facility_name = fac_map.get(facility_id, facility_id)
            item = consumption_by_facility.setdefault((facility_name, qty_unit), {"quantity": 0.0, "records": 0})
            item["quantity"] += allocated_quantity
            item["records"] += 1
        if allocated_emissions is not None:
            total_emissions += allocated_emissions
            emission_record_count += 1
            facility_id = r.get("facility_id")
            facility_name = fac_map.get(facility_id, facility_id)
            item = emissions_by_facility.setdefault(facility_name, {"emissions": 0.0, "records": 0})
            item["emissions"] += allocated_emissions
            item["records"] += 1
        if allocation_factor < 1:
            allocation_notes.append(
                f"{r.get('reporting_period')} value allocated at {allocation_factor:g} of its stored amount for {period.label}."
            )
        summary.append({
            "id": r.get("id"),
            "facility": fac_map.get(r.get("facility_id"), r.get("facility_id")),
            "scope": r.get("scope"),
            "category": r.get("category"),
            "sub_category": r.get("sub_category"),
            "fuel_type": r.get("fuel_type"),
            "quantity": allocated_quantity,
            "unit": qty_unit,
            "quantity_source": quantity_evidence["source"],
            "calculation_inputs": {
                key: value for key, value in (r.get("dynamic_field_values") or {}).items()
                if key != "qty" and isinstance(value, dict)
            },
            "stored_quantity": qty_value,
            "allocation_factor": allocation_factor,
            "emissions_value": allocated_emissions,
            "emissions_unit": resolve_emission_unit(r)["unit"] if allocated_emissions is not None else None,
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
        "consumption_totals": [
            {"quantity": round(quantity, 6), "unit": unit, "records": len(records)}
            for unit, quantity in totals_by_unit.items()
        ],
        "emissions_totals": [{"value": round(total_emissions, 6), "unit": "tCO2e", "records": emission_record_count}] if emission_record_count else [],
        "facility_emissions": [
            {"facility": facility, "value": round(data["emissions"], 6), "unit": "tCO2e", "records": data["records"]}
            for facility, data in emissions_by_facility.items()
        ],
        "facility_consumption": [
            {"facility": facility, "quantity": round(data["quantity"], 6), "unit": unit, "records": data["records"]}
            for (facility, unit), data in consumption_by_facility.items()
        ],
        "allocation_notes": allocation_notes,
    }
