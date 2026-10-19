"""OCR activity template matching the approved workbook layout."""
from __future__ import annotations

from io import BytesIO

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Color, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


LEDGER_HEADERS = [
    "Facility", "Reporting Period", "Invoice Number", "Vendor Name", "Item Description",
    "Cost", "Quantity", "Units", "Distance Travelled", "No. of Passengers Travelled",
    "Number of Rooms", "Number of Nights", "From Location", "To Location", "Notes",
]
HEADER_COMMENTS = {
    "A2": "Select the facility where this activity occurred.",
    "B2": "For which specific Month or Financial Year the entry is made for",
    "E2": "The Purpose of this entry in the organization boundary (Ex: Freight transport by Sea, Business Travel by Air, Raw material of a process)",
    "F2": "Wherever Available\n",
    "K2": "Required only when the activity includes a hotel stay.",
    "L2": "\n",
}
GUIDE_ROWS = [
    ("How to use", "Enter one purchased activity or invoice line item per row in the OCR Ledger sheet. Do not rename the column headers."),
    ("Facility", "Select the organization facility where the activity occurred."),
    ("Reporting Period", "Use a month or a Financial year (for example, April 2026, FY 2025-26)."),
    ("Invoice Number", "The invoice, bill, or internal reference number."),
    ("Vendor Name", "The supplier or vendor or service provider or travel provider name when available."),
    ("Item Description", "Describe the exact purchased item, fuel, transport, travel, service etc.,"),
    ("Cost", "Enter the spent amount for a purchased activity or invoice line item in rupees."),
    ("Quantity", "Use for fuel consumption, goods purchased, goods transported, waste, water, or any other measurable activity."),
    ("Units", "Enter the matching unit for Quantity (for example L, kg, tonnes, kWh, m3)"),
    ("Distance Travelled", "Use for passenger travel or goods transport. Enter the travelled distance in km."),
    ("Passengers", "Use No. of Passengers Travelled for passenger travel when applicable (For exapmle: Business travel)"),
    ("Hotel stays", "Number of Rooms and Number of Nights are required only when the activity includes a hotel stay."),
    ("From and To Location", "Enter the departure and arrival locations for travel or transport."),
    ("Notes", "Add additional info that can help classify an activity."),
]
LOOKUP_CURRENCIES = ["INR", "USD", "EUR", "GBP"]

THIN_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"), top=Side(style="thin"), bottom=Side(style="thin"),
)
TITLE_FILL = PatternFill("solid", fgColor=Color(theme=3, tint=-0.249977111117893))
REQUIRED_FILL = PatternFill("solid", fgColor="065F46")
OPTIONAL_FILL = PatternFill("solid", fgColor=Color(theme=0, tint=-0.14999847407452621))
CONDITIONAL_FILL = PatternFill("solid", fgColor=Color(theme=5))


def _ledger_header_style(cell, fill, font_color="FFFFFF"):
    cell.font = Font(name="Calibri", size=11, bold=True, color=font_color)
    cell.fill = fill
    cell.border = THIN_BORDER
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


