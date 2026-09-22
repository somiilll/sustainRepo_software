"""Immutable calculation-catalog resolution for new and versioned records."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Optional


class CalculationVersionError(ValueError):
    """Raised when a pinned calculation version cannot be resolved safely."""


def formula_definition(version_doc: Dict[str, Any]) -> Dict[str, Any]:
    definition = version_doc.get("definition_snapshot") or version_doc.get("definition")
    if not isinstance(definition, dict):
        raise CalculationVersionError("Formula version does not contain a valid definition snapshot")
    return deepcopy(definition)


def formula_snapshot(formula_doc: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "formula_id": formula_doc["id"],
        "formula_version_id": formula_doc.get("version_id"),
        "version_number": formula_doc.get("version_number"),
        "name": formula_doc.get("name"),
        "definition": deepcopy(formula_doc["definition"]),
    }


async def get_formula_for_execution(
    db,
    formula_id: str,
    formula_version_id: Optional[str] = None,
) -> Dict[str, Any]:
    current = await db.ce_formulas.find_one({"id": formula_id}, {"_id": 0})
    if not current:
        raise CalculationVersionError(f"Formula '{formula_id}' was not found")

    if not formula_version_id:
        if not current.get("is_active", True):
            raise CalculationVersionError(f"Formula '{formula_id}' is inactive")
        return current

    version = await db.ce_formula_versions.find_one(
        {
            "formula_id": formula_id,
            "$or": [
                {"id": formula_version_id},
                {"version_id": formula_version_id},
            ],
        },
        {"_id": 0},
    )
    if not version:
        if current.get("version_id") == formula_version_id:
            conflicting_version = await db.ce_formula_versions.find_one(
                {
                    "$or": [
                        {"id": formula_version_id},
                        {"version_id": formula_version_id},
                    ]
                },
                {"_id": 0, "formula_id": 1},
            )
            if conflicting_version and conflicting_version.get("formula_id") != formula_id:
                raise CalculationVersionError(
                    f"Formula version '{formula_version_id}' belongs to a different formula"
                )
            return current
        raise CalculationVersionError(
            f"Formula version '{formula_version_id}' is not available for formula '{formula_id}'"
        )

    return {
        **current,
        "definition": formula_definition(version),
        "version_id": formula_version_id,
        "version_number": version.get("version_number"),
        "is_active": True,
    }


async def get_decision_tree_for_execution(
    db,
    category_id: str,
    decision_tree_version_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not decision_tree_version_id:
        return await db.ce_decision_trees.find_one(
            {"category_id": category_id, "is_active": True},
            {"_id": 0},
        )

    version = await db.ce_decision_tree_versions.find_one(
        {
            "category_id": category_id,
            "$or": [
                {"id": decision_tree_version_id},
                {"version_id": decision_tree_version_id},
            ],
        },
        {"_id": 0},
    )
    if not version:
        current = await db.ce_decision_trees.find_one(
            {"category_id": category_id, "version_id": decision_tree_version_id},
            {"_id": 0},
        )
        if not current:
            raise CalculationVersionError(
                f"Decision-tree version '{decision_tree_version_id}' is not available for this category"
            )
        version = current

    return {
        **version,
        "id": version.get("source_tree_id") or version.get("tree_id") or version.get("id"),
        "version_id": decision_tree_version_id,
    }


async def resolve_formula_version_for_tree(
    db,
    tree_doc: Optional[Dict[str, Any]],
    formula_id: str,
    requested_formula_version_id: Optional[str],
) -> Dict[str, Any]:
    if requested_formula_version_id:
        requested_version = await db.ce_formula_versions.find_one(
            {
                "$or": [
                    {"id": requested_formula_version_id},
                    {"version_id": requested_formula_version_id},
                ],
            },
            {"_id": 0, "formula_id": 1},
        )
        if requested_version and requested_version.get("formula_id") == formula_id:
            return await get_formula_for_execution(db, formula_id, requested_formula_version_id)

    mapped_version_id = (tree_doc or {}).get("formula_version_map", {}).get(formula_id)
    if requested_formula_version_id and not mapped_version_id:
        raise CalculationVersionError(
            "The historical decision-tree version does not identify a safe formula version for this branch"
        )
    return await get_formula_for_execution(db, formula_id, mapped_version_id)


async def apply_record_version_binding(
    db,
    payload: Dict[str, Any],
    *,
    existing_record: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Canonicalize calculation references before an emission record is written.

    Existing records without version references deliberately remain on the legacy
    flow until a separate migration is approved.
    """
    bound = dict(payload)
    version_fields = ("decision_tree_version_id", "formula_version_id", "formula_snapshot")

    if existing_record is not None and not (
        existing_record.get("decision_tree_version_id")
        or existing_record.get("formula_version_id")
    ):
        for field in version_fields:
            bound.pop(field, None)
        return bound

    formula_id = bound.get("formula_id") or (existing_record or {}).get("formula_id")
    if not formula_id:
        bound.pop("formula_snapshot", None)
        return bound

    existing_tree_version_id = (existing_record or {}).get("decision_tree_version_id")
    requested_tree_version_id = bound.get("decision_tree_version_id")
    if existing_tree_version_id and requested_tree_version_id not in (None, existing_tree_version_id):
        raise CalculationVersionError(
            "This record is pinned to a historical decision-tree version and cannot use a newer version"
        )
    if existing_tree_version_id:
        bound["decision_tree_version_id"] = existing_tree_version_id

    effective_tree_version_id = bound.get("decision_tree_version_id")
    tree_version = None
    if effective_tree_version_id:
        tree_version = await db.ce_decision_tree_versions.find_one(
            {
                "$or": [
                    {"id": effective_tree_version_id},
                    {"version_id": effective_tree_version_id},
                ],
            },
            {"_id": 0, "id": 1, "version_id": 1, "formula_version_map": 1},
        )
        if tree_version is None:
            tree_version = await db.ce_decision_trees.find_one(
                {"version_id": effective_tree_version_id},
                {"_id": 0, "id": 1, "version_id": 1, "formula_version_map": 1},
            )
        if tree_version is None:
            raise CalculationVersionError(
                f"Decision-tree version '{effective_tree_version_id}' is not available"
            )
        if not isinstance(tree_version.get("formula_version_map"), dict):
            raise CalculationVersionError(
                f"Decision-tree version '{effective_tree_version_id}' is missing formula-version mappings"
            )

    existing_formula_id = (existing_record or {}).get("formula_id")
    existing_formula_version_id = (existing_record or {}).get("formula_version_id")
    requested_formula_version_id = bound.get("formula_version_id")

    if existing_formula_version_id and formula_id == existing_formula_id:
        if requested_formula_version_id not in (None, existing_formula_version_id):
            raise CalculationVersionError(
                "This record is pinned to a historical formula version and cannot use a newer version"
            )
        requested_formula_version_id = existing_formula_version_id

    mapped_version_id = (tree_version or {}).get("formula_version_map", {}).get(formula_id)
    if existing_tree_version_id and formula_id != existing_formula_id:
        if not mapped_version_id:
            raise CalculationVersionError(
                "The historical decision-tree version cannot safely resolve the edited formula branch"
            )
        if requested_formula_version_id not in (None, mapped_version_id):
            raise CalculationVersionError(
                "The edited formula does not belong to the record's historical decision-tree version"
            )
        requested_formula_version_id = mapped_version_id

    if mapped_version_id and requested_formula_version_id not in (None, mapped_version_id):
        raise CalculationVersionError(
            "The formula version does not belong to the selected decision-tree version"
        )
    if mapped_version_id:
        requested_formula_version_id = mapped_version_id

    formula_doc = await get_formula_for_execution(db, formula_id, requested_formula_version_id)
    bound["formula_id"] = formula_id
    bound["formula_version_id"] = formula_doc.get("version_id")
    bound["formula_snapshot"] = formula_snapshot(formula_doc)
    return bound