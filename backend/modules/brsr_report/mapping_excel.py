import io
from typing import Any, Dict, List

from openpyxl import Workbook
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
        {"framework": "BRSR"}, {"_id": 0}
    ).to_list(10000)
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

    summary = workbook.create_sheet("Summary", 0)
    summary.append(["BRSR KPI Mapping Review", "Count"])
    summary.append(["KPI mapping rows", len(rows)])
    summary.append(["Ready / exact destination", len(rows) - len(review_rows)])
    summary.append(["Needs your response", len(review_rows)])
    summary.append(["Review rule", "Rows need your response when question key, answer path, or exact destination confirmation is missing."])
    summary.column_dimensions["A"].width = 32
    summary.column_dimensions["B"].width = 95
    for cell in summary[1]:
        cell.fill = header_fill
        cell.font = Font(color="FFFFFF", bold=True)
    summary.freeze_panes = "A2"

    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()