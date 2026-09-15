"""Document rendering, structured extraction, and spreadsheet ingestion."""
from __future__ import annotations

import base64
import csv
import os
import re
from io import BytesIO
from pathlib import Path
from typing import Any

import fitz
import openpyxl
import xlrd
from PIL import Image

from .companion_rows import build_companion_rows
from .config import MAX_PDF_PAGES
from .llm_gateway import OcrLlmGateway
from .normalization import (
    extract_json,
    normalize_currency,
    normalize_date,
    normalize_period,
    normalize_unit,
)
from .reconciliation import prepare_item, reconcile_invoice_items
from .taxonomy_service import classify_item


EXTRACTION_SYSTEM_PROMPT = """You are an expert ESG emissions accounting data extraction assistant.
Extract transaction details and PHYSICAL ACTIVITY EVENTS from the provided invoice pages into raw JSON. Return only raw JSON without markdown or backticks.

UNIVERSAL PHYSICAL ACTIVITY EXTRACTION RULES:
1. MULTI-INVOICE / MULTI-PURCHASE-ORDER DOCUMENTS:
   - If the document contains multiple invoices, purchase orders, or delivery manifests, return a separate invoice object for each.
2. HIERARCHICAL LINE-ITEM DE-DUPLICATION:
   - In SAP/ERP purchase orders and service bills, do not extract summary parent group headers when itemized leaf lines have individual quantities and rates.
   - If a parent amount equals the sum of child lines, extract only the child lines to prevent double counting.
3. Identify the primary physical activity items: goods, raw materials, energy, waste, travel, freight, water, and services.
4. Classify material_nature:
   - raw_material: homogeneous unprocessed or semi-processed material such as copper rod, steel ingots, plastic granules, or bulk chemicals.
   - composite_product: manufactured, assembled, or multi-material products such as motors, PCB assemblies, equipment, furniture, valves, or tools.
   - service: non-physical services such as consulting, SaaS, software licences, or labour-only maintenance.
   - energy: fuels, electricity, steam, district heating, or cooling.
   - waste: refuse, scrap, wastewater, recycling, or disposal manifests.
   - logistics: freight, courier, shipping, or transport services.
   - travel: flights, rail, hotels, taxis, buses, or rental cars.
5. For raw_material, specify primary_material such as Copper, Steel, Aluminum, LDPE, Paper, or Synthetic Rubber.
6. Do not extract fee components such as tipping fees, hauling rates, loading charges, meter fees, fixed demand charges, fuel surcharges, late fees, documentation fees, or taxes as separate activity rows. Capture financial sums in invoice_financials.
7. PHYSICAL QUANTITY AND PACKAGING NORMALIZATION:
   - For fuel, gas, liquids, chemicals, and raw materials delivered in cylinders, drums, bottles, bags, barrels, cans, tankers, boxes, EA, Nos, or Pcs, calculate the total net mass or volume when package capacity is printed.
   - Use standard units: kg or tonnes for mass; Liters, Gallons, m3, or kL for volume; kg or m3 for gases; kWh or MWh for energy; km for distance.
   - Example: 11 EA of 4 kg becomes quantity 44 kg. Five 4.5 kg CO2 cylinders become quantity 22.5 kg.
   - Do not use EA, Nos, Pcs, or container count when net capacity is available.
   - For a pure non-physical service without an activity measurement, return quantity null and unit null.
8. CONFIDENCE AND CERTAINTY:
   - Explicit physical quantity and unit: 90-98%.
   - Explicit spend for purchased goods or services where physical quantity is not applicable: 85-95%.
   - If all required fields are legible and printed, low_confidence_fields must be empty.
   - If quantity is printed but unit is inferred, assign 70-75%, add inferred unit, and explain the assumption in additional_context.
   - If both physical activity and financial expenditure are missing, confidence must be 40% or below and low_confidence_fields must include missing qty & cost.
   - Do not flag vendor, buyer, addresses, or unit_price as low-confidence fields.
   - Blurry, truncated, or ambiguous values should score 50-65% and identify the affected field.
9. BUSINESS TRAVEL AND PASSENGER TICKETS:
   - Set item_category_hint to Travel and material_nature to travel.
   - Rail: mode Train; extract origin, destination, and passenger_count; class must be null.
   - Taxi/car: mode Taxi or Car; extract route and passenger_count; normalize vehicle_type to Small, Medium, Large, or Average, defaulting to Average.
   - Flights: mode Flight; extract origin, destination, class as Economy, Premium Economy, Business, or First, and passenger_count defaulting to 1. Do not calculate flight distance; leave distance null unless printed.
   - Hotels: mode Hotel; put the hotel city/country in origin; calculate quantity as rooms multiplied by nights and use unit room_nights.
10. WASTE:
   - Extract waste_type and normalize disposal_method to Landfill, Recycling, Composting, Incineration, or Wastewater.
11. FREIGHT:
   - Extract mode, shipment weight, origin, destination, and explicitly printed distance. Do not invent distance.
12. Preserve HSN/SAC when printed because it can strengthen commodity classification."""


