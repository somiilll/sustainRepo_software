"""Organization-aware spreadsheet template for OCR ledger extraction."""
from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation


LEDGER_HEADERS = [
    "Facility",
    "Reporting Period",
    "Invoice Number",
    "Invoice Date",
    "Vendor Name",
    "Item Description",
    "Quantity",
    "Unit",
    "Total Cost",
    "Currency",
    "Distance (km)",
    "Origin",
    "Destination",
    "Notes",
]


async def generate_ocr_template(database, organization_id: str) -> BytesIO:
    """Build an OCR-ready ledger with the organization's active facilities."""
    organization = await database.organizations.find_one(
        {"id": organization_id},
        {"_id": 0, "name": 1},
    ) or {}
    facilities = await database.facilities.find(
        {
            "organization_id": organization_id,
            "is_deleted": {"$ne": True},
            "is_active": {"$ne": False},
        },
        {"_id": 0, "name": 1},
    ).sort("name", 1).to_list(1000)
    facility_names = [str(facility["name"]).strip() for facility in facilities if facility.get("name")]

    workbook = Workbook()
    ledger = workbook.active
    ledger.title = "OCR Ledger"
    ledger.sheet_view.showGridLines = False
    ledger["A1"] = f"OCR Activity Ledger — {organization.get('name') or 'Organization'}"
    ledger["A1"].font = Font(bold=True, size=14, color="FFFFFF")
    ledger["A1"].fill = PatternFill("solid", fgColor="047857")
    ledger.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(LEDGER_HEADERS))
    ledger["A2"] = "Add one purchased activity or invoice line per row, then upload this workbook to OCR Activity Extraction."
    ledger["A2"].font = Font(italic=True, color="475569")
    ledger.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(LEDGER_HEADERS))

    for column, header in enumerate(LEDGER_HEADERS, start=1):
        cell = ledger.cell(row=4, column=column, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0F172A")
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    ledger.freeze_panes = "A5"
    ledger.auto_filter.ref = f"A4:{chr(64 + len(LEDGER_HEADERS))}4"

    widths = [24, 20, 20, 16, 24, 42, 14, 12, 16, 12, 16, 22, 22, 36]
    for index, width in enumerate(widths, start=1):
        ledger.column_dimensions[chr(64 + index)].width = width

    for row in range(5, 505):
        ledger.cell(row=row, column=1).comment = Comment("Choose the facility where this activity occurred.", "SustainRepo")

    lookups = workbook.create_sheet("Lookup values")
    lookups.sheet_state = "hidden"
    for row, facility_name in enumerate(facility_names, start=1):
        lookups.cell(row=row, column=1, value=facility_name)
    for row, currency in enumerate(["INR", "USD", "EUR", "GBP"], start=1):
        lookups.cell(row=row, column=2, value=currency)

    if facility_names:
        facility_validation = DataValidation(
            type="list",
            formula1=f"'Lookup values'!$A$1:$A${len(facility_names)}",
            allow_blank=True,
        )
        facility_validation.error = "Choose a facility from your organization list."
        facility_validation.errorTitle = "Unknown facility"
        ledger.add_data_validation(facility_validation)
        facility_validation.add("A5:A504")

    currency_validation = DataValidation(
        type="list",
        formula1="'Lookup values'!$B$1:$B$4",
        allow_blank=True,
    )
    ledger.add_data_validation(currency_validation)
    currency_validation.add("J5:J504")

    ledger.row_dimensions[1].height = 26
    ledger.row_dimensions[4].height = 32
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output