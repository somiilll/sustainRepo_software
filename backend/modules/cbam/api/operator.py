"""Operator side: verification / assurance, per-shipment ledger, communication to EU importers, MMD document."""
import secrets
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from ..core import db
from ..core.auth import User, current_user, require_role
from ..core.config import settings
from ..core.notifier import Message, get_notifier
from ..engine.pipeline import compute_installation
from ..reference.loader import load_reference
from ..reports import builders, mmd
from .common import DOCX, XLSX, _404, download
from .deps import get_factors

router = APIRouter(prefix="/api/cbam")
public = APIRouter(prefix="/api/cbam/public")

MATERIALITY = 0.05  # 5 % of SEE and of SEFA, per CN code (Verification Regulation 2025/2546)
MAX_CONSECUTIVE = 5  # lead auditor: 5 consecutive verifications, then a 3-year break
OPINIONS = ("positive", "positive_with_comments", "negative")


async def _installation(org_id: str, inst_id: str) -> tuple[dict, dict]:
    inst = _404(await db.get_doc("installations", org_id, inst_id))
    return inst, compute_installation(inst, load_reference(), await get_factors(org_id))


# ---------------------------------------------------------------- verification
def materiality(results: dict, misstatements: list[dict]) -> list[dict]:
    """Flag misstatements above 5 % of SEE or SEFA for the CN code they relate to."""
    by_cn = {p.get("cn_code"): p for p in results["processes"] if not p.get("error")}
    out = []
    for m in misstatements or []:
        p = by_cn.get(m.get("cn_code"))
        if not p:
            continue
        see_rel = abs(float(m.get("see") or 0)) / p["see"] if p["see"] else 0
        sefa_rel = abs(float(m.get("sefa") or 0)) / p["sefa"] if p["sefa"] else 0
        out.append({"cn_code": m["cn_code"], "see_rel": see_rel, "sefa_rel": sefa_rel,
                    "material": see_rel > MATERIALITY or sefa_rel > MATERIALITY})
    return out


def verification_checks(v: dict, today: date | None = None) -> list[dict]:
    today = today or date.today()
    site = v.get("site_visit") or {}
    first = bool(v.get("first_year", True))
    lead, reviewer = (v.get("lead_auditor") or "").strip(), (v.get("independent_reviewer") or "").strip()
    exp = v.get("accreditation_expiry")
    checks = [
        {"item": "Verifier accredited (accreditation number and expiry recorded)", "ok": bool(v.get("accreditation_no")) and bool(exp)
         and date.fromisoformat(exp) >= today, "detail": f"expires {exp}" if exp else "missing"},
        {"item": "Site visit", "ok": (site.get("type") == "physical") if first else (site.get("type") == "physical" or bool(site.get("condition"))),
         "detail": ("first verification of this installation needs a physical site visit" if first and site.get("type") != "physical"
                    else f"{site.get('type') or 'not planned'}{' - ' + site['condition'] if site.get('condition') else ''}")},
        {"item": "Independent reviewer (not the lead auditor)", "ok": bool(reviewer) and reviewer.lower() != lead.lower(),
         "detail": reviewer or "missing"},
        {"item": "Lead auditor rotation (max 5 consecutive, then 3-year break)",
         "ok": int(v.get("lead_auditor_consecutive") or 0) <= MAX_CONSECUTIVE,
         "detail": f"{int(v.get('lead_auditor_consecutive') or 0)} consecutive verification(s)"},
        {"item": "Verification report in English", "ok": (v.get("report_language") or "English") == "English",
         "detail": v.get("report_language") or "English"},
    ]
    mat = v.get("materiality") or []
    checks.append({"item": "No material misstatement (> 5 % of SEE or SEFA per CN)", "ok": not any(m["material"] for m in mat),
                   "detail": ", ".join(f"{m['cn_code']}: SEE {m['see_rel']:.1%} / SEFA {m['sefa_rel']:.1%}" for m in mat) or "none reported"})
    return checks


async def _verification(org_id: str, inst_id: str) -> dict:
    doc = await db.col("verifications").find_one({"org_id": org_id, "installation_id": inst_id})
    return db.clean(doc) or {"installation_id": inst_id, "status": "Not started", "first_year": True,
                             "site_visit": {"type": "physical"}, "report_language": "English"}


V_FIELDS = ("verifier_body", "accreditation_no", "accreditation_expiry", "lead_auditor", "lead_auditor_consecutive",
            "independent_reviewer", "site_visit", "first_year", "report_language", "verifier_email", "status")


