"""Approved OCR rows -> canonical GHG emission records (category, factor, formula, calculation, evidence)."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from modules.emissions.contracts import EmissionRecordCreate
from modules.emissions.router import create_emission_record
from r2_storage import get_r2_storage

from extractor_core.config import load
from .ghg_save_service import execute_ocr_calculation
from .units import canonicalize_calc_engine_unit

SCOPE_CODE = {"scope_1": "scope1", "scope_2": "scope2", "scope_3": "scope3", "biogenic": "biogenic"}
METHOD = {"activity": "activity_basis", "spend": "spend_basis", "supplier": "supplier_basis"}
QTY_KEYS = {"qty", "qty_energy", "activity_value", "spent_value", "quantity_used_process_emissions", "activity_value_supplier_based", "qty_travelled", "qty_passenger"}
MAIN_KEYS = ("qty", "qty_energy", "activity_value", "quantity_used_process_emissions", "spent_value")
S1_METHOD = {"s1_heat": "using_heat_basis_ncv", "s1_quantity": "using_qty_basis_ef", "s1_carbon": "using_carbon_composition"}


class SaveError(Exception):
    def __init__(self, message: str, needs_factor: bool = False):
        super().__init__(message)
        self.needs_factor = needs_factor


def norm(text) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def category_name(rec: dict) -> str:
    return load().taxonomy.raw["category_labels"].get(rec["category"], rec.get("category_label") or rec["category"])


async def resolve_category(db, rec: dict) -> dict:
    scope_code = SCOPE_CODE.get(rec["scope"])
    if not scope_code:
        raise SaveError("Only Scope 1, 2, 3 and Biogenic rows can be saved to GHG records")
    scope = await db.scopes.find_one({"code": scope_code}, {"_id": 0, "id": 1})
    want = norm(category_name(rec))
    cats = await db.emission_categories.find({"scope_id": scope["id"], "is_active": {"$ne": False}}, {"_id": 0}).to_list(50)
    hit = next((c for c in cats if norm(c["name"]) == want), None) or next((c for c in cats if norm(c["name"]).startswith(want)), None)
    if not hit:
        raise SaveError(f"No GHG category '{category_name(rec)}' exists for {rec.get('scope_label')} in this system")
    return hit


def _option(doc: dict, collection: str) -> dict:
    name = doc.get("fuel_name") if collection == "fuel_database" else doc.get("activity")
    return {"id": doc["id"], "collection": collection, "label": name, "region": doc.get("region"), "source": doc.get("source"),
            "year": doc.get("year_applicable"), "unit": doc.get("unit"), "allowed_units": doc.get("allowed_units") or [],
            "activity_type": doc.get("activity_type"), "method": doc.get("method")}


def factor_query(rec: dict, category: dict) -> tuple[str, dict]:
    scope_code = SCOPE_CODE[rec["scope"]]
    if scope_code == "scope3":
        q = {"category": {"$regex": f"^{re.escape(category['name'])}$", "$options": "i"}}
        method = METHOD.get(rec["ef_method"])
        if method:
            q["method"] = method
        return "scope3_ef", q
    return "fuel_database", {"scope": scope_code, "is_active": {"$ne": False}, "$or": [{"category": category["name"]}, {"categories": category["name"]}]}


def _prefer(opts: list[dict]) -> dict:
    return sorted(opts, key=lambda o: (o.get("region") != "India", -(o.get("year") or 0), o["label"]))[0]


async def search_factors(db, rec: dict, category: dict, text: str = "", limit: int = 40) -> list[dict]:
    coll, q = factor_query(rec, category)
    field = "fuel_name" if coll == "fuel_database" else "activity"
    if text:
        q[field] = {"$regex": re.escape(text), "$options": "i"}
    docs = await db[coll].find(q, {"_id": 0}).limit(400).to_list(400)
    opts = [_option(d, coll) for d in docs]
    want = norm(rec.get("subcategory"))
    wants = {want, *ALIASES.get(want, [])}
    t = norm(text)
    opts.sort(key=lambda o: (norm(o["label"]) not in wants, bool(t) and not norm(o["label"]).startswith(t), o["label"].lower(), o.get("region") != "India"))
    return opts[:limit]


async def resolve_factor(db, org: str, rec: dict, category: dict, chosen: dict | None) -> dict:
    coll, q = factor_query(rec, category)
    if chosen:
        doc = await db[chosen["collection"]].find_one({"id": chosen["id"]}, {"_id": 0})
        if not doc:
            raise SaveError("The chosen emission factor no longer exists. Pick another one in Edit.", True)
        return _option(doc, chosen["collection"])
    mem = await db.ocr_ext_factor_choices.find_one({"organization_id": org, "key": factor_key(rec)}, {"_id": 0})
    if mem:
        doc = await db[mem["collection"]].find_one({"id": mem["factor_id"]}, {"_id": 0})
        if doc:
            return _option(doc, mem["collection"])
    field = "fuel_name" if coll == "fuel_database" else "activity"
    docs = await db[coll].find(q, {"_id": 0}).to_list(2000)
    want = norm(rec.get("subcategory"))
    wants = {want, *ALIASES.get(want, [])}
    exact = [_option(d, coll) for d in docs if norm(d.get(field)) in wants]
    if exact:
        return _prefer(exact)
    if coll == "fuel_database" and len(docs) == 1:
        return _option(docs[0], coll)
    raise SaveError(f"No emission factor named '{rec.get('subcategory')}' in {category['name']}. Choose one in Edit.", True)


ALIASES = {"gas diesel oil": ["diesel"], "motor gasoline": ["petrol motor gasoline"], "natural gas": ["natural gas"], "mixed solid waste landfill": ["mixed msw municipal solid waste landfilled"]}


def factor_key(rec: dict) -> str:
    return f"{rec['scope']}|{rec['category']}|{norm(rec.get('subcategory'))}|{rec['ef_method']}"


def _scaled(fields: dict, share: float) -> dict:
    return {k: (v * share if k in QTY_KEYS and isinstance(v, (int, float)) else v) for k, v in fields.items()}


def build_values(rec: dict, category: dict, factor: dict, facility: dict, period: str, fields: dict) -> dict:
    scope_code = SCOPE_CODE[rec["scope"]]
    dynamic = {k: {"value": v, "unit": canonicalize_calc_engine_unit(fields.get(f"{k}_unit") or "")}
               for k, v in fields.items() if not k.endswith("_unit") and isinstance(v, (int, float))}
    main = next((k for k in MAIN_KEYS if k in dynamic), None)
    values = {"scope": scope_code, "category": category["name"], "category_code": category.get("code"), "category_id": category["id"],
              "reporting_period": period, "ef_method": "activity" if scope_code != "scope3" else rec["ef_method"],
              "facility_id": facility["id"], "location": facility.get("name"), "dynamic_field_values": dynamic,
              "fuel_name": factor["label"], "subcategory": factor["label"], "ef_lookup_key": factor["label"], "factor_id": factor["id"],
              "scope3_activity_type": factor.get("activity_type")}
    if main:
        values["quantity"], values["unit"] = dynamic[main]["value"], dynamic[main]["unit"]
        if main == "spent_value":
            values["cost"], values["currency"] = dynamic[main]["value"], dynamic[main]["unit"] or rec.get("currency") or "INR"
    if factor["collection"] == "fuel_database":
        values["fuel_id"] = factor["id"]
    else:
        values["scope3_ef_id"] = factor["id"]
    if scope_code in ("scope1", "biogenic") and rec["formula_id"] in S1_METHOD:
        values["calculation_methodology"] = S1_METHOD[rec["formula_id"]]
    return values


def check_units(factor: dict, values: dict) -> None:
    allowed = {u.lower() for u in factor.get("allowed_units") or []}
    unit = (values.get("unit") or "").lower()
    if allowed and unit and unit not in allowed and values.get("cost") is None:
        raise SaveError(f"Unit '{values.get('unit')}' is not allowed for '{factor['label']}'. Allowed: {', '.join(factor['allowed_units'])}. Edit the unit or choose another factor.")


async def attach_evidence(db, org: str, user: dict, emission_id: str, file_key: str | None, filename: str, cache: dict) -> None:
    if not file_key:
        return
    if file_key not in cache:
        r2 = get_r2_storage()
        content, ctype = await r2.get_file("ocr_temp", file_key)
        up = await r2.upload_file(file_content=content, filename=filename, bucket_type="emission_evidence",
                                  content_type=ctype or "application/octet-stream", organization_id=org)
        if not up or not up.get("key"):
            raise SaveError("The source document could not be stored as evidence")
        fid = str(uuid.uuid4())
        await db.uploaded_files.insert_one({"id": fid, "original_filename": filename, "stored_filename": up["key"], "bucket_name": up.get("bucket"),
                                            "bucket_type": "emission_evidence", "r2_key": up["key"], "file_size": len(content),
                                            "content_type": ctype or "application/octet-stream", "organization_id": org,
                                            "uploaded_by": user.get("id"), "uploaded_at": datetime.now(timezone.utc).isoformat(), "source": "ocr_extraction"})
        cache[file_key] = (fid, f"/api/files/{fid}")
    fid, url = cache[file_key]
    await db.emission_records.update_one({"id": emission_id, "organization_id": org}, {"$set": {"evidence_url": url, "evidence_file_name": filename, "evidence_file_id": fid}})


async def save_ghg_record(db, org: str, user: dict, rec: dict, chosen: dict | None, file_key: str | None, evidence_cache: dict) -> list[str]:
    if not rec.get("facility_id") or not rec.get("formula_id"):
        raise SaveError("Needs a facility and a calculable quantity before it can be saved")
    facility = await db.facilities.find_one({"id": rec["facility_id"], "organization_id": org, "is_deleted": {"$ne": True}}, {"_id": 0, "id": 1, "name": 1})
    if not facility:
        raise SaveError("The facility on this row no longer exists. Pick another in Edit.")
    category = await resolve_category(db, rec)
    factor = await resolve_factor(db, org, rec, category, chosen)
    alloc = rec.get("period_allocation") or [{"period": rec["reporting_period"], "share": 1.0}]
    ids = []
    for part in alloc:
        values = build_values(rec, category, factor, facility, part["period"], _scaled(rec["fields"], part["share"]))
        check_units(factor, values)
        try:
            calc = await execute_ocr_calculation(db, values, category, org)
        except ValueError as e:
            raise SaveError(str(e)) from e
        dec = calc["decision_inputs"]
        inputs = dict(calc["inputs"])
        for k in ("calculation_methodology", "calculation_method_scope3", "spend_currency_conversion_method"):
            if dec.get(k):
                inputs[k] = {"value": dec[k], "unit": ""}
        if values.get("scope3_activity_type"):
            inputs["scope3_activity_type"] = {"value": values["scope3_activity_type"], "unit": ""}
        is_sheet = (rec.get("evidence") or {}).get("sheet") is not None
        payload = EmissionRecordCreate(
            facility_id=facility["id"], organization_id=org, reporting_period=part["period"], frequency_type="monthly",
            scope=values["scope"], category=category["name"], category_code=category.get("code"), category_id=category["id"],
            sub_category=factor["label"], fuel_type=factor["label"],
            calculation_methodology=dec.get("calculation_methodology"),
            calculation_method_scope3=dec.get("calculation_method_scope3") if values["scope"] == "scope3" else None,
            spend_currency_conversion_method=dec.get("spend_currency_conversion_method"),
            scope3_ef_id=values.get("scope3_ef_id"), scope3_activity=factor["label"] if values["scope"] == "scope3" else None,
            scope3_activity_type=values.get("scope3_activity_type"),
            supplier_name=rec.get("vendor") if values["scope"] == "scope3" else None,
            formula_id=calc["formula_id"], formula_version_id=calc["formula_version_id"],
            decision_tree_version_id=calc["decision_tree_version_id"], formula_snapshot=calc["formula_snapshot"],
            dynamic_field_values=inputs, outputs=calc["outputs"],
            fuel_database_id=values.get("fuel_id"),
            source_of_information="OCR Excel Upload" if is_sheet else "OCR Invoice Upload",
            record_source=rec.get("invoice_number") or "",
            notes="\n".join(x for x in (f"Vendor: {rec['vendor']}" if rec.get("vendor") else "", f"Item: {rec.get('description') or ''}",
                                        f"OCR extraction row {rec['row_id']}") if x),
            upload_source="ocr_upload", ocr_line_item_id=rec["row_id"],
        )
        emission = await create_emission_record(payload, user)
        data = emission.model_dump() if hasattr(emission, "model_dump") else emission
        if calc.get("audit_log_id") and data.get("id"):
            await db.ce_calculation_audit_logs.update_one({"id": calc["audit_log_id"]}, {"$set": {"emission_record_id": data["id"]}})
        if not is_sheet:
            await attach_evidence(db, org, user, data["id"], file_key, (rec.get("evidence") or {}).get("file") or "document", evidence_cache)
        ids.append(data["id"])
    return ids
