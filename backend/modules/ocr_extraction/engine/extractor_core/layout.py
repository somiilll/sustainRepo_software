"""Step 2 (spreadsheets) - understand a table's layout ONCE, then apply it to every row with plain code.

Three shapes cover factory registers:
  ledger        one row per transaction/item (Description | Qty | Unit | Amount | Date ...)
  wide_months   items down, months across (Item | Apr-25 | May-25 | ...)
  column_items  months/dates down, items across (Month | Diesel (L) | LPG (kg) | Electricity (kWh))
A layout is recognised by a header fingerprint. Order: org memory -> heuristics -> Claude (headers + 20 rows only).
"""
from __future__ import annotations

import hashlib
import re

from . import llm
from .config import load
from .normalise import Table, _cell_str
from .periods import fy_start_year, parse_date, parse_month
from .units import normalize_unit, parse_number, unit_from_header

ROLE_ALIASES = {
    "description": ["description", "item description", "item", "particulars", "material", "material description", "item name",
                    "product", "product name", "fuel", "fuel type", "goods", "description of goods", "nature of expense", "activity",
                    "service", "expense", "details", "commodity", "waste type", "type of waste", "gas", "refrigerant", "ledger"],
    "quantity": ["quantity", "qty", "consumption", "consumed", "quantity consumed", "billed qty", "volume", "net quantity",
                 "units consumed", "kwh consumed", "no of units", "units", "kwh", "energy consumed", "litres", "liters", "kg", "net weight", "weight", "quantity used"],
    "unit": ["unit", "uom", "unit of measure", "units of measure", "measure"],
    "amount": ["amount", "total amount", "net amount", "invoice amount", "bill amount", "total", "cost", "value", "spend", "total cost",
               "taxable value", "debit", "amount rs", "amount inr", "net payable", "grand total", "expense amount"],
    "rate": ["rate", "unit price", "price", "rate per unit"],
    "currency": ["currency", "curr"],
    "date": ["date", "invoice date", "bill date", "posting date", "voucher date", "doc date", "document date", "transaction date"],
    "period": ["month", "period", "billing period", "reporting month", "reporting period", "fy", "financial year", "billing month"],
    "facility": ["facility", "facility name", "plant", "plant name", "site", "location", "unit name", "branch", "factory", "cost centre", "cost center"],
    "vendor": ["vendor", "vendor name", "supplier", "supplier name", "party", "party name", "payee", "transporter", "service provider"],
    "invoice_number": ["invoice no", "invoice number", "bill no", "bill number", "voucher no", "doc no", "document no", "inv no", "lr no", "reference"],
    "hsn": ["hsn", "sac", "hsn sac", "hsn code", "sac code", "hsn/sac"],
    "distance_km": ["distance", "distance km", "km", "kms", "distance travelled", "trip km"],
    "origin": ["from", "origin", "source", "from location", "pickup"],
    "destination": ["to", "destination", "to location", "drop"],
    "notes": ["remarks", "notes", "narration", "comments", "purpose", "remark"],
    "category_hint": ["category", "type", "expense type", "head", "account head", "ledger name", "nature", "expense head", "sub category", "scope"],
    "vehicle": ["vehicle", "vehicle no", "vehicle number", "equipment", "asset", "dg set"],
}
TOTAL_ROW = re.compile(r"^\s*(grand\s*)?(sub\s*)?total\b|^\s*sum\b|^\s*net\s+total|^\s*total\s*:", re.I)


def _clean_header(h: str) -> str:
    h = re.sub(r"[\(\[].*?[\)\]]", " ", str(h or "")).lower()
    h = re.sub(r"[^a-z0-9/ ]", " ", h)
    return re.sub(r"\s+", " ", h).strip()


def fingerprint(t: Table) -> str:
    return hashlib.sha1("|".join(_clean_header(h) for h in t.header).encode()).hexdigest()[:16]


def _col_numeric_share(t: Table, c: int, n: int = 40) -> float:
    vals = [r[c] for r in t.rows[:n] if c < len(r) and _cell_str(r[c])]
    if not vals:
        return 0.0
    return sum(1 for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool) or
               (isinstance(v, str) and parse_number(v) is not None and not re.search(r"[a-z]{3,}", v.lower()))) / len(vals)


