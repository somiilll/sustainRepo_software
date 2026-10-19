"""Deterministic period-comparison response rendering."""
from modules.internal_data_ai.formatters.markdown import format_list_of_dicts_as_table
from modules.internal_data_ai.query_contracts import QueryType, StructuredQueryPlan


def _comparison_value_kind(query_plan: StructuredQueryPlan) -> str:
    return "consumption" if query_plan.query_type == QueryType.CONSUMPTION_LOOKUP else "emissions"


def _comparison_value(record: dict, value_kind: str) -> tuple[float | None, str | None]:
    value_key = "quantity" if value_kind == "consumption" else "emissions_value"
    unit_key = "unit" if value_kind == "consumption" else "emissions_unit"
    value = record.get(value_key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None, None
    return float(value), record.get(unit_key)


def _format_comparison_number(value: float | None) -> str:
    return "—" if value is None else f"{value:,.6f}".rstrip("0").rstrip(".")


def build_period_comparison_response(query_plan: StructuredQueryPlan, data: dict, response_type: str) -> dict:
    """Render exact-month comparison values and reference-period variances."""
    comparisons = (data.get("comparison") or {}).get("periods") or []
    if len(comparisons) < 2:
        return {
            "answer": "The requested period comparison could not be completed from at least two explicit reporting periods.",
            "highlights": [{"label": "State", "value": "NOT_FOUND"}],
            "suggestion": None,
            "response_type": response_type,
            "chart": None,
            "raw_data": None,
        }

    value_kind = _comparison_value_kind(query_plan)
    labels = [item.get("period", {}).get("label") or f"Period {index + 1}" for index, item in enumerate(comparisons)]
    period_values = []
    for item in comparisons:
        values = {}
        for record in (item.get("data") or {}).get("records") or []:
            value, unit = _comparison_value(record, value_kind)
            if value is None:
                continue
            unit = unit or ("tCO2e" if value_kind == "emissions" else "Unit not stored")
            category = record.get("category") or record.get("sub_category") or "Uncategorised"
            key = (str(category), str(unit))
            values[key] = values.get(key, 0.0) + value
        period_values.append(values)

    keys = set().union(*period_values)
    if not keys:
        subject = "activity data" if value_kind == "consumption" else "emissions"
        return {
            "answer": f"No authorized {subject} with stored values were found for {', '.join(labels)}.",
            "highlights": [{"label": f"Period {index + 1}", "value": label} for index, label in enumerate(labels)],
            "suggestion": None,
            "response_type": response_type,
            "chart": None,
            "raw_data": None,
        }

    rows = []
    for category, unit in sorted(keys):
        values = [period_value.get((category, unit), 0.0) for period_value in period_values]
        row = {"Category": category, "Unit": unit}
        row.update({label: _format_comparison_number(value) for label, value in zip(labels, values)})
        for index, value in enumerate(values[1:], start=1):
            variance = values[0] - value
            variance_pct = None if value == 0 else (variance / abs(value)) * 100
            row[f"Variance ({labels[0]} − {labels[index]})"] = _format_comparison_number(variance)
            row["Variance %" if len(comparisons) == 2 else f"Variance % ({labels[0]} vs {labels[index]})"] = "—" if variance_pct is None else f"{variance_pct:,.2f}%"
        rows.append(row)

    units = sorted({unit for _, unit in keys})
    for unit in units:
        values = [sum(value for (_, row_unit), value in period_value.items() if row_unit == unit) for period_value in period_values]
        total_row = {"Category": "Total", "Unit": unit}
        total_row.update({label: _format_comparison_number(value) for label, value in zip(labels, values)})
        for index, value in enumerate(values[1:], start=1):
            variance = values[0] - value
            variance_pct = None if value == 0 else (variance / abs(value)) * 100
            total_row[f"Variance ({labels[0]} − {labels[index]})"] = _format_comparison_number(variance)
            total_row["Variance %" if len(comparisons) == 2 else f"Variance % ({labels[0]} vs {labels[index]})"] = "—" if variance_pct is None else f"{variance_pct:,.2f}%"
        rows.insert(0, total_row)

    scope = query_plan.scope or "all scopes"
    subject = "activity comparison" if value_kind == "consumption" else "emissions comparison"
    chart = None
    if len(units) == 1:
        chart = {
            "type": "bar",
            "title": f"{scope.title()} {subject}: {' vs '.join(labels)}",
            "data": [{"name": label, "value": round(sum(period_value.values()), 6)} for label, period_value in zip(labels, period_values)],
            "xKey": "name",
            "yKey": "value",
            "color": "#0f766e",
        }
    return {
        "answer": f"**{scope.title()} {subject}**\n\n" + format_list_of_dicts_as_table(rows),
        "highlights": [*[{"label": f"Period {index + 1}", "value": label} for index, label in enumerate(labels)], {"label": "Reference period", "value": labels[0]}],
        "suggestion": None,
        "response_type": response_type,
        "chart": chart,
        "raw_data": None,
    }