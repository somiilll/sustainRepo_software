import logging
from typing import Any

from pymongo.errors import DuplicateKeyError

from shared.database.mongo import db

logger = logging.getLogger(__name__)


class AuditLogRepository:
    """Append-only access to the audit log. Deliberately exposes no update or delete operations."""

    COLLECTION = "question_audit_log"

    async def append(self, entry: dict[str, Any]) -> bool:
        """Insert one entry. Returns False when an identical entry (same idempotency key) already exists."""
        try:
            await db[self.COLLECTION].insert_one(entry)
            return True
        except DuplicateKeyError:
            logger.info("Audit entry skipped (duplicate idempotency key %s)", entry.get("idempotency_key"))
            return False
