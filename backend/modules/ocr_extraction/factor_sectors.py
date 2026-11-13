"""Sector of every Scope 3 factor name, kept in the database (ocr_factor_sectors) so it follows the factor list.

Names that have no sector yet are grouped in the background by the AI (Haiku) and saved; until then the classifier
still reaches them by name. The sector is only a hint when choosing a factor, so a missing one never blocks a match."""
from __future__ import annotations

import logging
import threading
import time

from extractor_core import llm
from extractor_core.decider import factors as engine_factors

from . import store

logger = logging.getLogger(__name__)
CHUNK, TTL = 120, 300
_cache: dict = {"at": 0.0, "map": {}}
_sync_lock = threading.Lock()


def _coll():
    return store.DB.ocr_factor_sectors


def cached_map() -> dict[str, str]:
    if time.time() - _cache["at"] > TTL:
        _cache["map"] = {d["name"]: d["sector"] for d in _coll().find({}, {"_id": 0, "name": 1, "sector": 1})}
        _cache["at"] = time.time()
    return _cache["map"]


def _classify(names: list[str], sectors: dict) -> dict[str, str]:
    system = ("You group emission-factor names (industry classes and materials, mostly US NAICS style) into sectors. For each numbered name give the "
              "single best sector id. Sectors:\n" + "\n".join(f"- {k}: {v}" for k, v in sectors.items()))
    schema = llm.obj({"items": {"type": "array", "items": llm.obj({"i": {"type": "integer"}, "sector": {"type": "string", "enum": list(sectors)}})}})
    data, _ = llm.call_json("layout", system, "\n".join(f"{i}: {n}" for i, n in enumerate(names)), schema, max_tokens=6000)
    return {names[r["i"]]: r["sector"] for r in data["items"] if 0 <= r["i"] < len(names)}


def sync() -> int:
    """Group every Scope 3 factor name that has no sector yet. Returns how many were added."""
    if not _sync_lock.acquire(blocking=False):
        return 0
    try:
        _coll().create_index("name", unique=True)
        sectors = engine_factors.sector_defs()
        _cache["at"] = 0.0
        have = set(cached_map())
        names = sorted({d["activity"].strip().lower() for d in store.DB.scope3_ef.find({"is_active": {"$ne": False}}, {"_id": 0, "activity": 1}) if d.get("activity")} - have)
        added = 0
        for i in range(0, len(names), CHUNK):
            try:
                part = _classify(names[i:i + CHUNK], sectors)
            except Exception as e:  # noqa: BLE001
                logger.warning("Factor sector grouping failed for %d names: %s", len(names[i:i + CHUNK]), e)
                continue
            if part:
                try:
                    _coll().insert_many([{"name": k, "sector": v} for k, v in part.items()], ordered=False)
                except Exception:  # noqa: BLE001
                    pass
                added += len(part)
        if added:
            _cache["at"] = 0.0
        return added
    finally:
        _sync_lock.release()


def sync_in_background() -> None:
    threading.Thread(target=sync, daemon=True, name="factor-sector-sync").start()


engine_factors.set_sector_source(cached_map)
