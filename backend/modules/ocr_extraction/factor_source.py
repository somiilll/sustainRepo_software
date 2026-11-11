"""Loads the real emission-factor names (scope3_ef, fuel_database) for the OCR classifier; cached for 10 minutes."""
from __future__ import annotations

import re
import threading
import time

from extractor_core.decider.factors import FactorIndex

from . import store

TTL = 600
FUEL_CATEGORIES = ("Stationary Combustion", "Mobile Combustion")
_cache: dict = {"at": 0.0, "index": None}
_lock = threading.Lock()


def _rank(e: dict):
    m = re.search(r"\d{4}", str(e.get("year") or ""))
    return (e.get("region") != "India", -(int(m.group()) if m else 0))


def _build() -> FactorIndex:
    db = store.DB
    code_of = {s["id"]: s["code"] for s in db.scopes.find({}, {"_id": 0, "id": 1, "code": 1})}
    cat_id: dict[tuple, str] = {}
    for c in db.emission_categories.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "scope_id": 1}):
        cat_id.setdefault((code_of.get(c["scope_id"]), c["name"].lower()), c["id"])
    best: dict[tuple, dict] = {}
    for d in db.scope3_ef.find({"is_active": {"$ne": False}}, {"_id": 0, "id": 1, "activity": 1, "category": 1, "method": 1, "allowed_units": 1,
                                                              "activity_type": 1, "region": 1, "year_applicable": 1}):
        method = {"activity_basis": "activity", "spend_basis": "spend"}.get(d.get("method"))
        cid = cat_id.get(("scope3", str(d.get("category")).lower()))
        if not method or not cid or not d.get("activity"):
            continue
        e = {"collection": "scope3_ef", "id": d["id"], "name": d["activity"], "scope": "scope3", "category": d["category"], "category_id": cid,
             "method": method, "allowed_units": d.get("allowed_units") or [], "activity_type": d.get("activity_type"),
             "region": d.get("region"), "year": d.get("year_applicable")}
        k = (e["name"].lower(), e["category"], method)
        if k not in best or _rank(e) < _rank(best[k]):
            best[k] = e
    for d in db.fuel_database.find({"scope": "scope1", "is_active": {"$ne": False}},
                                   {"_id": 0, "id": 1, "fuel_name": 1, "category": 1, "categories": 1, "allowed_units": 1, "region": 1, "year_applicable": 1}):
        for cat in set(d.get("categories") or [d.get("category")]) & set(FUEL_CATEGORIES):
            cid = cat_id.get(("scope1", cat.lower()))
            if not cid or not d.get("fuel_name"):
                continue
            e = {"collection": "fuel_database", "id": d["id"], "name": d["fuel_name"], "scope": "scope1", "category": cat, "category_id": cid,
                 "method": "activity", "allowed_units": d.get("allowed_units") or [], "activity_type": None,
                 "region": d.get("region"), "year": d.get("year_applicable")}
            k = (e["name"].lower(), cat, "activity")
            if k not in best or _rank(e) < _rank(best[k]):
                best[k] = e
    return FactorIndex(list(best.values()))


def get_index() -> FactorIndex:
    with _lock:
        if _cache["index"] is None or time.time() - _cache["at"] > TTL:
            _cache["index"], _cache["at"] = _build(), time.time()
        return _cache["index"]
