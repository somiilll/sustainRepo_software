"""Platform-scheduled jobs. Endpoints are called by the Emergent cron dispatcher with a bearer secret."""
import asyncio
import hmac
import logging
import os

from fastapi import APIRouter, Header, HTTPException, Request
from pymongo.errors import DuplicateKeyError

from shared.database.mongo import db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/cron", tags=["Cron"])


def _authorize(authorization: str | None) -> None:
    secret = os.environ["WEBHOOK_CRON_SECRET"]
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _claim_run(run_id: str) -> bool:
    try:
        await db["cron_runs"].insert_one({"_id": run_id})
        return True
    except DuplicateKeyError:
        return False


async def _sync_all_task_statuses() -> None:
    from modules.esg_records.task_engine import refresh_overdue_tasks

    try:
        result = await refresh_overdue_tasks(db)
        logger.info("Task status sync finished: %s", result)
    except Exception:
        logger.exception("Task status sync failed")


@router.post("/sync-task-status")
async def sync_task_status_cron(
    request: Request,
    authorization: str | None = Header(default=None),
    x_webhook_id: str | None = Header(default=None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    _authorize(authorization)
    if x_webhook_id and not await _claim_run(f"sync-task-status:{x_webhook_id}"):
        return {"accepted": True, "duplicate": True}
    asyncio.create_task(_sync_all_task_statuses())
    return {"accepted": True}
