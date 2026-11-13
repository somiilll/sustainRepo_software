"""The inputs an emission factor's formula declares as required, read from the calculation engine's own configuration
(active decision tree -> formula -> inputs), so OCR rows are checked against exactly what the engine will demand when saving."""
from __future__ import annotations

import threading
import time

from calc_engine.formulas import DecisionTreeError, resolve_formula_id

from . import store

TTL = 600
_cache: dict[tuple, tuple[float, list | None]] = {}
_lock = threading.Lock()


def _resolve(entry: dict) -> list[dict] | None:
    db = store.DB
    tree_doc = db.ce_decision_trees.find_one({"category_id": entry["category_id"], "is_active": True}, {"_id": 0})
    if not tree_doc:
        return None
    decisions = {"calculation_method_scope3": "activity_basis"}
    if entry.get("activity_type"):
        decisions["activity_type"] = entry["activity_type"]
    try:
        formula_id, _ = resolve_formula_id(tree_doc["tree"], decisions)
    except DecisionTreeError:
        return None
    formula = db.ce_formulas.find_one({"id": formula_id}, {"_id": 0, "definition": 1})
    mapped = (tree_doc.get("formula_version_map") or {}).get(formula_id)
    if mapped:
        version = db.ce_formula_versions.find_one({"formula_id": formula_id, "$or": [{"id": mapped}, {"version_id": mapped}]}, {"_id": 0, "definition": 1})
        formula = version or formula
    inputs = ((formula or {}).get("definition") or {}).get("inputs") or []
    spec = [{"variable": i["variable"], "expected_unit": i.get("expected_unit") or "", "required": i.get("required", True), "default": i.get("default")}
            for i in inputs if i.get("variable")]
    return spec or None


def required_inputs(entry: dict) -> list[dict] | None:
    """[{'variable', 'expected_unit', 'required'}] for a Scope 3 activity-basis factor; None when it cannot be resolved."""
    if entry.get("collection") != "scope3_ef" or entry.get("method") != "activity":
        return None
    key = (entry["category_id"], entry.get("activity_type") or "")
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < TTL:
            return hit[1]
    spec = _resolve(entry)
    with _lock:
        _cache[key] = (time.time(), spec)
    return spec
