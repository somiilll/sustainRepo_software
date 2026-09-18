"""Organization-aware spreadsheet template for OCR ledger extraction."""
from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


LEDGER_HEADERS = [
    "Facility",
    "Reporting Period",
    "Invoice Number",
    "Vendor Name",
    "Item Description",
    "Cost",
    "Currency",
    "Quantity",
    "Units",
    "Distance Travelled",
    "No. of Passengers Travelled",
    "Number of Rooms",
    "Number of Nights",
    "From Location",
    "To Location",
    "Notes",
]

OPTIONAL_HEADERS = {"Invoice Number", "Vendor Name", "From Location", "To Location", "Notes"}
HEADER_COMMENTS = {
    "Facility": "Select the facility where this activity occurred.",
    "Number of Rooms": "Required only when the activity includes a hotel stay.",
    "Number of Nights": "Required only when the activity includes a hotel stay.",
}
REQUIRED_HEADER_FILL = "065F46"
OPTIONAL_HEADER_FILL = "DBEAFE"
OPTIONAL_HEADER_TEXT = "0C4A6E"
GRID_BORDER = Border(
    left=Side(style="thin", color="CBD5E1"),
    right=Side(style="thin", color="CBD5E1"),
    top=Side(style="thin", color="CBD5E1"),
    bottom=Side(style="thin", color="CBD5E1"),
)


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
    for column, header in enumerate(LEDGER_HEADERS, start=1):
        cell = ledger.cell(row=4, column=column, value=header)
        is_optional = header in OPTIONAL_HEADERS
        cell.font = Font(bold=True, color=OPTIONAL_HEADER_TEXT if is_optional else "FFFFFF")
        cell.fill = PatternFill("solid", fgColor=OPTIONAL_HEADER_FILL if is_optional else REQUIRED_HEADER_FILL)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = GRID_BORDER
        if header in HEADER_COMMENTS:
            cell.comment = Comment(HEADER_COMMENTS[header], "SustainRepo")
    ledger.freeze_panes = "A5"
    ledger.auto_filter.ref = f"A4:{get_column_letter(len(LEDGER_HEADERS))}4"

    widths = [24, 20, 20, 24, 42, 16, 12, 14, 14, 18, 22, 18, 18, 22, 22, 36]
    for index, width in enumerate(widths, start=1):
        ledger.column_dimensions[get_column_letter(index)].width = width

    for row in range(5, 505):
        for column in range(1, len(LEDGER_HEADERS) + 1):
            cell = ledger.cell(row=row, column=column)
            cell.border = GRID_BORDER
            cell.alignment = Alignment(vertical="top", wrap_text=True)

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
    currency_column = get_column_letter(LEDGER_HEADERS.index("Currency") + 1)
    currency_validation.add(f"{currency_column}5:{currency_column}504")

    instructions = workbook.create_sheet("Instructions")
    instructions.sheet_view.showGridLines = False
    instructions.merge_cells("A1:D1")
    instructions["A1"] = "OCR Activity Template Guide"
    instructions["A1"].font = Font(bold=True, size=14, color="FFFFFF")
    instructions["A1"].fill = PatternFill("solid", fgColor="047857")
    instructions["A1"].alignment = Alignment(vertical="center")

    instructions["A3"] = "Header colours"
    instructions["A3"].font = Font(bold=True, color="FFFFFF")
    instructions["A3"].fill = PatternFill("solid", fgColor=REQUIRED_HEADER_FILL)
    instructions["B3"] = "Required field"
    instructions["B3"].fill = PatternFill("solid", fgColor=REQUIRED_HEADER_FILL)
    instructions["B3"].font = Font(color="FFFFFF")
    instructions["C3"] = "Optional field"
    instructions["C3"].fill = PatternFill("solid", fgColor=OPTIONAL_HEADER_FILL)
    instructions["C3"].font = Font(color=OPTIONAL_HEADER_TEXT)

    instruction_rows = [
        ("How to use", "Enter one purchased activity or invoice line per row in the OCR Ledger sheet. Do not rename the column headers."),
        ("Facility", "Required. Select the organization facility where the activity occurred."),
        ("Reporting Period", "Required. Use a month and year (for example, April 2026) or a financial year (for example, FY 2025-26)."),
        ("Invoice Number", "Optional. Add the invoice, bill, or internal reference number when available."),
        ("Vendor Name", "Optional. Add the supplier, vendor, service provider, or travel provider when available."),
        ("Item Description", "Required. Describe the purchased item, fuel, transport, travel, or service clearly so OCR can classify it."),
        ("Cost", "Enter the spend amount for spend-based activities."),
        ("Currency", "Enter the currency that matches Cost, such as INR, USD, EUR, or GBP."),
        ("Quantity", "Use for fuel consumption, goods purchased, goods transported, waste, water, or any other measurable activity."),
        ("Units", "Enter the matching unit for Quantity, for example L, kg, tonnes, kWh, m3, or km."),
        ("Distance Travelled", "Use for passenger travel or goods transport. Enter the travelled distance in km."),
        ("Passengers", "Use No. of Passengers Travelled for passenger travel when applicable."),
        ("Hotel stays", "Number of Rooms and Number of Nights are required only when the activity includes a hotel stay."),
        ("From and To Location", "Optional. Enter the departure and arrival locations for travel or transport when known."),
        ("Notes", "Optional. Add context that will help classify the activity."),
        ("Optional header colour", "Light-blue headers identify optional fields: Invoice Number, Vendor Name, From Location, To Location, and Notes."),
    ]
    for row, (topic, guidance) in enumerate(instruction_rows, start=5):
        instructions.cell(row=row, column=1, value=topic).font = Font(bold=True, color="0F172A")
        instructions.cell(row=row, column=2, value=guidance).alignment = Alignment(wrap_text=True, vertical="top")
        for column in range(1, 5):
            instructions.cell(row=row, column=column).border = GRID_BORDER

    instructions.column_dimensions["A"].width = 24
    instructions.column_dimensions["B"].width = 112
    instructions.column_dimensions["C"].width = 22
    instructions.column_dimensions["D"].width = 18
    instructions.row_dimensions[1].height = 26

    ledger.row_dimensions[1].height = 26
    ledger.row_dimensions[4].height = 32
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output