def heuristic_spec(t: Table) -> dict:
    cfg = load().policy
    fy0 = fy_start_year(" ".join(t.title_lines + [t.sheet]))
    heads = [_clean_header(h) for h in t.header]
    roles: dict[str, int] = {}
    # exact alias, then "starts with alias" - numeric columns cannot be description/unit/vendor
    for pass_ in ("exact", "prefix"):
        for c, h in enumerate(heads):
            if not h or c in roles.values():
                continue
            num = _col_numeric_share(t, c)
            for role, aliases in ROLE_ALIASES.items():
                if role in roles:
                    continue
                hit = h in aliases if pass_ == "exact" else any(h.startswith(a + " ") or h.endswith(" " + a) for a in aliases if len(a) > 2)
                if not hit:
                    continue
                if role in ("description", "unit", "vendor", "facility", "origin", "destination", "category_hint", "invoice_number") and num > 0.8:
                    continue
                if role in ("quantity", "amount", "distance_km", "rate") and num < 0.5:
                    if role == "quantity" and h == "units" and "unit" not in roles:
                        roles["unit"] = c
                    continue
                roles[role] = c
                break
    header_units = {c: unit_from_header(h) for c, h in enumerate(t.header) if unit_from_header(h)}
    month_cols = {c: parse_month(h, fy0, cfg["periods"]["fy_start_month"]) for c, h in enumerate(t.header)}
    month_cols = {c: m for c, m in month_cols.items() if m and c not in roles.values() and _col_numeric_share(t, c) >= 0.5}
    context = {"title": " | ".join(t.title_lines), "sheet": t.sheet, "fy_start": fy0}

    if len(month_cols) >= 3:
        desc = roles.get("description", roles.get("category_hint"))
        if desc is None:      # first text column
            desc = next((c for c in range(t.ncols) if c not in month_cols and _col_numeric_share(t, c) < 0.5), None)
        kind = "amount" if re.search(r"amount|cost|rs\b|inr|spend|₹", " ".join(t.title_lines + [t.sheet]), re.I) else "quantity"
        return {"shape": "wide_months", "columns": {**roles, **({"description": desc} if desc is not None else {})},
                "month_columns": month_cols, "value_kind": kind, "header_units": header_units, "context": context,
                "score": 0.85 if desc is not None else 0.5, "source": "heuristic"}

    has_value = "quantity" in roles or "amount" in roles
    if "description" not in roles and "category_hint" in roles:
        roles["description"] = roles.pop("category_hint")
    if "description" in roles and has_value:
        score = 0.6 + 0.25 * ("quantity" in roles) + 0.1 * ("amount" in roles) + 0.05 * bool({"date", "period"} & roles.keys())
        return {"shape": "ledger", "columns": roles, "header_units": header_units, "context": context,
                "score": min(score, 0.95), "source": "heuristic"}

    # column items: several numeric columns that are not generic quantity/amount, keyed by a date/month column
    keycol = roles.get("period", roles.get("date"))
    if keycol is None:
        keycol = next((c for c in range(t.ncols) if sum(1 for r in t.rows[:20] if c < len(r) and parse_month(r[c], fy0)) >= 3), None)
    item_cols = {}
    for c, h in enumerate(t.header):
        if c == keycol or c in roles.values() or not h or _col_numeric_share(t, c) < 0.6:
            continue
        kind = "amount" if re.search(r"amount|cost|\brs\b|inr|₹|value|bill", h, re.I) else "quantity"
        item_cols[c] = {"description": re.sub(r"[\(\[].*?[\)\]]", "", h).strip(), "unit": header_units.get(c), "value_kind": kind}
    # a generic quantity/amount column ("Billed consumption") means one row per reading, not one column per item
    if keycol is not None and item_cols and not has_value:
        return {"shape": "column_items", "columns": {**roles, "period": keycol}, "item_columns": item_cols,
                "header_units": header_units, "context": context, "score": 0.8, "source": "heuristic"}

    # ledger with no description column but a clear value: description comes from the sheet/title ("Diesel log")
    if has_value:
        return {"shape": "ledger", "columns": roles, "header_units": header_units, "context": context,
                "constant_description": " - ".join(x for x in [t.sheet, *t.title_lines] if x)[:120],
                "score": 0.8 if {"quantity", "unit"} <= roles.keys() else 0.55, "source": "heuristic"}
    return {"shape": "unknown", "columns": roles, "header_units": header_units, "context": context, "score": 0.0, "source": "heuristic"}


# ------------------------------------------------------------------------------- Claude layout mapping
LAYOUT_SYSTEM = (
    "You map the layout of one table from a factory's Excel file so code can read every row. You see the sheet name, "
    "title lines, the header row (with 0-based column indexes) and up to 20 sample rows. Decide the shape:\n"
    "- ledger: one row per item/transaction.\n- wide_months: items down the rows, months across the columns.\n"
    "- column_items: months or dates down the rows, different items (fuels, utilities) across the columns.\n"
    "Give the 0-based column index for each role that exists (-1 if absent; use \"\" for absent text). For wide_months list each month column with "
    "its YYYY-MM (use the financial year in the title; Indian FY runs April-March). For column_items list each item column "
    "with a short item name, its unit (from the header, or null) and whether the values are quantities or amounts. "
    "If the rows have no item description (e.g. a 'Diesel issue register' with Date/Vehicle/Litres), put the item in "
    "constant_description. Never invent columns.")


