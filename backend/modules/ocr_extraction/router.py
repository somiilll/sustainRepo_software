"""OCR Extraction v2 API (mounted at /api/ocr-invoice). Engine: extractor_core; storage: MongoDB + R2."""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user
from r2_storage import R2Storage

from shared.database.mongo import db as mongo_db

from . import factor_source, store  # noqa: F401  (also puts the engine package on sys.path via __init__)
from extractor_core import audit, facilities as fac_mod, llm, normalise, plausibility, usage  # noqa: E402
from extractor_core.config import load  # noqa: E402
from extractor_core.export import approval_blockers, save_all_payload  # noqa: E402
from extractor_core.group import memory_keys  # noqa: E402
from extractor_core.normalise import DOC_EXT, SHEET_EXT  # noqa: E402
from extractor_core.pipeline import Engine, JobCancelled  # noqa: E402
from extractor_core.validate import finish, row_checks, trust as trust_of  # noqa: E402
from .edit_override import Override, apply_override, edit_config, factor_options  # noqa: E402

logger = logging.getLogger(__name__)
router = APIRouter()

DB = store.DB
MEMORY, LEDGER, AUDIT, JOBS = store.MongoMemory(), store.MongoLedger(), store.MongoAudit(), store.JobStore()
TRIAL_CREDITS = 5000
PROGRESS_KEYS = ("stage", "done", "total", "message", "items", "files_total", "files_done", "credits", "elapsed")
_live: dict[str, dict] = {}
_live_lock = threading.Lock()
_r2 = None


def r2():
    global _r2
    if _r2 is None:
        _r2 = R2Storage()
    return _r2


def _bucket() -> str:
    return r2()._get_bucket("ocr_temp")


# ------------------------------------------------------------------ org helpers
def _org(user: dict) -> str:
    org = user.get("organization_id")
    if not org:
        raise HTTPException(400, "No organization assigned")
    return org


def _actor(user: dict) -> str:
    return str(user.get("full_name") or user.get("name") or user.get("email") or user.get("id") or "user")[:80]


def _facilities(org: str) -> list[dict]:
    out = []
    for f in DB.facilities.find({"organization_id": org, "is_deleted": {"$ne": True}, "is_active": {"$ne": False}}, {"_id": 0}):
        words = [w for w in re.split(r"[,;\n]", " ".join(str(f.get(k) or "") for k in ("city", "address"))) if len(w.strip()) > 3]
        out.append({"id": f["id"], "name": f.get("name") or f["id"], "aliases": [], "consumer_numbers": [], "gstins": [],
                    "address_keywords": [w.strip().lower() for w in words][:6]})
    return out


def _org_context(org: str) -> dict:
    o = DB.organizations.find_one({"id": org}, {"_id": 0, "name": 1, "industry_sector": 1, "industry": 1, "sector": 1}) or {}
    return {"name": o.get("name"), "industry": o.get("industry_sector") or o.get("industry") or o.get("sector")}


def _engine(org: str, facilities: list[dict] | None = None) -> Engine:
    return Engine(MEMORY, org=org, org_context=_org_context(org), facilities=facilities if facilities is not None else _facilities(org), use_ai=True, factors=factor_source.get_index)


def _ensure_trial(org: str) -> None:
    if not LEDGER.balance(org)["granted"]:
        LEDGER.grant(org, TRIAL_CREDITS, "Trial credits")


# ------------------------------------------------------------------ job storage
def _review_counts(rows: list[dict]) -> dict:
    c: dict[str, int] = {}
    for r in rows:
        if r.get("derived"):
            continue
        k = (r.get("review") or {}).get("state", r.get("review_status"))
        c[k] = c.get(k, 0) + 1
    return c


def _scope_counts(rows: list[dict]) -> dict:
    c: dict[str, int] = {}
    for r in rows:
        if r.get("derived"):
            continue
        k = (r.get("ghg") or {}).get("scope") or ("water" if "water" in r.get("modules", []) else "waste" if "waste" in r.get("modules", []) else "none")
        c[k] = c.get(k, 0) + 1
    return c


def _job_credits(j: dict) -> float | None:
    u = (j.get("usage") or {}).get("total")
    return u["credits"] if u else None


def _save_job(org: str, job: dict) -> None:
    """Full result to GridFS, light summary (everything the list and job views need) to ocr_ext_jobs."""
    JOBS.write(org, job)
    rows = job.get("rows", [])
    summary = {"status": job.get("status"), "finished": job.get("finished"), "mode": job.get("mode"), "error": job.get("error"),
               "review": _review_counts(rows), "linked": sum(1 for r in rows if r.get("derived")), "row_count": len(rows),
               "scopes": _scope_counts(rows), "credits": _job_credits(job), "metrics": job.get("metrics", {}),
               "skipped": job.get("skipped"), "documents": job.get("documents", []),
               "usage": {k: v for k, v in (job.get("usage") or {}).items() if k != "events"},
               "file_hashes": sorted({(i.get("source") or {}).get("file_hash") for i in job.get("items", [])} - {None})}
    DB.ocr_ext_jobs.update_one({"job_id": job["job_id"], "org": org}, {"$set": summary})


