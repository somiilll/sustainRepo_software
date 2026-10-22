import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from shared.database.mongo import db
from shared.unit_registry import can_convert, convert
from modules.kpi_engine.filters import FilterBuilder
from modules.kpi_engine.utils import get_collection_for_section, parse_numeric_value
from .proposal_calculator import build_reporting_period_filter, calculate_kpi_contribution


def previous_reporting_period(reporting_period: str) -> str:
    financial_year = re.fullmatch(r"FY\s*(\d{4})-(\d{4})", reporting_period or "", re.I)
    if financial_year:
        return f"FY {int(financial_year.group(1)) - 1}-{int(financial_year.group(2)) - 1}"
    calendar_year = re.fullmatch(r"CY\s*(\d{4})", reporting_period or "", re.I)
    if calendar_year:
        return f"CY {int(calendar_year.group(1)) - 1}"
    return reporting_period


def _base_answer_path(answer_path: str) -> Optional[str]:
    parts = [part for part in (answer_path or "").split(".") if part and part != "rows"]
    if not parts or any(not re.fullmatch(r"[A-Za-z0-9_-]+", part) for part in parts):
        return None
    return ".".join(parts)


def _period_answer_paths(mapping: Dict[str, Any], base_path: str) -> tuple:
    strategy = mapping.get("period_column_strategy") or "reporting_period_relative"
    if strategy == "response_period_document":
        return base_path, None
    if strategy == "reporting_year_filter":
        logical_columns = {
            "filed": ("cur_filed", "prev_filed"),
            "received": ("cur_received", "prev_received"),
            "pending": ("cur_pending", "prev_pending"),
            "remarks": ("cur_remarks", "prev_remarks"),
            "total": ("cur_total", "prev_total"),
            "hs_no": ("cur_hs_no", "prev_hs_no"),
            "hs_pct": ("cur_hs_pct", "prev_hs_pct"),
            "skill_no": ("cur_skill_no", "prev_skill_no"),
            "skill_pct": ("cur_skill_pct", "prev_skill_pct"),
        }
        parts = base_path.split(".")
        terminal = parts[-1]
        if terminal in logical_columns:
            current_column, previous_column = logical_columns[terminal]
            return ".".join([*parts[:-1], current_column]), ".".join([*parts[:-1], previous_column])
        return f"{base_path}.current_fy", f"{base_path}.previous_fy"
    period_columns = mapping.get("period_columns") or {}
    selected_column = period_columns.get("selected_reporting_year") or "current_fy"
    previous_column = period_columns.get("previous_reporting_year") or "previous_fy"
    parts = base_path.split(".")
    known_current_columns = {
        "current_fy": "previous_fy",
        "cur_filed": "prev_filed",
        "cur_received": "prev_received",
        "cur_pending": "prev_pending",
        "cur_remarks": "prev_remarks",
    }
    terminal = parts[-1]
    if terminal in known_current_columns:
        previous_parts = [*parts[:-1], known_current_columns[terminal]]
        return base_path, ".".join(previous_parts)
    return f"{base_path}.{selected_column}", f"{base_path}.{previous_column}"


def _set_nested(target: Dict[str, Any], path: str, value: Any) -> None:
    current = target
    parts = path.split(".")
    for part in parts[:-1]:
        current = current.setdefault(part, {})
    current[parts[-1]] = value


async def _mapping_value(
    mapping: Dict[str, Any],
    definitions_by_id: Dict[str, Dict[str, Any]],
    org_id: str,
    reporting_period: str,
) -> Optional[Dict[str, Any]]:
    kpi_ids = mapping.get("source_kpi_ids") or [mapping.get("kpi_id")]
    rule = (mapping.get("aggregation_rule") or "sum").lower()
    values: List[float] = []
    source_count = 0
    unit = mapping.get("destination_unit")

    for kpi_id in filter(None, kpi_ids):
        kpi = definitions_by_id.get(kpi_id)
        if not kpi:
            continue
        value, records = await calculate_kpi_contribution(kpi, org_id, reporting_period, rule)
        if value is None or not records:
            continue
        values.append(float(value))
        source_count += len(records)
        unit = unit or (kpi.get("unit_config") or {}).get("default_unit")

    if not values:
        return None
    value = sum(values) / len(values) if rule in {"avg", "average", "average_of_entry_formula"} else sum(values)
    return {"value": round(value, 6), "unit": unit, "source_count": source_count}


def _dynamic_row_key(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40] or "pollutant"
    digest = hashlib.sha1(name.strip().casefold().encode("utf-8")).hexdigest()[:8]
    return f"other_{slug}_{digest}"