def _layout_schema() -> dict:
    """Column index -1 = role absent; '' = no value (avoids nullable fields)."""
    S, I = {"type": "string"}, {"type": "integer"}
    roles = {r: I for r in ["description", "quantity", "unit", "amount", "date", "period", "facility", "vendor",
                            "invoice_number", "hsn", "distance_km", "origin", "destination", "notes", "category_hint"]}
    return llm.obj({
        "shape": {"type": "string", "enum": ["ledger", "wide_months", "column_items", "unknown"]},
        "columns": llm.obj(roles),
        "month_columns": {"type": "array", "items": llm.obj({"column": I, "period": S})},
        "item_columns": {"type": "array", "items": llm.obj({"column": I, "description": S, "unit": S,
                                                           "value_kind": {"type": "string", "enum": ["quantity", "amount"]}})},
        "wide_value_kind": {"type": "string", "enum": ["quantity", "amount"]},
        "constant_description": S,
        "facility_from_title": S,
        "confidence": {"type": "number"},
    })


def llm_spec(t: Table, model: str) -> tuple[dict, dict]:
    sample = "\n".join(f"row {t.first_row + i}: " + " | ".join(_cell_str(v) for v in r) for i, r in enumerate(t.rows[:20]))
    content = (f"Sheet: {t.sheet}\nTitle lines: {t.title_lines}\nHeader: " +
               " | ".join(f"[{c}] {h}" for c, h in enumerate(t.header)) + f"\nSample rows:\n{sample}")
    d, usage = llm.call_json(model, LAYOUT_SYSTEM, content, _layout_schema(), max_tokens=3000)
    cols = {k: v for k, v in d["columns"].items() if isinstance(v, int) and 0 <= v < t.ncols}
    spec = {"shape": d["shape"], "columns": cols, "header_units": {c: unit_from_header(h) for c, h in enumerate(t.header) if unit_from_header(h)},
            "context": {"title": " | ".join(t.title_lines), "sheet": t.sheet, "fy_start": fy_start_year(" ".join(t.title_lines + [t.sheet])),
                        "facility": d.get("facility_from_title") or None},
            "score": float(d.get("confidence") or 0.7), "source": "llm"}
    if d["shape"] == "wide_months":
        spec["month_columns"] = {m["column"]: m["period"] for m in d["month_columns"] if 0 <= m["column"] < t.ncols}
        spec["value_kind"] = d["wide_value_kind"]
    if d["shape"] == "column_items":
        spec["item_columns"] = {m["column"]: {"description": m["description"], "unit": m["unit"] or None, "value_kind": m["value_kind"]}
                                for m in d["item_columns"] if 0 <= m["column"] < t.ncols}
    if d.get("constant_description"):
        spec["constant_description"] = d["constant_description"]
    return spec, usage


def _jsonable(spec: dict) -> dict:
    """JSON keys must be strings; convert back with _from_json."""
    s = dict(spec)
    for k in ("month_columns", "item_columns", "header_units"):
        if k in s:
            s[k] = {str(c): v for c, v in s[k].items()}
    return s


def _from_json(spec: dict) -> dict:
    s = dict(spec)
    for k in ("month_columns", "item_columns", "header_units"):
        if k in s:
            s[k] = {int(c): v for c, v in s[k].items()}
    return s


def map_table(t: Table, org: str, memory, use_llm: bool, metrics: dict) -> dict:
    fp = fingerprint(t)
    if memory is not None:
        saved = memory.get_layout(org, fp)
        if saved:
            spec = _from_json(saved)
            spec["source"] = "memory"
            return spec
    spec = heuristic_spec(t)
    if spec["score"] < 0.75 and use_llm and llm.enabled():
        try:
            spec2, usage = llm_spec(t, load().policy["models"]["layout"])
            metrics.setdefault("llm_calls", []).append({"step": "layout", **usage})
            if spec2["shape"] != "unknown" and spec2["score"] >= spec["score"]:
                spec = spec2
        except llm.AIUnavailable as e:
            spec.setdefault("warnings", []).append(f"Layout AI unavailable: {e}")
    if memory is not None and spec["shape"] != "unknown" and spec["score"] >= 0.75:
        memory.save_layout(org, fp, _jsonable(spec))
    return spec


# ------------------------------------------------------------------------------- apply the spec to every row
def _get(row, c):
    return row[c] if c is not None and c < len(row) else None