async def generate_ocr_template(database, organization_id: str) -> BytesIO:
    """Build the approved OCR Activity Ledger workbook with active facilities."""
    organization = await database.organizations.find_one(
        {"id": organization_id}, {"_id": 0, "name": 1},
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
    instructions = workbook.active
    instructions.title = "Instructions"
    instructions.sheet_view.showGridLines = False
    instructions.merge_cells("A1:D1")
    instructions["A1"] = "OCR Activity Template Guide"
    instructions["A1"].font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    instructions["A1"].fill = TITLE_FILL
    instructions["A1"].alignment = Alignment(horizontal="center", vertical="center")
    instructions.row_dimensions[1].height = 26.1
    for column, width in {"A": 24, "B": 112, "C": 22, "D": 18}.items():
        instructions.column_dimensions[column].width = width

    instructions["A3"] = "Header colours"
    instructions["A3"].font = Font(name="Calibri", size=11, bold=True)
    for cell_ref, label, fill, text_color in [
        ("A4", "Mandatory field", REQUIRED_FILL, "FFFFFF"),
        ("A5", "Optional field", OPTIONAL_FILL, "0C4A6E"),
        ("A6", "Required field if the entry is related to travel or transport", CONDITIONAL_FILL, "FFFFFF"),
    ]:
        cell = instructions[cell_ref]
        cell.fill = fill
        cell.font = Font(name="Calibri", size=11, bold=True, color=text_color)
        cell.border = THIN_BORDER if cell_ref != "A4" else Border()
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        instructions.cell(row=cell.row, column=2, value=label)

    instructions["A8"] = "Guide:"
    instructions["A8"].font = Font(name="Calibri", size=11, bold=True)
    for row, (label, guidance) in enumerate(GUIDE_ROWS, start=9):
        label_cell = instructions.cell(row=row, column=1, value=label)
        label_cell.font = Font(name="Calibri", size=11, color="0F172A")
        label_cell.border = THIN_BORDER
        label_cell.alignment = Alignment(horizontal="center")
        guidance_cell = instructions.cell(row=row, column=2, value=guidance)
        guidance_cell.font = Font(name="Calibri", size=11)
        guidance_cell.border = THIN_BORDER
        guidance_cell.alignment = Alignment(vertical="top", wrap_text=True)
        for column in range(3, 6):
            instructions.cell(row=row, column=column).border = THIN_BORDER

    ledger = workbook.create_sheet("OCR Ledger")
    ledger.sheet_view.showGridLines = False
    ledger.merge_cells("A1:O1")
    ledger["A1"] = f"OCR Activity Ledger — {organization.get('name') or 'Organization'}"
    ledger["A1"].font = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    ledger["A1"].fill = TITLE_FILL
    ledger["A1"].border = THIN_BORDER
    ledger["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ledger.row_dimensions[1].height = 26.1
    ledger.row_dimensions[2].height = 32.1
    ledger.freeze_panes = "A3"
    ledger.auto_filter.ref = "A2:O2"
    for column, width in {"A": 24, "B": 20, "D": 24, "E": 42, "F": 16, "G": 14, "I": 18, "J": 22, "K": 18, "M": 22, "O": 36}.items():
        ledger.column_dimensions[column].width = width

    required_columns = {1, 2, 5, 6, 7, 8}
    conditional_columns = {9, 10, 11, 12}
    for column, header in enumerate(LEDGER_HEADERS, start=1):
        cell = ledger.cell(row=2, column=column, value=header)
        if column in required_columns:
            _ledger_header_style(cell, REQUIRED_FILL)
        elif column in conditional_columns:
            _ledger_header_style(cell, CONDITIONAL_FILL)
        else:
            _ledger_header_style(cell, OPTIONAL_FILL, "0C4A6E")
    for coordinate, text in HEADER_COMMENTS.items():
        ledger[coordinate].comment = Comment(text, "SustainRepo")

    for row in range(3, 503):
        for column in range(1, 16):
            cell = ledger.cell(row=row, column=column)
            cell.border = THIN_BORDER
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    lookup_values = workbook.create_sheet("Lookup values")
    lookup_values.sheet_state = "hidden"
    for row, facility_name in enumerate(facility_names, start=1):
        lookup_values.cell(row=row, column=1, value=facility_name)
    for row, currency in enumerate(LOOKUP_CURRENCIES, start=1):
        lookup_values.cell(row=row, column=2, value=currency)

    if facility_names:
        facility_validation = DataValidation(
            type="list", formula1=f"'Lookup values'!$A$1:$A${len(facility_names)}", allow_blank=True,
        )
        facility_validation.error = "Choose a facility from your organization list."
        facility_validation.errorTitle = "Unknown facility"
        ledger.add_data_validation(facility_validation)
        facility_validation.add("A3:A502")

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output