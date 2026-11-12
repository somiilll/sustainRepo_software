"""Reviewer's Scope -> Category -> Calculation method -> Activity -> Fields choice for one OCR row.

Nothing is calculated here: the row keeps the chosen category / emission factor / field values and the GHG save step
runs the calculation engine with them.
"""
from __future__ import annotations

import re

from fastapi import HTTPException
from pydantic import BaseModel

from extractor_core.config import load
from extractor_core.decider.factors import _fit, bind_inputs
from extractor_core.fields import display_quantity
from extractor_core.export import to_record
from extractor_core.validate import finish, row_checks

from . import factor_inputs, store
from .ghg_save import saver

DB = store.DB
SCOPE_KEY = {"scope1": "scope_1", "scope2": "scope_2", "scope3": "scope_3", "biogenic": "biogenic"}
SCOPE_CODE = {v: k for k, v in SCOPE_KEY.items()}
MAIN_FIELD = {"scope_1": "qty", "biogenic": "qty", "scope_2": "qty_energy", "scope_3": "activity_value"}
METHOD_NAME = {"activity": "activity_basis", "spend": "spend_basis"}
FACTOR_TABLE = {"scope1": "fuel_database", "scope2": "fuel_database", "biogenic": "fuel_database", "scope3": "scope3_ef"}


class Override(BaseModel):
    scope: str
    category_id: str
    ef_method: str = "activity"
    factor_collection: str
    factor_id: str
    quantity: float | None = None
    unit: str | None = None
    amount: float | None = None
    currency: str | None = None
    dynamic: dict[str, dict] | None = None


def _cat_sort(c: dict):
    m = re.match(r"C(\d+)\b", c["name"])
    return (int(m.group(1)) if m else 0, c["name"])


def _row_scope(row: dict) -> str:
    g = row.get("ghg") or {}
    if g.get("scope") == "water" or "water" in (row.get("modules") or []) and not g.get("scope"):
        return "water"
    return SCOPE_CODE.get(g.get("scope"), "")


def _from_calc(calc: dict) -> dict:
    f = calc.get("fields") or {}
    return {k: {"value": v, "unit": f.get(f"{k}_unit", "")} for k, v in f.items() if not k.endswith("_unit") and isinstance(v, (int, float))}


async def edit_config(db, org: str, row: dict) -> dict:
    from bulk_upload_scope3.ghg_config_resolver import resolve_ghg_capabilities

    caps = await resolve_ghg_capabilities(db, org)
    current_scope = _row_scope(row)
    enabled = {"scope1": caps.scope1_enabled, "scope2": caps.scope2_enabled, "scope3": caps.scope3_enabled, "biogenic": current_scope == "biogenic"}
    scopes = await db.scopes.find({"code": {"$in": list(SCOPE_KEY)}, "is_active": {"$ne": False}}, {"_id": 0}).sort("display_order", 1).to_list(10)
    scopes = [s for s in scopes if enabled.get(s["code"])]
    code_of = {s["id"]: s["code"] for s in scopes}
    cats = await db.emission_categories.find({"is_active": {"$ne": False}, "scope_id": {"$in": list(code_of)}}, {"_id": 0, "id": 1, "name": 1, "code": 1, "scope_id": 1}).to_list(300)
    methods: dict[str, list[str]] = {}
    async for g in db.scope3_ef.aggregate([{"$group": {"_id": {"c": "$category", "m": "$method"}}}]):
        m = {v: k for k, v in METHOD_NAME.items()}.get(g["_id"]["m"])
        if m:
            methods.setdefault(str(g["_id"]["c"]).lower(), []).append(m)
    out = []
    for c in sorted(cats, key=_cat_sort):
        scope = code_of[c["scope_id"]]
        m = re.match(r"(C\d+)\b", c["name"])
        if scope == "scope1" and not caps.is_scope1_category_enabled(c["code"]):
            continue
        if scope == "scope3" and m and not caps.is_scope3_sheet_enabled(m.group(1)):
            continue
        have = methods.get(c["name"].lower(), []) if scope == "scope3" else ["activity"]
        out.append({"id": c["id"], "name": c["name"], "code": c["code"], "scope": scope, "methods": [m for m in ("activity", "spend") if m in have]})

    review = row.get("review") or {}
    ov = review.get("override")
    current = {"scope": current_scope, "category_id": None, "ef_method": "activity", "factor": None, "dynamic": _from_calc(row.get("calc") or {}), "from_override": bool(ov)}
    if ov:
        doc = await db[ov["factor"]["collection"]].find_one({"id": ov["factor"]["id"]}, {"_id": 0})
        current.update(category_id=ov["category_id"], ef_method=ov["ef_method"], factor=saver._option(doc, ov["factor"]["collection"]) if doc else None, dynamic=ov.get("dynamic") or current["dynamic"])
    elif current_scope in SCOPE_KEY:
        rec = to_record(row)
        try:
            cat = await saver.resolve_category(db, rec)
            current["category_id"] = cat["id"]
            current["ef_method"] = (row.get("calc") or {}).get("ef_method") or "activity"
            current["factor"] = await saver.resolve_factor(db, org, rec, cat, review.get("factor"))
        except saver.SaveError:
            pass
    return {"scopes": [{"code": s["code"], "label": s["name"]} for s in scopes] + ([{"code": "water", "label": "Water"}] if current_scope == "water" else []),
            "categories": out, "current": current}


