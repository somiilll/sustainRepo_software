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
    c += [{"code": "row_read", "level": "warn", "message": n} for n in item.get("read_notes") or []]
    if not row["facility"]["id"]:
        sug = (row["facility"].get("suggestion") or {}).get("name")
        hint = f" for {item['facility_hint'][:60]!r}" if item.get("facility_hint") else ""
        c.append({"code": "facility_unmatched", "level": "warn",
                  "message": f"Facility{hint} not recognised - did you mean {sug!r}? Confirm it to assign" if sug else f"No facility matched{hint} - choose one"})
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


ORDER = ["certain", "likely", "uncertain", "guess"]
FACILITY_LEVEL = {"chosen by you": "certain", "you chose this before": "certain", "default for rows without a facility": "certain",
                  "exact name": "certain", "known alias": "certain", "similar name - please confirm": "uncertain"}
PERIOD_LEVEL = {"billing period": "certain", "period column": "certain", "invoice date": "likely"}


def _worse(a: str, b: str) -> str:
    return max(a, b, key=ORDER.index)


TAG_TEXT = {"unknown_brand": "brand not recognised", "material_inferred": "material guessed from the name", "ambiguous_between_options": "more than one option fits",
            "spend_proxy": "estimated from the amount spent", "no_good_option": "no clear match", "variant_unspecified": "variant not stated",
            "unit_printed": "unit is printed", "currency_printed": "currency is printed", "column_pattern": "same as the other rows", "spec_in_name": "number is part of the item name",
            "only_number_in_row": "only number on the row", "code_or_serial": "looks like a code or serial number", "unit_assumed": "unit was assumed", "brand_unknown": "brand not recognised", "product_inferred": "product guessed from the name",
            "missing_value": "value is missing", "needs_disposal_route": "disposal route not stated", "ai_read": "read by AI",
            "ambiguous_between_roles": "could be a quantity or an amount", "no_context": "nothing nearby to confirm it"}
TAG_HIDDEN = {"haiku_final", "jev_pick", "org_context_used", "exact_name", "none", "rules_and_ai_agree"}


def plain(tags: list) -> list[str]:
    return list(dict.fromkeys(TAG_TEXT.get(t, t.replace("_", " ")) for t in tags if t not in TAG_HIDDEN))


def decision_basis(d: dict) -> dict:
    """What the classification rests on. Factor decisions carry the AI's own level and tags; the older flows (rules, Jev, memory) are described by method."""
    if d.get("level"):
        return {"level": d["level"], "tags": d.get("tags") or []}
    src, c = d.get("source") or "", d.get("confidence") or 0
    if src == "user" or (src == "memory" and d.get("memory_source") == "user"):
        return {"level": "certain", "tags": ["confirmed_by_you"]}
    if src == "memory":
        return {"level": "likely", "tags": ["remembered_ai_answer"]}
    if src == "none" or not d.get("activity_id"):
        return {"level": "none", "tags": ["no_match"]}
    tags = ["rules_and_ai_agree"] if src.startswith("rules+") else [SOURCE_NAME.get(src, src)]
    rev = load().policy["review"]
    return {"level": "certain" if c >= rev["ready_threshold"] else "likely" if c >= rev["ask_below"] else "uncertain", "tags": tags}


def read_basis(row: dict, item: dict) -> dict:
    if row["calc"].get("formula_id") is None:
        return {"level": "none", "tags": ["missing_value"]}
    ai = (item.get("scan") or {}).get("ai_levels") or []
    level, tags = "certain", ["read_from_row"]
    for a in ai:
        level, tags = _worse(level, a["level"]), (a.get("tags") or ["ai_read"]) if _worse(level, a["level"]) == a["level"] else tags
    if item.get("read_notes"):
        level, tags = _worse(level, "uncertain"), tags + ["see_notes"]
    if any("quantity" in f.lower() or f.lower() in ("unit", "amount") for f in item.get("low_confidence_fields") or []):
        level, tags = _worse(level, "uncertain"), tags + ["unclear_on_document"]
    return {"level": level, "tags": tags}


