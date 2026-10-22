import io
import hashlib
import re
from typing import Any, Dict, List, Optional

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from shared.database.mongo import db


HEADERS = [
    "KPI Name",
    "KPI Code",
    "Section",
    "Category",
    "Subcategory",
    "BRSR Reference",
    "BRSR Question Key",
    "Answer Path",
    "Aggregation Rule",
    "Formula Definition",
    "Imported From",
    "Mapping Status",
    "Needs Your Response",
    "Response Needed For",
]


def logical_answer_path(path: Optional[str]) -> Optional[str]:
    if not path:
        return path
    period_segments = {"current_fy", "previous_fy", "prior_to_previous_fy"}
    logical_columns = {
        "cur_filed": "filed", "prev_filed": "filed",
        "cur_received": "received", "prev_received": "received",
        "cur_pending": "pending", "prev_pending": "pending",
        "cur_remarks": "remarks", "prev_remarks": "remarks",
    }
    parts = [part for part in str(path).split(".") if part not in period_segments]
    if parts and parts[-1] in logical_columns:
        parts[-1] = logical_columns[parts[-1]]
    return ".".join(parts)


def _has_brsr_reference(kpi: Dict[str, Any]) -> bool:
    if kpi.get("brsr_reference"):
        return True
    return any(
        str(reference.get("framework", "")).upper() == "BRSR"
        for reference in (kpi.get("framework_references") or [])
        if isinstance(reference, dict)
    )


def _review_reason(mapping: Dict[str, Any]) -> str:
    missing = []
    if not mapping:
        return "No BRSR mapping record"
    if not mapping.get("question_key"):
        missing.append("question key")
    if not mapping.get("answer_path"):
        missing.append("answer path")
    if mapping.get("mapping_status") != "exact_destination" and not missing:
        missing.append("exact destination confirmation")
    return ", ".join(missing)


