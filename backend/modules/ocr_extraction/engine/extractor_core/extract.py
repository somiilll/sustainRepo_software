"""Step 2 (documents) - read invoices/bills/scans with a vision model into a fixed JSON schema, then cross-check
the numbers in code. Adapted from the prototype prompt in Invoice_detection/invoice_processor.process_file.
"""
from __future__ import annotations

import re

from . import llm
from .config import load
from .normalise import Page
from .units import parse_number

SYSTEM = """You read invoices, utility bills, tickets, receipts, delivery challans, lorry receipts and similar documents for an
ESG / greenhouse-gas inventory of an Indian manufacturing company. Pages may be scans or phone photos, rotated, in
English, Hindi, Marathi, Gujarati, Tamil or another language. Report ONLY what the document shows - never estimate.

Rules
1. One object per distinct invoice/bill. A PDF holding several invoices returns several.
2. line_items = the physical or service activities: fuels, electricity, gases, water, waste, freight, travel, goods,
   services. In ERP/SAP purchase orders, if a parent line is broken into priced child lines, return ONLY the child lines.
3. Do NOT return taxes (GST/CGST/SGST/IGST), electricity duty, fixed/demand charges, meter rent, late fees, rounding,
   or surcharges as line items. Put their money in totals. Exception: for a utility bill, return ONE line for the
   energy/water consumed with its quantity and the TOTAL bill amount as amount.
4. Quantities: give the net physical quantity in the unit printed. Packed goods with a capacity (11 x 4 kg cylinders,
   5 x 4.5 kg CO2, 3 drums of 210 L) -> report the total (44 kg, 22.5 kg, 630 L). If the unit is not printed but obvious
   (litres for diesel), give it and add 'unit' to low_confidence_fields.
5. Electricity bills: units billed (kWh; kVAh only if kWh absent), billing period from/to, consumer/account number,
   meter readings (previous, current, multiplying factor) and any renewable/green energy quantity as its own line.
6. Travel: mode, origin, destination, class, passengers, rooms and nights separately. Do not compute distances.
7. Freight: mode, weight, distance if printed, origin, destination, and who pays (direction: inbound to the buyer,
   outbound from the buyer, or between the buyer's own sites) if it can be told.
8. Waste: waste type, quantity and disposal route (landfill/TSDF, incineration, co-processing, recycling, composting)
   only when printed. If the document is only for transporting waste, say so in transport_of_waste_only.
9. description = text as printed (original language); description_en = short English description.
10. Use "" for anything not shown on the document. Write numbers as plain text without currency symbols
   or thousands separators where possible (e.g. "150000.50").
11. evidence: one entry per line item with field "line 1", "line 2", ... (same order as line_items), the 1-based page
   it is printed on and a short exact quote (under 15 words) of that printed line. Add entries for "period",
   "consumer number" and "grand total" too.
12. confidence 0-1 per line: 0.95 when quantity, unit and amount are clearly printed; 0.7 when something was inferred;
   0.5 or less when blurry/ambiguous. List the uncertain field names in low_confidence_fields.
"""


def schema() -> dict:
    """No nullable fields (Claude structured outputs allow few unions): text fields use "" when absent and numbers
    are written as text ("" when absent), parsed afterwards with units.parse_number."""
    S, F, B = {"type": "string"}, {"type": "number"}, {"type": "boolean"}
    E = lambda *v: {"type": "string", "enum": list(v)}
    evidence = {"type": "array", "items": llm.obj({"field": S, "page": {"type": "integer"}, "quote": S})}
    line = llm.obj({
        "description": S, "description_en": S, "hsn_sac": S,
        "quantity": S, "unit": S, "rate": S, "amount": S,
        "nature": E("fuel", "electricity", "steam_heat", "water", "wastewater", "waste", "refrigerant", "industrial_gas", "freight",
                    "travel", "goods", "service", "capital_item", "rent", "fee_or_tax", "other"),
        "used_in": S,
        "travel": llm.obj({"mode": S, "origin": S, "destination": S, "class": S, "passengers": S, "rooms": S, "nights": S, "distance_km": S}),
        "freight": llm.obj({"mode": S, "weight_kg": S, "distance_km": S, "origin": S, "destination": S,
                            "direction": E("inbound", "outbound", "between_own_sites", "unknown")}),
        "waste": llm.obj({"waste_type": S, "disposal_method": S, "hazardous": E("yes", "no", "unknown")}),
        "confidence": F, "low_confidence_fields": {"type": "array", "items": S},
    })
    inv = llm.obj({
        "document_type": E("tax_invoice", "utility_bill", "purchase_order", "ticket", "receipt", "lorry_receipt",
                           "delivery_challan", "contract", "certificate_or_permit", "other"),
        "language": S, "vendor_name": S, "vendor_gstin": S, "vendor_type": S, "buyer_name": S, "buyer_gstin": S,
        "service_address": S, "invoice_number": S, "invoice_date": S, "billing_period_start": S, "billing_period_end": S,
        "consumer_number": S,
        "meter": llm.obj({"previous_reading": S, "current_reading": S, "multiplying_factor": S, "units_billed": S}),
        "currency": S,
        "totals": llm.obj({"subtotal": S, "tax": S, "other_charges": S, "grand_total": S}),
        "transport_of_waste_only": B,
        "line_items": {"type": "array", "items": line},
        "evidence": evidence, "notes": S,
    })
    return llm.obj({"invoices": {"type": "array", "items": inv}, "readable": B, "unreadable_reason": S})