def _summary(org: str, job_id: str) -> dict:
    d = DB.ocr_ext_jobs.find_one({"job_id": job_id, "org": org}, {"_id": 0})
    if not d:
        raise HTTPException(404, "No such job")
    return d


def _read_job(org: str, job_id: str) -> dict:
    _summary(org, job_id)
    j = JOBS.read(org, job_id)
    if not j:
        raise HTTPException(404, "This extraction has no saved result")
    for r in j.get("rows", []):
        if "trust" not in r and r.get("confidence") and r.get("decision") and r.get("calc") and r.get("period"):
            r["trust"] = trust_of(r)
    return j


# ------------------------------------------------------------------ queue runner
def _record_spent(eng, org: str, job_id: str) -> None:
    events = [usage.from_llm_call(c) for c in getattr(eng, "metrics", {}).get("llm_calls", [])] + \
             [usage.from_classifier_call(c) for c in eng.classifier.calls]
    if events:
        LEDGER.record(org, job_id, events)


def _runner(job: dict, cancel: threading.Event, set_credits) -> dict:
    job_id, org, mode, names, created = job["job_id"], job["org"], job["mode"], job["names"], job["created"]
    summary = DB.ocr_ext_jobs.find_one({"job_id": job_id, "org": org}, {"_id": 0}) or {}
    choices = summary.get("facility_choices") or {}
    tmp = Path(tempfile.mkdtemp(prefix="ocrx_"))
    with _live_lock:
        _live[job_id] = {"stage": "queued", "created": created, "mode": mode, "names": names}
    last = [0.0]

    def progress(p):
        with _live_lock:
            _live[job_id].update(p)
        if time.time() - last[0] > 2:
            last[0] = time.time()
            set_credits(p.get("credits") or 0)

    eng = None
    try:
        files = []
        for name, key in zip(names, job["paths"]):
            dest = tmp / name
            r2().client.download_file(_bucket(), key, str(dest))
            files.append(dest)
        eng = _engine(org)
        remaining = LEDGER.balance(org)["remaining"]
        if remaining <= 0:
            return {"status": "failed", "error": "No credits left. Add credits on the Credits & usage page, then retry.", "credits": 0}
        res = eng.run(files, mode=mode, progress=progress, job_id=job_id, budget=remaining, cancel=cancel, facility_choices=choices)
        res.update(status="done", created=created, names=names, finished=time.time(), facility_choices=choices)
        for r in res["rows"]:
            r["review"] = {"state": r["review_status"]}
        LEDGER.record(org, job_id, res["usage"]["events"])
        _save_job(org, res)
        return {"status": "done", "credits": res["usage"]["total"]["credits"]}
    except JobCancelled:
        if eng:
            _record_spent(eng, org, job_id)
        return {"status": "cancelled", "error": "Cancelled. Credits already used stay on the usage page."}
    except Exception as e:  # noqa: BLE001
        logger.exception("OCR extraction job failed")
        if eng:
            _record_spent(eng, org, job_id)
        return {"status": "failed", "error": f"{type(e).__name__}: {e}"}
    finally:
        with _live_lock:
            _live.pop(job_id, None)
        shutil.rmtree(tmp, ignore_errors=True)


_timing = load().policy.get("timing", {})
QUEUE = store.MongoJobQueue(_runner, heavy_slots=_timing.get("heavy_slots", 3), light_slots=_timing.get("light_slots", 2),
                            per_org=_timing.get("jobs_per_org", 2))


def start_queue() -> None:
    """Called once at server startup."""
    store.ensure_indexes()
    for j in QUEUE.recover():
        if (j.get("credits") or 0) > 0 and not LEDGER.has_job(j["org"], j["job_id"]):
            c = j["credits"]
            LEDGER.record(j["org"], j["job_id"], [{"step": "extract", "provider": "interrupted", "model": "unknown", "calls": 1, "ok": True,
                                                   "input_tokens": 0, "output_tokens": 0, "seconds": 0, "cost_usd": round(c * 0.001, 6),
                                                   "cost_basis": "reported", "estimated": True, "credits": c}])
    QUEUE.start()


# ------------------------------------------------------------------ upload
def _page_count(path: Path) -> int:
    try:
        if path.suffix.lower() == ".pdf":
            import fitz
            with fitz.open(path) as d:
                return min(len(d), load().policy["limits"]["max_pages"])
    except Exception:  # noqa: BLE001
        pass
    return 1


def _est_seconds(paths: list[Path], mode: str) -> tuple[int, int]:
    t = load().policy.get("timing", {})
    per_page = t.get("sec_per_page_think", 25) if mode == "think" else t.get("sec_per_page_fast", 10)
    secs, pages = [], 0
    for p in paths:
        if normalise.file_kind(p) == "sheet":
            secs.append(t.get("sec_per_sheet", 4))
        else:
            n = _page_count(p)
            pages += n
            secs.append(n * per_page)
    return (round(4 + max(max(secs), sum(secs) / 4)) if secs else 0), pages


