import hashlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

from .diff import PathChange, unflatten
from .models import KPI_SYNC_ACTOR, AuditAction, AuditActor, AuditSource, ChangeKind
from .repository import AuditLogRepository


def _canonical_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _change_kind(changes: list[PathChange]) -> ChangeKind:
    if all(change.old is None for change in changes):
        return ChangeKind.ADDED
    if all(change.new is None for change in changes):
        return ChangeKind.REMOVED
    return ChangeKind.UPDATED


class AuditTrailService:
    def __init__(self, repository: AuditLogRepository):
        self._repository = repository

    async def record_system_changes(
        self,
        *,
        framework: str,
        organization_id: str,
        reporting_period: str,
        question_key: str,
        changes: list[PathChange],
        source: AuditSource,
        state_token: str | None = None,
        action: AuditAction = AuditAction.KPI_SYNCED,
        actor: AuditActor = KPI_SYNC_ACTOR,
    ) -> str | None:
        """Append one entry describing system-applied answer changes. Returns the entry id, or None if nothing to record.

        `state_token` identifies the stored state the change was computed from, so concurrent
        syncs of the same state produce one entry while a genuine A→B→A→B sequence produces four.
        """
        if not changes:
            return None
        change_details = {
            "old_value": unflatten({change.path: change.old for change in changes}),
            "new_value": unflatten({change.path: change.new for change in changes}),
            "change_kind": _change_kind(changes).value,
            "changed_paths": [change.path for change in changes],
        }
        timestamp = datetime.now(UTC)
        core = {
            "framework": framework,
            "organization_id": organization_id,
            "reporting_period": reporting_period,
            "question_key": question_key,
            "action": action.value,
            "change_details": change_details,
            "source": source.to_dict(),
        }
        entry = {
            "id": str(uuid.uuid4()),
            **core,
            "timestamp": timestamp,
            "performed_by": actor.to_dict(),
            "idempotency_key": _canonical_hash({**core, "state_token": state_token}),
            "integrity_hash": _canonical_hash({**core, "timestamp": timestamp.isoformat(), "actor": actor.to_dict()}),
        }
        inserted = await self._repository.append(entry)
        return entry["id"] if inserted else None


audit_trail_service = AuditTrailService(AuditLogRepository())
