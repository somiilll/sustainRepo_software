"""Supplier data requests: workflow settings, reminders, review / status board, and the public supplier portal."""
import io
import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..adapters.base import get_adapter
from ..core import db
from ..core.auth import User, current_user, require_role
from ..core.config import settings
from ..core.notifier import Message, get_notifier
from ..engine.carbon_price import carbon_price_eur_per_t
from ..engine.guards import CbamError
from ..reference.loader import digits
from ..reports import builders
from .common import XLSX, _404, _store, download

router = APIRouter(prefix="/api/cbam")
public = APIRouter(prefix="/api/cbam/public")

OPEN_STATUSES = ("Sent", "Opened", "Needs completion")
DEFAULT_WORKFLOW = {
    "reminder_every_days": 7, "auto_reminders": True, "due_days": 45, "approver_role": "importer",
    "steps": {"bulk_upload": True, "faq": True, "carbon_price": True, "precursors": True},
    "message_template": ("Dear {supplier},\n\n{org} imports your goods ({cn_codes}) into the EU. Under the CBAM "
                         "Regulation we need verified embedded-emissions data for {year}. Please submit it here by {due}:\n{link}\n\nThank you."),
}
# Moves allowed on the status board (anything else is done by the system: Sent -> Opened -> Submitted).
BOARD_MOVES = {("Submitted", "Verified"), ("Submitted", "Rejected"), ("Submitted", "Needs completion"),
               ("Rejected", "Sent"), ("Needs completion", "Sent"), ("Opened", "Sent")}


async def get_workflow(org_id: str) -> dict:
    doc = await db.col("settings").find_one({"org_id": org_id, "id": "workflow"})
    data = (doc or {}).get("data") or {}
    return {**DEFAULT_WORKFLOW, **data, "steps": {**DEFAULT_WORKFLOW["steps"], **data.get("steps", {})}}


def _link(token: str) -> str:
    return f"{settings.public_base_url}/cbam/supplier/{token}"


async def _require_approver(user: User) -> None:
    wf = await get_workflow(user.org_id)
    if user.role not in (wf["approver_role"], "admin"):
        raise HTTPException(403, f"Only the {wf['approver_role']} role (or admin) can review supplier data")


# ---------------------------------------------------------------- settings
@router.get("/workflow/settings")
async def workflow_settings(user: User = Depends(current_user)):
    return await get_workflow(user.org_id)


@router.put("/workflow/settings")
async def put_workflow_settings(body: dict, user: User = Depends(require_role("admin"))):
    wf = await get_workflow(user.org_id)
    every, due = int(body.get("reminder_every_days", wf["reminder_every_days"])), int(body.get("due_days", wf["due_days"]))
    if not 1 <= every <= 60 or not 7 <= due <= 365:
        raise HTTPException(422, "Reminders every 1-60 days; due date 7-365 days after the request")
    if body.get("approver_role", wf["approver_role"]) not in ("importer", "admin"):
        raise HTTPException(422, "approver_role must be importer or admin")
    tpl = str(body.get("message_template", wf["message_template"]))
    if "{link}" not in tpl:
        raise HTTPException(422, "The message template must contain {link}")
    data = {"reminder_every_days": every, "due_days": due, "auto_reminders": bool(body.get("auto_reminders", wf["auto_reminders"])),
            "approver_role": body.get("approver_role", wf["approver_role"]), "message_template": tpl,
            "steps": {k: bool((body.get("steps") or {}).get(k, v)) for k, v in wf["steps"].items()}}
    await db.col("settings").update_one({"org_id": user.org_id, "id": "workflow"}, {"$set": {"data": data}}, upsert=True)
    await db.audit(user.org_id, user.email, "settings", "workflow", "update", wf, data)
    return data


# ---------------------------------------------------------------- requests
@router.get("/supplier-requests")
async def list_requests(user: User = Depends(current_user)):
    return [{**r, "link": _link(r["token"])} for r in await db.list_docs("supplier_requests", user.org_id)]


def _message(wf: dict, org: dict, req: dict, reminder: bool = False) -> Message:
    body = wf["message_template"].format(supplier=req["supplier_name"], org=org["name"], cn_codes=", ".join(req.get("cn_codes") or []) or "CBAM goods",
                                         year=req["reporting_year"], due=req.get("due_date") or "the due date", link=_link(req["token"]))
    subject = f"{'Reminder: ' if reminder else ''}CBAM emissions data request from {org['name']} ({req['reporting_year']})"
    return Message(req["supplier_email"], subject, body)


