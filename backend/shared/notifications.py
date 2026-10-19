"""
In-App Notification Service

Centralized service for creating and reading in-app notifications.
Used by assignments, approvals, and any future notification triggers.

Notifications are stored in the `notifications` collection and consumed
by the frontend bell component.
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from shared.database.mongo import db

logger = logging.getLogger(__name__)

COLLECTION = "notifications"


async def create_notification(
    user_id: str,
    org_id: str,
    title: str,
    message: str,
    notification_type: str = "info",
    link: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Create an in-app notification for a user.

    Args:
        user_id: Target user ID
        org_id: Organization ID
        title: Short title (shown in bell dropdown)
        message: Detail message
        notification_type: "assignment" | "approval" | "reminder" | "info"
        link: Optional frontend route to navigate to
        metadata: Optional extra data (entity_id, etc.)
    """
    notification = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "organization_id": org_id,
        "title": title,
        "message": message,
        "type": notification_type,
        "link": link,
        "metadata": metadata or {},
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db[COLLECTION].insert_one(notification)
    logger.info(f"Notification created for user {user_id}: {title}")
    return notification


async def get_notifications(
    user_id: str,
    org_id: str,
    unread_only: bool = False,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Get notifications for a user, newest first."""
    query = {"user_id": user_id, "organization_id": org_id}
    if unread_only:
        query["read"] = False
    cursor = db[COLLECTION].find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
    return await cursor.to_list(limit)


async def get_unread_count(user_id: str, org_id: str) -> int:
    """Get count of unread notifications."""
    return await db[COLLECTION].count_documents({
        "user_id": user_id,
        "organization_id": org_id,
        "read": False,
    })


async def mark_as_read(notification_id: str, user_id: str) -> bool:
    """Mark a single notification as read."""
    result = await db[COLLECTION].update_one(
        {"id": notification_id, "user_id": user_id},
        {"$set": {"read": True}},
    )
    return result.modified_count > 0


async def mark_all_read(user_id: str, org_id: str) -> int:
    """Mark all notifications as read for a user."""
    result = await db[COLLECTION].update_many(
        {"user_id": user_id, "organization_id": org_id, "read": False},
        {"$set": {"read": True}},
    )
    return result.modified_count