def _clean(v):
    """'' / 'null' / 'n/a' -> None, numbers-as-text -> float where the field is numeric (done by caller)."""
    if v is None:
        return None
    if isinstance(v, str) and v.strip().lower() in ("", "null", "none", "n/a", "na", "-", "unknown"):
        return None
    return v


NUMERIC = {"quantity", "rate", "amount", "passengers", "rooms", "nights", "distance_km", "weight_kg", "previous_reading",
           "current_reading", "multiplying_factor", "units_billed", "subtotal", "tax", "other_charges", "grand_total"}


def tidy(obj):
    """Recursively turn '' into None and numeric text into floats."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            v = tidy(v)
            if k in NUMERIC and isinstance(v, str):
                v = parse_number(v)
            out[k] = v
        return out
    if isinstance(obj, list):
        return [tidy(x) for x in obj]
    return _clean(obj)


def _content(pages: list[Page]) -> list[dict]:
    out: list[dict] = []
    for p in pages:
        out.append({"type": "text", "text": f"--- Page {p.index + 1} ---" + (f"\nText layer of this page:\n{p.text[:6000]}" if p.text else "")})
        out.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": p.jpeg_b64}})
    out.append({"type": "text", "text": "Extract every invoice/bill in this document into the schema."})
    return out


def read_document(pages: list[Page], think: bool, metrics: dict) -> dict:
    models = load().policy["models"]
    model = models["extract_think" if think else "extract_fast"]
    data, usage = llm.call_json(model, SYSTEM, _content(pages), schema(), max_tokens=16000, effort="medium" if think else "low")
    metrics.setdefault("llm_calls", []).append({"step": "extract", **usage})
    data = tidy(data)
    data["_model"] = model
    return data


# ------------------------------------------------------------------------------- arithmetic cross-checks
def cross_check(inv: dict) -> list[dict]:
    checks = []
    lines = inv.get("line_items") or []
    tot = inv.get("totals") or {}
    amts = [l.get("amount") for l in lines if isinstance(l.get("amount"), (int, float))]
    sub = tot.get("subtotal")
    if sub and amts and inv.get("document_type") != "utility_bill" and len(amts) > 1:
        s = sum(amts)
        if abs(s - sub) / max(sub, 1) > 0.02 and abs(s - (tot.get("grand_total") or 0)) / max(sub, 1) > 0.02:
            checks.append({"code": "lines_vs_subtotal", "level": "warn", "critical": True,
                           "message": f"Line amounts add up to {s:,.2f} but the subtotal is {sub:,.2f}"})
    for idx, l in enumerate(lines):
        q, r, a = l.get("quantity"), l.get("rate"), l.get("amount")
        if all(isinstance(x, (int, float)) for x in (q, r, a)) and a:
            if abs(q * r - a) / abs(a) > 0.05:
                checks.append({"code": "qty_x_rate", "level": "warn", "line": idx, "critical": True,
                               "message": f"{q:g} x {r:g} = {q * r:,.2f}, but the line amount is {a:,.2f}"})
    m = inv.get("meter") or {}
    if all(isinstance(m.get(k), (int, float)) for k in ("previous_reading", "current_reading", "units_billed")):
        mf = m.get("multiplying_factor") or 1
        calc = (m["current_reading"] - m["previous_reading"]) * mf
        if m["units_billed"] and abs(calc - m["units_billed"]) / m["units_billed"] > 0.03:
            checks.append({"code": "meter_readings", "level": "warn", "critical": True,
                           "message": f"Meter readings give {calc:,.0f} units, bill says {m['units_billed']:,.0f}"})
    s, e = inv.get("billing_period_start"), inv.get("billing_period_end")
    from .periods import parse_date
    ds, de = parse_date(s), parse_date(e)
    if ds and de and ds > de:
        checks.append({"code": "period_order", "level": "warn", "message": f"Billing period start {s} is after end {e}"})
    return checks


def _ev(inv: dict, field: str) -> list[dict]:
    return [e for e in inv.get("evidence") or [] if e.get("field", "").lower().startswith(field)]


def to_items(inv: dict, source: dict, doc_index: int) -> list[dict]:
    """One raw item per line item, carrying the invoice-level context the classifier and validators need."""
    lines = inv.get("line_items") or []
    doc = {k: inv.get(k) for k in ("document_type", "language", "vendor_name", "vendor_gstin", "vendor_type", "buyer_name", "buyer_gstin",
                                   "service_address", "invoice_number", "invoice_date", "billing_period_start", "billing_period_end",
                                   "consumer_number", "currency", "totals", "transport_of_waste_only", "notes")}
    doc["doc_index"] = doc_index
    doc["other_lines"] = [l.get("description_en") or l.get("description") for l in lines][:8]
    items = []
    ev_all = inv.get("evidence") or []
    for i, l in enumerate(lines):
        tr, fr, ws = l.get("travel") or {}, l.get("freight") or {}, l.get("waste") or {}
        q = l.get("quantity")
        unit = l.get("unit")
        # electricity: prefer the meter's units billed when the line has none
        if l.get("nature") == "electricity" and q is None and (inv.get("meter") or {}).get("units_billed"):
            q, unit = inv["meter"]["units_billed"], unit or "kWh"
        mine = [{**e, "field": "line"} for e in ev_all if re.fullmatch(rf"line\s*{i + 1}", (e.get("field") or "").strip().lower())]
        evidence = mine + [e for e in ev_all if not (e.get("field") or "").lower().startswith("line")]
        items.append({
            "source": {**source, "doc_index": doc_index, "line": i, "page": mine[0].get("page") if mine else None},
            "doc": doc,
            "description": l.get("description") or l.get("description_en") or "",
            "description_en": l.get("description_en") or l.get("description") or "",
            "hsn": re.sub(r"\D", "", l.get("hsn_sac") or "") or None,
            "quantity": q if isinstance(q, (int, float)) else parse_number(q), "unit": unit,
            "amount": l.get("amount"), "rate": l.get("rate"), "currency": inv.get("currency"),
            "nature": l.get("nature"), "used_in": l.get("used_in"),
            "vendor": inv.get("vendor_name"), "vendor_gstin": inv.get("vendor_gstin"),
            "invoice_number": inv.get("invoice_number"), "date": inv.get("invoice_date"),
            "period_start": inv.get("billing_period_start"), "period_end": inv.get("billing_period_end"),
            "facility_hint": inv.get("service_address") or inv.get("buyer_name"),
            "consumer_number": inv.get("consumer_number"), "buyer_gstin": inv.get("buyer_gstin"),
            "distance_km": tr.get("distance_km") or fr.get("distance_km"),
            "weight_kg": fr.get("weight_kg"), "origin": tr.get("origin") or fr.get("origin"),
            "destination": tr.get("destination") or fr.get("destination"),
            "freight_mode": fr.get("mode"), "freight_direction": fr.get("direction"),
            "travel_mode": tr.get("mode"), "travel_class": tr.get("class"), "passengers": int(tr["passengers"]) if tr.get("passengers") else None,
            "rooms": int(tr["rooms"]) if tr.get("rooms") else None, "nights": int(tr["nights"]) if tr.get("nights") else None,
            "waste_type": ws.get("waste_type"), "disposal_method": ws.get("disposal_method"), "hazardous": {"yes": True, "no": False}.get(ws.get("hazardous") or ""),
            "line_confidence": float(l.get("confidence") or 0.7), "low_confidence_fields": l.get("low_confidence_fields") or [],
            "evidence": evidence, "notes": inv.get("notes") or None,
            "context": f"{inv.get('document_type')} from {inv.get('vendor_name') or 'unknown vendor'}",
        })
    return items
