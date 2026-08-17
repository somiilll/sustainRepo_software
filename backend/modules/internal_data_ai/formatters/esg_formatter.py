"""Deterministic Environment, Social, and Governance record responses."""
from modules.internal_data_ai.formatters.ghg_formatter import format_metric_value
from modules.internal_data_ai.query_contracts import StructuredQueryPlan
from shared.unit_registry import convert_to_base, detect_unit_type


def _display_status(record: dict) -> str:
    approval = record.get("approval_status")
    if approval == "not_required":
        return "Not applicable"
    if approval:
        return str(approval).replace("_", " ").title()
    return f"Approval status unavailable; record status: {record.get('operational_status')}"


def _build_water_recycling_response(data: dict) -> str:
    results = data.get("derived_results") or []
    if not results:
        return "Water Recycling % could not be calculated because matching current Recycle and Withdrawal values were not found."
    lines = ["Water Recycling %"]
    for result in results[:12]:
        lines.append(f"Period: {result.get('period')}")
        if result.get("state") == "FOUND":
            unit = result.get("unit") or "stored unit"
            lines.extend([f"Recycled water: {result.get('recycled_value')} {unit}", f"Water withdrawal: {result.get('withdrawal_value')} {unit}", f"Formula: ({result.get('recycled_value')} / {result.get('withdrawal_value')}) × 100", f"Result: {result.get('percentage')}%"])
        elif result.get("state") == "ZERO_DENOMINATOR":
            lines.append("Cannot calculate: Water withdrawal is zero.")
        else:
            lines.append("Cannot calculate: recycled water or water withdrawal value is missing or has no compatible stored unit.")
    return "\n".join(lines)


def _build_renewable_energy_response(data: dict) -> str:
    results = data.get("renewable_energy_results") or []
    if not results:
        return "Renewable Energy % could not be calculated because matching renewable and total energy values were not found."
    lines = ["Renewable Energy %"]
    for result in results[:12]:
        unit = result.get("unit") or "unit not stored"
        lines.append(f"Period: {result.get('period')}")
        if result.get("state") == "FOUND":
            lines.extend([f"Renewable energy: {result.get('renewable_value')} {unit}", f"Total energy: {result.get('total_value')} {unit}", f"Formula: ({result.get('renewable_value')} / {result.get('total_value')}) × 100", f"Result: {result.get('percentage')}%"])
        else:
            lines.append("Cannot calculate: total energy is zero.")
    return "\n".join(lines)


def build_combined_renewable_energy_response(data: dict, components: dict) -> str:
    environment_renewable = environment_total = scope2_renewable = scope2_total = scope1_total = 0.0
    unavailable = []
    for result in data.get("renewable_energy_results") or []:
        unit = result.get("unit")
        if detect_unit_type(unit or "") != "energy":
            unavailable.append("Environment → Energy (stored unit unavailable)")
            continue
        environment_renewable += convert_to_base(result["renewable_value"], unit)[0]
        environment_total += convert_to_base(result["total_value"], unit)[0]
    for record in components.get("scope2_electricity", []):
        if not isinstance(record.get("quantity"), (int, float)) or detect_unit_type(record.get("unit") or "") != "energy":
            unavailable.append("Scope 2 electricity (stored unit unavailable)")
            continue
        value = convert_to_base(record["quantity"], record["unit"])[0]
        scope2_total += value
        if record.get("renewable"):
            scope2_renewable += value
    scope1_total = sum(item.get("energy_tj", 0) * 1000 for item in components.get("scope1_calculations", []))
    denominator = environment_total + scope2_total + scope1_total
    lines = ["Renewable Energy % — combined energy ledger", f"Environment renewable energy: {environment_renewable} GJ", f"Scope 2 renewable electricity: {scope2_renewable} GJ", f"Scope 1 Fuel Energy: {scope1_total} GJ", f"Scope 2 electricity energy: {scope2_total} GJ", f"Environment total energy: {environment_total} GJ"]
    if denominator:
        lines.extend([f"Formula: ({environment_renewable} + {scope2_renewable}) / ({scope1_total} + {scope2_total} + {environment_total}) × 100", f"Result: {round((environment_renewable + scope2_renewable) / denominator * 100, 6)}%"])
    else:
        lines.append("Cannot calculate: no usable total-energy source was available.")
    if unavailable:
        lines.append("Excluded sources: " + "; ".join(sorted(set(unavailable))))
    return "\n".join(lines)


