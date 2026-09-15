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

from .config import MAX_PDF_PAGES
from .llm_gateway import OcrLlmGateway
from .normalization import (
    convert_quantity,
    extract_json,
    normalize_currency,
    normalize_date,
    normalize_period,
    normalize_unit,
    parse_number,
)
from .taxonomy_service import classify_item


EXTRACTION_SYSTEM_PROMPT = """You are an audit-grade ESG invoice extraction assistant.
Extract invoice metadata and primary physical or financial activity events. Return only valid JSON.
Do not extract taxes, subtotals, demand charges, service fees, or summary parent rows when itemized leaf rows exist.
Preserve explicit quantities and units. For packaged liquids/gases/materials, calculate net physical quantity when package capacity is printed.
Confidence must reflect legibility and whether quantity, unit, or spend was inferred."""


EXTRACTION_SCHEMA_PROMPT = """Extract every invoice in these pages. Return a JSON object with key `invoices`, containing objects shaped as:
{
  "invoice_number": string|null,
  "date": "YYYY-MM-DD"|null,
  "billing_period_start": "YYYY-MM-DD"|null,
  "billing_period_end": "YYYY-MM-DD"|null,
  "billing_period_text": string|null,
  "vendor_name": string|null,
  "vendor_type": string|null,
  "buyer_name": string|null,
  "service_address": string|null,
  "currency": "INR|USD|EUR|GBP"|null,
  "grand_total": number|null,
  "line_items": [{
    "item_description": string,
    "item_description_english": string|null,
    "material_nature": "raw_material|composite_product|service|energy|waste|logistics|travel",
    "quantity": number|null,
    "unit": string|null,
    "total_cost": number|null,
    "distance_km": number|null,
    "origin": string|null,
    "destination": string|null,
    "additional_context": string|null,
    "confidence_score": integer,
    "low_confidence_fields": [string]
  }]
}
If multiple invoice numbers occur, create separate invoice objects. Return JSON only."""