def finish(row: dict, item: dict) -> dict:
    pol = load().policy["review"]
    fm, pm = row["facility"].get("method") or "", row["period"].get("method") or ""
    plevel = PERIOD_LEVEL.get(pm, "none")
    if pm == "invoice date" and (row["period"].get("confidence") or 1) < 0.9:
        plevel = "uncertain"
    basis = {"classification": decision_basis(row["decision"]), "quantity": read_basis(row, item),
             "facility": {"level": FACILITY_LEVEL.get(fm, "none") if row["facility"].get("id") else "none", "tags": [fm] if fm else []},
             "period": {"level": plevel, "tags": [pm] if pm and pm != "none" else []}}
    for v in basis.values():
        v["notes"] = plain(v.get("tags") or [])
    row["basis"] = basis
    row["read_tags"] = (item.get("scan") or {}).get("ai_levels") or []
    levels = {c["level"] for c in row["checks"]}
    good = lambda k: basis[k]["level"] in ("certain", "likely")      # noqa: E731
    if row["decision"].get("question") or basis["classification"]["level"] in ("uncertain", "guess", "none"):
        row["review_status"] = "ask"
    elif good("classification") and good("quantity") and basis["facility"]["level"] != "none" and basis["period"]["level"] != "none" \
            and not ({"warn", "error"} & levels if pol["ready_requires_no_warnings"] else {"error"} & levels):
        row["review_status"] = "ready"
    else:
        row["review_status"] = "needs_attention"
    row["trust"] = trust(row)
    return row


TRUST_LABEL = {"high": "High", "check": "Check", "needs_you": "Needs you"}


def trust(row: dict) -> dict:
    """A plain label with reasons, no percentages: {'level': high | check | needs_you, 'label', 'reasons': [..]}.

    High      identified outright (exact name, your confirmation, or the AI says certain) and nothing looks odd.
    Check     the AI says likely, only one method decided, or there is a warning.
    Needs you a question is open, a value is missing, or a check failed."""
    d, b, checks = row["decision"], row["basis"], row.get("checks") or []
    needs: list[str] = []
    look: list[str] = []
    good: str | None = None
    cl = b["classification"]
    tags = ", ".join(plain(cl["tags"])[:3])

    if row.get("review_status") == "ask":
        needs.append(d.get("question") or "We are not sure what this item is")
    if row["calc"].get("formula_id") is None and not row.get("no_record"):
        needs.append("A quantity or value is missing, so it cannot be calculated")
    if not row["period"].get("reporting_period"):
        needs.append("No period found")
    needs += [c["message"] for c in checks if c["level"] == "error"]
    if "please check" in (d.get("reason") or ""):
        needs.append("Two methods gave different answers")

    if cl["level"] == "certain":
        good = "Matched exactly" if "exact_name" in cl["tags"] else "You confirmed this item before" if "confirmed_by_you" in cl["tags"] else f"Clearly identified ({tags})" if tags else "Clearly identified"
    elif cl["level"] == "likely":
        look.append(f"Likely match ({tags}) - worth a glance" if tags else "Likely match - worth a glance")
    look += [c["message"] for c in checks if c["level"] == "warn" and c["code"] != "facility_unmatched"]
    if b["quantity"]["level"] in ("uncertain", "guess"):
        look.append("The quantity was hard to read")
    if b["period"]["level"] in ("likely", "uncertain") and row["period"].get("reporting_period"):
        look.append("The period is a best guess")

    if needs:
        level, reasons = "needs_you", needs
    elif look:
        level, reasons = "check", look
    else:
        level, reasons = "high", [good or "Nothing looks odd"]
    return {"level": level, "label": TRUST_LABEL[level], "reasons": reasons[:4]}


SOURCE_NAME = {"jev": "Jev", "claude": "Claude", "openai_decisions": "OpenAI"}