def apply_spec(t: Table, spec: dict, source: dict) -> list[dict]:
    cols = spec.get("columns", {})
    hu = spec.get("header_units", {})
    ctx = spec.get("context", {})
    fy0 = ctx.get("fy_start")
    title_ctx = " | ".join(x for x in [ctx.get("sheet"), ctx.get("title")] if x)
    items: list[dict] = []

    def raw_text(row, key) -> str | None:
        v = _get(row, cols.get(key)) if cols.get(key) is not None else None
        return v.strip() if isinstance(v, str) and v.strip() else None

    def base(r_idx: int, row) -> dict:
        d = parse_date(_get(row, cols.get("date"))) if cols.get("date") is not None else None
        per = parse_month(_get(row, cols.get("period")), fy0) if cols.get("period") is not None else None
        return {
            "source": {**source, "sheet": t.sheet, "row": t.first_row + r_idx, "hidden_sheet": t.hidden_sheet},
            "facility_hint": _cell_str(_get(row, cols.get("facility"))) or ctx.get("facility") or None,
            "vendor": _cell_str(_get(row, cols.get("vendor"))) or None,
            "invoice_number": _cell_str(_get(row, cols.get("invoice_number"))) or None,
            "hsn": re.sub(r"\D", "", _cell_str(_get(row, cols.get("hsn")))) or None,
            "date": d.isoformat() if d else None,
            "period_hint": per if per and not per.startswith("????") else (f"{d.year:04d}-{d.month:02d}" if d else None),
            "distance_km": parse_number(_get(row, cols.get("distance_km"))),
            "origin": _cell_str(_get(row, cols.get("origin"))) or None,
            "destination": _cell_str(_get(row, cols.get("destination"))) or None,
            "notes": " ".join(x for x in [_cell_str(_get(row, cols.get("notes"))), _cell_str(_get(row, cols.get("category_hint"))),
                                          _cell_str(_get(row, cols.get("vehicle")))] if x) or None,
            "context": title_ctx, "line_confidence": 0.97, "currency": _cell_str(_get(row, cols.get("currency"))) or None,
            "raw": {k: v for k, v in {"quantity": raw_text(row, "quantity"), "amount": raw_text(row, "amount"),
                                      "date": raw_text(row, "date")}.items() if v},
        }

    for i, row in enumerate(t.rows):
        joined = " ".join(_cell_str(v) for v in row[:4])
        if TOTAL_ROW.search(joined):
            continue
        if spec["shape"] == "ledger":
            desc = _cell_str(_get(row, cols.get("description"))) or spec.get("constant_description") or ""
            qty = parse_number(_get(row, cols.get("quantity")))
            amt = parse_number(_get(row, cols.get("amount")))
            if not desc or (qty is None and amt is None):
                continue
            unit = _cell_str(_get(row, cols.get("unit"))) or hu.get(cols.get("quantity")) or None
            if unit is None and isinstance(_get(row, cols.get("quantity")), str):      # '12.5 KL' in one cell
                m = re.search(r"[A-Za-z][A-Za-z. ]{0,10}$", _get(row, cols.get("quantity")).strip())
                unit = m.group(0).strip() if m and normalize_unit(m.group(0)) else None
            it = base(i, row)
            if spec.get("constant_description") and not cols.get("description") and unit:
                desc = f"{desc} ({unit})"                        # the unit tells the classifier what kind of reading this is
            it.update(description=desc, quantity=qty, unit=unit, amount=amt)
            if spec.get("constant_description") and not cols.get("description"):
                it["notes"] = " ".join(x for x in [it.get("notes"), _cell_str(_get(row, cols.get("vehicle")))] if x) or None
            items.append(it)
        elif spec["shape"] == "wide_months":
            desc = _cell_str(_get(row, cols.get("description")))
            if not desc:
                continue
            unit = _cell_str(_get(row, cols.get("unit"))) or None
            for c, per in spec["month_columns"].items():
                cell = _get(row, c)
                v = parse_number(cell)
                if v is None or v == 0:
                    continue
                cell_unit = None
                if isinstance(cell, str):                     # '0.55 KL' in a row whose unit column says L
                    m = re.search(r"[A-Za-z][A-Za-z. ]{0,10}$", cell.strip())
                    cell_unit = m.group(0).strip() if m and normalize_unit(m.group(0)) else None
                it = base(i, row)
                it["source"]["column"] = t.header[c]
                if isinstance(cell, str) and cell.strip():
                    it["raw"]["quantity"] = cell.strip()
                it.update(description=desc, period_hint=per if not str(per).startswith("????") else None,
                          quantity=v if spec.get("value_kind") != "amount" else None,
                          amount=v if spec.get("value_kind") == "amount" else None,
                          unit=cell_unit or unit or hu.get(c))
                items.append(it)
        elif spec["shape"] == "column_items":
            for c, meta in spec["item_columns"].items():
                v = parse_number(_get(row, c))
                if v is None or v == 0:
                    continue
                it = base(i, row)
                it["source"]["column"] = t.header[c]
                q = meta["value_kind"] == "quantity"
                it.update(description=meta["description"], quantity=v if q else None, amount=None if q else v, unit=meta.get("unit") if q else None)
                items.append(it)
    return items
