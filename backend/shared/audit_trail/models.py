from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AuditAction(str, Enum):
    KPI_SYNCED = "kpi_synced"


class ChangeKind(str, Enum):
    ADDED = "added"
    UPDATED = "updated"
    REMOVED = "removed"


@dataclass(frozen=True)
class AuditActor:
    """Who authored the change. System actors carry no user id so history never mis-attributes them to a person."""
    name: str
    type: str = "system"
    user_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"type": self.type, "name": self.name, "user_id": self.user_id}


KPI_SYNC_ACTOR = AuditActor(name="KPI Sync (System)")


@dataclass(frozen=True)
class AuditSource:
    """Where the new value came from (KPI today; other frameworks/integrations reuse the same shape)."""
    type: str
    mapping_ids: list[str] = field(default_factory=list)
    source_tags: list[str] = field(default_factory=list)
    triggered_by_user_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "mapping_ids": sorted(set(self.mapping_ids)),
            "source_tags": sorted(set(self.source_tags)),
            "triggered_by_user_id": self.triggered_by_user_id,
        }