@router.get("/installations/{inst_id}/verification")
async def get_verification(inst_id: str, user: User = Depends(current_user)):
    _, res = await _installation(user.org_id, inst_id)
    v = await _verification(user.org_id, inst_id)
    v["materiality"] = materiality(res, (v.get("opinion") or {}).get("misstatements"))
    return {**v, "checks": verification_checks(v)}


@router.put("/installations/{inst_id}/verification")
async def put_verification(inst_id: str, body: dict, user: User = Depends(require_role("operator"))):
    await _installation(user.org_id, inst_id)
    data = {k: body[k] for k in V_FIELDS if k in body}
    if (data.get("site_visit") or {}).get("type") not in (None, "physical", "virtual", "waived"):
        raise HTTPException(422, "site visit type must be physical | virtual | waived")
    await db.col("verifications").update_one({"org_id": user.org_id, "installation_id": inst_id},
                                             {"$set": {**data, "updated_at": db.now()}}, upsert=True)
    await db.audit(user.org_id, user.email, "verifications", inst_id, "update", None, data)
    if data.get("verifier_body"):
        await db.update_doc("installations", user.org_id, inst_id, {"verifier": data["verifier_body"]}, user.email)
    return await get_verification(inst_id, user)


@router.post("/installations/{inst_id}/verification/invite")
async def invite_verifier(inst_id: str, body: dict, user: User = Depends(require_role("operator"))):
    inst, _ = await _installation(user.org_id, inst_id)
    email = (body.get("email") or "").strip()
    if "@" not in email:
        raise HTTPException(422, "Enter the verifier's e-mail")
    token = secrets.token_urlsafe(16)
    await db.col("tokens").insert_one({"token": token, "org_id": user.org_id, "installation_id": inst_id, "kind": "verifier"})
    await db.col("verifications").update_one({"org_id": user.org_id, "installation_id": inst_id},
                                             {"$set": {"verifier_email": email, "verifier_body": body.get("name", ""), "status": "Invited",
                                                       "token": token, "updated_at": db.now()}}, upsert=True)
    await db.update_doc("installations", user.org_id, inst_id, {"verification_status": "Verifier invited"}, user.email)
    link = f"{settings.public_base_url}/cbam/verifier/{token}"
    sent = await get_notifier().send(user.org_id, user.email, Message(
        email, f"CBAM verification request - {inst['name']}",
        f"You are invited to verify the CBAM emissions report of {inst['name']} ({inst.get('country')}) for {inst.get('reporting_year')}.\n"
        f"Read-only access to the report and evidence: {link}"), "verifications", inst_id)
    return {"link": link, "notification": sent}


async def _verifier_token(token: str) -> dict:
    t = await db.col("tokens").find_one({"token": token, "kind": "verifier"})
    if not t:
        raise HTTPException(404, "Invalid or expired link")
    return t


@public.get("/verifier/{token}")
async def verifier_view(token: str):
    t = await _verifier_token(token)
    inst, res = await _installation(t["org_id"], t["installation_id"])
    v = await _verification(t["org_id"], t["installation_id"])
    evidence = sorted({p.get("evidence") for p in inst.get("precursors", []) if p.get("evidence")})
    return {"installation": {k: inst.get(k) for k in ("name", "country", "reporting_year", "verification_status")},
            "processes": [{k: p.get(k) for k in ("name", "cn_code", "sector", "activity_level_t", "attr_direct", "see_direct",
                                                 "see_indirect", "see", "sefa", "error", "see_steps", "sefa_steps", "attribution_steps")}
                          for p in res["processes"]],
            "streams": [{k: s.get(k) for k in ("name", "kind", "unit", "ncv", "ef", "source")} for s in inst.get("source_streams", [])],
            "evidence": evidence, "verification": {k: v.get(k) for k in ("verifier_body", "status", "opinion")}}


@public.post("/verifier/{token}/opinion")
async def verifier_opinion(token: str, body: dict):
    t = await _verifier_token(token)
    if body.get("opinion") not in OPINIONS:
        raise HTTPException(422, f"opinion must be one of {OPINIONS}")
    _, res = await _installation(t["org_id"], t["installation_id"])
    op = {"opinion": body["opinion"], "comments": body.get("comments", ""), "misstatements": body.get("misstatements") or [],
          "site_visit_date": body.get("site_visit_date"), "submitted_at": db.now()}
    mat = materiality(res, op["misstatements"])
    if body["opinion"] != "negative" and any(m["material"] for m in mat):
        raise HTTPException(422, "A material misstatement (> 5 %) is recorded - a positive opinion is not possible until it is corrected.")
    status = "Verified" if body["opinion"] != "negative" else "Negative opinion"
    await db.col("verifications").update_one({"org_id": t["org_id"], "installation_id": t["installation_id"]},
                                             {"$set": {"opinion": op, "status": status, "updated_at": db.now()}}, upsert=True)
    await db.update_doc("installations", t["org_id"], t["installation_id"], {"verification_status": status}, "verifier")
    return {"ok": True, "status": status, "materiality": mat}