EXTRACTION_SCHEMA_PROMPT = """Extract every invoice in these pages. Return a JSON object with key `invoices`, containing objects shaped as:
{
  "invoice_number": string|null,
  "date": "YYYY-MM-DD"|null,
  "billing_period_start": "YYYY-MM-DD"|null,
  "billing_period_end": "YYYY-MM-DD"|null,
  "billing_period_text": string|null,
  "vendor_name": string|null,
  "vendor_type": string|null,
  "vendor_address": string|null,
  "buyer_name": string|null,
  "buyer_address": string|null,
  "service_address": string|null,
  "currency": "INR|USD|EUR|GBP"|null,
  "grand_total": number|null,
  "freight_details": {"mode": "Road|Rail|Sea|Air|Courier"|null, "weight_kg": number|null, "distance_km": number|null, "origin": string|null, "destination": string|null},
  "invoice_financials": {"subtotal": number|null, "tax_amount": number|null, "additional_charges_amount": number|null, "grand_total": number|null, "currency": string|null},
  "line_items": [{
    "item_description": string,
    "item_description_english": string|null,
    "item_category_hint": "Purchased Goods|Capital Goods|Fuel/Energy|Water|Waste|Travel|Freight/Logistics|Refrigerant|Employee Commute|Other",
    "material_nature": "raw_material|composite_product|service|energy|waste|logistics|travel",
    "primary_material": string|null,
    "hsn_sac_code": string|null,
    "quantity": number|null,
    "unit": string|null,
    "unit_price": number|null,
    "base_cost": number|null,
    "total_cost": number|null,
    "distance_km": number|null,
    "origin": string|null,
    "destination": string|null,
    "waste_details": {"waste_type": string|null, "disposal_method": "Landfill|Recycling|Composting|Incineration|Wastewater"|null},
    "travel_details": {"mode": "Flight|Train|Taxi|Bus|Car Rental|Hotel"|null, "class": "Economy|Premium Economy|Business|First"|null, "vehicle_type": "Small|Medium|Large|Average"|null, "passenger_count": integer|null, "distance_km": number|null, "origin": string|null, "destination": string|null},
    "freight_details": {"mode": "Road|Rail|Sea|Air|Courier"|null, "weight_kg": number|null, "distance_km": number|null, "origin": string|null, "destination": string|null},
    "is_summary_header": boolean,
    "additional_context": string|null,
    "confidence_score": integer from 0 to 100,
    "low_confidence_fields": [string]
  }]
}
If multiple invoice numbers occur, create separate invoice objects. Return JSON only."""