def _question_answer_paths(config: Dict[str, Any], mapped_paths: List[str]) -> List[str]:
    paths = {logical_answer_path(path) for path in [*mapped_paths, *(config.get("answer_paths") or [])] if path}
    config_body = config.get("config") or {}
    table_config = config.get("table_config") or config_body
    question_type = config.get("type") or ""

    def safe_key(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", str(value).lower()).strip("_")

    columns = table_config.get("columns") or []
    fixed_rows = table_config.get("fixed_rows") or table_config.get("rows") or []
    for row in fixed_rows:
        if not isinstance(row, dict):
            continue
        row_id = row.get("key") or row.get("location_type") or row.get("category") or row.get("label")
        if not row_id:
            continue
        row_path = f"rows.{safe_key(row_id)}"
        paths.add(row_path)
        for column in columns:
            if isinstance(column, dict) and column.get("key"):
                paths.add(f"{row_path}.{column['key']}")

    if question_type == "dynamic_table":
        for column in config_body.get("columns") or columns:
            if isinstance(column, dict) and column.get("key"):
                paths.add(f"rows[].{column['key']}")
    elif question_type in {"address", "contact"}:
        for field in config_body.get("fields") or []:
            paths.add(field if isinstance(field, str) else field.get("key"))
    elif question_type == "composite":
        for sub_field in config_body.get("sub_fields") or []:
            sub_key = sub_field.get("key")
            if not sub_key:
                continue
            if sub_field.get("type") == "dynamic_table":
                for column in sub_field.get("columns") or []:
                    if column.get("key"):
                        paths.add(f"{sub_key}[].{column['key']}")
            else:
                paths.add(sub_key)
    elif question_type == "employees_workers_matrix":
        for category in config_body.get("categories") or []:
            for subcategory in category.get("sub_categories") or []:
                base = f"{category['key']}.{subcategory['key']}"
                paths.update({f"{base}.total", f"{base}.male", f"{base}.male_percentage",
                              f"{base}.female", f"{base}.female_percentage"})
    elif question_type == "turnover_rate_matrix":
        for year in ("current_fy", "previous_fy", "prior_to_previous_fy"):
            for row in config_body.get("rows") or []:
                for column in config_body.get("columns_per_year") or []:
                    paths.add(f"{year}.{row['key']}.{column}")
    elif question_type == "csr_details":
        for field in config_body.get("fields") or []:
            if field.get("key"):
                paths.add(field["key"])
    elif question_type == "complaints_grievances_matrix":
        for category in config_body.get("stakeholder_categories") or []:
            base = f"rows.{safe_key(category)}"
            paths.update({f"{base}.has_mechanism", f"{base}.policy_weblink"})
            for period in ("current_fy", "previous_fy"):
                paths.update({f"{base}.{period}.filed", f"{base}.{period}.pending", f"{base}.{period}.remarks"})
    elif question_type == "ngrbc_policy_matrix":
        paths.update({"all_together.covered", "all_together.board_approved", "all_together.web_link"})
        for reason in ("not_material", "not_ready", "no_resources", "planned_next_fy", "other"):
            paths.add(f"all_together.reasons.{reason}")
        for principle in (f"P{index}" for index in range(1, 10)):
            paths.update({f"principle_wise.{principle}.covered", f"principle_wise.{principle}.board_approved",
                          f"principle_wise.{principle}.web_link"})
            for reason in ("not_material", "not_ready", "no_resources", "planned_next_fy", "other"):
                paths.add(f"principle_wise.{principle}.reasons.{reason}")
    elif question_type == "principle_toggle_with_description":
        paths.update({"all_enabled", "all_description"})
        for principle in (f"P{index}" for index in range(1, 10)):
            paths.update({f"principles.{principle}.enabled", f"principles.{principle}.description"})
    elif question_type == "principle_text":
        paths.add("all_text")
        for principle in (f"P{index}" for index in range(1, 10)):
            paths.add(f"principles.{principle}")
    elif question_type == "principle_mode_table":
        fields = ((config.get("field_config") or {}).get("fields") or [])
        for field in fields:
            paths.add(f"combined.{field['key']}")
            for principle in (f"P{index}" for index in range(1, 10)):
                paths.add(f"principles.{principle}.{field['key']}")
    elif question_type == "conditional_yes_no_table":
        paths.add("answer")
        for column in table_config.get("columns") or []:
            key = column if isinstance(column, str) else column.get("key")
            if key:
                paths.add(f"rows[].{key}")
    elif question_type in {"text", "number", "email", "url", "radio", "currency", "textarea"}:
        paths.add("value")
    if not paths:
        paths.add("value")
    return sorted({logical_answer_path(path) for path in paths if path})


def _range_name(question_key: str) -> str:
    digest = hashlib.sha1(question_key.encode("utf-8")).hexdigest()[:12]
    return f"BRSR_Answers_{digest}"


def _add_mapping_dropdowns(workbook: Workbook, sheet, last_row: int) -> None:
    if last_row < 2:
        return
    question_validation = DataValidation(
        type="list",
        formula1="=BRSR_Question_Keys",
        allow_blank=True,
        errorStyle="stop",
        errorTitle="Invalid BRSR question",
        error="Choose a BRSR Question Key from the dropdown.",
        promptTitle="BRSR Question Key",
        prompt="Select a configured BRSR question.",
        showInputMessage=True,
        showErrorMessage=True,
    )
    answer_validation = DataValidation(
        type="list",
        formula1='=INDIRECT(IFERROR(VLOOKUP($G2,\'BRSR Options\'!$A:$C,3,FALSE),"BRSR_No_Options"))',
        allow_blank=True,
        errorStyle="stop",
        errorTitle="Invalid answer path",
        error="Choose an Answer Path available for the selected BRSR Question Key.",
        promptTitle="BRSR Answer Path",
        prompt="Select the question first, then choose its answer path.",
        showInputMessage=True,
        showErrorMessage=True,
    )
    sheet.add_data_validation(question_validation)
    sheet.add_data_validation(answer_validation)
    question_validation.add(f"G2:G{last_row}")
    answer_validation.add(f"H2:H{last_row}")


async def build_kpi_brsr_mapping_excel() -> bytes:
    kpis = await db.esg_kpi_definitions.find(
        {"status": {"$ne": "archived"}},
        {
            "_id": 0,
            "id": 1,
            "metric_name": 1,
            "metric_code": 1,
            "section": 1,
            "category_name": 1,
            "subcategory": 1,
            "brsr_reference": 1,
            "framework_references": 1,
        },
    ).sort([("section", 1), ("category_name", 1), ("subcategory", 1), ("metric_name", 1)]).to_list(10000)
    kpis = [kpi for kpi in kpis if _has_brsr_reference(kpi)]

    mappings = await db.kpi_framework_mappings.find(
        {"framework": "BRSR", "is_active": {"$ne": False}}, {"_id": 0}
    ).to_list(10000)
    mapped_paths_by_question: Dict[str, List[str]] = {}
    for mapping in mappings:
        if mapping.get("question_key") and mapping.get("answer_path"):
            mapped_paths_by_question.setdefault(mapping["question_key"], []).append(mapping["answer_path"])

    question_configs = await db.esg_question_configs.find(
        {"hidden": {"$ne": True}, "$or": [{"frameworks": "BRSR"}, {"question_key": {"$regex": "^p[0-9]+_", "$options": "i"}}]},
        {"_id": 0, "question_key": 1, "question": 1, "type": 1, "config": 1, "table_config": 1,
         "field_config": 1, "answer_paths": 1, "order": 1},
    ).sort([("question_key", 1)]).to_list(10000)
    question_options = []
    for config in question_configs:
        question_key = config.get("question_key")
        if not question_key:
            continue
        question_options.append({
            "question_key": question_key,
            "question": config.get("question") or question_key,
            "answer_paths": _question_answer_paths(config, mapped_paths_by_question.get(question_key, [])),
            "range_name": _range_name(question_key),
        })
    mapping_by_kpi: Dict[str, List[Dict[str, Any]]] = {}
    for mapping in mappings:
        source_ids = mapping.get("source_kpi_ids") or [mapping.get("kpi_id")]
        for kpi_id in source_ids:
            if kpi_id:
                mapping_by_kpi.setdefault(kpi_id, []).append(mapping)

    rows = []
    review_rows = []
    for kpi in kpis:
        kpi_mappings = mapping_by_kpi.get(kpi["id"]) or [{}]
        for mapping in kpi_mappings:
            reason = _review_reason(mapping)
            needs_response = bool(reason)
            row = [
                kpi.get("metric_name"),
                kpi.get("metric_code"),
                kpi.get("section"),
                kpi.get("category_name"),
                kpi.get("subcategory"),
                mapping.get("reference") or kpi.get("brsr_reference"),
                mapping.get("question_key"),
                mapping.get("answer_path"),
                mapping.get("aggregation_rule"),
                mapping.get("formula_definition"),
                mapping.get("source_tag") or " → ".join(filter(None, [kpi.get("category_name"), kpi.get("subcategory")])),
                mapping.get("mapping_status") or "unmapped",
                "YES" if needs_response else "NO",
                reason,
            ]
            rows.append(row)
            if needs_response:
                review_rows.append(row)

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "BRSR KPI Mappings"
    review_sheet = workbook.create_sheet("Needs Your Response")
    options_sheet = workbook.create_sheet("BRSR Options")

    options_sheet.append(["BRSR Question Key", "Question", "Answer Path Range"])
    for row_number, option in enumerate(question_options, start=2):
        options_sheet.cell(row_number, 1, option["question_key"])
        options_sheet.cell(row_number, 2, option["question"])
        options_sheet.cell(row_number, 3, option["range_name"])
        answer_column = 3 + row_number - 1
        options_sheet.cell(1, answer_column, option["question_key"])
        for answer_row, answer_path in enumerate(option["answer_paths"], start=2):
            options_sheet.cell(answer_row, answer_column, answer_path)
        column_letter = get_column_letter(answer_column)
        workbook.defined_names.add(DefinedName(
            option["range_name"],
            attr_text=f"'BRSR Options'!${column_letter}$2:${column_letter}${len(option['answer_paths']) + 1}",
        ))

    question_last_row = max(2, len(question_options) + 1)
    workbook.defined_names.add(DefinedName(
        "BRSR_Question_Keys",
        attr_text=f"'BRSR Options'!$A$2:$A${question_last_row}",
    ))
    no_options_row = question_last_row + 2
    options_sheet.cell(no_options_row, 1, "")
    workbook.defined_names.add(DefinedName(
        "BRSR_No_Options",
        attr_text=f"'BRSR Options'!$A${no_options_row}",
    ))

    header_fill = PatternFill("solid", fgColor="14532D")
    review_fill = PatternFill("solid", fgColor="FEF3C7")
    exact_fill = PatternFill("solid", fgColor="DCFCE7")
    thin_border = Border(bottom=Side(style="thin", color="D6D3D1"))

    for sheet, data_rows in ((worksheet, rows), (review_sheet, review_rows)):
        sheet.append(HEADERS)
        for cell in sheet[1]:
            cell.fill = header_fill
            cell.font = Font(color="FFFFFF", bold=True)
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = f"A1:N{max(1, len(data_rows) + 1)}"

        for row_index, row in enumerate(data_rows, start=2):
            sheet.append(row)
            for cell in sheet[row_index]:
                cell.border = thin_border
                cell.alignment = Alignment(vertical="top", wrap_text=True)
            if row[12] == "YES":
                for cell in sheet[row_index]:
                    cell.fill = review_fill
                sheet.cell(row_index, 13).font = Font(color="92400E", bold=True)
            else:
                sheet.cell(row_index, 12).fill = exact_fill
                sheet.cell(row_index, 13).fill = exact_fill
                sheet.cell(row_index, 13).font = Font(color="166534", bold=True)

        widths = [34, 22, 14, 24, 28, 18, 24, 30, 20, 40, 34, 24, 20, 34]
        for column_index, width in enumerate(widths, start=1):
            sheet.column_dimensions[get_column_letter(column_index)].width = width
        sheet.row_dimensions[1].height = 34
        sheet["G1"].comment = Comment(
            "Choose from configured BRSR questions. One KPI may appear on multiple mapping rows and point to multiple questions.",
            "SustainRepo",
        )
        sheet["H1"].comment = Comment(
            "This dropdown changes based on the selected BRSR Question Key.",
            "SustainRepo",
        )
        _add_mapping_dropdowns(workbook, sheet, len(data_rows) + 1)

    summary = workbook.create_sheet("Summary", 0)
    summary.append(["BRSR KPI Mapping Review", "Count"])
    summary.append(["KPI mapping rows", len(rows)])
    summary.append(["Ready / exact destination", len(rows) - len(review_rows)])
    summary.append(["Needs your response", len(review_rows)])
    summary.append(["Review rule", "Rows need your response when question key, answer path, or exact destination confirmation is missing."])
    summary.append(["Question Key options", "Use the dropdown in BRSR Question Key. Options come from the configured BRSR questionnaire catalogue."])
    summary.append(["Answer Path options", "Select a Question Key first; the Answer Path dropdown then shows only that question's configured paths."])
    summary.append(["Multiple destinations", "One KPI can map to multiple destinations by using multiple mapping rows. This workbook contains current rows only, as selected."])
    summary.append(["Reporting year rule", "Mappings are reporting-year neutral. The same KPI and Answer Path are reused; Current FY and Previous FY values are selected at runtime by filtering KPI source records by reporting year."])
    summary.append(["Persistence", "Workbook selections remain in the downloaded file; they are not applied to the application until an import workflow is implemented."])
    summary.column_dimensions["A"].width = 32
    summary.column_dimensions["B"].width = 95
    for cell in summary[1]:
        cell.fill = header_fill
        cell.font = Font(color="FFFFFF", bold=True)
    summary.freeze_panes = "A2"
    options_sheet.sheet_state = "hidden"

    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()