"""REST API for the CBAM add-on. Mounted at /api/cbam."""
import csv
import io
import json
import re
import secrets
from datetime import date

import openpyxl
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from ..adapters.base import get_adapter
from ..core import db
from ..core.auth import User, current_user, require_role
from ..core.config import settings
from ..engine.factors import Factors
from ..engine.guards import CbamError
from ..engine.lookups import lookup_benchmark, lookup_dv, sector_of
from ..engine.pipeline import compute_import_line, compute_installation
from ..engine.projection import project
from ..reference.loader import OTHER, SECTORS, digits, load_reference
from ..reports import builders, xml_export
from .common import _404, _safe, _store
from .deps import analytics, computed_lines, filter_lines, get_factors, get_grid_ef, save_factors, summarise

REQUEST_STATUSES = ("Sent", "Opened", "Submitted", "Needs completion", "Verified", "Rejected")
OPEN_REQ = ("Sent", "Opened", "Submitted", "Needs completion")

router = APIRouter(prefix="/api/cbam")
public = APIRouter(prefix="/api/cbam/public")




# ---------------------------------------------------------------- session
@router.get("/me")
async def me(user: User = Depends(current_user)):
    org = await get_adapter().get_org(user.org_id)
    return {"user": user.__dict__, "org": org}


# ---------------------------------------------------------------- reference data
@router.get("/reference/factors")
async def factors(user: User = Depends(current_user)):
    f = await get_factors(user.org_id)
    return {**f.to_dict(), "versions": load_reference().versions}


@router.put("/reference/factors")
async def put_factors(body: dict, user: User = Depends(require_role("admin"))):
    try:
        f = Factors.from_dict(body)
    except CbamError as e:
        raise HTTPException(422, str(e)) from e
    await save_factors(user.org_id, f, user.email)
    return f.to_dict()


@router.get("/reference/countries")
async def countries(user: User = Depends(current_user)):
    return {"countries": load_reference().countries, "sectors": list(SECTORS)}


@router.get("/reference/dv")
async def dv_search(country: str = OTHER, q: str = "", user: User = Depends(current_user)):
    ref = load_reference()
    rows = ref.dv.get(country, [])
    ql = q.lower().replace(" ", "")
    return [r.__dict__ for r in rows if not ql or r.code.startswith(digits(q) or "~") or ql in r.description.lower().replace(" ", "")][:300]


@router.get("/reference/benchmarks")
async def bm_search(q: str = "", user: User = Depends(current_user)):
    ref = load_reference()
    ql = q.lower()
    out = []
    for r in ref.bm.values():
        if not q or r.code.startswith(digits(q) or "~") or ql in r.description.lower():
            out.append({"code": r.code, "description": r.description, "sector": r.sector,
                        "col_a": [o.__dict__ for o in r.col_a], "col_b": [o.__dict__ for o in r.col_b]})
        if len(out) >= 300:
            break
    return out


@router.get("/reference/resolve")
async def resolve(cn: str, country: str | None = None, year: int = 2026, user: User = Depends(current_user)):
    """Quick lookup used by forms: sector, default value, route, Column A/B benchmarks."""
    ref = load_reference()
    out = {"cn": digits(cn), "sector": sector_of(ref, cn)}
    try:
        hit = lookup_dv(ref, country, cn)
        out["dv"] = hit.__dict__
        route = hit.route or None
    except CbamError as e:
        out["dv_error"], route = str(e), None
    for col in ("A", "B"):
        try:
            out[f"bm_{col.lower()}"] = lookup_benchmark(ref, cn, col, route, year)[0]
        except CbamError as e:
            out[f"bm_{col.lower()}_error"] = str(e)
    return out


@router.get("/reference/grid-ef")
async def grid_ef(user: User = Depends(current_user)):
    return await get_grid_ef(user.org_id)


@router.put("/reference/grid-ef")
async def put_grid_ef(body: dict, user: User = Depends(require_role("admin"))):
    for k, v in body.items():
        if not isinstance(v, (int, float)) or v < 0 or v > 3:
            raise HTTPException(422, f"Grid EF for {k} must be tCO2e/MWh between 0 and 3")
    await db.col("settings").update_one({"org_id": user.org_id, "id": "grid_ef"}, {"$set": {"data": body}}, upsert=True)
    return body