@router.post("/supplier-requests")
async def create_request(body: dict, user: User = Depends(require_role("importer"))):
    sups = {s["id"]: s for s in await get_adapter().list_suppliers(user.org_id)}
    sup = sups.get(body.get("supplier_id"))
    if not sup:
        raise HTTPException(422, "Unknown supplier")
    wf = await get_workflow(user.org_id)
    token = secrets.token_urlsafe(16)
    doc = await db.insert_doc("supplier_requests", user.org_id, {
        "supplier_id": sup["id"], "supplier_name": sup["name"], "supplier_email": sup["email"], "country": sup["country"],
        "import_line_ids": body.get("import_line_ids", []), "cn_codes": body.get("cn_codes", []),
        "reporting_year": int(body.get("reporting_year", 2026)),
        "due_date": body.get("due_date") or (date.today() + timedelta(days=wf["due_days"])).isoformat(),
        "message": body.get("message", ""), "token": token, "status": "Sent", "submission": None,
        "reminders": 0, "last_reminded": None, "history": [{"at": db.now(), "status": "Sent", "by": user.email}]}, user.email)
    await db.col("tokens").insert_one({"token": token, "org_id": user.org_id, "request_id": doc["id"], "kind": "supplier"})
    org = await get_adapter().get_org(user.org_id)
    sent = await get_notifier().send(user.org_id, user.email, _message(wf, org, doc), "supplier_requests", doc["id"])
    return {**doc, "link": _link(token), "notification": sent}


async def _remind(org_id: str, user: str, req: dict, wf: dict) -> dict:
    org = await get_adapter().get_org(org_id)
    sent = await get_notifier().send(org_id, user, _message(wf, org, req, reminder=True), "supplier_requests", req["id"])
    await db.update_doc("supplier_requests", org_id, req["id"],
                        {"reminders": int(req.get("reminders") or 0) + 1, "last_reminded": db.now()}, user)
    return sent


@router.post("/supplier-requests/{req_id}/remind")
async def remind(req_id: str, user: User = Depends(require_role("importer"))):
    req = _404(await db.get_doc("supplier_requests", user.org_id, req_id))
    if req["status"] not in OPEN_STATUSES:
        raise HTTPException(409, f"Request is '{req['status']}' - reminders are only for open requests")
    return await _remind(user.org_id, user.email, req, await get_workflow(user.org_id))


@router.post("/supplier-requests/run-reminders")
async def run_reminders(user: User = Depends(require_role("importer"))):
    """Scheduled rule: remind every N days until submitted. A cron/worker can call this daily."""
    wf = await get_workflow(user.org_id)
    if not wf["auto_reminders"]:
        return {"reminded": 0, "skipped": "auto reminders are off"}
    due_before = datetime.utcnow() - timedelta(days=wf["reminder_every_days"])
    n = 0
    for r in await db.list_docs("supplier_requests", user.org_id):
        last = r.get("last_reminded") or r.get("created_at") or ""
        if r["status"] in OPEN_STATUSES and last[:19] <= due_before.isoformat()[:19]:
            await _remind(user.org_id, "scheduler", r, wf)
            n += 1
    return {"reminded": n}


async def _apply_review(org_id: str, user: str, req: dict, decision: str, note: str = "") -> dict:
    if decision == "accept":
        sub = req.get("submission") or {}
        if not sub:
            raise HTTPException(409, "Nothing submitted yet")
        goods = sub.get("goods") or [{"cn_code": "", **{k: sub.get(k) for k in ("see_direct", "see_indirect", "sefa", "route")}}]
        for lid in req.get("import_line_ids", []):
            line = await db.get_doc("import_lines", org_id, lid)
            if not line:
                continue
            g = next((g for g in goods if g.get("cn_code") and digits(line["cn_code"]).startswith(digits(g["cn_code"]))), goods[0])
            await db.update_doc("import_lines", org_id, lid, {
                "basis": "actual", "see_direct": g.get("see_direct"), "see_indirect": g.get("see_indirect") or 0,
                "sefa": g.get("sefa"), "route": g.get("route") or sub.get("route", ""),
                "carbon_price": sub.get("carbon_price"), "carbon_price_paid": sub.get("carbon_price_paid", 0),
                "installation_name": sub.get("installation_name"), "status": "Actual - verified",
                "evidence": sub.get("verification_report")}, user)
        status = "Verified"
    elif decision == "complete":
        status = "Needs completion"
    elif decision == "reject":
        status = "Rejected"
    else:
        raise HTTPException(422, "decision must be accept | complete | reject")
    hist = (req.get("history") or []) + [{"at": db.now(), "status": status, "by": user, "note": note}]
    return await db.update_doc("supplier_requests", org_id, req["id"], {"status": status, "review_note": note, "history": hist}, user)


