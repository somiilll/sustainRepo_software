"""
Notification API endpoints.

GET  /notifications          — list notifications
GET  /notifications/unread   — unread count
PUT  /notifications/{id}/read — mark one as read
PUT  /notifications/read-all  — mark all as read
"""

from fastapi import APIRouter, Depends
from modules.auth.dependencies import get_current_user
from shared.notifications import (
    get_notifications,
    get_unread_count,
    mark_as_read,
    mark_all_read,
)

router = APIRouter()


@router.get("/notifications")
async def list_notifications(
    unread_only: bool = False,
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user.get("organization_id", "")
    items = await get_notifications(current_user["id"], org_id, unread_only)
    return {"notifications": items, "total": len(items)}


@router.get("/notifications/unread")
async def unread_notification_count(
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user.get("organization_id", "")
    count = await get_unread_count(current_user["id"], org_id)
    return {"count": count}


@router.put("/notifications/{notification_id}/read")
async def read_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    ok = await mark_as_read(notification_id, current_user["id"])
    return {"success": ok}


@router.put("/notifications/read-all")
async def read_all_notifications(
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user.get("organization_id", "")
    count = await mark_all_read(current_user["id"], org_id)
    return {"marked": count}
