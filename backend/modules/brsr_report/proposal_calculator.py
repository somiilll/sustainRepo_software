import ast
import hashlib
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from modules.kpi_engine.aggregators import Aggregator
from modules.kpi_engine.filters import FilterBuilder
from modules.kpi_engine.ghg_adapter import calculate_ghg_kpi
from modules.kpi_engine.utils import get_collection_for_section, parse_numeric_value
from shared.database.mongo import db


MONTH_VALUES = {
    1: [1, "1", "01", "Jan", "January"],
    2: [2, "2", "02", "Feb", "February"],
    3: [3, "3", "03", "Mar", "March"],
    4: [4, "4", "04", "Apr", "April"],
    5: [5, "5", "05", "May"],
    6: [6, "6", "06", "Jun", "June"],
    7: [7, "7", "07", "Jul", "July"],
    8: [8, "8", "08", "Aug", "August"],
    9: [9, "9", "09", "Sep", "September"],
    10: [10, "10", "Oct", "October"],
    11: [11, "11", "Nov", "November"],
    12: [12, "12", "Dec", "December"],
}


def build_reporting_period_filter(reporting_period: str) -> Dict[str, Any]:
    fy_match = re.search(r"FY\s*(\d{4})-(\d{4})", reporting_period or "", re.I)
    if fy_match:
        start_year, end_year = int(fy_match.group(1)), int(fy_match.group(2))
        apr_dec = [value for month in range(4, 13) for value in MONTH_VALUES[month]]
        jan_mar = [value for month in range(1, 4) for value in MONTH_VALUES[month]]
        short_fy = f"{start_year}-{str(end_year)[-2:]}"
        return {"$or": [
            {"reporting_period.financial_year": {"$in": [reporting_period, short_fy, f"{start_year}-{end_year}"]}},
            {"reporting_period.year": start_year, "reporting_period.month": {"$in": apr_dec}},
            {"reporting_period.year": end_year, "reporting_period.month": {"$in": jan_mar}},
            {"reporting_period.year": start_year, "reporting_period.reporting_type": "yearly"},
            {"reporting_period.date": {"$gte": f"{start_year}-04-01", "$lt": f"{end_year}-04-01"}},
        ]}

    cy_match = re.search(r"CY\s*(\d{4})", reporting_period or "", re.I)
    if cy_match:
        year = int(cy_match.group(1))
        return {"$or": [
            {"reporting_period.calendar_year": {"$in": [reporting_period, str(year)]}},
            {"reporting_period.year": year},
            {"reporting_period.date": {"$gte": f"{year}-01-01", "$lt": f"{year + 1}-01-01"}},
        ]}

    return {"$or": [
        {"reporting_period.financial_year": reporting_period},
        {"reporting_period.calendar_year": reporting_period},
    ]}


def _ghg_period(reporting_period: str) -> Optional[Dict[str, Any]]:
    """Translate the shared BRSR FY/CY label to the GHG adapter period contract."""
    financial_year = re.fullmatch(r"FY\s*(\d{4})-(\d{4})", reporting_period or "", re.I)
    if financial_year:
        return {"year": int(financial_year.group(1)), "reporting_year_type": "FY"}
    calendar_year = re.fullmatch(r"CY\s*(\d{4})", reporting_period or "", re.I)
    if calendar_year:
        return {"year": int(calendar_year.group(1)), "reporting_year_type": "CY"}
    return None


class SafeFormulaEvaluator(ast.NodeVisitor):
    OPERATORS = {
        ast.Add: lambda a, b: a + b,
        ast.Sub: lambda a, b: a - b,
        ast.Mult: lambda a, b: a * b,
        ast.Div: lambda a, b: a / b,
    }

    def __init__(self, variables: Dict[str, float]):
        self.variables = variables

    def visit_Expression(self, node: ast.Expression) -> float:
        return self.visit(node.body)

    def visit_BinOp(self, node: ast.BinOp) -> float:
        operator = self.OPERATORS.get(type(node.op))
        if not operator:
            raise ValueError("Unsupported formula operator")
        return operator(self.visit(node.left), self.visit(node.right))

    def visit_UnaryOp(self, node: ast.UnaryOp) -> float:
        value = self.visit(node.operand)
        if isinstance(node.op, ast.USub):
            return -value
        if isinstance(node.op, ast.UAdd):
            return value
        raise ValueError("Unsupported unary operator")

    def visit_Name(self, node: ast.Name) -> float:
        if node.id not in self.variables:
            raise ValueError(f"Missing formula variable: {node.id}")
        return self.variables[node.id]

    def visit_Constant(self, node: ast.Constant) -> float:
        if not isinstance(node.value, (int, float)):
            raise ValueError("Formula constants must be numeric")
        return float(node.value)

    def generic_visit(self, node):
        raise ValueError(f"Unsupported formula element: {type(node).__name__}")