@router.post("/supplier-requests/{req_id}/review")
async def review_request(req_id: str, body: dict, user: User = Depends(current_user)):
    """accept -> linked import lines switch to 'actual'; complete -> back to the supplier with a note; reject."""
    await _require_approver(user)
    req = _404(await db.get_doc("supplier_requests", user.org_id, req_id))
    return await _apply_review(user.org_id, user.email, req, body.get("decision", ""), body.get("note", ""))


@router.post("/supplier-requests/{req_id}/status")
async def move_request(req_id: str, body: dict, user: User = Depends(current_user)):
    """Status board drag-and-drop. Only the moves in BOARD_MOVES are allowed."""
    req = _404(await db.get_doc("supplier_requests", user.org_id, req_id))
    to = body.get("status")
    if (req["status"], to) not in BOARD_MOVES:
        raise HTTPException(409, f"Cannot move a request from '{req['status']}' to '{to}'")
    if to == "Sent":
        require_role("importer")(user)
        hist = (req.get("history") or []) + [{"at": db.now(), "status": "Sent", "by": user.email, "note": body.get("note", "")}]
        return await db.update_doc("supplier_requests", user.org_id, req_id, {"status": "Sent", "history": hist}, user.email)
    await _require_approver(user)
    decision = {"Verified": "accept", "Rejected": "reject", "Needs completion": "complete"}[to]
    return await _apply_review(user.org_id, user.email, req, decision, body.get("note", ""))


# ---------------------------------------------------------------- public supplier portal
async def _by_token(token: str) -> tuple[dict, dict]:
    t = await db.col("tokens").find_one({"token": token})
    if not t or t.get("kind", "supplier") != "supplier":
        raise HTTPException(404, "Invalid or expired link")
    req = _404(await db.get_doc("supplier_requests", t["org_id"], t["request_id"]))
    return t, req


@public.get("/supplier/{token}")
async def public_request(token: str):
    t, req = await _by_token(token)
    if req["status"] == "Sent":
        await db.update_doc("supplier_requests", t["org_id"], req["id"], {"status": "Opened"}, "supplier")
    org = await get_adapter().get_org(t["org_id"])
    wf = await get_workflow(t["org_id"])
    keep = ("supplier_name", "country", "cn_codes", "reporting_year", "due_date", "message", "status", "submission", "review_note")
    return {"org_name": org["name"], "steps": wf["steps"], **{k: req.get(k) for k in keep}}


def _num(v, name: str, required: bool = False) -> float:
    if v in (None, ""):
        if required:
            raise CbamError(f"{name} is required")
        return 0.0
    x = float(str(v).replace(",", "."))
    if x < 0 or x > 50:
        raise CbamError(f"{name} must be tCO2e per tonne between 0 and 50 (check units)")
    return x


def validate_submission(body: dict) -> dict:
    """Normalise a supplier submission (wizard or bulk). Raises CbamError with a readable message."""
    if not str(body.get("installation_name") or "").strip():
        raise CbamError("Installation name is required")
    goods_in = body.get("goods") or [{k: body.get(k) for k in ("cn_code", "see_direct", "see_indirect", "sefa", "route")}]
    goods = []
    for g in goods_in:
        sd, si, sf = _num(g.get("see_direct"), "SEE direct", True), _num(g.get("see_indirect"), "SEE indirect"), _num(g.get("sefa"), "SEFA", True)
        if sf > sd + si + 5:
            raise CbamError(f"SEFA {sf} looks implausibly high versus SEE {sd + si} for {g.get('cn_code') or 'the good'} - check units.")
        goods.append({"cn_code": str(g.get("cn_code") or ""), "see_direct": sd, "see_indirect": si, "sefa": sf, "route": g.get("route") or ""})
    cp = body.get("carbon_price") or None
    cp_eur = carbon_price_eur_per_t(cp, body.get("carbon_price_paid"))  # rejects voluntary credits
    precursors = [{"name": p.get("name", ""), "cn_code": p.get("cn_code", ""), "country": p.get("country", ""),
                   "mass_t": float(p.get("mass_t") or 0), "see_direct": _num(p.get("see_direct"), "Precursor SEE direct"),
                   "see_indirect": _num(p.get("see_indirect"), "Precursor SEE indirect")} for p in body.get("precursors") or []]
    first = goods[0]
    return {"installation_name": str(body["installation_name"]), "route": body.get("route") or first["route"],
            "goods": goods, "see_direct": first["see_direct"], "see_indirect": first["see_indirect"], "sefa": first["sefa"],
            "precursors": precursors, "carbon_price": cp, "carbon_price_paid": cp_eur.value, "carbon_price_warnings": cp_eur.warnings,
            "verifier": body.get("verifier", ""), "verification_report": body.get("verification_report", ""),
            "submitted_at": db.now()}


