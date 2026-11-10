"""Step 7 - checks that decide whether a row is Ready, Needs attention or needs a question answered.

Never fills defaults silently: no facility match -> flagged (the prototype wrote 'Default Facility').
"""
from __future__ import annotations

import re
from datetime import date

from .config import load
from .group import norm_vendor
from .periods import allocate, month_of, parse_date

PRICE_RANGES = [   # INR per canonical unit; only checked when both quantity and amount exist
    (r"^fuel\.(diesel|petrol)$", "L", 60, 140), (r"^fuel\.lpg$", "kg", 40, 160), (r"^fuel\.natural_gas$", "m3", 25, 130),
    (r"^fuel\.(furnace_oil|kerosene)$", "L", 35, 120), (r"^fuel\.coal", "kg", 2, 30), (r"^elec\.", "kWh", 2.5, 20),
    (r"^water\.", "L", 0.002, 0.25), (r"^refrigerant\.r", "kg", 150, 6000),
]


def _norm(s: str | None) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).split())


def match_facility(item: dict, facilities: list[dict]) -> dict:
    """{'id','name','method','confidence'} - id None when nothing matched."""
    none = {"id": None, "name": None, "method": "none", "confidence": 0.0}
    if not facilities:
        return {**none, "method": "no facilities configured"}
    cn = re.sub(r"[^0-9a-z]", "", (item.get("consumer_number") or "").lower())
    if cn:
        for f in facilities:
            if any(cn == re.sub(r"[^0-9a-z]", "", str(x).lower()) for x in f.get("consumer_numbers", [])):
                return {"id": f["id"], "name": f["name"], "method": "consumer/meter number", "confidence": 0.98}
    hint = _norm(item.get("facility_hint"))
    if hint:
        for f in facilities:
            names = [_norm(f["name"])] + [_norm(a) for a in f.get("aliases", [])]
            if hint in names:
                return {"id": f["id"], "name": f["name"], "method": "facility name", "confidence": 0.97}
        for f in facilities:
            names = [_norm(f["name"])] + [_norm(a) for a in f.get("aliases", [])]
            if any(n and (n in hint or (len(hint) > 3 and hint in n)) for n in names):
                return {"id": f["id"], "name": f["name"], "method": "name in address/text", "confidence": 0.88}
            if any(_norm(k) and _norm(k) in hint for k in f.get("address_keywords", [])):
                return {"id": f["id"], "name": f["name"], "method": "address keyword", "confidence": 0.85}
    gst = (item.get("buyer_gstin") or "").upper().strip()
    if gst:
        hits = [f for f in facilities if gst in [g.upper() for g in f.get("gstins", [])]]
        if len(hits) == 1:
            return {"id": hits[0]["id"], "name": hits[0]["name"], "method": "buyer GSTIN", "confidence": 0.9}
    if len(facilities) == 1 and not hint:
        f = facilities[0]
        return {"id": f["id"], "name": f["name"], "method": "only facility in organisation", "confidence": 0.95}
    return none


def resolve_period(item: dict) -> dict:
    """{'reporting_period','allocation','confidence','method'}"""
    s, e = parse_date(item.get("period_start")), parse_date(item.get("period_end"))
    if s and e:
        alloc = allocate(s, e)
        main = max(alloc, key=lambda a: a["share"])["period"]
        return {"reporting_period": main, "allocation": alloc if len(alloc) > 1 else None, "confidence": 0.96,
                "method": "billing period", "period_start": s.isoformat(), "period_end": e.isoformat()}
    if item.get("period_hint"):
        return {"reporting_period": item["period_hint"], "allocation": None, "confidence": 0.95, "method": "period column"}
    d = parse_date(item.get("date"))
    if d:
        # a purchase is booked in the month of its invoice; a utility bill's consumption month may be earlier
        utility = (item.get("doc") or {}).get("document_type") == "utility_bill" or item.get("nature") in ("electricity", "water", "steam_heat")
        return {"reporting_period": month_of(d), "allocation": None, "confidence": 0.8 if utility else 0.93, "method": "invoice date"}
    return {"reporting_period": None, "allocation": None, "confidence": 0.3, "method": "none"}


