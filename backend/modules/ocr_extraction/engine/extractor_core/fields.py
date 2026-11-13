"""Step 5 - activity + extracted values -> the Emergent formula and the exact field keys Save-all writes.

Emergent: a subcategory's emission factor picks a formula; the formula decides the fields (qty, qty_energy,
spent_value, qty_travelled + km_travelled, ...); every field also stores '<key>_unit'. Values here are already in
canonical units (L, kg, kWh, m3, km). Scope 1/2 have no spend formula, so a fuel/electricity line without a quantity
cannot be calculated and goes to review; Scope 3 falls back to spend-based (policy: spend_based_flagged).
"""
from __future__ import annotations

from .config import load
from .units import emergent_unit, to_canonical

QTY_KEYS = {"qty", "qty_energy", "activity_value", "quantity_used_process_emissions", "activity_value_supplier_based"}


def _formula_fits(fid: str, ghg: dict) -> bool:
    f = load().formulas[fid]
    if ghg["scope"] not in f["scopes"]:
        return False
    cats = f["categories"]
    return cats == "*" or ghg["category"] in cats


def candidate_formulas(activity: dict, ghg: dict) -> list[str]:
    fs = [f for f in activity["formulas"] if _formula_fits(f, ghg)]
    if not fs and ghg["scope"] == "scope_3":
        fs = [f for f in ("s3_activity", "s3_spend") if _formula_fits(f, ghg)]
    return fs


def _value_for(key: str, field: dict, item: dict, qty_c, unit_c, dim):
    """(value, unit) for one formula field, or (None, None)."""
    dims = field.get("dimension")
    if key in QTY_KEYS:
        if qty_c is not None and unit_c and (not dims or dim in dims):
            return qty_c, emergent_unit(unit_c)
        return None, None
    if key == "spent_value":
        a = item.get("amount")
        return (a, item.get("currency") or load().policy["currency_default"]) if a is not None else (None, None)
    if key == "qty_travelled":
        if item.get("weight_kg"):
            return item["weight_kg"], "kg"
        return (qty_c, emergent_unit(unit_c)) if dim == "mass" and qty_c is not None else (None, None)
    if key == "km_travelled":
        return (item["distance_km"], "km") if item.get("distance_km") else ((qty_c, "km") if dim == "distance" and qty_c else (None, None))
    if key == "qty_passenger":
        return item.get("passengers") or field.get("default"), "Nos"
    if key == "qty_days_travelled":
        return field.get("default", 1), "days"
    if key == "qty_room":
        return item.get("rooms") or field.get("default"), "Nos"
    if key == "qty_nights":
        if item.get("nights"):
            return item["nights"], "nights"
        return (qty_c, "nights") if dim == "count" and qty_c else (None, None)
    return None, None


def capacity_conversion(activity: dict, item: dict) -> tuple[dict, str | None]:
    """'5 Nos CO2 type 4.5 kg extinguisher' -> 22.5 kg of CO2 refilled (fugitive gases only). Returns (item, note)."""
    import re
    qty_c, unit_c, dim, _ = to_canonical(item.get("quantity"), item.get("unit"))
    if dim != "count" or not qty_c or "s1_fugitive" not in activity.get("formulas", []):
        return item, None
    m = re.search(r"(\d+(?:\.\d+)?)\s*kg", " ".join(str(item.get(k) or "") for k in ("description", "description_en")), re.I)
    if not m:
        return item, None
    cap = float(m.group(1))
    return {**item, "quantity": qty_c * cap, "unit": "kg"}, f"{qty_c:g} x {cap:g} kg capacity = {qty_c * cap:g} kg gas refilled"


def lump_sum_note(activity: dict, qty, unit, amount) -> str | None:
    """'1 L of diesel for Rs 1.3 crore' is a lump-sum reimbursement, not one litre: drop the quantity."""
    if qty != 1 or not amount:
        return None
    import re
    from .validate import PRICE_RANGES
    for rx, u, lo, hi in PRICE_RANGES:
        if re.search(rx, activity["id"]) and unit == u and amount > hi * 50:
            return f"Quantity 1 {u} for {amount:,.0f} looks like a lump sum, not a real quantity - add the actual {u}"
    return None


def build_calc(activity: dict, ghg: dict, item: dict) -> dict:
    cfg = load()
    qty_c, unit_c, dim, unit_warn = to_canonical(item.get("quantity"), item.get("unit"))
    notes = [unit_warn] if unit_warn else []
    info: list[str] = []          # explanations, not problems
    item, cap_note = capacity_conversion(activity, item)
    if cap_note:
        info.append(cap_note)
        qty_c, unit_c, dim, _ = to_canonical(item.get("quantity"), item.get("unit"))
    inr = (item.get("currency") or "INR").upper() == "INR"
    lump = lump_sum_note(activity, qty_c, unit_c, item.get("amount") if inr else None)
    if lump:
        notes.append(lump)
        qty_c, unit_c, dim = None, None, "unknown"
    if item.get("quantity") is not None and not item.get("unit"):
        notes.append(f"Quantity {item['quantity']:g} has no unit on the document - add the unit")
    tried = []
    for fid in candidate_formulas(activity, ghg):
        f = cfg.formulas[fid]
        vals, missing = {}, []
        for fld in f["fields"]:
            v, u = _value_for(fld["key"], fld, item, qty_c, unit_c, dim)
            if v is None:
                if fld.get("required"):
                    missing.append(fld["label"])
                continue
            vals[fld["key"]] = round(v, 6) if isinstance(v, float) else v
            vals[f"{fld['key']}_unit"] = u
        if not missing:
            if f["ef_method"] == "spend" and tried:
                notes.append(f"Spend-based because {tried[0][1]} is missing")
            return {"formula_id": fid, "formula_label": f["label"], "ef_method": f["ef_method"], "fields": vals,
                    "missing": [], "notes": notes, "info": info, "status": f.get("status", "ok"),
                    "emergent_formula_id": f.get("emergent_formula_id")}
        tried.append((fid, ", ".join(missing)))
    first = tried[0] if tried else (None, "a matching formula")
    return {"formula_id": None, "formula_label": None, "ef_method": None, "fields": {},
            "missing": [first[1]], "notes": notes + [f"Cannot calculate: {first[1]} missing"], "info": info, "status": "incomplete",
            "emergent_formula_id": None}


def display_quantity(item: dict) -> tuple[float | None, str | None, str | None]:
    q, u, d, _ = to_canonical(item.get("quantity"), item.get("unit"))
    if q is None:
        return None, item.get("unit"), None
    return round(q, 4), emergent_unit(u) if u else item.get("unit"), d