def _clean_choices(raw: str, files: list[str], facs: list[dict]) -> dict:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Facility choices are not valid JSON")
    ids = {f["id"] for f in facs}
    out: dict = {}
    for name, c in (data or {}).items():
        if name not in files or not isinstance(c, dict):
            continue
        one: dict = {}
        if c.get("default"):
            one["default"] = c["default"]
        if isinstance(c.get("map"), dict):
            one["map"] = dict(c["map"])
        if isinstance(c.get("sheets"), dict):
            one["sheets"] = dict(c["sheets"])
        used = [v for v in ([one.get("default")] + list(one.get("map", {}).values()) + list(one.get("sheets", {}).values())) if v]
        bad = [v for v in used if v not in ids]
        if bad:
            raise HTTPException(400, f"Unknown facility: {bad[0]}")
        out[name] = one
    return out


def _find_earlier(org: str, hashes: set[str], choices: dict) -> dict | None:
    if not hashes:
        return None
    best = None
    for d in DB.ocr_ext_jobs.find({"org": org, "status": "done"}, {"_id": 0, "job_id": 1, "created": 1, "file_hashes": 1, "facility_choices": 1}):
        if set(d.get("file_hashes") or []) == hashes and (d.get("facility_choices") or {}) == choices and (best is None or d["created"] > best["created"]):
            best = {"job_id": d["job_id"], "created": d["created"]}
    return best


@router.post("/jobs")
def create_job(files: list[UploadFile] = File(...), mode: str = Form("fast"), force: bool = Form(False), facilities: str = Form(""),
               user: dict = Depends(get_current_user)):
    org = _org(user)
    if mode not in ("fast", "think"):
        raise HTTPException(400, "mode must be fast or think")
    lim = load().policy["limits"]
    if len(files) > lim.get("max_files", 30):
        raise HTTPException(413, f"Too many files: {len(files)}. Upload at most {lim.get('max_files', 30)} at a time.")
    for f in files:
        ext = Path(f.filename or "").suffix.lower()
        if ext not in (SHEET_EXT | DOC_EXT):
            raise HTTPException(415, f"'{Path(f.filename or 'file').name}' is not a supported file type ({ext or 'no extension'}). Use PDF, image, Excel or CSV.")
    _ensure_trial(org)
    if LEDGER.balance(org)["remaining"] <= 0:
        raise HTTPException(402, "No credits left. Add credits on the Credits & usage page to run another extraction.")
    job_id = uuid.uuid4().hex[:10]
    tmp = Path(tempfile.mkdtemp(prefix="ocrx_up_"))
    try:
        paths, names, seen = [], [], set()
        for f in files:
            name = Path(f.filename or "file").name
            if name in seen:
                raise HTTPException(400, f"Two files are named '{name}'. Rename one and upload again.")
            seen.add(name)
            dest = tmp / name
            with dest.open("wb") as out:
                shutil.copyfileobj(f.file, out)
            if dest.stat().st_size > lim.get("max_file_mb", 25) * 1024 * 1024:
                raise HTTPException(413, f"'{name}' is larger than {lim.get('max_file_mb', 25)} MB. Split it or compress it.")
            paths.append(dest)
            names.append(name)
        facs = _facilities(org)
        choices = _clean_choices(facilities, names, facs)
        hashes = {normalise.file_hash(p) for p in paths}
        if not force:
            earlier = _find_earlier(org, hashes, choices)
            if earlier:
                return {"reused": True, **earlier}
        for c in choices.values():
            for raw_name, fid in (c.get("map") or {}).items():
                MEMORY.save_facility_alias(org, raw_name, fid)
        est, pages = _est_seconds(paths, mode)
        lane = "light" if all(normalise.file_kind(p) == "sheet" for p in paths) else "heavy"
        keys = []
        for name, p in zip(names, paths):
            key = f"ocr-extraction/{org}/{job_id}/{name}"
            r2().client.upload_file(str(p), _bucket(), key)
            keys.append(key)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    now = time.time()
    DB.ocr_ext_jobs.insert_one({"job_id": job_id, "org": org, "status": "queued", "created": now, "mode": mode, "names": names, "file_keys": keys,
                                "facility_choices": choices, "file_hashes": sorted(hashes), "created_by": _actor(user)})
    QUEUE.submit(job_id, org, mode, lane, names, keys, pages=pages, est_seconds=est, created=now)
    return {"job_id": job_id, "est_seconds": est, **QUEUE.wait_info(job_id)}


@router.post("/preview")
def preview(files: list[UploadFile] = File(...), user: dict = Depends(get_current_user)):
    org = _org(user)
    facs = _facilities(org)
    tmp = Path(tempfile.mkdtemp(prefix="ocrx_pv_"))
    out = []
    try:
        for f in files:
            name = Path(f.filename or "file").name
            dest = tmp / name
            with dest.open("wb") as o:
                shutil.copyfileobj(f.file, o)
            entry = {"file": name, "kind": normalise.file_kind(dest)}
            if entry["kind"] == "sheet":
                try:
                    entry.update(fac_mod.peek_sheet(dest, facs, alias_of=lambda n: MEMORY.get_facility_alias(org, n)))
                except Exception as e:  # noqa: BLE001
                    entry.update(tables=[], sheets=[], note=f"Could not read the sheet headers: {e}")
            out.append(entry)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return {"files": out, "facilities": [{"id": f["id"], "name": f["name"]} for f in facs]}