def evaluate_formula(expression: str, variables: Dict[str, float]) -> Optional[float]:
    try:
        tree = ast.parse(expression, mode="eval")
        return float(SafeFormulaEvaluator(variables).visit(tree))
    except (ValueError, SyntaxError, ZeroDivisionError, TypeError):
        return None


def _normalise_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def _match_formula_fields(expression: str, input_fields: List[str]) -> Dict[str, List[str]]:
    variables = sorted(set(re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", expression)))
    aliases = {
        "leaving": ["leaving", "left_during"],
        "start_of_year": ["start_of_year"],
        "end_of_year": ["end_of_year"],
        "returned_to_work": ["returned_to_work"],
        "took_parental_leave": ["took_parental_leave", "took_leave"],
        "retained_after_12_months": ["retained_after_12_months"],
    }
    available = {_normalise_name(field): field for field in input_fields}
    matched: Dict[str, List[str]] = {}
    for variable in variables:
        candidates = aliases.get(variable, [variable])
        matches = [original for normalised, original in available.items()
                   if any(candidate in normalised for candidate in candidates)]
        if matches:
            matched[variable] = matches
    return matched


def _formula_value(
    records: List[Dict[str, Any]],
    expression: str,
    input_fields: List[str],
    per_entry: bool,
    period_aggregation: str = "average",
) -> Optional[float]:
    field_map = _match_formula_fields(expression, input_fields)
    if not field_map:
        return None

    if per_entry:
        values = []
        for record in records:
            field_values = record.get("field_values") or {}
            variables = {
                variable: sum(parse_numeric_value(field_values.get(field)) or 0.0 for field in fields)
                for variable, fields in field_map.items()
            }
            result = evaluate_formula(expression, variables)
            if result is not None:
                values.append(result)
        if not values:
            return None
        return sum(values) if period_aggregation == "sum" else sum(values) / len(values)

    variables = {
        variable: sum(
            parse_numeric_value((record.get("field_values") or {}).get(field)) or 0.0
            for record in records
            for field in fields
        )
        for variable, fields in field_map.items()
    }
    return evaluate_formula(expression, variables)


async def _load_kpi_records(kpi: Dict[str, Any], org_id: str, reporting_period: str) -> List[Dict[str, Any]]:
    collection = db[get_collection_for_section(kpi.get("section", "environment"))]
    query: Dict[str, Any] = {
        "$or": [{"org_id": org_id}, {"organization_id": org_id}],
        "is_current": True,
        "status": {"$ne": "draft"},
    }
    query.update(FilterBuilder.build_category_filter(
        kpi.get("category_name"), kpi.get("subcategory"), kpi.get("sub_subcategory")
    ))
    query.update(FilterBuilder.build_filters(kpi.get("filters") or []))
    period_filter = build_reporting_period_filter(reporting_period)
    query = {"$and": [query, period_filter]}
    return await collection.find(query, {
        "_id": 0,
        "id": 1,
        "field_values": 1,
        "reporting_period": 1,
        "created_at": 1,
        "updated_at": 1,
        "version": 1,
    }).to_list(10000)


async def calculate_kpi_contribution(
    kpi: Dict[str, Any], org_id: str, reporting_period: str, mapping_rule: str,
    visited_kpi_ids: Optional[set] = None,
) -> Tuple[Optional[float], List[Dict[str, Any]]]:
    visited = set(visited_kpi_ids or set())
    kpi_id = kpi.get("id")
    if kpi_id and kpi_id in visited:
        return None, []
    if kpi_id:
        visited.add(kpi_id)

    if kpi.get("baseline_mapping_key"):
        result = await calculate_ghg_kpi(
            kpi=kpi,
            org_id=org_id,
            period=_ghg_period(reporting_period),
        )
        value = result.get("value")
        record_count = int(result.get("record_count") or 0)
        source_records = [{
            "id": f"ghg:{kpi.get('baseline_mapping_key')}",
            "_source_count": record_count,
        }] if value is not None else []
        return value, source_records

    source_type = kpi.get("source_type")
    if source_type == "constant":
        value = ((kpi.get("source_config") or {}).get("constant") or {}).get("value")
        return (float(value), [{"id": f"constant:{kpi_id}", "field_values": {"value": value}}]) if value is not None else (None, [])

    if source_type == "composite":
        composite = (kpi.get("source_config") or {}).get("composite") or {}
        source_ids = composite.get("source_kpi_ids") or []
        definitions = await db.esg_kpi_definitions.find(
            {"id": {"$in": source_ids}, "status": {"$ne": "archived"}}, {"_id": 0}
        ).to_list(1000)
        definitions_by_id = {definition["id"]: definition for definition in definitions}
        values = []
        source_records = []
        for source_id in source_ids:
            source_kpi = definitions_by_id.get(source_id)
            if not source_kpi:
                continue
            source_value, records = await calculate_kpi_contribution(
                source_kpi, org_id, reporting_period, mapping_rule, visited
            )
            if source_value is not None:
                values.append(float(source_value))
                source_records.extend(records)
        if not values:
            return None, source_records
        operation = composite.get("operation") or "sum"
        if operation == "average":
            result = sum(values) / len(values)
        elif operation == "ratio_percent":
            result = (values[0] / values[1] * 100) if len(values) >= 2 and values[1] else None
        else:
            result = sum(values)
        return result, source_records

    records = await _load_kpi_records(kpi, org_id, reporting_period)
    if not records:
        return None, []

    aggregation_type = (kpi.get("aggregation_type") or "sum").lower()
    if aggregation_type == "formula" or kpi.get("source_type") == "calculated":
        formula = (kpi.get("formula_config") or {}).get("formula_definition")
        input_fields = ((kpi.get("source_config") or {}).get("calculated") or {}).get("input_fields") or []
        if not formula or not input_fields:
            return None, records
        per_entry = mapping_rule == "average_of_entry_formula" or (
            (kpi.get("metadata") or {}).get("calculation_scope") == "per_record_then_period_aggregate"
            and mapping_rule not in {"ratio_of_period_totals", "formula"}
        )
        period_aggregation = (kpi.get("metadata") or {}).get("period_aggregation") or "average"
        return _formula_value(records, formula, input_fields, per_entry, period_aggregation), records

    target_unit = None
    unit_config = kpi.get("unit_config") or {}
    if unit_config.get("allow_unit_conversion"):
        target_unit = unit_config.get("default_unit")
    result = Aggregator.aggregate(
        records,
        "avg" if aggregation_type in {"avg", "average"} else aggregation_type,
        kpi.get("value_field") or None,
        target_unit,
    )
    return result.get("value"), records


def build_fingerprint(
    mapping: Dict[str, Any], reporting_period: str, contributions: List[Dict[str, Any]]
) -> str:
    payload = {
        "mapping_id": mapping.get("id"),
        "reporting_period": reporting_period,
        "aggregation_rule": mapping.get("aggregation_rule"),
        "formula_definition": mapping.get("formula_definition"),
        "contributions": contributions,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def resolve_answer_path(answer_path: str) -> str:
    parts = [part for part in (answer_path or "").split(".") if part and part != "rows"]
    if not parts:
        raise ValueError("Mapping has no answer path")
    if not any(part in {"current_fy", "previous_fy", "prior_to_previous_fy"} for part in parts):
        parts.append("current_fy")
    if any(not re.fullmatch(r"[A-Za-z0-9_-]+", part) for part in parts):
        raise ValueError("Mapping contains an unsafe answer path")
    return ".".join(parts)