@public.post("/supplier/{token}")
async def public_submit(token: str, body: dict):
    t, req = await _by_token(token)
    if req["status"] in ("Verified",):
        raise HTTPException(409, "Already accepted")
    try:
        sub = validate_submission(body)
    except (CbamError, KeyError, ValueError) as e:
        raise HTTPException(422, f"Invalid submission: {e}") from e
    hist = (req.get("history") or []) + [{"at": db.now(), "status": "Submitted", "by": "supplier"}]
    await db.update_doc("supplier_requests", t["org_id"], req["id"], {"status": "Submitted", "submission": sub, "history": hist}, "supplier")
    return {"ok": True, "warnings": sub["carbon_price_warnings"]}


BULK_HEADERS = ["CN code", "Installation", "Production route", "SEE direct (tCO2e/t)", "SEE indirect (tCO2e/t)", "SEFA (tCO2e/t)",
                "Carbon price type (carbon_tax/ets)", "Scheme", "Currency", "Carbon price per t of goods", "Rebate per t", "FX to EUR"]


@public.get("/supplier/{token}/template.xlsx")
async def public_template(token: str):
    _, req = await _by_token(token)
    rows = [[cn, "", "", "", "", "", "", "", "", "", "", ""] for cn in (req.get("cn_codes") or ["7208 51 20"])]
    return download(builders.simple_xlsx("Supplier data", BULK_HEADERS, rows, notes=[
        "One row per CN code you supply. SEE and SEFA in tCO2e per tonne of goods, from your verified operator report.",
        "SEE indirect is only counted for cement and fertilisers, but please report it for all goods.",
        "Carbon price: only a tax/levy/fee or ETS allowances count. Voluntary carbon credits are not eligible.",
        "Upload the completed file in the supplier portal, then attach your verification report."]),
        XLSX, f"CBAM_supplier_template_{req['supplier_name']}.xlsx")


@public.post("/supplier/{token}/bulk")
async def public_bulk(token: str, file: UploadFile = File(...), confirm: bool = Form(False), verifier: str = Form(""),
                      verification_report: str = Form("")):
    """Parse the bulk template. confirm=false returns the parsed submission for review; confirm=true submits it."""
    import openpyxl

    t, req = await _by_token(token)
    ws = openpyxl.load_workbook(io.BytesIO(await file.read()), read_only=True, data_only=True).worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True) if any(c not in (None, "") for c in r)]
    if len(rows) < 2:
        raise HTTPException(422, "The file has no data rows")
    goods, cp, inst = [], None, ""
    for r in rows[1:]:
        r = (r + [None] * len(BULK_HEADERS))[:len(BULK_HEADERS)]
        inst = inst or str(r[1] or "")
        goods.append({"cn_code": str(r[0] or ""), "route": r[2] or "", "see_direct": r[3], "see_indirect": r[4], "sefa": r[5]})
        if r[6] and not cp:
            cp = {"type": str(r[6]).strip(), "scheme": r[7] or "", "currency": r[8] or "EUR", "amount_per_t": r[9] or 0,
                  "rebate_per_t": r[10] or 0, "fx_to_eur": r[11] or (1 if (r[8] or "EUR") == "EUR" else 0),
                  "evidence": verification_report}
    try:
        sub = validate_submission({"installation_name": inst, "goods": goods, "carbon_price": cp,
                                   "verifier": verifier, "verification_report": verification_report})
    except (CbamError, ValueError) as e:
        raise HTTPException(422, f"Invalid file: {e}") from e
    if confirm:
        hist = (req.get("history") or []) + [{"at": db.now(), "status": "Submitted", "by": "supplier (bulk)"}]
        await db.update_doc("supplier_requests", t["org_id"], req["id"], {"status": "Submitted", "submission": sub, "history": hist}, "supplier")
    return {"submitted": confirm, "submission": sub}


@public.post("/supplier/{token}/file")
async def public_file(token: str, file: UploadFile = File(...)):
    await _by_token(token)
    return {"file": await _store(file)}
