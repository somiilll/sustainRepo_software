"""Deterministic GHG and fuel-energy response rendering."""
from modules.internal_data_ai.query_contracts import StructuredQueryPlan


def build_fuel_energy_response(energy: dict, fuel_energy: dict, response_type: str) -> dict:
    lines = ["Fuel Energy"]
    records = energy.get("records") or []
    if records:
        lines.append("Environment → Energy → Fuel Within Organization")
        lines.extend(f"• {record.get('reporting_period')}: {format_metric_value(record.get('metric_value') or {})}" for record in records[:12])
    else:
        lines.append("No authorized Environment → Energy → Fuel Within Organization record was found.")
    calculations = fuel_energy.get("calculations") or []
    if calculations:
        lines.append("GHG → Scope 1 fuel activity energy")
        for calculation in calculations[:12]:
            lines.append(f"• {calculation['fuel_type']} ({calculation['reporting_period']}): {calculation['quantity']} {calculation['quantity_unit']} × {calculation['density']} {calculation['density_unit']} ({calculation['density_source']}) × {calculation['ncv']} {calculation['ncv_unit']} ({calculation['ncv_source']}) = {calculation['energy_tj']} TJ")
    else:
        lines.append("No Scope 1 fuel record had the quantity, density, and NCV required for an energy calculation.")
    return {"answer": "\n".join(lines), "highlights": [{"label": "Source", "value": "Environment Energy + GHG Scope 1"}], "suggestion": None, "response_type": response_type, "chart": None, "raw_data": {"energy": energy, "fuel_energy": fuel_energy}}


def build_ghg_response(query_plan: StructuredQueryPlan, data: dict, response_type: str) -> dict:
    """Render activity data separately from calculated GHG emissions."""
    value_kind = data.get("value_kind") or query_plan.value_kind or "emissions"
    category = data.get("category") or "all matching categories"
    scope = data.get("scope") or query_plan.scope or "all scopes"
    period = data.get("period") or "All reporting periods"
    found = data.get("total_found", 0)
    subject = "GHG emissions" if value_kind == "emissions" else "GHG activity data"
    if not found:
        answer = f"No authorized {subject} records were found for {scope} → {category} in {period}."
    else:
        answer = f"{found} {subject} record(s) found for {scope} → {category} in {period}."
        if value_kind == "emissions":
            totals, period_totals = data.get("emissions_totals") or [], data.get("period_emissions") or []
            if period == "All reporting periods" and period_totals:
                answer += "\nPeriod comparison:" + "".join(f"\n• {item['period']}: {item['value']} {item['unit']}" for item in period_totals[:12])
            elif totals:
                answer += "\nTotal emissions: " + ", ".join(f"{item['value']} {item['unit']}" for item in totals)
        else:
            totals, period_totals = data.get("consumption_totals") or [], data.get("period_consumption") or []
            if period == "All reporting periods" and period_totals:
                answer += "\nPeriod comparison:" + "".join(f"\n• {item['period']}: {item['quantity']} {item['unit']}" for item in period_totals[:12])
            elif totals:
                answer += "\nTotal activity: " + ", ".join(f"{item['quantity']} {item['unit']}" for item in totals)
        details = []
        for record in data.get("records", [])[:12]:
            value = record.get("emissions_value") if value_kind == "emissions" else record.get("quantity")
            unit = record.get("emissions_unit") if value_kind == "emissions" else record.get("unit")
            details.append(f"• {record.get('category') or 'Category'} — {record.get('facility') or 'Organization level'}; {record.get('reporting_period')}; {value if value is not None else 'Value missing'}{f' {unit}' if unit else ''}; Status: {record.get('status') or 'unavailable'}")
        if details:
            answer += "\nUnderlying records:\n" + "\n".join(details)
    return {"answer": answer, "highlights": [{"label": "Source", "value": f"GHG Emissions → {scope} → {category}"}, {"label": "Records found", "value": str(found)}, {"label": "Data type", "value": "Calculated emissions" if value_kind == "emissions" else "Activity data"}], "suggestion": None, "response_type": response_type, "chart": None, "raw_data": data}


def format_metric_value(metric_value: dict) -> str:
    if not metric_value or metric_value.get("state") != "AVAILABLE":
        return "Value: Missing"
    unit = metric_value.get("unit")
    value = metric_value.get("value")
    label = metric_value.get("field_label") or metric_value.get("field_key") or "Value"
    identifier = f"{metric_value.get('field_key') or ''} {label}".lower()
    count_markers = ("count", "number", "no_of", "no of", "employee", "worker", "incident", "case", "director", "complaint", "grievance", "injury", "fatality")
    is_dimensionless_count = bool(metric_value.get("is_count")) or any(marker in identifier for marker in count_markers)
    suffix = f" {unit}" if unit else "" if is_dimensionless_count else " (unit not stored)"
    return f"{label}: {value}{suffix}"