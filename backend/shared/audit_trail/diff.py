import math
from dataclasses import dataclass
from typing import Any

VALUE_PREFIX = "value."


@dataclass(frozen=True)
class PathChange:
    path: str
    old: Any
    new: Any


def flatten(value: Any, prefix: str = "") -> dict[str, Any]:
    """Flatten nested dicts into dotted leaf paths; lists and scalars are leaves."""
    if isinstance(value, dict):
        flat: dict[str, Any] = {}
        for key, item in value.items():
            flat.update(flatten(item, f"{prefix}.{key}" if prefix else str(key)))
        return flat
    return {prefix: value} if prefix else {}


def unflatten(flat: dict[str, Any]) -> dict[str, Any]:
    """Inverse of `flatten`: dotted leaf paths back to nested dicts (Mongo-safe keys)."""
    nested: dict[str, Any] = {}
    for path, leaf in flat.items():
        node = nested
        *parents, last = path.split(".")
        for part in parents:
            node = node.setdefault(part, {})
        node[last] = leaf
    return nested


def get_path(value: Any, path: str) -> Any:
    for part in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def values_equal(old: Any, new: Any) -> bool:
    if isinstance(old, (int, float)) and isinstance(new, (int, float)) and not isinstance(old, bool) and not isinstance(new, bool):
        return math.isclose(old, new, rel_tol=1e-9, abs_tol=1e-12)
    return old == new


def _diff_flat(old_flat: dict[str, Any], new_flat: dict[str, Any]) -> list[PathChange]:
    changes = []
    for path in sorted(set(old_flat) | set(new_flat)):
        old, new = old_flat.get(path), new_flat.get(path)
        if not values_equal(old, new):
            changes.append(PathChange(path=path, old=old, new=new))
    return changes


def planned_value_changes(
    old_value: Any, set_fields: dict[str, Any], unset_fields: dict[str, Any]
) -> list[PathChange]:
    """Leaf-level changes a Mongo update (`$set` / `$unset` on `value.*`) will make to a response value."""
    if "value" in set_fields:
        return _diff_flat(flatten(old_value, "value"), flatten(set_fields["value"], "value"))

    old_flat: dict[str, Any] = {}
    new_flat: dict[str, Any] = {}
    for db_path, new in set_fields.items():
        if not db_path.startswith(VALUE_PREFIX):
            continue
        path = db_path[len(VALUE_PREFIX):]
        old_flat.update(flatten(get_path(old_value, path), path) or {path: get_path(old_value, path)})
        new_flat.update(flatten(new, path) or {path: new})
    for db_path in unset_fields:
        if not db_path.startswith(VALUE_PREFIX):
            continue
        path = db_path[len(VALUE_PREFIX):]
        removed = flatten(get_path(old_value, path), path) or {path: get_path(old_value, path)}
        old_flat.update(removed)
        new_flat.update({leaf: None for leaf in removed})
    return _diff_flat(old_flat, new_flat)