# ---------------------------------------------------------------- SustainRepo data (via adapter)
@router.get("/platform/facilities")
async def facilities(user: User = Depends(current_user)):
    return await get_adapter().list_facilities(user.org_id)


@router.get("/platform/suppliers")
async def suppliers(user: User = Depends(current_user)):
    return await get_adapter().list_suppliers(user.org_id)


@router.get("/platform/emission-records/{facility_id}")
async def emission_records(facility_id: str, user: User = Depends(current_user)):
    return await get_adapter().list_emission_records(user.org_id, facility_id)


# ---------------------------------------------------------------- importer: import lines
LINE_FIELDS = ("cn_code", "description", "country_of_origin", "import_date", "net_mass", "basis", "supplier_id",
               "installation_name", "customs_ref", "see_direct", "see_indirect", "sefa", "route", "production_date",
               "carbon_price_paid", "carbon_price", "electricity_ef", "status", "evidence")


def _clean_line(body: dict) -> dict:
    d = {k: body.get(k) for k in LINE_FIELDS if k in body}
    if "net_mass" in d:
        d["net_mass"] = float(d["net_mass"])
    d.setdefault("basis", "default")
    if d.get("basis") not in ("default", "actual"):
        raise HTTPException(422, "basis must be 'default' or 'actual'")
    return d


@router.get("/imports")
async def list_imports(year: int | None = None, user: User = Depends(current_user)):
    lines, _ = await computed_lines(user.org_id, year)
    return lines


@router.post("/imports")
async def create_import(body: dict, user: User = Depends(require_role("importer"))):
    doc = await db.insert_doc("import_lines", user.org_id, {"status": "Draft", **_clean_line(body)}, user.email)
    return {**doc, "calc": compute_import_line(doc, load_reference(), await get_factors(user.org_id))}


@router.put("/imports/{line_id}")
async def update_import(line_id: str, body: dict, user: User = Depends(require_role("importer"))):
    doc = _404(await db.update_doc("import_lines", user.org_id, line_id, _clean_line(body), user.email))
    return {**doc, "calc": compute_import_line(doc, load_reference(), await get_factors(user.org_id))}


@router.delete("/imports/{line_id}")
async def delete_import(line_id: str, user: User = Depends(require_role("importer"))):
    _404(await db.delete_doc("import_lines", user.org_id, line_id, user.email) or None)
    return {"ok": True}


@router.post("/imports/preview")
async def preview_line(body: dict, user: User = Depends(current_user)):
    return compute_import_line(_clean_line(body), load_reference(), await get_factors(user.org_id))


UPLOAD_HEADERS = {"cn_code": ("cn", "cn code", "cn_code", "commodity code"), "description": ("description", "goods"),
                  "country_of_origin": ("country", "origin", "country of origin"),
                  "import_date": ("date", "import date", "release date"), "net_mass": ("net mass", "mass", "net_mass", "tonnes", "quantity (t)"),
                  "customs_ref": ("mrn", "customs ref", "declaration"), "installation_name": ("installation", "producer")}


REQUIRED_UPLOAD = ("cn_code", "country_of_origin", "import_date", "net_mass")
TEMPLATE_HEADERS = ["CN code", "Description", "Country of origin", "Import date", "Net mass", "Customs ref", "Installation"]


def _read_rows(raw: bytes, filename: str) -> list[list]:
    if filename.lower().endswith((".xlsx", ".xlsm")):
        ws = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True).worksheets[0]
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
    else:
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    rows = [r for r in rows if any(c not in (None, "") for c in r)]
    if not rows:
        raise HTTPException(422, "Empty file")
    return rows


def _suggest(header: list[str]) -> dict:
    low = [h.strip().lower() for h in header]
    return {f: next((header[low.index(h)] for h in names if h in low), None) for f, names in UPLOAD_HEADERS.items()}