HEADER_ALIASES = {
    "facility": ["facility_name", "facility", "plant_name", "plant", "site", "branch_name", "branch", "cost_center", "location"],
    "reporting_period": ["reporting_period", "reporting_month", "financial_year", "reporting_period_month_or_fy", "period", "billing_period", "fin_year", "fiscal_year", "fy", "month", "accounting_period", "reporting_year"],
    "invoice_number": ["invoice_number", "invoicenumber", "inv_no", "inv_num", "invoice_no", "bill_no", "bill_number", "doc_no", "document_no", "voucher_no"],
    "date": ["invoice_date", "invoicedate", "date", "bill_date", "doc_date", "posting_date"],
    "vendor_name": ["vendor_name", "vendor", "supplier_name", "supplier", "party_name", "party", "payee"],
    "item_description": ["item_description", "description", "item", "particulars", "material_description", "material_name", "product_name", "product", "activity", "service_description"],
    "quantity": ["quantity", "qty", "billed_qty", "volume", "net_weight", "quantity_used", "units"],
    "unit": ["unit", "uom", "unit_of_measure", "unit_of_quantity", "unit_of_quantity_used", "measure"],
    "total_cost": ["total_cost", "total_amount", "amount", "cost", "total", "net_amount", "spent_amount", "spent_amount_inr", "spend", "invoice_amount", "value"],
    "currency": ["currency", "curr"],
    "distance_km": ["distance_km", "distance", "dist_km", "dist", "travel_distance", "km", "kms", "route_distance"],
    "origin": ["origin", "from", "source", "departure", "pickup"],
    "destination": ["destination", "to", "arrival", "drop", "dest"],
    "primary_material": ["primary_material", "material", "material_type", "dominant_material"],
    "material_nature": ["material_nature", "nature", "item_nature"],
    "item_category_hint": ["item_category_hint", "category_hint", "activity_type"],
    "hsn_sac_code": ["hsn_sac_code", "hsn", "sac", "hsn_code", "sac_code"],
    "unit_price": ["unit_price", "rate", "price_per_unit"],
    "travel_mode": ["travel_mode", "mode_of_travel", "transport_mode"],
    "travel_class": ["travel_class", "class", "cabin_class", "cabin", "booking_class"],
    "vehicle_type": ["vehicle_type", "vehicle", "car_type", "cab_type"],
    "passenger_count": ["passenger_count", "passengers", "pax"],
    "freight_mode": ["freight_mode", "shipping_mode", "mode_of_transport"],
    "waste_type": ["waste_type", "waste_material"],
    "disposal_method": ["disposal_method", "treatment_method", "waste_treatment"],
    "notes": ["notes_context", "notes", "context", "remarks", "memo", "comments"],
}


def _image_to_base64(image: Image.Image) -> str:
    if image.mode in {"RGBA", "P", "LA"}:
        image = image.convert("RGB")
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=88, optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def render_document(path: str) -> list[str]:
    images: list[str] = []
    if path.lower().endswith(".pdf"):
        with fitz.open(path) as document:
            for index in range(min(len(document), MAX_PDF_PAGES)):
                pixmap = document.load_page(index).get_pixmap(dpi=150, alpha=False)
                image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
                images.append(_image_to_base64(image))
    else:
        with Image.open(path) as image:
            images.append(_image_to_base64(image))
    return images


def _normalize_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")


