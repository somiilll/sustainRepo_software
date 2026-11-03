"""MongoDB access. All add-on data lives in `cbam_*` collections and is scoped by org_id."""
import uuid
from datetime import datetime, timezone
from typing import Any

from shared.database.mongo import db as host_db


def col(name: str):
    return host_db[f"cbam_{name}"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def clean(doc: dict | None) -> dict | None:
    if doc is not None:
        doc.pop("_id", None)
    return doc


async def list_docs(name: str, org_id: str, query: dict | None = None, sort: str = "updated_at") -> list[dict]:
    q = {"org_id": org_id, **(query or {})}
    cur = col(name).find(q).sort(sort, -1)
    return [clean(d) async for d in cur]


async def get_doc(name: str, org_id: str, doc_id: str) -> dict | None:
    return clean(await col(name).find_one({"org_id": org_id, "id": doc_id}))


async def insert_doc(name: str, org_id: str, data: dict[str, Any], user: str = "system") -> dict:
    doc = {"id": new_id(), **data, "org_id": org_id, "created_by": user, "created_at": now(), "updated_at": now()}
    await col(name).insert_one(dict(doc))
    await audit(org_id, user, name, doc["id"], "create", None, doc)
    return clean(doc)


async def update_doc(name: str, org_id: str, doc_id: str, data: dict[str, Any], user: str = "system") -> dict | None:
    before = await get_doc(name, org_id, doc_id)
    if before is None:
        return None
    data = {k: v for k, v in data.items() if k not in ("id", "org_id", "created_by", "created_at")}
    data["updated_at"] = now()
    await col(name).update_one({"org_id": org_id, "id": doc_id}, {"$set": data})
    after = await get_doc(name, org_id, doc_id)
    await audit(org_id, user, name, doc_id, "update", before, after)
    return after


async def delete_doc(name: str, org_id: str, doc_id: str, user: str = "system") -> bool:
    before = await get_doc(name, org_id, doc_id)
    if before is None:
        return False
    await col(name).delete_one({"org_id": org_id, "id": doc_id})
    await audit(org_id, user, name, doc_id, "delete", before, None)
    return True


async def audit(org_id: str, user: str, entity: str, entity_id: str, action: str, before, after):
    await col("audit").insert_one(
        {"id": new_id(), "org_id": org_id, "user": user, "entity": entity, "entity_id": entity_id,
         "action": action, "before": before, "after": after,
         "at": datetime.now(timezone.utc).isoformat(timespec="microseconds")}  # sub-second so the log sorts in order
    )