def doc_key(item: dict) -> str | None:
    inv = (item.get("invoice_number") or "").strip().lower()
    if not inv:
        return None
    who = (item.get("vendor_gstin") or norm_vendor(item.get("vendor")) or "?").lower()
    tot = ((item.get("doc") or {}).get("totals") or {}).get("grand_total") or item.get("amount") or 0
    return f"{who}|{inv}|{round(float(tot or 0))}"


def row_checks(row: dict, item: dict) -> list[dict]:
    c = []
    calc = row["calc"]
    if calc.get("formula_id") is None and not row.get("no_record"):
        if row["ghg"]["scope"] in ("scope_1", "scope_2", "biogenic"):
            c.append({"code": "needs_quantity", "level": "warn", "message": f"{', '.join(calc['missing'])} missing - Scope 1/2 cannot be spend-based"})
        else:
            c.append({"code": "cannot_calculate", "level": "warn", "message": "; ".join(calc["notes"]) or "Missing values"})
    elif calc.get("ef_method") == "spend":
        c.append({"code": "spend_based", "level": "warn", "message": "Spend-based (no physical quantity) - lower data quality"})
    if calc.get("status") == "TBD":
        c.append({"code": "module_schema_tbd", "level": "info", "message": "Water/Waste record schema not confirmed with Emergent yet"})
    for n in calc.get("notes", []):
        if n and "Spend-based" not in n and "Cannot calculate" not in n:
            c.append({"code": "unit_note", "level": "warn", "message": n})
    for n in calc.get("info", []):
        c.append({"code": "calc_info", "level": "info", "message": n})
    act = load().taxonomy.get(row["activity_id"]) if row.get("activity_id") else None
    dim = row.get("dimension")
    if act and dim and dim not in ("currency", "unknown") and dim not in act["dimensions"]:
        c.append({"code": "unit_dimension", "level": "warn",
                  "message": f"Unit '{item.get('unit')}' ({dim}) does not fit {act['label'][:40]} - check the unit"})
    q, a = row.get("quantity"), row.get("amount")
    cur = (row.get("currency") or load().policy["currency_default"]).upper()
    if act and q and a and cur == "INR" and not row.get("derived") and not any("lump sum" in n for n in calc.get("notes", [])):
        for rx, unit, lo, hi in PRICE_RANGES:
            if re.search(rx, act["id"]) and row.get("unit") == unit:
                p = a / q
                if not lo <= p <= hi:
                    c.append({"code": "unit_price", "level": "warn",
                              "message": f"Price works out to ₹{p:,.2f} per {unit} (usual {lo}-{hi}) - check quantity/unit"})
    if q is not None and q < 0:
        c.append({"code": "negative", "level": "warn", "message": "Negative quantity (credit note or reversal?)"})
    lcf = [f.lower() for f in item.get("low_confidence_fields") or []]
    if lcf:
        c.append({"code": "unclear_on_document", "level": "warn", "message": "Unclear on the document: " + ", ".join(item["low_confidence_fields"])})
    if not row["facility"]["id"]:
        c.append({"code": "facility_unmatched", "level": "warn",
                  "message": f"No facility matched{(' for ' + repr(item.get('facility_hint')[:60])) if item.get('facility_hint') else ''} - choose one"})
    elif row["facility"]["method"] == "only facility in organisation":
        c.append({"code": "facility_assumed", "level": "info", "message": "Assigned to the only facility in the organisation"})
    p = row["period"]
    if not p["reporting_period"]:
        c.append({"code": "no_period", "level": "warn", "message": "No billing period or date found"})
    else:
        try:
            y, m = map(int, p["reporting_period"].split("-"))
            if date(y, m, 1) > date.today():
                c.append({"code": "future_period", "level": "error", "message": f"Period {p['reporting_period']} is in the future"})
        except ValueError:
            pass
        if p["method"] == "invoice date" and (item.get("doc") or {}).get("document_type") == "utility_bill":
            c.append({"code": "period_from_bill_date", "level": "info", "message": "Period taken from the bill date - the consumption month may be earlier"})
    if not item.get("vendor") and item["source"].get("kind") == "document":
        c.append({"code": "no_vendor", "level": "info", "message": "Vendor not found on the document"})
    if item["source"].get("hidden_sheet"):
        c.append({"code": "hidden_sheet", "level": "info", "message": "Row comes from a hidden sheet"})
    return c


