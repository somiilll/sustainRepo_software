"""Emissions service for Internal Data AI."""
import re
from shared.database.mongo import db
from modules.internal_data_ai.data_normalization import resolve_emission_unit, resolve_record_quantity
from modules.internal_data_ai.query_scope import and_filters, normalize_scope, organization_scope, resolve_authorized_facilities, scope_filter
from modules.internal_data_ai.reporting_periods import annual_record_allocation, emission_period_filter, latest_available_period, period_from_payload


def _density_kg_per_litre(value, unit):
    if not isinstance(value, (int, float)):
        return None
    normalized = str(unit or "kg/L").lower().replace(" ", "")
    if normalized in {"kg/l", "kg/litre", "kg/liter"}:
        return float(value)
    if normalized in {"kg/m3", "kg/m³"}:
        return float(value) / 1000 if float(value) >= 100 else None
    return None


def _ncv_tj_per_kg(value, unit, density_kg_litre=None):
    if not isinstance(value, (int, float)):
        return None
    normalized = str(unit or "").lower().replace(" ", "")
    factors = {"tj/kg": 1, "gj/kg": 1e-3, "mj/kg": 1e-6, "kj/kg": 1e-9}
    if normalized in factors:
        return float(value) * factors[normalized]
    if normalized in {"mj/l", "mj/litre", "mj/liter"} and density_kg_litre:
        return float(value) * 1e-6 / density_kg_litre
    return None


def _quantity_to_kg(quantity, unit, density_kg_litre=None):
    if not isinstance(quantity, (int, float)):
        return None
    normalized = str(unit or "").lower().replace(" ", "")
    if normalized in {"kg", "kilogram", "kilograms"}:
        return float(quantity)
    if normalized in {"t", "tonne", "tonnes", "metricton"}:
        return float(quantity) * 1000
    if normalized in {"g", "gram", "grams"}:
        return float(quantity) / 1000
    if normalized in {"l", "litre", "liter", "litres", "liters"} and density_kg_litre:
        return float(quantity) * density_kg_litre
    if normalized in {"ml", "millilitre", "milliliter"} and density_kg_litre:
        return float(quantity) / 1000 * density_kg_litre
    if normalized in {"kl", "kilolitre", "kiloliter", "kilolitres", "kiloliters"} and density_kg_litre:
        return float(quantity) * 1000 * density_kg_litre
    return None


def _deduplicate_records(records: list[dict]) -> list[dict]:
    """Remove exact duplicate current entries before comparison aggregation."""
    seen, unique = set(), []
    for record in records:
        identity = (
            "content",
            record.get("facility_id"),
            record.get("scope"),
            record.get("category"),
            record.get("sub_category"),
            record.get("fuel_type"),
            record.get("reporting_period"),
            str((record.get("dynamic_field_values") or {}).get("qty")),
            record.get("co2e_emissions", record.get("total_emissions")),
            record.get("record_source") or record.get("source_of_information") or record.get("evidence_url"),
            str(sorted((record.get("dynamic_field_values") or {}).items())),
        )
        if identity not in seen:
            seen.add(identity)
            unique.append(record)
    return unique


