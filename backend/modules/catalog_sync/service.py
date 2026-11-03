"""Platform catalog bundle: export from one environment, apply once (exact copy) on another.

Covers KPI definitions, KPI->BRSR/GRI mappings, BRSR/GRI question configs and KPI categories.
Applied automatically at backend start, once per bundle version per database.
"""
import gzip
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

from bson import json_util
from pymongo import ReplaceOne
from pymongo.errors import DuplicateKeyError

from shared.database.mongo import db

logger = logging.getLogger(__name__)

BUNDLE_DIR = Path(__file__).resolve().parents[2] / "data" / "catalog_bundle"
BUNDLE_FILE = BUNDLE_DIR / "bundle.json.gz"

# collection -> natural key fields (applied in this order)
CATALOG_COLLECTIONS: Dict[str, Tuple[str, ...]] = {
    "esg_kpi_definitions": ("metric_code",),
    "esg_record_categories": ("section", "category", "subcategory", "sub_subcategory"),
    "esg_question_configs": ("question_key",),
    "kpi_framework_mappings": ("id",),
}


def _key(doc: Dict[str, Any], fields: Tuple[str, ...]) -> tuple:
    return tuple(doc.get(field) for field in fields)


def _filter(doc: Dict[str, Any], fields: Tuple[str, ...]) -> Dict[str, Any]:
    return {field: doc.get(field) for field in fields}


async def export_bundle(version: str) -> Dict[str, int]:
    """Write the current catalog collections to the bundle file."""
    payload: Dict[str, Any] = {"version": version, "exported_at": datetime.now(timezone.utc).isoformat(), "collections": {}}
    counts: Dict[str, int] = {}
    for name in CATALOG_COLLECTIONS:
        docs = await db[name].find({}, {"_id": 0}).to_list(None)
        payload["collections"][name] = docs
        counts[name] = len(docs)
    BUNDLE_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(BUNDLE_FILE, "wt", encoding="utf-8") as handle:
        handle.write(json_util.dumps(payload))
    return counts


def load_bundle() -> Dict[str, Any] | None:
    if not BUNDLE_FILE.exists():
        return None
    with gzip.open(BUNDLE_FILE, "rt", encoding="utf-8") as handle:
        return json_util.loads(handle.read())


async def _sync_collection(name: str, docs: List[Dict[str, Any]], run_id: str) -> Dict[str, int]:
    fields = CATALOG_COLLECTIONS[name]
    collection = db[name]
    wanted = {_key(doc, fields) for doc in docs}
    for start in range(0, len(docs), 500):
        batch = docs[start:start + 500]
        await collection.bulk_write(
            [ReplaceOne(_filter(doc, fields), doc, upsert=True) for doc in batch], ordered=False
        )
    stale = [doc async for doc in collection.find({}) if _key(doc, fields) not in wanted]
    if stale:
        backup = [{"run_id": run_id, "collection": name, "doc": doc} for doc in stale]
        await db["catalog_sync_backup"].insert_many(backup)
        await collection.delete_many({"_id": {"$in": [doc["_id"] for doc in stale]}})
    return {"applied": len(docs), "removed": len(stale)}


async def apply_bundle_once() -> None:
    """Make this database's catalog match the bundle; runs once per bundle version."""
    bundle = load_bundle()
    if not bundle:
        return
    version = bundle["version"]
    try:
        await db["catalog_sync_log"].insert_one({"_id": version, "started_at": datetime.now(timezone.utc).isoformat()})
    except DuplicateKeyError:
        return
    try:
        results = {}
        for name in CATALOG_COLLECTIONS:
            results[name] = await _sync_collection(name, bundle["collections"].get(name, []), version)
        await db["catalog_sync_log"].update_one(
            {"_id": version}, {"$set": {"finished_at": datetime.now(timezone.utc).isoformat(), "results": results}}
        )
        logger.warning("Catalog bundle %s applied: %s", version, results)
    except Exception:
        await db["catalog_sync_log"].delete_one({"_id": version})
        logger.exception("Catalog bundle %s failed; it will retry on next start", version)
        raise
