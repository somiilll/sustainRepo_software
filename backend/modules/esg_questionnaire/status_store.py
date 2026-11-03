"""Persists the resolved status on each response so dashboards and gap analysis can query it."""
from typing import Any, Dict

from pymongo import UpdateOne

from modules.esg_questionnaire.status_rules import resolved_status
from shared.database.mongo import db


async def refresh_resolved_status(query: Dict[str, Any]) -> int:
    """Recompute `resolved_status` for the matching responses; returns how many changed."""
    tables = {c["question_key"]: c.get("table_config") async for c in db.esg_question_configs.find({"table_config": {"$exists": True}}, {"_id": 0, "question_key": 1, "table_config": 1})}
    ops = []
    async for doc in db.organization_esg_responses.find(query):
        status = resolved_status(doc, tables.get(doc.get("question_key")))
        if doc.get("resolved_status") != status:
            ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": {"resolved_status": status}}))
    if ops:
        await db.organization_esg_responses.bulk_write(ops, ordered=False)
    return len(ops)