HEADER_ALIASES = {
    "facility": ["facility", "facility_name", "plant", "site", "branch", "cost_center"],
    "reporting_period": ["reporting_period", "period", "billing_period", "fiscal_year", "financial_year", "month"],
    "invoice_number": ["invoice_number", "invoice_no", "inv_no", "bill_no", "document_no", "voucher_no"],
    "date": ["invoice_date", "date", "bill_date", "posting_date"],
    "vendor_name": ["vendor_name", "vendor", "supplier_name", "supplier", "party", "payee"],
    "item_description": ["item_description", "description", "item", "particulars", "material_description", "product", "activity", "service_description"],
    "quantity": ["quantity", "qty", "volume", "net_weight", "quantity_used", "units"],
    "unit": ["unit", "uom", "unit_of_measure", "measure"],
    "total_cost": ["total_cost", "total_amount", "amount", "cost", "total", "net_amount", "spend", "value"],
    "currency": ["currency", "curr"],
    "distance_km": ["distance_km", "distance", "dist_km", "km", "kms"],
    "origin": ["origin", "from", "source", "departure", "pickup"],
    "destination": ["destination", "to", "arrival", "drop", "dest"],
    "notes": ["notes", "context", "remarks", "memo", "comments"],
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
        extracted.append({
            "invoice_number": str(value("invoice_number") or f"ROW-{len(extracted) + 1:03d}"),
            "date": value("date"),
            "billing_period_text": value("reporting_period"),
            "vendor_name": str(value("vendor_name") or "Corporate Expenditure"),
            "service_address": str(value("facility") or ""),
            "currency": value("currency"),
            "line_items": [{
                "item_description": description,
                "item_description_english": description,
                "material_nature": "composite_product",
                "quantity": value("quantity"),
                "unit": value("unit"),
                "total_cost": value("total_cost"),
                "distance_km": value("distance_km"),
                "origin": value("origin"),
                "destination": value("destination"),
                "additional_context": value("notes"),
                "confidence_score": 92,
                "low_confidence_fields": [],
            }],
        })
    return extracted


def _clean_invoice(invoice: dict) -> tuple[dict, list[dict]]:
    invoice_date, future_date = normalize_date(invoice.get("date"))
    period = normalize_period(
        invoice.get("billing_period_start"),
        invoice.get("billing_period_end"),
        invoice.get("billing_period_text"),
        invoice_date,
    )
    metadata = {
        **invoice,
        "date": invoice_date,
        "billing_period": period,
        "currency": normalize_currency(invoice.get("currency")),
        "future_date": future_date,
    }
    items: list[dict] = []
    for item in invoice.get("line_items", []) or []:
        quantity, quantity_error = parse_number(item.get("quantity"), positive=True)
        cost, cost_error = parse_number(item.get("total_cost"))
        distance, distance_error = parse_number(item.get("distance_km"))
        unit = normalize_unit(item.get("unit"))
        quantity, unit = convert_quantity(quantity, unit)
        warnings = [warning for warning in (quantity_error, cost_error, distance_error) if warning]
        warnings.extend(item.get("low_confidence_fields") or [])
        if future_date:
            warnings.append("Future invoice date")
        has_activity = bool((quantity and unit) or distance)
        has_cost = bool(cost)
        missing_values = not has_activity and not has_cost
        if missing_values:
            warnings.append("Missing quantity and cost")
        try:
            confidence = int(item.get("confidence_score", 85))
        except (TypeError, ValueError):
            confidence = 85
        if missing_values:
            confidence = min(confidence, 40)
        elif warnings:
            confidence = min(confidence, 70)
        items.append({
            **item,
            "quantity": quantity,
            "unit": unit,
            "total_cost": cost,
            "distance_km": distance,
            "confidence_score": max(0, min(100, confidence)),
            "low_confidence_fields": list(dict.fromkeys(str(value) for value in warnings)),
            "missing_values": missing_values,
        })
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
        invoices = payload.get("invoices", []) if isinstance(payload, dict) else payload
        if isinstance(invoices, dict):
            invoices = [invoices]
    rows: list[dict] = []
    for invoice in invoices or []:
        if not isinstance(invoice, dict):
            continue
        metadata, items = _clean_invoice(invoice)
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
            confidence = min(item["confidence_score"], classification["confidence_score"])
            row = {
                "invoice_number": metadata.get("invoice_number"),
                "date": metadata.get("date"),
                "billing_period": metadata.get("billing_period"),
                "vendor_name": metadata.get("vendor_name"),
                "vendor_type": metadata.get("vendor_type"),
                "location": metadata.get("service_address"),
                "item_description": item.get("item_description_english") or item.get("item_description"),
                "material_nature": item.get("material_nature"),
                "scope": classification["ghg_scope"],
                "category": classification["ghg_category"],
                "category_key": classification["category_key"],
                "category_code": classification["category_code"],
                "subcategory": classification["ghg_subcategory"],
                "fuel_name": classification["ghg_subcategory"],
                "quantity": item.get("quantity"),
                "unit": normalize_unit(item.get("unit"), classification["ghg_category"]),
                "distance_km": item.get("distance_km"),
                "origin": item.get("origin"),
                "destination": item.get("destination"),
                "cost": item.get("total_cost"),
                "currency": normalize_currency(item.get("currency") or metadata.get("currency")),
                "ef_method": classification["ef_method"],
                "ef_database": classification["ef_database"],
                "ef_lookup_key": classification["ef_lookup_key"],
                "naics_code": classification["naics_code"],
                "naics_label": classification["naics_label"],
                "accounting_rationale": classification["accounting_rationale"],
                "confidence_score": confidence,
                "low_confidence_fields": item.get("low_confidence_fields", []),
                "needs_review": item.get("missing_values") or classification["needs_review"] or confidence < 75,
                "missing_values": item.get("missing_values", False),
                "classification_source": classification["classification_source"],
                "auto_generate_cat3": classification["auto_generate_cat3"],
            }
            rows.append(row)
    return rows