# ------------------------------------------------------------------ jobs
@router.get("/jobs")
def list_jobs(user: dict = Depends(get_current_user)):
    org = _org(user)
    out = []
    for q in QUEUE.all(org=org, states=("queued", "running", "failed", "cancelled", "interrupted")):
        base = {"job_id": q["job_id"], "created": q["created"], "mode": q["mode"], "names": q["names"], "est_seconds": q["est_seconds"],
                "attempts": q["attempts"], "lane": q["lane"]}
        if q["status"] == "running":
            with _live_lock:
                p = _live.get(q["job_id"], {})
            out.append({**base, "status": "running", "cancelling": q["cancel_requested"], "progress": {k: p.get(k) for k in PROGRESS_KEYS}})
        elif q["status"] == "queued":
            out.append({**base, "status": "queued", **QUEUE.wait_info(q["job_id"])})
        else:
            out.append({**base, "status": q["status"], "error": q["error"], "credits": q["credits"]})
    for j in DB.ocr_ext_jobs.find({"org": org, "status": "done"}, {"_id": 0}).sort("created", -1).limit(50):
        out.append({"job_id": j["job_id"], "status": "done", "created": j.get("created"), "mode": j.get("mode"), "names": j.get("names", []),
                    "error": j.get("error"), "metrics": j.get("metrics", {}), "review": j.get("review", {}), "linked": j.get("linked", 0),
                    "credits": j.get("credits"), "scopes": j.get("scopes", {}),
                    "documents": [{"file": d["file"], "kind": d["kind"], "status": d["status"], "rows": d.get("rows", 0), "pages": d.get("pages")}
                                  for d in j.get("documents", [])]})
    return out


@router.get("/jobs/{job_id}")
def get_job(job_id: str, user: dict = Depends(get_current_user)):
    org = _org(user)
    s = _summary(org, job_id)
    q = QUEUE.get(job_id)
    if q and q["org"] == org and q["status"] != "done":
        with _live_lock:
            p = _live.get(job_id, {})
        return {"job_id": job_id, "status": q["status"], "error": q["error"], "names": q["names"], "created": q["created"],
                "progress": {k: p.get(k) for k in PROGRESS_KEYS}, **QUEUE.wait_info(job_id)}
    return {k: s.get(k) for k in ("job_id", "status", "error", "mode", "created", "finished", "names", "documents", "skipped", "metrics",
                                  "review", "linked", "row_count", "credits", "usage")}


@router.get("/jobs/{job_id}/source-rows")
def get_source_rows(job_id: str, user: dict = Depends(get_current_user)):
    """Spreadsheet rows that were deliberately not turned into records (column titles, summary rows, all-zero rows), with the reason."""
    return _read_job(_org(user), job_id).get("source_rows", [])


@router.get("/jobs/{job_id}/rows")
def get_rows(job_id: str, user: dict = Depends(get_current_user)):
    return _read_job(_org(user), job_id).get("rows", [])


@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, user: dict = Depends(get_current_user)):
    org = _org(user)
    s = _summary(org, job_id)
    QUEUE.remove(job_id)
    JOBS.delete(job_id)
    DB.ocr_ext_jobs.delete_one({"job_id": job_id, "org": org})
    for key in s.get("file_keys", []):
        try:
            r2().client.delete_object(Bucket=_bucket(), Key=key)
        except Exception:  # noqa: BLE001
            logger.warning("Could not delete %s from storage", key)
    return {"ok": True}


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user: dict = Depends(get_current_user)):
    _summary(_org(user), job_id)
    state = QUEUE.cancel(job_id)
    if state is None:
        raise HTTPException(404, "No such job")
    return {"status": state}


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, user: dict = Depends(get_current_user)):
    _summary(_org(user), job_id)
    if not QUEUE.retry(job_id):
        raise HTTPException(409, "Only a failed, cancelled or interrupted job can be retried")
    return {"status": "queued", **QUEUE.wait_info(job_id)}


# ------------------------------------------------------------------ review actions
class ItemEdit(BaseModel):
    activity_id: str | None = None
    use_context: str | None = None
    quantity: float | None = None
    unit: str | None = None
    amount: float | None = None
    facility_id: str | None = None
    reporting_period: str | None = None
    override: Override | None = None
    remember: bool = True
    scope: str = "vendor"