async def search_records(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    deterministic_route = kwargs.get("data_source") == "ghg_emissions"
    resolved_facilities = await resolve_authorized_facilities(db, org_id, facility_ids, kwargs.get("facility"))
    query = organization_scope(org_id, resolved_facilities)
    query = and_filters(query, {"is_current": {"$ne": False}}, {"$or": [{"deleted_at": {"$exists": False}}, {"deleted_at": None}]})

    scope = kwargs.get("scope")
    if scope:
        query = and_filters(query, scope_filter(scope))

    category = kwargs.get("category")
    if category:
        query = and_filters(query, {"$or": [
            {"category": {"$regex": f"^{re.escape(category)}$", "$options": "i"}},
            {"sub_category": {"$regex": f"^{re.escape(category)}$", "$options": "i"}},
        ]})

    fuel_type = kwargs.get("fuel_type")
    if fuel_type:
        query = and_filters(query, {"fuel_type": {"$regex": re.escape(fuel_type), "$options": "i"}})

    period = period_from_payload(kwargs.get("period"))
    strict_period = bool(kwargs.get("strict_period"))
    if period is None and not deterministic_route:
        period = await latest_available_period(db, "emission_records", query)
    if period is None and not deterministic_route:
        return {"total_found": 0, "showing": 0, "period": "No reporting period available", "records": []}
    if period is not None:
        period_filter = {"reporting_period": {"$gte": period.start_month, "$lte": period.end_month}} if strict_period else emission_period_filter(period)
        query = and_filters(query, period_filter)

    raw_records = await db.emission_records.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
    records = [
        record for record in raw_records
        if period is None or (
            period.start_month <= str(record.get("reporting_period") or "") <= period.end_month
            if strict_period else annual_record_allocation(record.get("reporting_period"), period) > 0
        )
    ]
    records = _deduplicate_records(records)

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
    period_consumption = {}
    period_emissions = {}
    allocation_notes = []
    for r in records:
        quantity_evidence = resolve_record_quantity(r)
        qty_value, qty_unit = quantity_evidence["value"], quantity_evidence["unit"]
        allocation_factor = annual_record_allocation(r.get("reporting_period"), period) if period else 1
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
            period_key = (str(r.get("reporting_period")), qty_unit)
            period_consumption[period_key] = period_consumption.get(period_key, 0.0) + allocated_quantity
        if allocated_emissions is not None:
            total_emissions += allocated_emissions
            emission_record_count += 1
            facility_id = r.get("facility_id")
            facility_name = fac_map.get(facility_id, facility_id)
            item = emissions_by_facility.setdefault(facility_name, {"emissions": 0.0, "records": 0})
            item["emissions"] += allocated_emissions
            item["records"] += 1
            period_key = str(r.get("reporting_period"))
            period_emissions[period_key] = period_emissions.get(period_key, 0.0) + allocated_emissions
        if allocation_factor < 1:
            allocation_notes.append(
                f"{r.get('reporting_period')} value allocated at {allocation_factor:g} of its stored amount for {period.label}."
            )
        summary.append({
            "id": r.get("id"),
            "facility_id": r.get("facility_id"),
            "record_source": r.get("record_source") or r.get("source_of_information") or r.get("evidence_url"),
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
        "state": "FOUND" if records else "NOT_FOUND",
        "deterministic_route": deterministic_route,
        "value_kind": kwargs.get("value_kind"),
        "scope": scope,
        "category": category,
        "total_found": len(records),
        "showing": len(summary),
        "period": period.label if period else "All reporting periods",
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
        "period_consumption": [
            {"period": period_key, "quantity": round(quantity, 6), "unit": unit}
            for (period_key, unit), quantity in period_consumption.items()
        ],
        "period_emissions": [
            {"period": period_key, "value": round(value, 6), "unit": "tCO2e"}
            for period_key, value in period_emissions.items()
        ],
        "allocation_notes": allocation_notes,
    }


async def get_fuel_energy(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Calculate Scope 1 fuel energy from stored quantity and override/default fuel properties."""
    records_data = await search_records(org_id, facility_ids, scope="scope1", **{key: value for key, value in kwargs.items() if key != "scope"})
    calculations = []
    seen_records = set()
    for record in records_data.get("records", []):
        inputs = record.get("calculation_inputs") or {}
        record_identity = (record.get("facility_id"), record.get("scope"), record.get("category"), record.get("sub_category"), record.get("fuel_type"), str(record.get("reporting_period")), record.get("quantity"), record.get("unit"), (inputs.get("density") or {}).get("value"), (inputs.get("cv") or inputs.get("ncv") or {}).get("value"), record.get("record_source"))
        if record_identity in seen_records:
            continue
        seen_records.add(record_identity)
        fuel_name = record.get("fuel_type")
        if not fuel_name:
            continue
        fuel = await db.fuel_database.find_one({"fuel_name": {"$regex": f"^{re.escape(fuel_name)}$", "$options": "i"}}, {"_id": 0})
        density_input, ncv_input = inputs.get("density") or {}, inputs.get("cv") or inputs.get("ncv") or {}
        density_value = density_input.get("value") if density_input.get("value") is not None else (fuel or {}).get("density")
        density_unit = density_input.get("unit") or (fuel or {}).get("density_unit") or "kg/L"
        density = _density_kg_per_litre(density_value, density_unit)
        ncv_value = ncv_input.get("value") if ncv_input.get("value") is not None else (fuel or {}).get("calorific_value")
        ncv_unit = ncv_input.get("unit") or (fuel or {}).get("calorific_value_unit")
        ncv = _ncv_tj_per_kg(ncv_value, ncv_unit, density)
        quantity_kg = _quantity_to_kg(record.get("quantity"), record.get("unit"), density)
        if density is None or ncv is None or quantity_kg is None:
            continue
        calculations.append({
            "fuel_type": fuel_name,
            "reporting_period": record.get("reporting_period"),
            "quantity": record.get("quantity"),
            "quantity_unit": record.get("unit"),
            "density": density_value,
            "density_unit": density_unit,
            "density_source": "record override" if density_input.get("value") is not None else "fuel database default",
            "ncv": ncv_value,
            "ncv_unit": ncv_unit,
            "ncv_source": "record override" if ncv_input.get("value") is not None else "fuel database default",
            "energy_tj": round(quantity_kg * ncv, 10),
        })
    return {"records_found": records_data.get("total_found", 0), "period": records_data.get("period"), "calculations": calculations}


async def get_renewable_energy_components(org_id: str, facility_ids: list = None, **kwargs) -> dict:
    """Return Scope 1 fuel-energy calculations plus Scope 2 electricity activity for a combined energy ledger."""
    scope2 = await search_records(org_id, facility_ids, scope="scope2", category="Purchased Electricity", **{key: value for key, value in kwargs.items() if key not in {"scope", "category"}})
    scope1 = await get_fuel_energy(org_id, facility_ids, **kwargs)
    electricity = []
    seen_electricity = set()
    for record in scope2.get("records", []):
        energy_input = next((value for value in (record.get("calculation_inputs") or {}).values() if isinstance(value, dict) and value.get("unit") and str(value.get("unit")).lower() in {"kwh", "mwh", "gwh", "kj", "mj", "gj", "tj"}), None)
        quantity = energy_input.get("value") if energy_input else record.get("quantity")
        unit = energy_input.get("unit") if energy_input else record.get("unit")
        identity = (record.get("facility_id"), record.get("scope"), record.get("category"), record.get("sub_category"), str(record.get("reporting_period")), quantity, unit, record.get("record_source"))
        if identity in seen_electricity:
            continue
        seen_electricity.add(identity)
        electricity.append({
            "id": record.get("id"), "facility_id": record.get("facility_id"), "record_source": record.get("record_source"),
            "quantity": quantity, "unit": unit,
            "renewable": "renewable" in str(record.get("sub_category") or "").lower() and "non-renewable" not in str(record.get("sub_category") or "").lower(),
            "period": record.get("reporting_period"),
        })
    return {"scope1_calculations": scope1.get("calculations", []), "scope2_electricity": electricity, "period": scope2.get("period") or scope1.get("period")}