async def factor_options(db, row: dict, scope: str, category_id: str, method: str, q: str, org: str = "", facility_id: str | None = None) -> list[dict]:
    if scope not in SCOPE_KEY:
        raise HTTPException(400, "Unknown scope")
    cat = await db.emission_categories.find_one({"id": category_id, "is_active": {"$ne": False}}, {"_id": 0})
    if not cat:
        raise HTTPException(400, "Unknown category")
    rec = {"scope": SCOPE_KEY[scope], "ef_method": method if scope == "scope3" else "activity", "subcategory": (row.get("ghg") or {}).get("subcategory")}
    fid = facility_id or (row.get("facility") or {}).get("id")
    fac = await db.facilities.find_one({"id": fid, "organization_id": org}, {"_id": 0, "sector": 1}) if fid else None
    return await saver.search_factors(db, rec, cat, q, limit=300, sector=(fac or {}).get("sector") or None, unique=True)


def apply_override(row: dict, item: dict, ov: Override, remember: bool, org: str) -> dict:
    if ov.scope not in SCOPE_KEY:
        raise HTTPException(400, "Choose Scope 1, 2 or 3")
    cat = DB.emission_categories.find_one({"id": ov.category_id, "is_active": {"$ne": False}}, {"_id": 0})
    scope_doc = DB.scopes.find_one({"id": (cat or {}).get("scope_id")}, {"_id": 0, "code": 1})
    if not cat or (scope_doc or {}).get("code") != ov.scope:
        raise HTTPException(400, "That category does not belong to the chosen scope")
    if ov.factor_collection != FACTOR_TABLE[ov.scope]:
        raise HTTPException(400, "That emission factor does not belong to the chosen scope")
    doc = DB[ov.factor_collection].find_one({"id": ov.factor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(400, "That activity no longer exists")
    factor = saver._option(doc, ov.factor_collection)
    sk = SCOPE_KEY[ov.scope]
    method = ov.ef_method if ov.scope == "scope3" else "activity"
    if method not in ("activity", "spend", "supplier"):
        raise HTTPException(400, "Unknown calculation method")

    dynamic = {k: v for k, v in (ov.dynamic or {}).items() if isinstance(v, dict) and v.get("value") not in (None, "")}
    if not dynamic and method == "activity" and ov.scope == "scope3":
        spec = factor_inputs.required_inputs({"collection": ov.factor_collection, "category_id": cat["id"], "method": "activity", "activity_type": doc.get("activity_type")})
        if spec and not (len(spec) == 1 and spec[0]["variable"] == "activity_value"):
            bound = bind_inputs(spec, item, factor.get("allowed_units"))
            if bound["missing"]:
                raise HTTPException(400, "This emission factor needs: " + ", ".join(bound["missing"]) + ". Enter them before saving.")
            dynamic = {k: {"value": v, "unit": bound["fields"].get(f"{k}_unit", "")} for k, v in bound["fields"].items() if not k.endswith("_unit")}
    if dynamic:
        fields = {}
        for k, v in dynamic.items():
            fields[k] = v["value"]
            fields[f"{k}_unit"] = v.get("unit") or ""
    elif method == "spend":
        if ov.amount is None:
            raise HTTPException(400, "Enter the amount spent")
        fields = {"spent_value": ov.amount, "spent_value_unit": ov.currency or row.get("currency") or "INR"}
    else:
        if ov.quantity is None or not ov.unit:
            raise HTTPException(400, "Enter the quantity and its unit")
        allowed = [u.lower() for u in factor.get("allowed_units") or []]
        if allowed and ov.unit.lower() not in allowed:
            raise HTTPException(400, f"Unit '{ov.unit}' is not allowed for '{factor['label']}'. Allowed: {', '.join(factor['allowed_units'])}")
        key = "activity_value_supplier_based" if method == "supplier" else MAIN_FIELD[sk]
        fields = {key: ov.quantity, f"{key}_unit": ov.unit}

    old = row["ghg"]
    row["ghg"] = {"scope": sk, "category": cat["name"], "subcategory": factor["label"], "scope_label": load().taxonomy.raw["scope_labels"][sk],
                  "category_label": cat["name"], "subcategory_label": factor["label"], "category_id": cat["id"], "subcategory_id": factor["id"]}
    row["calc"] = {"formula_id": "reviewer_selection", "formula_label": "Chosen in Edit - calculated when saved", "ef_method": method, "fields": fields,
                   "missing": [], "notes": [], "info": [], "status": "ok", "emergent_formula_id": None}
    if not dynamic and method != "spend":
        row["quantity"], row["unit"], row["dimension"] = ov.quantity, ov.unit, None
    if method == "spend":
        row["amount"], row["currency"] = ov.amount, ov.currency or row.get("currency")
    row["decision"] = {**row["decision"], "source": "user", "confidence": 0.99, "question": None, "alternatives": [], "level": "certain", "tags": ["confirmed_by_you"],
                       "reason": "Scope, category and activity chosen by reviewer"}
    row["checks"] = row_checks({**row, "activity_id": None}, item)
    finish(row, item)
    row["review"] = {**(row.get("review") or {}), "factor": {"collection": ov.factor_collection, "id": ov.factor_id},
                     "override": {"scope": ov.scope, "category_id": cat["id"], "ef_method": method, "factor": {"collection": ov.factor_collection, "id": ov.factor_id},
                                  "dynamic": dynamic or None}}
    if remember:
        DB.ocr_ext_factor_choices.update_one({"organization_id": org, "key": saver.factor_key(to_record(row))},
                                             {"$set": {"collection": ov.factor_collection, "factor_id": ov.factor_id}}, upsert=True)
    return old


def prefill(item: dict, collection: str, factor_id: str, category_id: str, method: str) -> dict:
    """What the row already holds, mapped onto the inputs of the chosen factor: {'dynamic': {var: {value, unit}}, 'quantity', 'unit', 'amount', 'currency'}."""
    doc = DB[collection].find_one({"id": factor_id}, {"_id": 0})
    if not doc:
        raise HTTPException(400, "That activity no longer exists")
    factor = saver._option(doc, collection)
    out: dict = {"dynamic": {}, "quantity": None, "unit": None, "amount": item.get("amount"), "currency": item.get("currency")}
    if method == "spend":
        return out
    spec = factor_inputs.required_inputs({"collection": collection, "category_id": category_id, "method": "activity", "activity_type": doc.get("activity_type")}) if collection == "scope3_ef" else None
    if spec:
        b = bind_inputs(spec, item, factor.get("allowed_units"))
        out["dynamic"] = {k: {"value": v, "unit": b["fields"].get(f"{k}_unit", "")} for k, v in b["fields"].items() if not k.endswith("_unit")}
    qty, unit, dim = display_quantity(item)
    st, q2, u2 = _fit(factor.get("allowed_units") or [], qty, unit, dim)
    if st == "ok":
        out["quantity"], out["unit"] = q2, u2
    return out
