"""Persists the resolved status on each response so dashboards and gap analysis can query it."""
from typing import Any, Dict

from pymongo import UpdateOne

from modules.esg_questionnaire.status_rules import resolved_status
from shared.database.mongo import db


async def refresh_resolved_status(query: Dict[str, Any]) -> int:
    """Recompute `resolved_status` for the matching responses; returns how many changed."""
    ops = [UpdateOne({"_id": doc["_id"]}, {"$set": {"resolved_status": resolved_status(doc)}})
           async for doc in db.organization_esg_responses.find(query)
           if doc.get("resolved_status") != resolved_status(doc)]
    if ops:
        await db.organization_esg_responses.bulk_write(ops, ordered=False)
    return len(ops)