async def _table_dimension_values(
    kpi: Dict[str, Any], org_id: str, reporting_period: str
) -> Dict[str, Dict[str, Any]]:
    table = (((kpi.get("source_config") or {}).get("records") or {}).get("table") or {})
    table_field = table.get("field")
    value_column = table.get("value_column")
    unit_column = table.get("unit_column")
    dimension_columns = table.get("dimension_columns") or []
    if not table_field or not value_column or not dimension_columns:
        return {}
    dimension_column = dimension_columns[0]
    query = {
        "$and": [
            {"$or": [{"org_id": org_id}, {"organization_id": org_id}]},
            {"is_current": True, "status": {"$ne": "draft"}},
            FilterBuilder.build_category_filter(kpi.get("category_name"), kpi.get("subcategory"), kpi.get("sub_subcategory")),
            build_reporting_period_filter(reporting_period),
        ]
    }
    collection = db[get_collection_for_section(kpi.get("section", "environment"))]
    records = await collection.find(query, {"_id": 0, f"field_values.{table_field}": 1}).to_list(10000)
    grouped: Dict[str, Dict[str, Any]] = {}
    default_unit = (kpi.get("unit_config") or {}).get("default_unit") or "tonnes"
    for record in records:
        for row in ((record.get("field_values") or {}).get(table_field) or []):
            name = str(row.get(dimension_column) or "").strip()
            value = parse_numeric_value(row.get(value_column))
            unit = str(row.get(unit_column) or default_unit).strip()
            if not name or value is None:
                continue
            key = name.casefold()
            group = grouped.setdefault(key, {"label": name, "entries": [], "source_count": 0})
            group["entries"].append((float(value), unit))
            group["source_count"] += 1

    results: Dict[str, Dict[str, Any]] = {}
    for key, group in grouped.items():
        units = {unit.casefold() for _value, unit in group["entries"]}
        output_unit = group["entries"][0][1] if len(units) == 1 else default_unit
        total = 0.0
        for value, unit in group["entries"]:
            total += convert(value, unit, output_unit) if can_convert(unit, output_unit) else value
        results[key] = {"label": group["label"], "value": round(total, 6), "unit": output_unit,
                        "source_count": group["source_count"]}
    return results


def _align_period_units(current: Optional[Dict[str, Any]], previous: Optional[Dict[str, Any]], default_unit: str) -> tuple:
    if not current or not previous or current.get("unit", "").casefold() == previous.get("unit", "").casefold():
        return current, previous, (current or previous or {}).get("unit")
    aligned_current = dict(current)
    aligned_previous = dict(previous)
    if can_convert(aligned_current["unit"], default_unit):
        aligned_current["value"] = round(convert(aligned_current["value"], aligned_current["unit"], default_unit), 6)
        aligned_current["unit"] = default_unit
    if can_convert(aligned_previous["unit"], default_unit):
        aligned_previous["value"] = round(convert(aligned_previous["value"], aligned_previous["unit"], default_unit), 6)
        aligned_previous["unit"] = default_unit
    return aligned_current, aligned_previous, default_unit


