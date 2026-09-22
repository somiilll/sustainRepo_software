"""Idempotent transactional emails for newly assigned supplier work."""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.logging import get_logger, log_event
from app.config.env import FRONTEND_URL
from modules.supplier_assessment.email_templates import supplier_assignment_email
from shared.database.mongo import db
from shared.helpers.email import send_email

logger = get_logger(__name__)


ASSIGNMENT_LABELS = {
    "esg": "ESG questionnaire",
    "ghg": "GHG emissions request",
    "documents": "document",
    "training": "training",
    "revenue": "revenue information request",
}


async def notify_supplier_assignment(
    relationship: Dict[str, Any],
    assignment_type: str,
    assignment_id: str,
    assignment_name: str,
    *,
    due_date: Optional[str] = None,
) -> bool:
    """Deliver one email for an assignment event, even if its request is retried."""
    recipient_email = str(relationship.get("contact_email") or "").strip().lower()
    assignment_label = ASSIGNMENT_LABELS.get(assignment_type)
    if not recipient_email or not assignment_label or not assignment_id:
        log_event(logger, logging.WARNING, "supplier_assessment.email.assignment.skipped", action="supplier_assessment.email.assignment", outcome="skipped", error_code="ASSIGNMENT_EMAIL_INPUT_MISSING", context={"relationship_id": relationship.get("id"), "assignment_type": assignment_type})
        return False

    event_key = f"supplier-assignment:{assignment_type}:{relationship['id']}:{assignment_id}"
    await db.supplier_notification_deliveries.create_index("event_key", unique=True)
    now = datetime.now(timezone.utc).isoformat()
    claimed = await db.supplier_notification_deliveries.update_one(
        {"event_key": event_key},
        {"$setOnInsert": {
            "event_key": event_key,
            "relationship_id": relationship["id"],
            "module_code": assignment_type,
            "recipient_email": recipient_email,
            "status": "pending",
            "created_at": now,
        }},
        upsert=True,
    )
    if claimed.upserted_id is None:
        log_event(logger, logging.INFO, "supplier_assessment.email.assignment.duplicate", action="supplier_assessment.email.assignment", outcome="deduplicated", context={"relationship_id": relationship.get("id"), "assignment_type": assignment_type, "assignment_id": assignment_id})
        return True

    customer = await db.organizations.find_one(
        {"id": relationship["customer_org_id"]},
        {"_id": 0, "name": 1, "organization_name": 1},
    ) or {}
    customer_name = customer.get("organization_name") or customer.get("name") or "Your customer"
    try:
        delivered = await send_email(
            recipient_email,
            f"New {assignment_label} assigned by {customer_name}",
            supplier_assignment_email(
                supplier_name=relationship.get("contact_person") or relationship.get("company_name") or "Supplier",
                customer_name=customer_name,
                assignment_label=assignment_label,
                assignment_name=assignment_name,
                login_link=f"{FRONTEND_URL.rstrip('/')}/login",
                due_date=due_date,
            ),
        )
    except Exception:
        delivered = False
        log_event(logger, logging.ERROR, "supplier_assessment.email.assignment.failed", action="supplier_assessment.email.assignment", outcome="failed", error_code="ASSIGNMENT_EMAIL_EXCEPTION", context={"relationship_id": relationship.get("id"), "assignment_type": assignment_type, "assignment_id": assignment_id}, exc_info=True)
    await db.supplier_notification_deliveries.update_one(
        {"event_key": event_key},
        {"$set": {
            "status": "sent" if delivered else "failed",
            "processed_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    log_event(logger, logging.INFO if delivered else logging.ERROR, "supplier_assessment.email.assignment.sent" if delivered else "supplier_assessment.email.assignment.failed", action="supplier_assessment.email.assignment", outcome="succeeded" if delivered else "failed", error_code=None if delivered else "ASSIGNMENT_EMAIL_DELIVERY_FAILED", context={"relationship_id": relationship.get("id"), "assignment_type": assignment_type, "assignment_id": assignment_id})
    return delivered