# ---------------------------------------------------------------- shipments and communication
S_FIELDS = ("ref", "date", "buyer", "buyer_email", "process_id", "quantity_t", "note")


def _enrich(s: dict, res: dict, inst: dict) -> dict:
    p = next((p for p in res["processes"] if p["process_id"] == s.get("process_id")), None) or {}
    q = float(s.get("quantity_t") or 0)
    see = p.get("see") or 0
    return {**s, "process_name": p.get("name"), "cn_code": p.get("cn_code"), "route": p.get("route", ""),
            "see_direct": p.get("see_direct"), "see_indirect": p.get("see_indirect"), "see": p.get("see"), "sefa": p.get("sefa"),
            "indirect_in_scope": p.get("indirect_in_scope"), "embedded": see * q,
            "carbon_price_eur_per_t": inst.get("carbon_price_paid") or 0,
            "verification": inst.get("verification_status"), "error": p.get("error") if p else "Unknown process"}


@router.get("/installations/{inst_id}/shipments")
async def list_shipments(inst_id: str, user: User = Depends(current_user)):
    inst, res = await _installation(user.org_id, inst_id)
    rows = await db.list_docs("shipments", user.org_id, {"installation_id": inst_id}, sort="date")
    return [_enrich(s, res, inst) for s in rows]


@router.post("/installations/{inst_id}/shipments")
async def add_shipment(inst_id: str, body: dict, user: User = Depends(require_role("operator"))):
    inst, res = await _installation(user.org_id, inst_id)
    data = {k: body.get(k) for k in S_FIELDS}
    if not data["ref"] or not data["date"] or not data["process_id"]:
        raise HTTPException(422, "Shipment / invoice number, date and product (process) are required")
    if float(data.get("quantity_t") or 0) <= 0:
        raise HTTPException(422, "Quantity must be > 0 tonnes")
    if not any(p["process_id"] == data["process_id"] for p in res["processes"]):
        raise HTTPException(422, "Unknown process for this installation")
    data["quantity_t"] = float(data["quantity_t"])
    doc = await db.insert_doc("shipments", user.org_id, {**data, "installation_id": inst_id}, user.email)
    return _enrich(doc, res, inst)


@router.delete("/installations/{inst_id}/shipments/{sid}")
async def delete_shipment(inst_id: str, sid: str, user: User = Depends(require_role("operator"))):
    _404(await db.delete_doc("shipments", user.org_id, sid, user.email) or None)
    return {"ok": True}


@router.get("/installations/{inst_id}/communication.{fmt}")
async def communication(inst_id: str, fmt: str, buyer: str = "", period: str = "", user: User = Depends(current_user)):
    """Emissions data communication for one buyer and period (YYYY or YYYY-Qn)."""
    inst, res = await _installation(user.org_id, inst_id)
    rows = [_enrich(s, res, inst) for s in await db.list_docs("shipments", user.org_id, {"installation_id": inst_id}, sort="date")]

    def in_period(d: str) -> bool:
        if not period:
            return True
        if "-Q" in period:
            y, q = period.split("-Q")
            return d[:4] == y and (int(d[5:7]) - 1) // 3 + 1 == int(q)
        return d.startswith(period)

    rows = [r for r in rows if (not buyer or r.get("buyer") == buyer) and in_period(str(r.get("date", "")))]
    label = period or str(inst.get("reporting_year"))
    name = f"CBAM_communication_{inst['name']}_{buyer or 'all'}_{label}"
    if fmt == "xlsx":
        return download(builders.communication_xlsx(inst, buyer, label, rows), XLSX, f"{name}.xlsx")
    if fmt == "pdf":
        return download(builders.communication_pdf(inst, buyer, label, rows), "application/pdf", f"{name}.pdf")
    raise HTTPException(404, "Format must be xlsx or pdf")


# ---------------------------------------------------------------- monitoring methodology document
@router.get("/installations/{inst_id}/mmd.docx")
async def mmd_docx(inst_id: str, user: User = Depends(current_user)):
    inst, res = await _installation(user.org_id, inst_id)
    v = await _verification(user.org_id, inst_id)
    return download(mmd.build(inst, res, v), DOCX, f"CBAM_MMD_{inst['name']}_{res['reporting_year']}.docx")