@router.patch("/jobs/{job_id}/items/{item_id}")
def edit_item(job_id: str, item_id: str, e: ItemEdit, user: dict = Depends(get_current_user)):
    org = _org(user)
    job = _read_job(org, job_id)
    item = next((i for i in job["items"] if i["item_id"] == item_id), None)
    if item is None:
        raise HTTPException(404, "No such item")
    tax = load().taxonomy
    if any((r.get("review") or {}).get("saved") for r in job["rows"] if r["item_id"] == item_id):
        raise HTTPException(409, "This line is already saved to GHG records. Change the emission record there instead.")
    old = next((r for r in job["rows"] if r["item_id"] == item_id and not r.get("derived")), None)
    dec = dict(job["decisions"].get(item["group_key"], {})) if not old else dict(old["decision"])
    for k in ("quantity", "unit", "amount"):
        v = getattr(e, k)
        if v is not None:
            item[k] = v
    if e.reporting_period:
        if not re.fullmatch(r"\d{4}-\d{2}", e.reporting_period):
            raise HTTPException(400, "Period must be YYYY-MM")
        item["period_hint"], item["period_start"], item["period_end"], item["date"] = e.reporting_period, None, None, None
    facs = _facilities(org)
    fac = None
    if e.facility_id:
        fac = next((f for f in facs if f["id"] == e.facility_id), None)
        if not fac:
            raise HTTPException(400, "Unknown facility")
        item["facility_hint"], item["consumer_number"], item["buyer_gstin"] = fac["name"], None, None
    changed_class = bool(e.activity_id) or bool(e.use_context)
    if e.activity_id:
        if e.activity_id not in tax.activities:
            raise HTTPException(400, "Unknown activity")
        ctx = dict(dec.get("context") or {}) if e.activity_id == dec.get("activity_id") else {}
        if e.use_context:
            ctx["use_context"] = e.use_context
        dec = {"activity_id": e.activity_id, "confidence": 0.99, "source": "user", "context": ctx,
               "context_confidence": {k: 0.99 for k in ctx}, "reason": "Set by reviewer", "alternatives": [], "question": None}
    elif e.use_context:
        dec = {**dec, "context": {**(dec.get("context") or {}), "use_context": e.use_context},
               "context_confidence": {**(dec.get("context_confidence") or {}), "use_context": 0.99}, "question": None,
               "confidence": max(dec.get("confidence", 0), 0.95), "source": "user", "reason": "Use confirmed by reviewer"}
    eng = _engine(org, facs)
    new_rows = eng.rows_for_item(item, dec)
    if fac:
        for r in new_rows:
            r["facility"] = {"id": fac["id"], "name": fac["name"], "method": "set by reviewer", "confidence": 0.99}
            r["checks"] = row_checks(r, item)
            finish(r, item)
    if e.override:
        parent = next((r for r in new_rows if not r.get("derived")), None)
        if parent is None:
            raise HTTPException(400, "This line has no record to edit")
        before = parent["ghg"]
        apply_override(parent, item, e.override, e.remember, org)
        same = before.get("scope") == parent["ghg"]["scope"] and str(before.get("category_label") or "").lower() == parent["ghg"]["category_label"].lower()
        new_rows = [r for r in new_rows if r is parent or (same and r.get("derived"))]
    for r in new_rows:
        r["review"] = {**(r.get("review") or {}), "state": r["review_status"], "edited": True}
    remember = e.remember and changed_class and dec.get("activity_id")
    if remember:
        eng.classifier.remember(item, dec, source="user", scope="all" if e.scope == "all" else "vendor")
    job["rows"] = [r for r in job["rows"] if r["item_id"] != item_id]
    pos = next((n for n, i in enumerate(job["items"]) if i["item_id"] == item_id), 0)
    before = {i["item_id"] for i in job["items"][:pos]}
    k = max((n + 1 for n, r in enumerate(job["rows"]) if r["item_id"] in before), default=0)
    job["rows"][k:k] = new_rows
    _save_job(org, job)
    parent = next((r for r in new_rows if not r.get("derived")), None)
    note = ("Classification confirmed and remembered for " + ("this wording from any vendor" if e.scope == "all" else "this vendor")) if remember \
        else "Classification confirmed" if changed_class else None
    AUDIT.record(org, job_id, "edited", _actor(user), item_id=item_id, row_id=(parent or {}).get("row_id"), label=(parent or {}).get("extracted_item"),
                 changes=audit.diff(audit.snapshot(old), audit.snapshot(parent)), note=note)
    return new_rows


class ReviewAction(BaseModel):
    row_ids: list[str]
    state: str


@router.post("/jobs/{job_id}/review")
def review(job_id: str, a: ReviewAction, user: dict = Depends(get_current_user)):
    org = _org(user)
    if a.state not in ("approved", "rejected", "reset"):
        raise HTTPException(400, "state must be approved, rejected or reset")
    job = _read_job(org, job_id)
    who = _actor(user)
    ids = set(a.row_ids)
    ids |= {r["row_id"] for r in job["rows"] if r.get("parent_id") in ids}
    n, blocked = 0, []
    if a.state == "approved":
        bad = approval_blockers(job["rows"], ids)
        blocked = sorted(bad)
        for r in job["rows"]:
            if r["row_id"] in bad and not r.get("derived"):
                AUDIT.record(org, job_id, "approval_blocked", who, item_id=r["item_id"], row_id=r["row_id"], label=r.get("extracted_item"),
                             note="Not approved: needs a formula, facility and period first")
        ids -= bad
    for r in job["rows"]:
        if r["row_id"] in ids:
            before = (r.get("review") or {}).get("state") or r.get("review_status")
            r["review"] = {**(r.get("review") or {}), "state": r["review_status"] if a.state == "reset" else a.state, "at": time.time(), "by": who}
            n += 1
            if not r.get("derived"):
                AUDIT.record(org, job_id, a.state, who, item_id=r["item_id"], row_id=r["row_id"], label=r.get("extracted_item"),
                             changes={"review_state": [before, r["review"]["state"]]})
                if a.state == "approved":
                    it = next((i for i in job["items"] if i["item_id"] == r["item_id"]), None)
                    if it and r.get("activity_id") and not (r.get("review") or {}).get("override"):
                        MEMORY.confirm(org, memory_keys(it)[0], r["activity_id"])
                    if (r.get("quantity") or 0) > 0 and r.get("reporting_period"):
                        MEMORY.add_history(org, plausibility.history_key(r), r["reporting_period"], r["quantity"], r.get("unit"), job_id, r["row_id"])
    _save_job(org, job)
    return {"updated": n, "blocked": blocked}


