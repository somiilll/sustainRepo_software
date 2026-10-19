"""
Formula + Decision Tree persistence and resolution.

Collections
-----------
ce_formulas            — current formula per id (mirror of latest active version)
ce_formula_versions    — every version of every formula; historical; append-only
ce_decision_trees      — a tree per category (most-specific match wins)
ce_decision_tree_versions — history

Formula doc shape (stored in `definition`) — identical to what CalcEngine.execute() eats:
{
  "inputs": [{variable, expected_unit, required, allow_dimension_conversion, allowed_transformations}],
  "properties": [{variable, expected_unit}],
  "steps": [{name, type:"expression", expression}],
  "outputs": [{variable, unit, produced_by_step}]
}
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


class DecisionTreeError(ValueError):
    pass


# ---------- Version helpers ----------

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _bump_formula_version(db, formula_id: str, definition: Dict[str, Any],
                                 created_by: str) -> dict:
    """Append a new version row and return its id + version_number."""
    latest = await db.ce_formula_versions.find(
        {"formula_id": formula_id}, {"_id": 0, "version_number": 1},
    ).sort("version_number", -1).to_list(1)
    next_num = (latest[0]["version_number"] if latest else 0) + 1

    # Close out the previous active version
    await db.ce_formula_versions.update_many(
        {"formula_id": formula_id, "is_active": True},
        {"$set": {"is_active": False, "effective_to": _now()}},
    )

    version_doc = {
        "id": str(uuid.uuid4()),
        "formula_id": formula_id,
        "version_number": next_num,
        "definition_snapshot": definition,
        "effective_from": _now(),
        "effective_to": None,
        "is_active": True,
        "created_at": _now(),
        "created_by": created_by,
    }
    await db.ce_formula_versions.insert_one(dict(version_doc))
    version_doc.pop("_id", None)
    return version_doc


# ---------- Formula CRUD ----------

async def create_formula(db, *, name: str, description: Optional[str],
                         scope_ids: Optional[List[str]] = None,
                         category_ids: Optional[List[str]] = None,
                         category_id: Optional[str], definition: Dict[str, Any],
                         created_by: str) -> dict:
    formula_id = str(uuid.uuid4())
    version_doc = await _bump_formula_version(db, formula_id, definition, created_by)
    doc = {
        "id": formula_id,
        "name": name,
        "description": description,
        "scope_ids": scope_ids or [],
        "category_ids": category_ids or [],
        "category_id": category_id,
        "version_id": version_doc["id"],
        "version_number": version_doc["version_number"],
        "definition": definition,
        "is_active": True,
        "created_at": _now(),
        "updated_at": _now(),
        "created_by": created_by,
    }
    await db.ce_formulas.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def update_formula(db, formula_id: str, *, name: Optional[str] = None,
                         description: Optional[str] = None,
                         scope_ids: Optional[List[str]] = None,
                         category_ids: Optional[List[str]] = None,
                         category_id: Optional[str] = None,
                         definition: Optional[Dict[str, Any]] = None,
                         created_by: Optional[str] = None) -> dict:
    existing = await db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise ValueError("Formula not found")

    updates: Dict[str, Any] = {"updated_at": _now()}
    if name is not None:
        updates["name"] = name
    if description is not None:
        updates["description"] = description
    if scope_ids is not None:
        updates["scope_ids"] = scope_ids
    if category_ids is not None:
        updates["category_ids"] = category_ids
    if category_id is not None:
        updates["category_id"] = category_id

    definition_changed = definition is not None and definition != existing.get("definition")
    if definition_changed:
        version_doc = await _bump_formula_version(db, formula_id, definition,
                                                   created_by or "unknown")
        updates["definition"] = definition
        updates["version_id"] = version_doc["id"]
        updates["version_number"] = version_doc["version_number"]

    await db.ce_formulas.update_one({"id": formula_id}, {"$set": updates})
    if definition_changed:
        await _bump_linked_decision_tree_versions(
            db,
            formula_id=formula_id,
            created_by=created_by or "unknown",
        )
    return await db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})


async def soft_delete_formula(db, formula_id: str) -> None:
    existing = await db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not existing:
        raise ValueError("Formula not found")
    await db.ce_formulas.update_one(
        {"id": formula_id},
        {"$set": {"is_active": False, "updated_at": _now()}},
    )


async def list_formulas(db, *, include_inactive: bool = False,
                        category_id: Optional[str] = None) -> List[dict]:
    query: Dict[str, Any] = {}
    if not include_inactive:
        query["is_active"] = True
    if category_id:
        query["category_id"] = category_id
    return await db.ce_formulas.find(query, {"_id": 0}).sort("name", 1).to_list(10000)


# ---------- Decision tree resolution ----------

def _validate_tree_node(node: Dict[str, Any], path: str = "root") -> None:
    # A node is either a leaf ({"formula_id": "..."}) or an internal node
    # ({"field_name": "...", "allowed_values": [...], "options": {...}}).
    if "formula_id" in node:
        if not isinstance(node["formula_id"], str):
            raise DecisionTreeError(f"{path}: formula_id must be a string")
        return
    for k in ("field_name", "options"):
        if k not in node:
            raise DecisionTreeError(f"{path}: missing '{k}'")
    if not isinstance(node["options"], dict) or not node["options"]:
        raise DecisionTreeError(f"{path}: options must be a non-empty dict")
    allowed = node.get("allowed_values")
    if allowed is not None:
        opt_keys = set(node["options"].keys())
        if not opt_keys.issubset(set(allowed)):
            extra = opt_keys - set(allowed)
            raise DecisionTreeError(f"{path}: options {extra} not in allowed_values")
    for val, child in node["options"].items():
        if not isinstance(child, dict):
            raise DecisionTreeError(f"{path}.{val}: child must be an object")
        if "next" in child:
            _validate_tree_node(child["next"], f"{path}.{val}.next")
        elif "formula_id" in child:
            if not isinstance(child["formula_id"], str):
                raise DecisionTreeError(f"{path}.{val}: formula_id must be a string")
        else:
            raise DecisionTreeError(
                f"{path}.{val}: child must have 'next' (nested) or 'formula_id' (leaf)"
            )


def validate_decision_tree(tree: Dict[str, Any]) -> None:
    if not isinstance(tree, dict):
        raise DecisionTreeError("Tree must be a dict")
    _validate_tree_node(tree)


def resolve_formula_id(tree: Dict[str, Any],
                        decision_inputs: Dict[str, Any]) -> Tuple[str, List[dict]]:
    """Walk the decision tree using decision_inputs. Returns (formula_id, path_audit)."""
    node = tree
    path: List[dict] = []
    depth = 0
    while True:
        depth += 1
        if depth > 100:
            raise DecisionTreeError("Decision tree too deep (possible cycle)")
        if "formula_id" in node:
            return node["formula_id"], path
        field = node.get("field_name")
        required = node.get("required", True)
        provided = decision_inputs.get(field)
        if provided is None:
            if required:
                raise DecisionTreeError(
                    f"Missing decision input '{field}' "
                    f"(expected one of {list(node.get('options', {}).keys())})"
                )
            return None, path  # type: ignore[return-value]
        allowed = node.get("allowed_values")
        if allowed is not None and provided not in allowed:
            raise DecisionTreeError(
                f"Value '{provided}' for '{field}' not in allowed_values {allowed}"
            )
        child = node["options"].get(provided)
        if child is None:
            raise DecisionTreeError(
                f"No branch for '{field}'='{provided}' (options: {list(node['options'].keys())})"
            )
        path.append({"field": field, "value": provided})
        if "formula_id" in child:
            return child["formula_id"], path
        node = child["next"]


# ---------- Decision tree CRUD ----------


def _formula_ids_in_tree(node: Any) -> set[str]:
    formula_ids: set[str] = set()
    if isinstance(node, dict):
        formula_id = node.get("formula_id")
        if isinstance(formula_id, str):
            formula_ids.add(formula_id)
        for value in node.values():
            formula_ids.update(_formula_ids_in_tree(value))
    elif isinstance(node, list):
        for value in node:
            formula_ids.update(_formula_ids_in_tree(value))
    return formula_ids


async def _formula_version_map(db, tree: Dict[str, Any]) -> Dict[str, str]:
    formula_ids = list(_formula_ids_in_tree(tree))
    if not formula_ids:
        return {}
    formulas = await db.ce_formulas.find(
        {"id": {"$in": formula_ids}},
        {"_id": 0, "id": 1, "version_id": 1},
    ).to_list(len(formula_ids))
    missing_formulas = set(formula_ids) - {formula.get("id") for formula in formulas}
    if missing_formulas:
        raise DecisionTreeError(
            f"Decision tree references missing formulas: {', '.join(sorted(missing_formulas))}"
        )

    version_ids = [formula.get("version_id") for formula in formulas if formula.get("version_id")]
    versions = await db.ce_formula_versions.find(
        {"id": {"$in": version_ids}},
        {"_id": 0, "id": 1, "formula_id": 1},
    ).to_list(len(version_ids)) if version_ids else []
    versions_by_id = {version.get("id"): version for version in versions}
    invalid_versions = []
    for formula in formulas:
        version_id = formula.get("version_id")
        version = versions_by_id.get(version_id)
        if not version_id or not version or version.get("formula_id") != formula.get("id"):
            invalid_versions.append(formula.get("id"))
    if invalid_versions:
        raise DecisionTreeError(
            "Decision tree formulas do not have valid, formula-specific versions: "
            + ", ".join(sorted(invalid_versions))
        )

    return {
        formula["id"]: formula["version_id"]
        for formula in formulas
    }


async def ensure_formula_current_version(
    db,
    formula_id: str,
    *,
    created_by: str,
) -> Tuple[dict, bool]:
    """Ensure a current formula points to its own immutable definition snapshot."""
    formula = await db.ce_formulas.find_one({"id": formula_id, "is_active": True}, {"_id": 0})
    if not formula:
        raise ValueError(f"Active formula '{formula_id}' was not found")

    version_id = formula.get("version_id")
    version = await db.ce_formula_versions.find_one(
        {
            "formula_id": formula_id,
            "$or": [{"id": version_id}, {"version_id": version_id}],
        },
        {"_id": 0},
    ) if version_id else None
    version_definition = (version or {}).get("definition_snapshot") or (version or {}).get("definition")
    if version and version_definition == formula.get("definition"):
        return formula, False

    version = await _bump_formula_version(
        db,
        formula_id,
        formula.get("definition") or {},
        created_by,
    )
    result = await db.ce_formulas.update_one(
        {"id": formula_id, "version_id": version_id},
        {"$set": {
            "version_id": version["id"],
            "version_number": version["version_number"],
            "updated_at": _now(),
        }},
    )
    if result.modified_count != 1:
        raise RuntimeError(f"Concurrent formula update detected for '{formula_id}'")
    repaired = await db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
    return repaired, True


async def _append_decision_tree_version(
    db,
    current: Dict[str, Any],
    *,
    tree: Dict[str, Any],
    created_by: str,
) -> Dict[str, Any]:
    now = _now()
    previous_version_id = current.get("version_id")
    if previous_version_id:
        await db.ce_decision_tree_versions.update_many(
            {
                "$or": [
                    {"id": previous_version_id},
                    {"version_id": previous_version_id},
                ],
            },
            {"$set": {"is_active": False, "effective_to": now}},
        )

    version_id = str(uuid.uuid4())
    version_number = (current.get("version_number") or 0) + 1
    snapshot = {
        "id": version_id,
        "version_id": version_id,
        "source_tree_id": current["id"],
        "category_id": current["category_id"],
        "tree": tree,
        "formula_version_map": await _formula_version_map(db, tree),
        "version_number": version_number,
        "is_active": True,
        "effective_from": now,
        "effective_to": None,
        "created_at": now,
        "created_by": created_by,
    }
    await db.ce_decision_tree_versions.insert_one(dict(snapshot))
    await db.ce_decision_trees.update_one(
        {"id": current["id"], "version_id": previous_version_id},
        {"$set": {
            "tree": tree,
            "formula_version_map": snapshot["formula_version_map"],
            "version_id": version_id,
            "version_number": version_number,
            "updated_at": now,
            "effective_from": now,
            "updated_by": created_by,
        }},
    )
    return snapshot


async def ensure_decision_tree_current_snapshot(
    db,
    tree_id: str,
    *,
    created_by: str,
) -> Tuple[dict, bool]:
    """Publish the current tree when its active immutable snapshot or map is stale."""
    current = await db.ce_decision_trees.find_one(
        {"id": tree_id, "is_active": True},
        {"_id": 0},
    )
    if not current:
        raise ValueError(f"Active decision tree '{tree_id}' was not found")
    validate_decision_tree(current.get("tree"))
    expected_map = await _formula_version_map(db, current["tree"])
    current_version_id = current.get("version_id")
    snapshot = await db.ce_decision_tree_versions.find_one(
        {
            "$or": [
                {"id": current_version_id},
                {"version_id": current_version_id},
            ]
        },
        {"_id": 0},
    ) if current_version_id else None
    snapshot_matches = bool(
        snapshot
        and snapshot.get("tree") == current.get("tree")
        and snapshot.get("formula_version_map") == expected_map
        and snapshot.get("category_id") == current.get("category_id")
    )
    if snapshot_matches and current.get("formula_version_map") == expected_map:
        return current, False

    await _append_decision_tree_version(
        db,
        current,
        tree=current["tree"],
        created_by=created_by,
    )
    repaired = await db.ce_decision_trees.find_one({"id": tree_id}, {"_id": 0})
    return repaired, True


async def _bump_linked_decision_tree_versions(
    db,
    *,
    formula_id: str,
    created_by: str,
) -> None:
    trees = await db.ce_decision_trees.find(
        {"is_active": True},
        {"_id": 0},
    ).to_list(10000)
    for tree_doc in trees:
        if formula_id in _formula_ids_in_tree(tree_doc.get("tree") or {}):
            await _append_decision_tree_version(
                db,
                tree_doc,
                tree=tree_doc["tree"],
                created_by=created_by,
            )

async def create_decision_tree(db, *, category_id: str, tree: Dict[str, Any],
                                created_by: str) -> dict:
    validate_decision_tree(tree)
    # Deactivate existing for the same category
    await db.ce_decision_trees.update_many(
        {"category_id": category_id, "is_active": True},
        {"$set": {"is_active": False, "updated_at": _now()}},
    )
    tree_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())
    now = _now()
    formula_versions = await _formula_version_map(db, tree)
    doc = {
        "id": tree_id,
        "category_id": category_id,
        "tree": tree,
        "formula_version_map": formula_versions,
        "version_id": version_id,
        "version_number": 1,
        "is_active": True,
        "effective_from": now,
        "effective_to": None,
        "created_at": now,
        "updated_at": now,
        "created_by": created_by,
    }
    await db.ce_decision_trees.insert_one(dict(doc))
    snapshot = {
        **doc,
        "id": version_id,
        "source_tree_id": tree_id,
    }
    await db.ce_decision_tree_versions.insert_one(dict(snapshot))
    doc.pop("_id", None)
    return doc


async def update_decision_tree(db, tree_id: str, *, tree: Dict[str, Any],
                                created_by: str) -> dict:
    existing = await db.ce_decision_trees.find_one({"id": tree_id}, {"_id": 0})
    if not existing:
        raise ValueError("Decision tree not found")
    validate_decision_tree(tree)

    if tree != existing.get("tree"):
        await _append_decision_tree_version(
            db,
            existing,
            tree=tree,
            created_by=created_by,
        )
    return await db.ce_decision_trees.find_one({"id": tree_id}, {"_id": 0})


async def get_decision_tree_for_category(db, category_id: str) -> Optional[dict]:
    return await db.ce_decision_trees.find_one(
        {"category_id": category_id, "is_active": True}, {"_id": 0},
    )