def finish(row: dict, item: dict) -> dict:
    pol = load().policy["review"]
    q_conf = float(item.get("line_confidence") or 0.9)
    if any(f.lower() in ("quantity", "unit", "amount") or "quantity" in f.lower() for f in item.get("low_confidence_fields") or []):
        q_conf = min(q_conf, 0.7)
    if row["calc"].get("formula_id") is None:
        q_conf = min(q_conf, 0.5)
    conf = {"classification": row["decision"]["confidence"], "quantity": round(q_conf, 3),
            "facility": row["facility"]["confidence"], "period": row["period"]["confidence"]}
    conf["overall"] = round(min(conf.values()), 3)
    row["confidence"] = conf
    levels = {c["level"] for c in row["checks"]}
    if row["decision"].get("question") or conf["classification"] < pol["ask_below"]:
        row["review_status"] = "ask"
    elif conf["overall"] >= pol["ready_threshold"] and not ({"warn", "error"} & levels if pol["ready_requires_no_warnings"] else {"error"} & levels):
        row["review_status"] = "ready"
    else:
        row["review_status"] = "needs_attention"
    row["trust"] = trust(row)
    return row


TRUST_LABEL = {"high": "High", "check": "Check", "needs_you": "Needs you"}


def trust(row: dict) -> dict:
    """A plain label instead of a made-up percentage: {'level': high | check | needs_you, 'label', 'reasons': [..]}.

    High      the method(s) agree or you confirmed it before, and nothing looks odd.
    Check     only one method decided, the answer was remembered but never confirmed, or there is a warning.
    Needs you a question is open, a value is missing, the methods disagree, or a check failed.
    Percentages come later, once enough reviewed lines show how often each level is right."""
    d, conf, checks = row["decision"], row["confidence"], row.get("checks") or []
    src, reason = d.get("source") or "", d.get("reason") or ""
    needs: list[str] = []
    look: list[str] = []
    good: str | None = None

    if row.get("review_status") == "ask":
        needs.append(d.get("question") or "We are not sure what this item is")
    if row["calc"].get("formula_id") is None and not row.get("no_record"):
        needs.append("A quantity or value is missing, so it cannot be calculated")
    if not row["period"].get("reporting_period"):
        needs.append("No period found")
    needs += [c["message"] for c in checks if c["level"] == "error"]
    if "please check" in reason:
        needs.append("Two methods gave different answers")

    if src == "memory":
        if d.get("memory_source") == "user":
            good = "You confirmed this item before" + (" (any vendor)" if d.get("memory_scope") == "all vendors" else "")
        else:
            look.append("Remembered from an earlier AI answer that nobody has confirmed yet")
    elif src == "user":
        good = "Set by you"
    elif src.startswith("rules+"):
        other = src.split("+", 1)[1]
        good = "Rules and " + SOURCE_NAME.get(other, other) + " agree"
    elif src == "rules":
        if conf["classification"] >= 0.95:
            good = "Matched a clear rule"
        else:
            look.append("Only a rule decided this, and it is not a strong match")
    else:
        look.append(f"Only one method decided this ({SOURCE_NAME.get(src, src)})")

    look += [c["message"] for c in checks if c["level"] == "warn" and c["code"] != "facility_unmatched"]   # facility is shown as its own setup step
    if conf["quantity"] < 0.9:
        look.append("The quantity was hard to read")
    if conf["period"] < 0.9 and row["period"].get("reporting_period"):
        look.append("The period is a best guess")

    if needs:
        level, reasons = "needs_you", needs
    elif look:
        level, reasons = "check", look
    else:
        level, reasons = "high", [good or "Nothing looks odd"]
    return {"level": level, "label": TRUST_LABEL[level], "reasons": reasons[:4]}


SOURCE_NAME = {"jev": "Jev", "claude": "Claude", "openai_decisions": "OpenAI"}
