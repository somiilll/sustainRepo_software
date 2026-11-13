"""Step 2 (documents) - read invoices/bills/scans with a vision model into a fixed JSON schema, then cross-check
the numbers in code. Adapted from the prototype prompt in Invoice_detection/invoice_processor.process_file.
"""
from __future__ import annotations

import math
import re

from . import llm
from .config import load
from .normalise import Page
from .units import parse_number, to_canonical

SYSTEM = """You read invoices, utility bills, tickets, receipts, delivery challans, lorry receipts and similar documents for an
ESG / greenhouse-gas inventory of an Indian manufacturing company. Pages may be scans or phone photos, rotated, in
English, Hindi, Marathi, Gujarati, Tamil or another language. Report ONLY what the document shows - never estimate.

Rules
1. One object per distinct invoice/bill. A PDF holding several invoices returns several.
2. line_items = the physical or service activities: fuels, electricity, gases, water, waste, freight, travel, goods,
   services. In ERP/SAP purchase orders, if a parent line is broken into priced child lines, return ONLY the child lines.
   nature = what the line DOES, not what it handles: a line that moves, hauls, collects or carries anything is freight,
   even when the thing moved is waste; a line that treats, processes, recycles or disposes of waste is waste.
   One trip, cab ride, ticket or hotel stay is ONE activity: its fare components (base fare, distance or time charge,
   one room line per night of the same stay) are one line_item with the summed amount and the total quantity
   (hotel: total rooms and nights). A ticket covering several flight legs or journeys (outbound and return, connections)
   gives one line_item per leg with its own origin and destination, all with the same printed_line number.
3. Taxes and add-on fees are NOT line items: taxes (GST/CGST/SGST/IGST), duties, fixed/demand charges, meter rent, late
   fees, rounding, discounts, and every charge billed on top of a main line (fuel or other surcharges, loading/handling,
   documentation, convenience/booking fees, seat selection, meals, breakfast, baggage, laundry, extra-km, waiting, tolls,
   parking, driver allowance). Their money goes in totals (tax or other_charges); it is later shared over the main
   lines by value, so it is never lost. If you still return such a charge as a line, set add_on = true.
   Exception: for a utility bill, return ONE line for the energy/water consumed with its quantity and the TOTAL bill
   amount as amount.
4. One printed line can hold more than one emission activity, and then it MUST be returned as several line_items, one
   per activity. Example: "Collection, transport and disposal of 5 MT hazardous waste to TSDF, 40 km, 12000" -> line A
   nature waste (5 MT, disposal route TSDF) and line B nature freight (5 MT over 40 km). Likewise goods supplied with
   their delivery/freight on one line. Give every part the same printed_line number and repeat the printed amount on
   every part (it is counted once, or shared between legs). Separate printed lines get separate printed_line numbers.
5. Quantities: give the net physical quantity in the unit printed. Packed goods with a capacity (11 x 4 kg cylinders,
   5 x 4.5 kg CO2, 3 drums of 210 L) -> report the total (44 kg, 22.5 kg, 630 L). If the unit is not printed but obvious
   (litres for diesel), give it and add 'unit' to low_confidence_fields.
6. Electricity bills: units billed (kWh; kVAh only if kWh absent), billing period from/to, consumer/account number,
   meter readings (previous, current, multiplying factor) and any renewable/green energy quantity as its own line.
7. Travel: mode, origin, destination and passengers separately; never compute distance_km (leave it empty unless printed).
   Flights: origin and destination = the 3-letter IATA airport code (printed, or the city's main airport), class = Economy, Premium Economy, Business or First.
   Rail: origin and destination stations; ignore the cabin class. Taxi/cab (Uber, Ola, local): vehicle_size = Small,
   Medium, Large or Average (Average when the vehicle type is not stated). Hotel: rooms and nights separately.
8. Freight: mode, weight, distance if printed, origin, destination, and who pays (direction: inbound to the buyer,
   outbound from the buyer, or between the buyer's own sites) if it can be told.
9. Waste: waste type, quantity and disposal route (landfill/TSDF, incineration, co-processing, recycling, composting)
   only when printed.
10. description = text as printed (original language); description_en = short English description.
11. Use "" for anything not shown on the document. Write numbers as plain text without currency symbols
   or thousands separators where possible (e.g. "150000.50").
12. evidence: one entry per line item with field "line 1", "line 2", ... (same order as line_items), the 1-based page
   it is printed on and a short exact quote (under 15 words) of that printed line. Add entries for "period",
   "consumer number" and "grand total" too.
13. confidence 0-1 per line: 0.95 when quantity, unit and amount are clearly printed; 0.7 when something was inferred;
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
        "used_in": S, "printed_line": {"type": "integer"}, "add_on": B,
        "travel": llm.obj({"mode": S, "origin": S, "destination": S, "class": S, "passengers": S, "rooms": S, "nights": S, "vehicle_size": S, "distance_km": S}),
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
    data, usage = llm.call_json("extract_think" if think else "extract_fast", SYSTEM, _content(pages), schema(),
                                max_tokens=16000, effort="medium" if think else "low")
    metrics.setdefault("llm_calls", []).append({"step": "extract", **usage})
    data = tidy(data)
    data["_model"] = usage["model"]
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


_num = lambda v: v if isinstance(v, (int, float)) else None      # noqa: E731
PAID_PART = ("freight", "travel", "service", "goods", "rent", "capital_item")


def _is_add_on(l: dict) -> bool:
    return bool(l.get("add_on")) or l.get("nature") == "fee_or_tax"


def _main_lines(lines: list[dict]) -> list[int]:
    """Indexes of the real activity lines; taxes and add-on fees are not lines (a fee-only document keeps its lines)."""
    main = [i for i, l in enumerate(lines) if not _is_add_on(l)]
    return main or list(range(len(lines)))


def _one_amount_per_printed_line(lines: list[dict], main: list[int]) -> dict[int, float | None]:
    """Parts split from one printed line share its money once: it stays on the paid-for part (transport/service), the others carry quantity only."""
    amounts = {i: _num(lines[i].get("amount")) for i in main}
    parts: dict[int, list[int]] = {}
    for i in main:
        if (pl := lines[i].get("printed_line")):
            parts.setdefault(pl, []).append(i)
    for idx in parts.values():
        paid = [i for i in idx if amounts[i]]
        if paid and len(idx) > 1 and len({lines[i].get("nature") for i in idx}) == 1:      # legs of one ticket: the fare is shared
            share = round(amounts[paid[0]] / len(idx), 2)
            for i in idx:
                amounts[i] = share
        elif len(paid) > 1:
            keep = next((i for i in paid if lines[i].get("nature") in PAID_PART), paid[0])
            for i in paid:
                if i != keep:
                    amounts[i] = None
    return amounts


TRIP_UNITS = {"", "trip", "trips", "ride", "ticket", "tickets", "lot", "nos", "no", "service", "fare"}


def _merge_trip_parts(lines: list[dict], main: list[int]) -> list[int]:
    """Safety net for rule 2: the fare components of one cab ride / train trip / flight (same mode and route) and the per-night
    lines of one hotel stay become one line with the summed amount; separate trips (two distance lines) are left apart."""
    groups: dict[tuple, list[int]] = {}
    for i in main:
        tr = lines[i].get("travel") or {}
        kind = _travel_terms(tr)[0] if lines[i].get("nature") == "travel" else None
        if kind in ("hotel", "taxi", "rail", "flight"):
            route = () if kind == "hotel" else (str(tr.get("origin") or "").strip().lower(), str(tr.get("destination") or "").strip().lower())
            groups.setdefault((kind, lines[i].get("printed_line") if kind == "flight" else None, *route), []).append(i)
    drop = set()
    for (kind, *_), idx in groups.items():
        if len(idx) < 2:
            continue
        if kind != "hotel":
            dist = [i for i in idx if str(lines[i].get("unit") or "").strip().lower() not in TRIP_UNITS]
            if len(dist) > 1 or len(idx) - len(dist) > 1:
                continue
            head = dist[0] if dist else idx[0]
        else:
            head = idx[0]
        merged = dict(lines[head])
        merged["amount"] = round(sum(_num(lines[i].get("amount")) or 0 for i in idx), 2) or None
        if kind == "hotel":
            rn = sum((int(_num(t.get("rooms")) or 1) * int(_num(t.get("nights")) or _num(lines[i].get("quantity")) or 1))
                     for i in idx for t in [lines[i].get("travel") or {}])
            merged["travel"] = {**(merged.get("travel") or {}), "rooms": 1, "nights": rn}
        merged["merged_from"] = [lines[i].get("description_en") or lines[i].get("description") for i in idx]
        lines[head] = merged
        for i in set(idx) - {head}:
            lines[i] = {**lines[i], "merged_into": head}
            drop.add(i)
    return [i for i in main if i not in drop]


def _airport(text) -> dict | None:
    from airportsdata import load as airports
    global _AIRPORTS
    if _AIRPORTS is None:
        _AIRPORTS = airports("IATA")
    m = re.search(r"\b([A-Z]{3})\b", str(text or ""))
    return _AIRPORTS.get(m.group(1)) if m else None


_AIRPORTS = None


def flight_km(origin, destination) -> float | None:
    """Great-circle distance between two airport codes plus the policy uplift (routing and stacking), or None."""
    a, b = _airport(origin), _airport(destination)
    if not a or not b or a is b:
        return None
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return round(2 * 6371.0 * math.asin(math.sqrt(h)) * load().policy["travel"].get("flight_distance_uplift", 1.0), 1)


def _spend_amounts(inv: dict, lines: list[dict], amounts: dict[int, float | None]) -> tuple[dict, str | None]:
    """Each main line's amount plus its share (by value) of everything else on the invoice - taxes, add-on fees, surcharges.
    The extra is the gap between the grand total and the main lines, so a fee the reader left out is still counted."""
    base = sum(a for a in amounts.values() if a)
    if not load().policy.get("spend_includes_tax") or not base:
        return amounts, None
    tot = inv.get("totals") or {}
    grand = _num(tot.get("grand_total"))
    if grand:
        extra = grand - base
    else:
        extra = sum(v for v in (_num(tot.get("tax")), _num(tot.get("other_charges"))) if v) + \
                sum(_num(l.get("amount")) or 0 for i, l in enumerate(lines) if i not in amounts and "merged_into" not in l)
    if abs(extra) <= max(1.0, 0.001 * base):
        return amounts, None
    names = [l.get("description_en") or l.get("description") for i, l in enumerate(lines) if i not in amounts and "merged_into" not in l]
    names += [label for k, label in (("tax", "taxes"), ("other_charges", "other charges")) if _num(tot.get(k))]
    note = (f"Includes {extra:,.2f} of taxes / add-on charges" + (f" ({', '.join(str(n) for n in names[:5])})" if names else "")
            + f" shared over the invoice lines by value (lines {base:,.2f}, invoice total {(grand or base + extra):,.2f})")
    return {i: round(a + extra * a / base, 2) if a else a for i, a in amounts.items()}, note


def _travel_terms(tr: dict) -> tuple[str, str | None, str | None]:
    """(mode kind, cabin class, vehicle size) in the wording of the factor names; rail ignores the cabin class, a cab without a stated size is Average."""
    pol = load().policy["travel"]
    mode = str(tr.get("mode") or "").lower()
    kind = ("hotel" if re.search(r"hotel|accommodat|lodging|stay", mode) else "rail" if re.search(r"rail|train|metro", mode)
            else "taxi" if re.search(r"taxi|cab|uber|ola|ride", mode) else "flight" if re.search(r"flight|air", mode) else mode)
    norm = lambda m, v: next((m[k] for k in sorted(m, key=len, reverse=True) if k in str(v or "").lower()), None)
    cabin = norm(pol["cabin_class"], tr.get("class")) if kind == "flight" else None
    size = (norm(pol["vehicle_size"], tr.get("vehicle_size")) or "Average") if kind == "taxi" else None
    return kind, cabin, size


def to_items(inv: dict, source: dict, doc_index: int) -> list[dict]:
    """One raw item per line item, carrying the invoice-level context the classifier and validators need."""
    lines = list(inv.get("line_items") or [])
    doc = {k: inv.get(k) for k in ("document_type", "language", "vendor_name", "vendor_gstin", "vendor_type", "buyer_name", "buyer_gstin",
                                   "service_address", "invoice_number", "invoice_date", "billing_period_start", "billing_period_end",
                                   "consumer_number", "currency", "totals", "notes")}
    doc["doc_index"] = doc_index
    main = _merge_trip_parts(lines, _main_lines(lines))
    doc["other_lines"] = [lines[i].get("description_en") or lines[i].get("description") for i in main][:8]
    items = []
    ev_all = inv.get("evidence") or []
    amounts = _one_amount_per_printed_line(lines, main)
    spend_amounts, spend_note = _spend_amounts(inv, lines, amounts)
    for i in main:
        l = lines[i]
        tr, fr, ws = l.get("travel") or {}, l.get("freight") or {}, l.get("waste") or {}
        q = l.get("quantity")
        unit = l.get("unit")
        # electricity: prefer the meter's units billed when the line has none
        if l.get("nature") == "electricity" and q is None and (inv.get("meter") or {}).get("units_billed"):
            q, unit = inv["meter"]["units_billed"], unit or "kWh"
        tmode, tclass, vsize = _travel_terms(tr)
        if tmode == "hotel" and tr.get("rooms") and tr.get("nights"):
            q, unit = int(tr["rooms"]) * int(tr["nights"]), "room_nights"
        km, notes = tr.get("distance_km") or fr.get("distance_km"), []
        if not km and tmode == "flight" and (km := flight_km(tr.get("origin"), tr.get("destination"))):
            notes.append(f"Flight distance {km:,.0f} km worked out from the airport codes {tr.get('origin')} - {tr.get('destination')}")
        if l.get("merged_from"):
            notes.append("One trip/stay - combined from: " + "; ".join(str(x) for x in l["merged_from"] if x))
        mine = [{**e, "field": "line"} for e in ev_all if re.fullmatch(rf"line\s*{i + 1}", (e.get("field") or "").strip().lower())]
        evidence = mine + [e for e in ev_all if not (e.get("field") or "").lower().startswith("line")]
        items.append({
            "source": {**source, "doc_index": doc_index, "line": i, "page": mine[0].get("page") if mine else None},
            "doc": doc,
            "description": l.get("description") or l.get("description_en") or "",
            "description_en": l.get("description_en") or l.get("description") or "",
            "hsn": re.sub(r"\D", "", l.get("hsn_sac") or "") or None,
            "quantity": q if isinstance(q, (int, float)) else parse_number(q), "unit": unit,
            "amount": amounts[i], "spend_amount": spend_amounts[i], "spend_note": spend_note if amounts[i] else None, "rate": l.get("rate"), "currency": inv.get("currency"),
            "nature": l.get("nature"), "used_in": l.get("used_in"),
            "vendor": inv.get("vendor_name"), "vendor_gstin": inv.get("vendor_gstin"),
            "invoice_number": inv.get("invoice_number"), "date": inv.get("invoice_date"),
            "period_start": inv.get("billing_period_start"), "period_end": inv.get("billing_period_end"),
            "facility_hint": inv.get("service_address") or inv.get("buyer_name"),
            "consumer_number": inv.get("consumer_number"), "buyer_gstin": inv.get("buyer_gstin"),
            "distance_km": km, "travel_kind": tmode if l.get("nature") == "travel" else None, "line_notes": notes,
            "weight_kg": None if to_canonical(1, unit)[2] == "mass" else fr.get("weight_kg"), "origin": tr.get("origin") or fr.get("origin"),
            "destination": tr.get("destination") or fr.get("destination"),
            "freight_mode": fr.get("mode"), "freight_direction": fr.get("direction"),
            "travel_mode": tr.get("mode"), "travel_class": tclass, "vehicle_size": vsize, "passengers": int(tr["passengers"]) if tr.get("passengers") else None,
            "rooms": int(tr["rooms"]) if tr.get("rooms") else None, "nights": int(tr["nights"]) if tr.get("nights") else None,
            "waste_type": ws.get("waste_type"), "disposal_method": ws.get("disposal_method"), "hazardous": {"yes": True, "no": False}.get(ws.get("hazardous") or ""),
            "line_confidence": float(l.get("confidence") or 0.7), "low_confidence_fields": l.get("low_confidence_fields") or [],
            "evidence": evidence, "notes": inv.get("notes") or None,
            "context": f"{inv.get('document_type')} from {inv.get('vendor_name') or 'unknown vendor'}",
        })
    return items