@router.get("/jobs/{job_id}/audit")
def job_audit(job_id: str, item_id: str | None = None, limit: int = 200, user: dict = Depends(get_current_user)):
    org = _org(user)
    _summary(org, job_id)
    return AUDIT.for_item(org, job_id, item_id) if item_id else AUDIT.for_job(org, job_id, min(limit, 1000))


@router.get("/jobs/{job_id}/export")
def export(job_id: str, include_unapproved: bool = False, user: dict = Depends(get_current_user)):
    org = _org(user)
    job = _read_job(org, job_id)
    payload = save_all_payload(job["rows"], org, only_approved=not include_unapproved)
    return Response(json.dumps(payload, indent=2, default=str), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="extraction_{job_id}.json"'})


@router.get("/jobs/{job_id}/page")
def page_image(job_id: str, file: str, page: int = 1, q: str = "", user: dict = Depends(get_current_user)):
    org = _org(user)
    s = _summary(org, job_id)
    name = Path(file).name
    key = next((k for n, k in zip(s.get("names", []), s.get("file_keys", [])) if n == name), None)
    if not key:
        raise HTTPException(404, "File not found")
    body = r2().client.get_object(Bucket=_bucket(), Key=key)["Body"].read()
    suf = Path(name).suffix.lower()
    if suf == ".pdf":
        import fitz
        doc = fitz.open(stream=body, filetype="pdf")
        pg = doc[max(0, min(page - 1, len(doc) - 1))]
        found = 0
        if q:
            for needle in [q, *[x for x in re.split(r"\s{2,}|,|;", q) if len(x.strip()) > 5]]:
                rects = pg.search_for(needle.strip())
                for r in rects[:6]:
                    a = pg.add_highlight_annot(r)
                    a.set_colors(stroke=(1, 0.85, 0.2))
                    a.update()
                found += len(rects)
                if rects:
                    break
        return Response(pg.get_pixmap(dpi=110).tobytes("png"), media_type="image/png", headers={"X-Highlights": str(found), "X-Pages": str(len(doc))})
    from PIL import Image
    for mod in ("pillow_avif",):
        try:
            __import__(mod)
        except ImportError:
            pass
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    buf = io.BytesIO()
    Image.open(io.BytesIO(body)).convert("RGB").save(buf, "PNG")
    return Response(buf.getvalue(), media_type="image/png")


# ------------------------------------------------------------------ credits
@router.get("/usage")
def usage_report(days: int = 30, user: dict = Depends(get_current_user)):
    org = _org(user)
    _ensure_trial(org)
    days = max(1, min(days, 365))
    rep = LEDGER.report(org, time.time() - days * 86400)
    info = {}
    for j in DB.ocr_ext_jobs.find({"org": org}, {"_id": 0, "job_id": 1, "names": 1, "row_count": 1, "documents": 1, "mode": 1, "usage": 1}):
        info[j["job_id"]] = {"names": j.get("names", []), "rows": j.get("row_count", 0), "files": len(j.get("names", [])),
                             "pages": sum(d.get("pages") or 0 for d in j.get("documents", [])), "mode": j.get("mode"),
                             "extract_credits": (j.get("usage") or {}).get("by_step", {}).get("extract", {}).get("credits", 0)}
    for jb in rep["by_job"]:
        jb.update(info.get(jb["job_id"], {"names": ["(deleted job)"], "rows": 0, "files": 0, "pages": 0, "mode": None}))
    st = rep["summary"]["by_step"]
    pages = sum(j["pages"] for j in rep["by_job"] if j.get("mode") == "fast")
    models = load().policy["models"]
    fast_extract = sum(info.get(j["job_id"], {}).get("extract_credits", 0) for j in rep["by_job"] if j.get("mode") == "fast")
    rep["estimate"] = {
        "per_page_fast": round(fast_extract / pages, 2) if pages and fast_extract else usage.event("extract", "anthropic", models["extract_fast"], 6000, 1200)["credits"],
        "per_page_think": usage.event("extract", "anthropic", models["extract_think"], 6000, 1500)["credits"],
        "per_item": round(st["classify"]["credits"] / st["classify"]["calls"], 3) if st.get("classify", {}).get("calls") else 0.05,
    }
    pr = usage.pricing()
    rep["pricing"] = {"credit": {k: v for k, v in pr["credit"].items() if not k.startswith("_")}, "steps": pr["steps"],
                      "models": {k: {kk: vv for kk, vv in v.items() if not kk.startswith("_")} for k, v in pr["models"].items()}}
    tm = load().policy.get("timing", {})
    rep["estimate"].update(sec_per_page_fast=tm.get("sec_per_page_fast", 10), sec_per_page_think=tm.get("sec_per_page_think", 25),
                           sec_per_sheet=tm.get("sec_per_sheet", 4))
    rep["days"] = days
    rep["can_grant"] = user.get("role") == "super_admin"
    return rep


class Grant(BaseModel):
    credits: float
    note: str = ""
    organization_id: str | None = None


@router.post("/usage/grant")
def usage_grant(g: Grant, user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Only a platform administrator can add credits")
    if not 0 < g.credits <= 1_000_000:
        raise HTTPException(400, "Credits must be between 0 and 1,000,000")
    org = g.organization_id or _org(user)
    LEDGER.grant(org, g.credits, g.note or "Top-up")
    return LEDGER.balance(org)


# ------------------------------------------------------------------ reference data and learned decisions
@router.get("/meta")
def meta(user: dict = Depends(get_current_user)):
    org = _org(user)
    cfg = load()
    tax = cfg.taxonomy
    return {
        "ai": {"claude": llm.enabled(), "providers": [p.name for p in _engine(org).classifier.providers if p.available()]},
        "domains": tax.domains,
        "activities": [{"id": a["id"], "label": a["label"], "domain": a["domain"], "context_key": tax.context_key(a["id"])} for a in tax.raw["activities"]],
        "use_context": {"stationary_equipment": "Own fixed equipment (DG set, boiler, furnace)", "company_vehicle": "Own/leased vehicles",
                        "offroad_equipment": "Forklifts, cranes, hydras, site machinery", "third_party_vehicle": "Transporter's vehicle"},
        "policy": cfg.policy["review"],
        "facilities": [{"id": f["id"], "name": f["name"]} for f in _facilities(org)],
    }


def _describe_key(key: str) -> dict:
    parts = key[2:].split("|")
    return {"wording": parts[0], "dimension": parts[1] if len(parts) > 1 else "", "vendor": parts[2] if key.startswith("x:") and len(parts) > 2 else "",
            "scope": "vendor" if key.startswith("x:") else "all"}


@router.get("/memory")
def memory_list(user: dict = Depends(get_current_user)):
    return [{**r, **_describe_key(r["key"]), "confirmed": r["source"] == "user"} for r in MEMORY.list_decisions(_org(user))]


class MemoryChange(BaseModel):
    key: str
    activity_id: str | None = None


@router.post("/memory/forget")
def memory_forget(c: MemoryChange, user: dict = Depends(get_current_user)):
    org = _org(user)
    if not MEMORY.delete_decision(org, c.key):
        raise HTTPException(404, "No such memory")
    AUDIT.record(org, "memory", "memory_forgotten", _actor(user), label=c.key, note="Learned decision removed")
    return {"ok": True}


@router.post("/memory/change")
def memory_change(c: MemoryChange, user: dict = Depends(get_current_user)):
    org = _org(user)
    if not c.activity_id or c.activity_id not in load().taxonomy.activities:
        raise HTTPException(400, "Unknown activity")
    if not MEMORY.set_decision(org, c.key, c.activity_id):
        raise HTTPException(404, "No such memory")
    AUDIT.record(org, "memory", "memory_changed", _actor(user), label=c.key, note=f"Now means {c.activity_id}")
    return {"ok": True}


@router.post("/memory/share")
def memory_share(c: MemoryChange, user: dict = Depends(get_current_user)):
    org = _org(user)
    new = MEMORY.share_with_all_vendors(org, c.key)
    if not new:
        raise HTTPException(400, "Only a vendor-specific decision can be shared with all vendors")
    AUDIT.record(org, "memory", "memory_shared", _actor(user), label=c.key, note="Applied to all vendors")
    return {"key": new}


@router.delete("/memory")
def memory_clear(user: dict = Depends(get_current_user)):
    MEMORY.delete_all_decisions(_org(user))
    return {"ok": True}


# ------------------------------------------------------------------ save to GHG records
from .ghg_save import saver, water  # noqa: E402


def _raw_rec(row: dict) -> dict:
    from extractor_core.export import to_record
    return to_record(row)


@router.get("/jobs/{job_id}/rows/{row_id}/factors")
async def row_factors(job_id: str, row_id: str, q: str = "", user: dict = Depends(get_current_user)):
    org = _org(user)
    job = await asyncio.to_thread(_read_job, org, job_id)
    row = next((r for r in job["rows"] if r["row_id"] == row_id), None)
    if not row:
        raise HTTPException(404, "No such row")
    rec = _raw_rec(row)
    try:
        category = await saver.resolve_category(mongo_db, rec)
    except saver.SaveError as e:
        raise HTTPException(400, str(e))
    chosen = (row.get("review") or {}).get("factor")
    try:
        current = await saver.resolve_factor(mongo_db, org, rec, category, chosen)
    except saver.SaveError:
        current = None
    return {"category": category["name"], "current": current, "options": await saver.search_factors(mongo_db, rec, category, q)}


@router.get("/jobs/{job_id}/rows/{row_id}/edit-config")
async def row_edit_config(job_id: str, row_id: str, user: dict = Depends(get_current_user)):
    org = _org(user)
    job = await asyncio.to_thread(_read_job, org, job_id)
    row = next((r for r in job["rows"] if r["row_id"] == row_id), None)
    if not row:
        raise HTTPException(404, "No such row")
    return await edit_config(mongo_db, org, row)


@router.get("/jobs/{job_id}/rows/{row_id}/factor-options")
async def row_factor_options(job_id: str, row_id: str, scope: str, category_id: str, method: str = "activity", q: str = "", user: dict = Depends(get_current_user)):
    org = _org(user)
    job = await asyncio.to_thread(_read_job, org, job_id)
    row = next((r for r in job["rows"] if r["row_id"] == row_id), None)
    if not row:
        raise HTTPException(404, "No such row")
    return {"options": await factor_options(mongo_db, row, scope, category_id, method, q)}


class FactorChoice(BaseModel):
    collection: str
    id: str
    remember: bool = True


@router.post("/jobs/{job_id}/rows/{row_id}/factor")
async def choose_factor(job_id: str, row_id: str, c: FactorChoice, user: dict = Depends(get_current_user)):
    org = _org(user)
    if c.collection not in ("fuel_database", "scope3_ef"):
        raise HTTPException(400, "Unknown factor table")
    if not await mongo_db[c.collection].find_one({"id": c.id}, {"_id": 1}):
        raise HTTPException(404, "No such emission factor")
    job = await asyncio.to_thread(_read_job, org, job_id)
    row = next((r for r in job["rows"] if r["row_id"] == row_id), None)
    if not row:
        raise HTTPException(404, "No such row")
    group = [r for r in job["rows"] if r["row_id"] == row_id]
    for r in group:
        r["review"] = {**(r.get("review") or {}), "factor": {"collection": c.collection, "id": c.id}}
        r["review"].pop("save_error", None)
    if c.remember:
        await mongo_db.ocr_ext_factor_choices.update_one({"organization_id": org, "key": saver.factor_key(_raw_rec(row))},
                                                         {"$set": {"collection": c.collection, "factor_id": c.id}}, upsert=True)
    await asyncio.to_thread(_save_job, org, job)
    await asyncio.to_thread(AUDIT.record, org, job_id, "edited", _actor(user), row["item_id"], row_id, row.get("extracted_item"),
                            {"emission_factor": [None, c.id]}, "Emission factor chosen")
    return {"ok": True}


class SaveRequest(BaseModel):
    row_ids: list[str] | None = None


@router.post("/jobs/{job_id}/save")
async def save_to_ghg(job_id: str, body: SaveRequest | None = None, user: dict = Depends(get_current_user)):
    org = _org(user)
    job = await asyncio.to_thread(_read_job, org, job_id)
    summary = await asyncio.to_thread(_summary, org, job_id)
    keys = dict(zip(summary.get("names", []), summary.get("file_keys", [])))
    only = set(body.row_ids) if body and body.row_ids else None
    cache: dict = {}
    saved, failed, skipped = [], [], []
    for row in job["rows"]:
        rv = row.get("review") or {}
        if rv.get("state") != "approved" or (only and row["row_id"] not in only):
            continue
        if rv.get("saved"):
            skipped.append(row["row_id"])
            continue
        rec = _raw_rec(row)
        if rec["scope"] == "none" or not rec.get("scope"):
            failed.append({"row_id": row["row_id"], "label": rec["description"], "reason": "This is not a GHG or Water activity, so there is no record to create", "needs_factor": False})
            continue
        fkey = keys.get((rec.get("evidence") or {}).get("file"))
        try:
            if rec["scope"] == "water":
                ids = await water.save_water_record(mongo_db, org, user, rec, fkey, cache)
            else:
                ids = await saver.save_ghg_record(mongo_db, org, user, rec, rv.get("factor"), fkey, cache)
            row["review"] = {**rv, "saved": {"record_ids": ids, "at": time.time(), "by": _actor(user)}}
            row["review"].pop("save_error", None)
            saved.append({"row_id": row["row_id"], "record_ids": ids})
            AUDIT.record(org, job_id, "saved", _actor(user), row["item_id"], row["row_id"], row.get("extracted_item"), {"emission_records": [None, ids]}, "Saved as emission / water records")
        except (saver.SaveError, HTTPException, ValueError) as e:
            reason = getattr(e, "detail", None) or str(e)
            row["review"] = {**rv, "save_error": reason}
            failed.append({"row_id": row["row_id"], "label": rec["description"], "reason": reason, "needs_factor": getattr(e, "needs_factor", False)})
        except Exception as e:  # noqa: BLE001
            logger.exception("OCR save to GHG failed")
            row["review"] = {**rv, "save_error": f"{type(e).__name__}: {e}"}
            failed.append({"row_id": row["row_id"], "label": rec["description"], "reason": f"{type(e).__name__}: {e}", "needs_factor": False})
    await asyncio.to_thread(_save_job, org, job)
    return {"saved": len(saved), "failed": failed, "already_saved": len(skipped), "records": saved}
