"""Deterministic BRSR and GRI response rendering."""
from modules.internal_data_ai.formatters.markdown import format_list_of_dicts_as_table, format_markdown_cell
from modules.internal_data_ai.query_contracts import StructuredQueryPlan
from modules.internal_data_ai.question_registry import RESPONSE_CONFIGURED_NO_RESPONSE, RESPONSE_EMPTY, RESPONSE_FOUND, RESPONSE_MAPPING_NOT_FOUND, RESPONSE_NOT_CONFIGURED


_NGRBC_REASON_LABELS = {
    "not_material": "The entity does not consider the Principles material to its business.",
    "not_ready": "The entity is not at a stage where it is in a position to formulate and implement the policies on specified principles.",
    "no_resources": "The entity does not have the financial or/human and technical resources available for the task.",
    "planned_next_fy": "It is planned to be done in the next financial year.",
    "other": "Any other reason",
}


def _format_ngrbc_policy_matrix(value: dict) -> str:
    mode = value.get("mode") or "together"
    is_together = mode in {"together", "all_together", "combined"}
    lines = [f"Mode: {'Fill All Principles Together' if is_together else 'Fill Principle-wise Separately'}"]
    if is_together:
        coverage = value.get("all_together") if isinstance(value.get("all_together"), dict) else value
        covered = coverage.get("covered")
        lines.append(f"Policies cover NGRBCs: {format_markdown_cell(covered)}")
        if covered is True:
            if "board_approved" in coverage:
                lines.append(f"Board approved: {format_markdown_cell(coverage.get('board_approved'))}")
            if coverage.get("web_link"):
                lines.append(f"Policy web link: {format_markdown_cell(coverage['web_link'])}")
        elif covered is False:
            selected_reasons = []
            for key, saved_value in (coverage.get("reasons") or {}).items():
                if not saved_value:
                    continue
                label = _NGRBC_REASON_LABELS.get(key, key.replace("_", " ").capitalize())
                if key == "other" and isinstance(saved_value, str) and saved_value.strip().lower() not in {"true", "yes"}:
                    label = f"{label}: {saved_value.strip()}"
                selected_reasons.append(label)
            if selected_reasons:
                lines.extend(["Reasons:", *[f"- {reason}" for reason in selected_reasons]])
        return "\n".join(lines)
    rows = []
    for principle, coverage in (value.get("principle_wise") or value.get("principles") or {}).items():
        if not isinstance(coverage, dict):
            continue
        selected_reasons = [_NGRBC_REASON_LABELS.get(key, key.replace("_", " ").capitalize()) for key, saved_value in (coverage.get("reasons") or {}).items() if saved_value]
        rows.append({"Principle": principle, "Covered": format_markdown_cell(coverage.get("covered")), "Board Approved": format_markdown_cell(coverage.get("board_approved")), "Reasons": "; ".join(selected_reasons) or "-"})
    return "\n".join([*lines, format_list_of_dicts_as_table(rows)]) if rows else "\n".join(lines)


def _format_training_awareness_coverage(value: dict) -> str:
    group_labels = (("bod", "Board of Directors"), ("kmp", "Key Managerial Personnel"), ("employees", "Employees other than BoD and KMP"), ("workers", "Workers"))
    rows = []
    for prefix, group_label in group_labels:
        programs = value.get(f"{prefix}_programs", value.get(f"{prefix}_programmes"))
        topics, coverage = value.get(f"{prefix}_topics"), value.get(f"{prefix}_coverage")
        if all(item in (None, "", [], {}) for item in (programs, topics, coverage)):
            continue
        rendered_coverage = format_markdown_cell(coverage)
        if rendered_coverage != "-" and isinstance(coverage, (int, float)):
            rendered_coverage = f"{rendered_coverage}%"
        rows.append({"Category": group_label, "Programmes Conducted": format_markdown_cell(programs), "Topics Covered": format_markdown_cell(topics), "Coverage": rendered_coverage})
    if rows:
        return format_list_of_dicts_as_table(rows)
    nested_group_labels = (("bod", "Board of Directors"), ("kmp", "Key Managerial Personnel"), ("employees", "Employees other than BoD and KMP"), ("employees_other_than_bod_kmp", "Employees other than BoD and KMP"), ("workers", "Workers"))
    nested_rows, rendered_groups = [], set()
    for key, group_label in nested_group_labels:
        group = value.get(key)
        if not isinstance(group, dict) or group_label in rendered_groups:
            continue
        total, trained, coverage = group.get("total", group.get("total_persons")), group.get("trained", group.get("covered")), group.get("pct", group.get("coverage"))
        if all(item in (None, "", [], {}) for item in (total, trained, coverage)):
            continue
        rendered_groups.add(group_label)
        rendered_coverage = format_markdown_cell(coverage)
        if rendered_coverage != "-" and str(rendered_coverage).replace(".", "", 1).isdigit():
            rendered_coverage = f"{rendered_coverage}%"
        nested_rows.append({"Category": group_label, "Total Persons": format_markdown_cell(total), "Persons Covered": format_markdown_cell(trained), "Coverage": rendered_coverage})
    if nested_rows:
        return format_list_of_dicts_as_table(nested_rows)
    if isinstance(value.get("rows"), list) and value["rows"] and isinstance(value["rows"][0], dict):
        return format_list_of_dicts_as_table(value["rows"])
    return "Value unavailable"


