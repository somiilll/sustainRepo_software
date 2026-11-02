"""Admin upload and runtime endpoints for cross-framework question links."""
import io
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from openpyxl import load_workbook
from pydantic import BaseModel

from modules.auth.dependencies import get_current_user
from shared.database.mongo import db
from . import service

router = APIRouter(prefix="/framework-links", tags=["Framework Links"])
REQUIRED = ("framework_a", "question_key_a", "framework_b", "question_key_b")


class CheckRequest(BaseModel):
    framework: str
    question_keys: List[str]
    reporting_period: str


class PushTarget(BaseModel):
    framework: str
    question_key: str
    source_key: str


class PushRequest(BaseModel):
    framework: str
    reporting_period: str
    targets: List[PushTarget]


def _org_id(user: dict) -> str:
    org_id = user.get("organization_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization assigned")
    return org_id


def _require_admin(user: dict) -> None:
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can manage framework links")


def coverage(record: Dict[str, str], column: str) -> str:
    value = (record.get(column) or record.get("coverage") or "partial").lower()
    return "complete" if value == "complete" else "partial"


async def _question_exists(framework: str, key: str) -> bool:
    return bool(await service._config(framework, key))


@router.get("")
async def list_links(current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    return {"links": await db.framework_question_links.find({}, {"_id": 0}).sort("created_at", 1).to_list(5000)}


@router.post("/upload")
async def upload_links(file: UploadFile = File(...), replace_all: bool = Query(False), current_user: dict = Depends(get_current_user)):
    """Excel columns: framework_a, question_key_a, framework_b, question_key_b, [path_a], [path_b], [coverage_a_to_b], [coverage_b_to_a], [coverage], [active].
    coverage = complete | partial (default partial): partial auto-fills show "In progress" until a person saves them."""
    _require_admin(current_user)
    rows = list(load_workbook(io.BytesIO(await file.read()), read_only=True, data_only=True).active.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="The file is empty")
    header = [str(h or "").strip().lower() for h in rows[0]]
    missing = [c for c in REQUIRED if c not in header]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing columns: {', '.join(missing)}")
    parsed: List[Dict[str, Any]] = []
    errors: List[str] = []
    for number, row in enumerate(rows[1:], start=2):
        record = {h: (str(v).strip() if v is not None else "") for h, v in zip(header, row)}
        if not any(record.get(c) for c in REQUIRED):
            continue
        fa, fb = record["framework_a"].upper(), record["framework_b"].upper()
        ka, kb = record["question_key_a"], record["question_key_b"]
        if not all([fa, fb, ka, kb]) or fa == fb:
            errors.append(f"Row {number}: both frameworks and question keys are required and the frameworks must differ")
        elif not await _question_exists(fa, ka) or not await _question_exists(fb, kb):
            errors.append(f"Row {number}: unknown question key ({fa} {ka} / {fb} {kb})")
        else:
            parsed.append({"framework_a": fa, "key_a": ka, "path_a": record.get("path_a") or None,
                           "framework_b": fb, "key_b": kb, "path_b": record.get("path_b") or None,
                           "coverage_a_to_b": coverage(record, "coverage_a_to_b"), "coverage_b_to_a": coverage(record, "coverage_b_to_a"),
                           "active": record.get("active", "").lower() not in ("no", "false", "0")})
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Nothing was saved. Fix these rows and upload again.", "errors": errors[:50]})
    if replace_all:
        await db.framework_question_links.delete_many({})
    now = datetime.now(timezone.utc).isoformat()
    for link in parsed:
        await db.framework_question_links.update_one(
            {"framework_a": link["framework_a"], "key_a": link["key_a"], "framework_b": link["framework_b"], "key_b": link["key_b"]},
            {"$set": {**link, "updated_at": now}, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}}, upsert=True)
    return {"saved": len(parsed)}


@router.post("/check")
async def check_links(body: CheckRequest, current_user: dict = Depends(get_current_user)):
    return {"targets": await service.check_targets(_org_id(current_user), body.framework.upper(), body.question_keys, body.reporting_period)}


@router.post("/push")
async def push_links(body: PushRequest, current_user: dict = Depends(get_current_user)):
    pushed = await service.push_values(_org_id(current_user), current_user, body.framework.upper(), body.reporting_period,
                                       [t.model_dump() for t in body.targets])
    return {"updated": pushed}


@router.get("/autofilled")
async def autofilled(framework: str = Query(...), reporting_period: str = Query(...), current_user: dict = Depends(get_current_user)):
    return {"questions": await service.autofilled_map(_org_id(current_user), framework.upper(), reporting_period)}