@router.get("/imports/template.xlsx")
async def import_template(user: User = Depends(current_user)):
    return Response(builders.simple_xlsx("Customs data", TEMPLATE_HEADERS, [
        ["7208 51 20", "Hot-rolled plate > 15 mm", "India", "2026-05-12", 400, "26DE0001", "Raipur works"],
        ["2523 29 00", "Grey Portland cement", "Tunisia", "2026-04-22", 900, "26IT0006", ""]],
        notes=["One row per customs declaration line. Net mass in tonnes (electricity: MWh).",
               "Dates as YYYY-MM-DD. CN code with or without spaces."]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="CBAM_customs_import_template.xlsx"'})


@router.post("/imports/inspect")
async def inspect_upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    """Step 2 of the upload wizard: headers, a suggested column mapping and a sample."""
    rows = _read_rows(await file.read(), file.filename)
    header = [str(h or "").strip() for h in rows[0]]
    return {"headers": header, "suggested": _suggest(header), "required": list(REQUIRED_UPLOAD),
            "fields": list(UPLOAD_HEADERS), "sample": [[str(c) if c is not None else "" for c in r] for r in rows[1:6]],
            "row_count": len(rows) - 1}


@router.post("/imports/upload")
async def upload_imports(file: UploadFile = File(...), mapping: str = Form(""), dry_run: bool = Form(False),
                         user: User = Depends(require_role("importer"))):
    """CSV/XLSX of customs data. Columns come from `mapping` ({field: header}) or common header names.
    dry_run=true validates and previews the calculation without saving."""
    rows = _read_rows(await file.read(), file.filename)
    header = [str(h or "").strip() for h in rows[0]]
    chosen = json.loads(mapping) if mapping else _suggest(header)
    idx = {f: (header.index(h) if h in header else None) for f, h in chosen.items() if f in UPLOAD_HEADERS}
    missing = [f for f in REQUIRED_UPLOAD if idx.get(f) is None]
    if missing:
        raise HTTPException(422, f"Missing columns: {missing}. Found: {header}")
    ref, f = load_reference(), await get_factors(user.org_id)
    created, errors, preview = 0, [], []
    for n, r in enumerate(rows[1:], start=2):
        rec = {fld: (r[i] if i is not None and i < len(r) else None) for fld, i in idx.items()}
        try:
            d = rec["import_date"]
            rec["import_date"] = d.date().isoformat() if hasattr(d, "date") else date.fromisoformat(str(d)[:10]).isoformat()
            rec["net_mass"] = float(str(rec["net_mass"]).replace(",", ""))
            rec["cn_code"] = str(rec["cn_code"])
            doc = {"status": "Draft", "basis": "default", **{k: v for k, v in rec.items() if v not in (None, "")}}
            if dry_run:
                c = compute_import_line(doc, ref, f)
                preview.append({"row": n, **doc, "certificates": c.get("certificates"), "sector": c.get("sector"), "error": c["error"]})
                if c["error"]:
                    errors.append({"row": n, "error": c["error"]})
            else:
                await db.insert_doc("import_lines", user.org_id, doc, user.email)
                created += 1
        except Exception as e:  # noqa: BLE001 - report row-level problems back to the user
            errors.append({"row": n, "error": str(e)})
    return {"created": created, "errors": errors, **({"preview": preview} if dry_run else {})}


# ---------------------------------------------------------------- operator: installations
@router.get("/installations")
async def list_installations(user: User = Depends(current_user)):
    ref, f = load_reference(), await get_factors(user.org_id)
    out = []
    for inst in await db.list_docs("installations", user.org_id):
        res = compute_installation(inst, ref, f)
        out.append({**{k: inst[k] for k in inst if k not in ("source_streams", "precursors")},
                    "summary": [{k: p.get(k) for k in ("name", "cn_code", "see", "sefa", "net_per_t", "error")} for p in res["processes"]]})
    return out


@router.post("/installations")
async def create_installation(body: dict, user: User = Depends(require_role("operator"))):
    fac = await get_adapter().get_facility(user.org_id, body.get("facility_id", ""))
    data = {"name": body.get("name") or (fac or {}).get("name", "Installation"), "facility_id": body.get("facility_id"),
            "country": body.get("country") or (fac or {}).get("country", ""), "reporting_year": int(body.get("reporting_year", 2026)),
            "verification_status": "Not started", "verifier": "", "carbon_price_paid": 0,
            "processes": body.get("processes", []), "source_streams": [], "precursors": []}
    return await db.insert_doc("installations", user.org_id, data, user.email)


@router.get("/installations/{inst_id}")
async def get_installation(inst_id: str, user: User = Depends(current_user)):
    inst = _404(await db.get_doc("installations", user.org_id, inst_id))
    return {**inst, "results": compute_installation(inst, load_reference(), await get_factors(user.org_id))}


@router.put("/installations/{inst_id}")
async def update_installation(inst_id: str, body: dict, user: User = Depends(require_role("operator"))):
    for coll in ("processes", "source_streams", "precursors"):
        for item in body.get(coll, []) or []:
            item.setdefault("id", db.new_id())
    inst = _404(await db.update_doc("installations", user.org_id, inst_id, body, user.email))
    return {**inst, "results": compute_installation(inst, load_reference(), await get_factors(user.org_id))}


@router.delete("/installations/{inst_id}")
async def delete_installation(inst_id: str, user: User = Depends(require_role("operator"))):
    _404(await db.delete_doc("installations", user.org_id, inst_id, user.email) or None)
    return {"ok": True}


@router.post("/installations/{inst_id}/import-ghg")
async def import_ghg(inst_id: str, body: dict, user: User = Depends(require_role("operator"))):
    """Copy selected SustainRepo GHG log records (combustion) into source streams of a process."""
    inst = _404(await db.get_doc("installations", user.org_id, inst_id))
    recs = await get_adapter().list_emission_records(user.org_id, inst.get("facility_id", ""))
    chosen = [r for r in recs if r["id"] in set(body.get("record_ids", []))]
    streams = inst.get("source_streams", [])
    for r in chosen:
        streams.append({"id": db.new_id(), "process_id": body["process_id"], "name": f"{r['sub_category']} (GHG log {r['id']})",
                        "kind": "combustion" if r.get("ncv_tj_per_unit") else "process", "unit": r["unit"],
                        "ncv": r.get("ncv_tj_per_unit"), "ef": r.get("ef_t_per_tj") or (r["tco2e"] / r["quantity"] if r["quantity"] else 0),
                        "of": r.get("of") or 1.0, "source": "sustainrepo-ghg", "source_record": r["id"],
                        "months": [{"month": "annual", "qty": r["quantity"]}]})
    inst = await db.update_doc("installations", user.org_id, inst_id, {"source_streams": streams}, user.email)
    return {"imported": len(chosen), "installation": inst}


@router.get("/installations/{inst_id}/report.{fmt}")
async def installation_report(inst_id: str, fmt: str, user: User = Depends(current_user)):
    inst = _404(await db.get_doc("installations", user.org_id, inst_id))
    res = compute_installation(inst, load_reference(), await get_factors(user.org_id))
    if fmt == "xlsx":
        return Response(builders.operator_report_xlsx(inst, res), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="CBAM_operator_report_{_safe(inst["name"])}_{res["reporting_year"]}.xlsx"'})
    if fmt == "pdf":
        return Response(builders.operator_report_pdf(inst, res), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="CBAM_operator_report_{_safe(inst["name"])}_{res["reporting_year"]}.pdf"'})
    raise HTTPException(404, "Format must be xlsx or pdf")


@router.post("/files")
async def upload_file(file: UploadFile = File(...), user: User = Depends(current_user)):
    return {"file": await _store(file)}


# ---------------------------------------------------------------- certificates
@router.get("/certificates")
async def list_certs(user: User = Depends(current_user)):
    return await db.list_docs("certificates", user.org_id, sort="date")


@router.post("/certificates")
async def add_cert(body: dict, user: User = Depends(require_role("importer"))):
    kind = body.get("kind", "purchase")
    if kind not in ("purchase", "surrender", "repurchase"):
        raise HTTPException(422, "kind must be purchase | surrender | repurchase")
    qty = int(body.get("quantity", 0))
    if qty <= 0:
        raise HTTPException(422, "quantity must be a positive whole number of certificates")
    return await db.insert_doc("certificates", user.org_id, {
        "kind": kind, "quantity": qty, "price": float(body.get("price") or 0), "date": body["date"],
        "obligation_year": int(body.get("obligation_year", 2026)), "note": body.get("note", "")}, user.email)


@router.delete("/certificates/{cid}")
async def del_cert(cid: str, user: User = Depends(require_role("importer"))):
    _404(await db.delete_doc("certificates", user.org_id, cid, user.email) or None)
    return {"ok": True}


@router.get("/certificates/position")
async def position(year: int = 2026, user: User = Depends(current_user)):
    lines, f = await computed_lines(user.org_id, year)
    led = await db.list_docs("certificates", user.org_id, {"obligation_year": year}, sort="date")
    held = sum(c["quantity"] * (1 if c["kind"] == "purchase" else -1) for c in led if c["kind"] != "surrender")
    surrendered = sum(c["quantity"] for c in led if c["kind"] == "surrender")
    quarters, cum = [], 0.0
    for q in range(1, 5):
        cum += sum(l["calc"]["certificates"] for l in lines if not l["calc"]["error"] and l["calc"]["quarter"] == q)
        held_q = sum(c["quantity"] * (1 if c["kind"] == "purchase" else -1) for c in led
                     if c["kind"] != "surrender" and c["date"] <= f"{year}-{q * 3:02d}-31")
        required = f.holding_pct * cum if year >= 2027 else 0.0
        quarters.append({"quarter": f"Q{q}", "cumulative_net": cum, "required": required, "held": held_q, "gap": max(0.0, required - held_q)})
    total = sum(l["calc"]["certificates"] for l in lines if not l["calc"]["error"])
    need = int(-(-total // 1))
    return {"year": year, "holding_rule_applies": year >= 2027, "holding_pct": f.holding_pct, "quarters": quarters,
            "obligation": total, "obligation_whole": need, "held": held, "surrendered": surrendered,
            "to_buy": max(0, need - held - surrendered), "excess": max(0, held + surrendered - need),
            "surrender_deadline": f"{year + 1}-09-30", "repurchase_deadline": f"{year + 1}-10-31",
            "sales_open": "2027-02-01", "price_hint": f.reference_price(year)}


# ---------------------------------------------------------------- dashboard, declaration, audit
@router.get("/dashboard")
async def dashboard(year: int = 2026, sector: str = "", country: str = "", supplier: str = "", quarter: str = "",
                    basis: str = "", user: User = Depends(current_user)):
    all_lines, f = await computed_lines(user.org_id, year)
    lines = filter_lines(all_lines, {"sector": sector, "country": country, "supplier": supplier, "quarter": quarter, "basis": basis})
    s = summarise(lines, f, year)
    reqs = await db.list_docs("supplier_requests", user.org_id)
    insts = await db.list_docs("installations", user.org_id)
    sups = await get_adapter().list_suppliers(user.org_id)
    s.update(analytics(lines, f, sups, reqs))
    s["supplier_requests"] = {st: sum(1 for r in reqs if r["status"] == st) for st in REQUEST_STATUSES}
    s["installations"] = len(insts)
    # Filter options come from the unfiltered year so chips never disappear.
    s["filter_options"] = {
        "sector": sorted({l["calc"].get("sector") for l in all_lines if l["calc"].get("sector")}),
        "country": sorted({l.get("country_of_origin") for l in all_lines if l.get("country_of_origin")}),
        "supplier": [{"id": x["id"], "name": x["name"]} for x in sups if any(l.get("supplier_id") == x["id"] for l in all_lines)],
        "quarter": ["Q1", "Q2", "Q3", "Q4"], "basis": ["default", "actual"]}
    s["filters"] = {k: v for k, v in (("sector", sector), ("country", country), ("supplier", supplier),
                                      ("quarter", quarter), ("basis", basis)) if v}
    s["deadlines"] = deadlines(year, f)
    return s


def deadlines(year: int, f: Factors) -> list[dict]:
    nxt = year + 1
    out = [{"date": f"{year}-{m:02d}-{d}", "label": f"Q{q} end: hold {f.holding_pct:.0%} of YTD net emissions", "kind": "holding",
            "applies": year >= 2027} for q, (m, d) in enumerate(((3, 31), (6, 30), (9, 30), (12, 31)), start=1)]
    out += [
        {"date": f"{nxt}-01-04" if year == 2026 else f"{nxt}-01-07", "label": f"Q4 {year} certificate price published" if year == 2026
         else "Weekly prices continue", "kind": "price", "applies": True},
        {"date": "2027-02-01", "label": "Certificate sales open on the common platform", "kind": "platform", "applies": year == 2026},
        {"date": f"{nxt}-06-30", "label": "Deadline to claim alternative / region-specific default values", "kind": "data", "applies": True},
        {"date": f"{nxt}-09-30", "label": f"Submit {year} CBAM declaration & surrender certificates", "kind": "declaration", "applies": True},
        {"date": f"{nxt}-10-31", "label": "Last day to request repurchase of excess certificates", "kind": "repurchase", "applies": True},
    ]
    return sorted([d for d in out if d["applies"]], key=lambda d: d["date"])


# ---------------------------------------------------------------- cost simulator
SIM_FIELDS = ("cn_code", "country_of_origin", "net_mass", "basis", "see_direct", "see_indirect", "sefa", "route")


def _sim_rows(rows: list[dict], force_default: bool, ref, f) -> list[dict]:
    out = []
    for r in rows:
        line = {k: r.get(k) for k in SIM_FIELDS if r.get(k) not in (None, "")}
        line.setdefault("basis", "default")
        if force_default:
            line["basis"] = "default"
        line["import_date"] = "2026-06-30"  # one reference year; the projection re-prices every later year
        line["net_mass"] = float(line.get("net_mass") or 0)
        out.append({**line, "label": r.get("label") or line.get("cn_code"), "calc": compute_import_line(line, ref, f)})
    return out


@router.post("/simulate")
async def simulate(body: dict, user: User = Depends(current_user)):
    """What-if: rows x EUA price path x volume growth -> certificates and cost for 2026-2034."""
    ref, f = load_reference(), await get_factors(user.org_id)
    rows = body.get("rows") or []
    if not rows:
        raise HTTPException(422, "Add at least one row (CN code, origin, tonnes)")
    price = body.get("price_eur")
    price = float(price) if price not in (None, "") else None
    pg, vg = float(body.get("price_growth") or 0), float(body.get("volume_growth") or 0)
    for name, v in (("price_growth", pg), ("volume_growth", vg)):
        if not -0.5 <= v <= 1:
            raise HTTPException(422, f"{name} is a fraction per year (0.05 = 5%), between -0.5 and 1")
    scenario = _sim_rows(rows, False, ref, f)
    default = _sim_rows(rows, True, ref, f)
    ok = lambda ls: [l for l in ls if not l["calc"]["error"]]
    proj, proj_def = project(ok(scenario), f, price, pg, vg), project(ok(default), f, price, pg, vg)
    for p, d in zip(proj, proj_def):
        p["certificates_default"], p["cost_default"] = d["certificates"], d["cost"]
    return {"rows": [{"label": l["label"], "cn_code": l.get("cn_code"), "country_of_origin": l.get("country_of_origin"),
                      "net_mass": l["net_mass"], "basis": l["basis"], "error": l["calc"]["error"],
                      **{k: l["calc"].get(k) for k in ("sector", "see", "sefa", "certificates", "see_direct", "see_indirect_counted")}}
                     for l in scenario],
            "projection": proj, "price_eur": price if price is not None else f.reference_price(2026),
            "total_cost": sum(p["cost"] for p in proj), "total_cost_default": sum(p["cost_default"] for p in proj)}


@router.get("/scenarios")
async def list_scenarios(user: User = Depends(current_user)):
    return await db.list_docs("scenarios", user.org_id)


@router.post("/scenarios")
async def save_scenario(body: dict, user: User = Depends(current_user)):
    if not body.get("name"):
        raise HTTPException(422, "Give the scenario a name")
    keep = {k: body.get(k) for k in ("name", "rows", "price_eur", "price_growth", "volume_growth")}
    return await db.insert_doc("scenarios", user.org_id, keep, user.email)


@router.delete("/scenarios/{sid}")
async def delete_scenario(sid: str, user: User = Depends(current_user)):
    _404(await db.delete_doc("scenarios", user.org_id, sid, user.email) or None)
    return {"ok": True}


def _checklist(lines: list[dict], s: dict, reqs: list[dict]) -> list[dict]:
    return [
        {"item": "De minimis assessed", "ok": True, "detail": f"{s['deminimis_mass']:,.1f} t vs {s['deminimis_t']:.0f} t threshold"},
        {"item": "All import lines calculate without errors", "ok": s["lines_with_errors"] == 0, "detail": f"{s['lines_with_errors']} line(s) with errors"},
        {"item": "No floored (negative) results", "ok": s["floored_lines"] == 0, "detail": f"{s['floored_lines']} floored line(s) - check SEFA"},
        {"item": "Actual data backed by verification evidence",
         "ok": all(l.get("evidence") for l in lines if l.get("basis") == "actual"),
         "detail": f"{sum(1 for l in lines if l.get('basis') == 'actual' and not l.get('evidence'))} actual line(s) without evidence"},
        {"item": "Open supplier requests closed", "ok": not any(r["status"] in OPEN_REQ for r in reqs),
         "detail": f"{sum(1 for r in reqs if r['status'] in OPEN_REQ)} open"},
        {"item": "Q4 certificate price published", "ok": not any(l["calc"].get("price_is_estimate") for l in lines if not l["calc"]["error"]),
         "detail": "Some costs use the year-average estimate"},
    ]


@router.get("/declarations/{year}")
async def declaration(year: int, user: User = Depends(current_user)):
    lines, f = await computed_lines(user.org_id, year)
    s = summarise(lines, f, year)
    reqs = await db.list_docs("supplier_requests", user.org_id)
    snap = await db.col("declarations").find_one({"org_id": user.org_id, "year": year})
    return {"summary": s, "checklist": _checklist(lines, s, reqs), "deadline": f"{year + 1}-09-30",
            "snapshot": db.clean(snap)}


@router.post("/declarations/{year}/status")
async def set_declaration_status(year: int, body: dict, user: User = Depends(require_role("importer"))):
    status = body.get("status")
    if status not in ("Draft", "Ready", "Submitted"):
        raise HTTPException(422, "status must be Draft | Ready | Submitted")
    lines, f = await computed_lines(user.org_id, year)
    await db.col("declarations").update_one({"org_id": user.org_id, "year": year}, {"$set": {
        "status": status, "updated_at": db.now(), "by": user.email, "summary": summarise(lines, f, year),
        "reference_versions": load_reference().versions, "factors": f.to_dict()}}, upsert=True)
    await db.audit(user.org_id, user.email, "declarations", str(year), f"status:{status}", None, None)
    return {"ok": True, "status": status}


@router.get("/declarations/{year}/export.{fmt}")
async def export_declaration(year: int, fmt: str, user: User = Depends(current_user)):
    lines, f = await computed_lines(user.org_id, year)
    s = summarise(lines, f, year)
    org = await get_adapter().get_org(user.org_id)
    if fmt == "xlsx":
        return Response(builders.declaration_xlsx(org, year, lines, s, f),
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="CBAM_declaration_{year}.xlsx"'})
    if fmt == "pdf":
        return Response(builders.declaration_pdf(org, year, lines, s), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="CBAM_declaration_{year}.pdf"'})
    if fmt == "json":
        return builders.declaration_json(org, year, lines, s, f)
    if fmt == "xml":
        xml, check = xml_export.build(org, year, lines, s)
        return Response(xml, media_type="application/xml", headers={
            "Content-Disposition": f'attachment; filename="CBAM_declaration_{year}{"" if check["valid"] else "_DRAFT"}.xml"',
            "X-Schema-Status": check["status"]})
    raise HTTPException(404, "Format must be xlsx, pdf, json or xml")


@router.get("/declarations/{year}/xml-status")
async def xml_status(year: int, user: User = Depends(current_user)):
    lines, f = await computed_lines(user.org_id, year)
    _, check = xml_export.build(await get_adapter().get_org(user.org_id), year, lines, summarise(lines, f, year))
    return check


@router.get("/audit")
async def audit_log(limit: int = 100, user: User = Depends(require_role("admin"))):
    cur = db.col("audit").find({"org_id": user.org_id}).sort("at", -1).limit(limit)
    return [{k: v for k, v in db.clean(d).items() if k not in ("before", "after")} async for d in cur]