def _column_mapping(headers: list[str]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for key, aliases in HEADER_ALIASES.items():
        normalized_aliases = {_normalize_header(alias) for alias in aliases}
        for index, header in enumerate(headers):
            if header in normalized_aliases:
                mapping[key] = index
                break
    for key, aliases in HEADER_ALIASES.items():
        if key in mapping:
            continue
        for index, header in enumerate(headers):
            if index in mapping.values():
                continue
            if any(len(alias) >= 4 and _normalize_header(alias) in header for alias in aliases):
                mapping[key] = index
                break
    return mapping


def read_spreadsheet(path: str) -> list[dict]:
    rows: list[list[Any]] = []
    if path.lower().endswith(".csv"):
        with open(path, "r", encoding="utf-8-sig", errors="ignore", newline="") as handle:
            rows = [row for row in csv.reader(handle) if any(str(cell).strip() for cell in row)]
    elif path.lower().endswith(".xls"):
        workbook = xlrd.open_workbook(path)
        sheet = workbook.sheet_by_index(0)
        rows = [sheet.row_values(index) for index in range(sheet.nrows) if any(str(cell).strip() for cell in sheet.row_values(index))]
    else:
        workbook = openpyxl.load_workbook(path, data_only=True, read_only=True)
        sheet_name = next((name for name in workbook.sheetnames if any(token in name.lower() for token in ("invoice", "data", "ledger"))), workbook.sheetnames[0])
        rows = [list(row) for row in workbook[sheet_name].iter_rows(values_only=True) if any(cell not in (None, "") for cell in row)]
    if not rows:
        return []
    header_index = max(
        range(min(15, len(rows))),
        key=lambda idx: sum(any(alias in _normalize_header(cell) for values in HEADER_ALIASES.values() for alias in values) for cell in rows[idx]),
    )
    headers = [_normalize_header(value) for value in rows[header_index]]
    columns = _column_mapping(headers)
    extracted: list[dict] = []
    for raw in rows[header_index + 1:]:
        def value(key: str) -> Any:
            index = columns.get(key)
            return raw[index] if index is not None and index < len(raw) else None
        description = str(value("item_description") or "").strip()
        if not description:
            continue
        facility = str(value("facility") or "").strip()
        reporting_period = value("reporting_period")
        low_fields = []
        confidence = 95
        if not facility:
            low_fields.append("missing facility")
            confidence = min(confidence, 70)
        if not reporting_period:
            low_fields.append("missing reporting period / FY")
            confidence = min(confidence, 70)
        origin = value("origin")
        destination = value("destination")
        distance = value("distance_km")
        extracted.append({
            "invoice_number": str(value("invoice_number") or f"ROW-{len(extracted) + 1:03d}"),
            "date": value("date"),
            "billing_period_text": reporting_period,
            "vendor_name": str(value("vendor_name") or "Corporate Expenditure"),
            "service_address": facility,
            "currency": value("currency"),
            "line_items": [{
                "item_description": description,
                "item_description_english": description,
                "item_category_hint": value("item_category_hint") or "Other",
                "material_nature": value("material_nature") or "composite_product",
                "primary_material": value("primary_material") or "",
                "hsn_sac_code": value("hsn_sac_code"),
                "quantity": value("quantity"),
                "unit": value("unit"),
                "unit_price": value("unit_price"),
                "total_cost": value("total_cost"),
                "distance_km": distance,
                "origin": origin,
                "destination": destination,
                "travel_details": {
                    "mode": value("travel_mode"), "class": value("travel_class"),
                    "vehicle_type": value("vehicle_type"), "passenger_count": value("passenger_count") or 1,
                    "distance_km": distance, "origin": origin, "destination": destination,
                },
                "freight_details": {
                    "mode": value("freight_mode") or "Road", "distance_km": distance,
                    "origin": origin, "destination": destination,
                },
                "waste_details": {"waste_type": value("waste_type"), "disposal_method": value("disposal_method")},
                "additional_context": value("notes"),
                "confidence_score": confidence,
                "low_confidence_fields": low_fields,
            }],
        })
    return extracted


def _detect_location(invoice: dict, org_context: dict) -> str:
    address = str(invoice.get("service_address") or invoice.get("buyer_address") or "").strip()
    address_lower = address.lower()
    for location in org_context.get("locations", []):
        city = str(location.get("city") or "").strip()
        name = str(location.get("name") or "").strip()
        if (city and city.lower() in address_lower) or (name and name.lower() in address_lower):
            return name or city
    return address or "Unknown"


def _clean_invoice(invoice: dict, org_context: dict) -> tuple[dict, list[dict]]:
    invoice_date, future_date = normalize_date(invoice.get("date"))
    period = normalize_period(
        invoice.get("billing_period_start"),
        invoice.get("billing_period_end"),
        invoice.get("billing_period_text") or invoice.get("billing_period"),
        invoice_date,
    )
    financials = invoice.get("invoice_financials") or {}
    metadata = {
        **invoice,
        "date": invoice_date,
        "billing_period": period,
        "service_address": invoice.get("service_address") or invoice.get("buyer_address"),
        "detected_location": _detect_location(invoice, org_context),
        "currency": normalize_currency(financials.get("currency") or invoice.get("currency")),
        "future_date": future_date,
    }
    reconciled = reconcile_invoice_items(invoice)
    invoice_freight = invoice.get("freight_details") or {}
    for item in reconciled:
        if not item.get("freight_details") and invoice_freight:
            item["freight_details"] = invoice_freight
    items = [prepare_item(item, future_date=future_date) for item in reconciled]
    return metadata, items


async def process_document(
    path: str,
    gateway: OcrLlmGateway,
    org_context: dict,
    enabled_scopes: set[str],
    disabled_scope3_sheets: set[str],
    override_lookup,
) -> list[dict]:
    if Path(path).suffix.lower() in {".csv", ".xlsx", ".xls"}:
        invoices = read_spreadsheet(path)
    else:
        images = render_document(path)
        response = await gateway.extract_document(EXTRACTION_SYSTEM_PROMPT, EXTRACTION_SCHEMA_PROMPT, images)
        payload = extract_json(response, {})
        if isinstance(payload, dict) and "invoices" in payload:
            invoices = payload.get("invoices") or []
        elif isinstance(payload, dict):
            invoices = [payload]
        else:
            invoices = payload
        if isinstance(invoices, dict):
            invoices = [invoices]
    rows: list[dict] = []
    for invoice in invoices or []:
        if not isinstance(invoice, dict):
            continue
        metadata, items = _clean_invoice(invoice, org_context)
        for item in items:
            override = await override_lookup(metadata.get("vendor_name"), item.get("item_description_english") or item.get("item_description"))
            classification = await classify_item(
                gateway,
                item,
                metadata,
                org_context,
                enabled_scopes,
                disabled_scope3_sheets,
                override,
            )
            confidence = item["confidence_score"]
            freight = item.get("freight_details") or {}
            travel = item.get("travel_details") or {}
            origin = travel.get("origin") or freight.get("origin") or item.get("origin")
            destination = travel.get("destination") or freight.get("destination") or item.get("destination")
            warnings = item.get("quality_warnings") or []
            rationale = " | ".join([*warnings, classification["accounting_rationale"]]) if warnings else classification["accounting_rationale"]
            row = {
                "invoice_number": metadata.get("invoice_number"),
                "date": metadata.get("date"),
                "billing_period": metadata.get("billing_period"),
                "vendor_name": metadata.get("vendor_name"),
                "vendor_type": metadata.get("vendor_type"),
                "location": metadata.get("detected_location"),
                "item_description": item.get("item_description_english") or item.get("item_description"),
                "item_category_hint": item.get("item_category_hint"),
                "material_nature": item.get("material_nature"),
                "primary_material": item.get("primary_material"),
                "hsn_sac_code": item.get("hsn_sac_code"),
                "unit_price": item.get("unit_price"),
                "waste_details": item.get("waste_details"),
                "travel_details": travel,
                "freight_details": freight,
                "scope": classification["ghg_scope"],
                "category": classification["ghg_category"],
                "category_key": classification["category_key"],
                "category_code": classification["category_code"],
                "subcategory": classification["ghg_subcategory"],
                "fuel_name": classification["ghg_subcategory"],
                "quantity": item.get("quantity"),
                "unit": normalize_unit(item.get("unit"), classification["ghg_category"]),
                "distance_km": item.get("distance_km"),
                "origin": origin,
                "destination": destination,
                "cost": item.get("total_cost"),
                "currency": normalize_currency(item.get("currency") or metadata.get("currency")),
                "ef_method": classification["ef_method"],
                "ef_database": classification["ef_database"],
                "ef_lookup_key": classification["ef_lookup_key"],
                "naics_code": classification["naics_code"],
                "naics_label": classification["naics_label"],
                "accounting_rationale": rationale,
                "confidence_score": confidence,
                "classification_confidence_score": classification["confidence_score"],
                "low_confidence_fields": item.get("low_confidence_fields", []),
                "needs_review": item.get("missing_values") or classification["needs_review"] or confidence < 70 or bool(item.get("low_confidence_fields")),
                "missing_values": item.get("missing_values", False),
                "is_auto_generated": False,
                "classification_source": classification["classification_source"],
                "auto_generate_cat3": classification["auto_generate_cat3"],
            }
            rows.append(row)
            rows.extend(build_companion_rows(row))
    return rows