def build_esg_record_response(query_plan: StructuredQueryPlan, data: dict, response_type: str) -> dict:
    """Return deterministic ESG-record answers so record state never depends on LLM phrasing."""
    if data.get("error"):
        return {"answer": "The requested metric records could not be retrieved. No record count, value, or approval status was inferred.", "highlights": [{"label": "State", "value": "STATUS_UNAVAILABLE"}], "suggestion": None, "response_type": response_type, "chart": None, "raw_data": {"error": data["error"]}}
    category = data.get("category") or query_plan.category or query_plan.record_type or "ESG"
    metric = data.get("subcategory") or data.get("requested_metric")
    subject = f"{category} {str(metric).title()}" if metric and str(metric).lower() != str(category).lower() else str(category)
    period = data.get("period") or "All reporting periods"
    state = data.get("state", "NOT_FOUND")
    found = data.get("records_found", 0)
    matching = data.get("matching_status_records", 0)
    status_filter = data.get("approval_status_filter")
    summary = data.get("approval_status_summary") or {}
    if state == "NOT_FOUND":
        answer = f"No {subject} metric records were found for {period}."
    elif state == "STATUS_UNAVAILABLE":
        answer = f"No approval-status data was provided for the {found} matching {subject} metric record(s) for {period}; their approval state cannot be determined."
    elif status_filter == "pending_approval" and matching == 0:
        answer = f"No {str(category).lower()} metric records are pending approval. Records found: {found}. Awaiting approval: 0."
    elif status_filter == "approved" and matching == 0:
        answer = f"No {category} metric records currently have Approved status. Records found: {found}. Approved: 0."
    elif data.get("derived_metric") == "water_recycling_percentage":
        answer = _build_water_recycling_response(data)
    elif data.get("derived_metric") == "renewable_energy_percentage":
        answer = _build_renewable_energy_response(data)
    else:
        status_label = "pending approval" if state == "PENDING" else "approved" if state == "APPROVED" else "found"
        answer = f"{matching if status_filter else found} {subject} metric record(s) {status_label} for {period}."
        aggregates = data.get("aggregates") or []
        if aggregates:
            if period == "All reporting periods":
                answer += "\nPeriod comparison:" + "".join(f"\n• {total.get('period')}: {total.get('value')} {total.get('unit')} across {len(total.get('facilities') or [])} location(s)." for total in aggregates[:12])
            else:
                total = aggregates[0]
                answer += f"\nTotal: {total.get('value')} {total.get('unit')} across {len(total.get('facilities') or [])} location(s)."
        details = [f"• {record.get('metric') or category} — {record.get('facility') or 'Organization level'}; {record.get('reporting_period')}; {format_metric_value(record.get('metric_value') or {})}; Status: {_display_status(record)}" for record in data.get("records", [])[:12]]
        if details:
            answer += "\nUnderlying records:\n" + "\n".join(details)
    highlights = [{"label": "State", "value": state}, {"label": "Records found", "value": str(found)}, {"label": "Pending", "value": str(summary.get("PENDING", 0))}, {"label": "Approved", "value": str(summary.get("APPROVED", 0))}]
    if data.get("source_path"):
        highlights.append({"label": "Source", "value": data["source_path"]})
    if summary.get("STATUS_UNAVAILABLE"):
        highlights.append({"label": "Status unavailable", "value": str(summary["STATUS_UNAVAILABLE"])})
    return {"answer": answer, "highlights": highlights, "suggestion": None, "response_type": response_type, "chart": None, "raw_data": data}


def build_esg_record_history_response(query_plan: StructuredQueryPlan, data: dict, response_type: str) -> dict:
    history = data.get("history") or []
    period = data.get("period") or "the requested period"
    subject = " → ".join(item for item in [data.get("category") or query_plan.category, data.get("subcategory") or query_plan.subcategory] if item) or "ESG record"
    period_context = "across all reporting periods" if period == "All reporting periods" else f"for records with reporting period {period}"
    if not history:
        answer = f"No version history was found for {subject} {period_context}."
    else:
        lines = [f"{len(history)} version change(s) found for {subject} {period_context}."]
        for entry in history[:20]:
            changes = []
            for diff in entry.get("field_diffs") or []:
                old_unit = f" {diff['old_unit']}" if diff.get("old_unit") else ""
                new_unit = f" {diff['new_unit']}" if diff.get("new_unit") else ""
                changes.append(f"{diff.get('field') or 'Field'}: {diff.get('old_value')}{old_unit} → {diff.get('new_value')}{new_unit}")
            changed = "; ".join(changes) or ", ".join(entry.get("changed_fields") or []) or "No changed fields were recorded"
            detail = f"• {entry.get('changed_at') or 'Time unavailable'} — {entry.get('changed_by_name') or 'Unknown user'}: {entry.get('change_type') or 'Updated'} — {changed}."
            if entry.get("change_reason"):
                detail += f" {entry['change_reason']}"
            lines.append(detail)
        answer = "\n".join(lines)
    return {"answer": answer, "highlights": [{"label": "History entries", "value": str(len(history))}, {"label": "Source", "value": subject}], "suggestion": None, "response_type": response_type, "chart": None, "raw_data": data}