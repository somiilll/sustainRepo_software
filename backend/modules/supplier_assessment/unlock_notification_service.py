"""Idempotent transactional notifications for supplier submission unlocks."""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.logging import get_logger, log_event
from app.config.env import FRONTEND_URL
from modules.supplier_assessment.email_templates import supplier_module_unlocked_email
from shared.database.mongo import db
from shared.helpers.email import send_email

logger = get_logger(__name__)


MODULE_LABELS = {
    "esg": "ESG questionnaire",
    "ghg": "GHG emissions",
    "documents": "document response",
    "revenue": "Org Information",
}


async def notify_supplier_module_unlocked(
    relationship: Dict[str, Any],
    module_code: str,
    event_id: str,
    *,
    item_name: Optional[str] = None,
    supplier_instructions: Optional[str] = None,
) -> bool:
    """Send one email per successful unlock event without delaying the parent action."""
    recipient_email = str(relationship.get("contact_email") or "").strip().lower()
    module_label = MODULE_LABELS.get(module_code)
    if not recipient_email or not module_label or not event_id:
        log_event(logger, logging.WARNING, "supplier_assessment.email.unlock.skipped", action="supplier_assessment.email.unlock", outcome="skipped", error_code="UNLOCK_EMAIL_INPUT_MISSING", context={"relationship_id": relationship.get("id"), "module_code": module_code})
        return False

    event_key = f"supplier-unlock:{module_code}:{event_id}"
    await db.supplier_notification_deliveries.create_index("event_key", unique=True)
    now = datetime.now(timezone.utc).isoformat()
    claimed = await db.supplier_notification_deliveries.update_one(
        {"event_key": event_key},
        {"$setOnInsert": {
            "event_key": event_key,
            "relationship_id": relationship["id"],
            "module_code": module_code,
            "recipient_email": recipient_email,
            "status": "pending",
            "created_at": now,
        }},
        upsert=True,
    )
    if claimed.upserted_id is None:
        log_event(logger, logging.INFO, "supplier_assessment.email.unlock.duplicate", action="supplier_assessment.email.unlock", outcome="deduplicated", context={"relationship_id": relationship.get("id"), "module_code": module_code, "event_id": event_id})
        return True

    customer = await db.organizations.find_one(
        {"id": relationship["customer_org_id"]},
        {"_id": 0, "name": 1, "organization_name": 1},
    ) or {}
    customer_name = customer.get("organization_name") or customer.get("name") or "Your customer"
    body = supplier_module_unlocked_email(
        supplier_name=relationship.get("contact_person") or relationship.get("company_name") or "Supplier",
        customer_name=customer_name,
        module_label=module_label,
        login_link=f"{FRONTEND_URL.rstrip('/')}/login",
        item_name=item_name,
        supplier_instructions=supplier_instructions,
    )
    try:
        delivered = await send_email(
            recipient_email,
            f"Action needed: {module_label} reopened by {customer_name}",
            body,
        )
    except Exception:
        delivered = False
        log_event(logger, logging.ERROR, "supplier_assessment.email.unlock.failed", action="supplier_assessment.email.unlock", outcome="failed", error_code="UNLOCK_EMAIL_EXCEPTION", context={"relationship_id": relationship.get("id"), "module_code": module_code, "event_id": event_id}, exc_info=True)
    await db.supplier_notification_deliveries.update_one(
        {"event_key": event_key},
        {"$set": {
            "status": "sent" if delivered else "failed",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    log_event(logger, logging.INFO if delivered else logging.ERROR, "supplier_assessment.email.unlock.sent" if delivered else "supplier_assessment.email.unlock.failed", action="supplier_assessment.email.unlock", outcome="succeeded" if delivered else "failed", error_code=None if delivered else "UNLOCK_EMAIL_DELIVERY_FAILED", context={"relationship_id": relationship.get("id"), "module_code": module_code, "event_id": event_id})
    return delivered