def build_framework_question_response(query_plan: StructuredQueryPlan, framework_data: dict, response_type: str) -> dict:
    """Render registry-resolved framework answers from stored response data."""
    state = framework_data.get("response_state", RESPONSE_NOT_CONFIGURED)
    qkey = query_plan.framework_question_key or query_plan.requested_metric or ""
    framework_name = framework_data.get("framework", "BRSR")
    source_path = query_plan.framework_source_path or framework_name
    period = framework_data.get("period") or "current period"
    responses = framework_data.get("responses") or []
    label = query_plan.framework_display_label or qkey.replace("_", " ").replace("brsr a ", "").replace("p1 ", "P1 ").title()
    if state == RESPONSE_FOUND:
        matching = [response for response in responses if response.get("question_key") == qkey] or responses[:1]
        if matching:
            record = matching[0]
            value, approval = record.get("value"), record.get("approval_status")
            if qkey == "ngrbc_policy_matrix" and isinstance(value, dict):
                formatted_value = _format_ngrbc_policy_matrix(value)
            elif qkey == "p1_training_awareness_coverage" and isinstance(value, dict):
                formatted_value = _format_training_awareness_coverage(value)
            elif isinstance(value, dict):
                value_lines = []
                for key, item in value.items():
                    if item in (None, "", [], {}):
                        continue
                    if isinstance(item, list) and item and isinstance(item[0], dict):
                        value_lines.extend([f"**{key.replace('_', ' ').title()}**\n", format_list_of_dicts_as_table(item)])
                    elif isinstance(item, dict):
                        value_lines.extend(f"{nested_key.replace('_', ' ').title()}: {nested_value}" for nested_key, nested_value in item.items() if nested_value not in (None, "", [], {}))
                    elif isinstance(item, bool):
                        value_lines.append(f"{key.replace('_', ' ').replace('has ', '').title()}: {'Yes' if item else 'No'}")
                    else:
                        value_lines.append(f"{key.replace('_', ' ').title()}: {item}")
                formatted_value = "\n".join(value_lines) if value_lines else str(value)
            elif isinstance(value, list):
                formatted_value = format_list_of_dicts_as_table(value) if value and isinstance(value[0], dict) else "\n".join(f"  - {item}" for item in value[:20])
            else:
                formatted_value = str(value)
            answer = f"**{label}**\n\n{formatted_value}"
            if period and period != "current period":
                answer += f"\n\nPeriod: {period}"
            answer += f"\nSource: {source_path}"
            if approval:
                answer += f"\nApproval Status: {str(approval).replace('_', ' ').title()}"
        else:
            answer = f"**{label}**\nValue found but could not be formatted.\n\nSource: {source_path}"
    elif state == RESPONSE_CONFIGURED_NO_RESPONSE:
        answer = f"**{label}**\n\nThe question is configured for {framework_name}, but no response has been submitted for this organization.\n\nStatus: Not answered\nSource: {source_path}"
    elif state == RESPONSE_EMPTY:
        answer = f"**{label}**\n\nA response exists but the value is empty.\n\nStatus: Empty response\nSource: {source_path}"
    elif state == RESPONSE_MAPPING_NOT_FOUND:
        answer = f"**{label}**\n\nA matching question likely exists in the {framework_name} configuration, but the system could not map your question to its canonical key.\n\nStatus: Mapping not found\nSource: {source_path}"
    else:
        answer = f"**{label}**\n\nThis question is not configured in the system.\n\nStatus: Not configured\nSource: {source_path}"
    highlights = [{"label": "State", "value": state}, {"label": "Source", "value": source_path}]
    if period and period != "current period":
        highlights.append({"label": "Period", "value": period})
    return {"answer": answer, "highlights": highlights, "suggestion": None, "response_type": response_type, "chart": None, "raw_data": framework_data}