class BRSRLiveKPIAutofillService:
    async def sync(self, org_id: str, reporting_period: str) -> Dict[str, Any]:
        mappings = await db.kpi_framework_mappings.find({
            "framework": "BRSR",
            "is_active": {"$ne": False},
            "mapping_status": "exact_destination",
            "question_key": {"$nin": [None, ""]},
            "answer_path": {"$nin": [None, ""]},
        }, {"_id": 0}).sort([("question_key", 1), ("answer_path", 1)]).to_list(1000)

        kpi_ids = sorted({
            kpi_id
            for mapping in mappings
            for kpi_id in (mapping.get("source_kpi_ids") or [mapping.get("kpi_id")])
            if kpi_id
        })
        definitions = await db.esg_kpi_definitions.find(
            {"id": {"$in": kpi_ids}, "status": {"$ne": "archived"}}, {"_id": 0}
        ).to_list(1000)
        definitions_by_id = {definition["id"]: definition for definition in definitions}
        prior_period = previous_reporting_period(reporting_period)
        now = datetime.now(timezone.utc).isoformat()
        values_by_question: Dict[str, Dict[str, Any]] = {}

        for mapping in mappings:
            base_path = _base_answer_path(mapping.get("answer_path"))
            if not base_path:
                continue
            question_key = mapping["question_key"]
            question_result = values_by_question.setdefault(question_key, {
                "value": {},
                "locked_paths": [],
                "sources": [],
                "dynamic_rows": [],
                "has_dynamic_mapping": False,
            })
            mapping_kpi_ids = mapping.get("source_kpi_ids") or [mapping.get("kpi_id")]
            table_kpi = next((definitions_by_id.get(kpi_id) for kpi_id in mapping_kpi_ids
                              if definitions_by_id.get(kpi_id) and
                              (((definitions_by_id[kpi_id].get("source_config") or {}).get("records") or {}).get("table"))), None)
            if mapping.get("dynamic_rows") and table_kpi:
                question_result["has_dynamic_mapping"] = True
                current_rows = await _table_dimension_values(table_kpi, org_id, reporting_period)
                previous_rows = await _table_dimension_values(table_kpi, org_id, prior_period)
                default_unit = (table_kpi.get("unit_config") or {}).get("default_unit") or "tonnes"
                for dimension_key in sorted(set(current_rows) | set(previous_rows)):
                    current_row, previous_row, unit = _align_period_units(
                        current_rows.get(dimension_key), previous_rows.get(dimension_key), default_unit
                    )
                    label = (current_row or previous_row)["label"]
                    row_key = _dynamic_row_key(label)
                    question_result["dynamic_rows"].append({"key": row_key, "label": label})
                    for column, cell_value in (
                        ("unit", unit),
                        ("current_fy", (current_row or {}).get("value")),
                        ("previous_fy", (previous_row or {}).get("value")),
                    ):
                        path = f"{row_key}.{column}"
                        question_result["locked_paths"].append(path)
                        _set_nested(question_result["value"], path, cell_value)
                    question_result["sources"].append({
                        "mapping_id": mapping.get("id"), "source_tag": mapping.get("source_tag"),
                        "answer_path": row_key, "dimension_value": label,
                        "current_source_count": (current_row or {}).get("source_count", 0),
                        "previous_source_count": (previous_row or {}).get("source_count", 0),
                    })
                if not question_result["dynamic_rows"]:
                    for column in ("unit", "current_fy", "previous_fy"):
                        path = f"{base_path}.{column}"
                        question_result["locked_paths"].append(path)
                        _set_nested(question_result["value"], path, None)
                continue
            current = await _mapping_value(mapping, definitions_by_id, org_id, reporting_period)
            previous = await _mapping_value(mapping, definitions_by_id, org_id, prior_period)
            current_path, previous_path = _period_answer_paths(mapping, base_path)
            direct_root = current_path == "value" and mapping.get("period_column_strategy") == "response_period_document"
            if direct_root:
                question_result["value"] = current["value"] if current else None
                question_result["locked_paths"].append("$")
            else:
                question_result["locked_paths"].append(current_path)
                _set_nested(question_result["value"], current_path, current["value"] if current else None)
                if previous_path:
                    question_result["locked_paths"].append(previous_path)
                    _set_nested(question_result["value"], previous_path, previous["value"] if previous else None)
                unit = (current or previous or {}).get("unit")
                unit_path = f"{base_path}.unit"
                if mapping.get("question_key") == "p6_air_emissions" and unit and unit_path not in {current_path, previous_path}:
                    question_result["locked_paths"].append(unit_path)
                    _set_nested(question_result["value"], unit_path, unit)
            question_result["sources"].append({
                "mapping_id": mapping.get("id"),
                "source_tag": mapping.get("source_tag"),
                "answer_path": base_path,
                "current_source_count": (current or {}).get("source_count", 0),
                "previous_source_count": (previous or {}).get("source_count", 0),
            })

        for question_key, result in values_by_question.items():
            config = await db.esg_question_configs.find_one(
                {"question_key": question_key}, {"_id": 0, "section": 1}
            ) or {}
            existing_response = await db.organization_esg_responses.find_one(
                {"org_id": org_id, "question_key": question_key, "reporting_year": reporting_period},
                {"_id": 0, "kpi_autofill_dynamic_rows": 1},
            ) or {}
            current_dynamic_keys = {row["key"] for row in result.get("dynamic_rows") or []}
            previous_dynamic_keys = set(existing_response.get("kpi_autofill_dynamic_rows") or [])
            set_fields: Dict[str, Any] = {
                "framework": "BRSR",
                "section": config.get("section") or "section_c",
                "status": "saved",
                "updated_at": now,
                "kpi_autofill_updated_at": now,
                "kpi_autofill_dynamic_rows": sorted(current_dynamic_keys),
            }
            unset_fields: Dict[str, str] = {}
            for stale_key in previous_dynamic_keys - current_dynamic_keys:
                unset_fields[f"value.{stale_key}"] = ""
            if result.get("has_dynamic_mapping"):
                unset_fields["value.others"] = ""
            for path in result["locked_paths"]:
                if path == "$":
                    set_fields["value"] = result["value"]
                    continue
                current: Any = result["value"]
                for part in path.split("."):
                    current = current.get(part) if isinstance(current, dict) else None
                db_path = f"value.{path}"
                if current is None:
                    unset_fields[db_path] = ""
                else:
                    set_fields[db_path] = current

            update: Dict[str, Any] = {
                "$set": set_fields,
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "organization_id": org_id,
                    "question_key": question_key,
                    "reporting_year": reporting_period,
                    "created_at": now,
                },
            }
            if unset_fields:
                update["$unset"] = unset_fields
            await db.organization_esg_responses.update_one(
                {"org_id": org_id, "question_key": question_key, "reporting_year": reporting_period},
                update,
                upsert=True,
            )
            result["locked_paths"] = sorted(set(result["locked_paths"]))

        return {
            "reporting_period": reporting_period,
            "previous_reporting_period": prior_period,
            "values_by_question": values_by_question,
            "synced_at": now,
        }


brsr_live_kpi_autofill_service = BRSRLiveKPIAutofillService()