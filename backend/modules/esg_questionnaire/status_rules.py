"""Read-time status corrections for saved responses that were never really answered."""
from typing import Any, Dict, Optional

DUAL_YES_NO_CATEGORIES = {"p3_life_insurance_package": ("employees", "workers")}
UNTOUCHED_DEFAULT_KEYS = {"brsr_a_complaints_grievances"}


COLUMN_OPTIONAL_KEYS = ("remark", "weblink", "web_link", "url", "note", "comment", "description", "unit", "specify")
OPTIONAL_KEYS = ("remark", "weblink", "web_link", "url", "note", "comment", "description", "detail", "reason", "unit", "total", "specify", "name_of")


def _leaves(node: Any, key: str = ""):
    if isinstance(node, dict):
        mode = node.get("mode")
        for k, v in node.items():
            if str(k) == "country" and len(node) > 1:
                continue
            if (mode == "principle_wise" and str(k).startswith("all_")) or (mode == "all" and str(k) == "principles") or k == "mode":
                continue
            yield from _leaves(v, str(k))
    elif isinstance(node, list):
        for item in node:
            yield from _leaves(item, key)
    elif not any(part in key.lower() for part in OPTIONAL_KEYS):
        yield node


def _cell_filled(value: Any) -> bool:
    return not (value is None or (isinstance(value, str) and not value.strip()))


def partially_filled_by_config(value: Any, table_config: Optional[Dict[str, Any]]) -> Optional[bool]:
    """Fixed-row tables: every row x column of the config is an expected cell (missing cells count as empty).
    Returns None when the config has no fixed rows (caller falls back to checking the stored cells)."""
    rows = [r for r in (table_config or {}).get("fixed_rows") or [] if "optional" not in f'{r.get("key")} {r.get("label")}'.lower()]
    columns = [c["key"] for c in (table_config or {}).get("columns") or [] if not any(p in c["key"].lower() for p in COLUMN_OPTIONAL_KEYS)]
    if not rows or not columns or not isinstance(value, dict):
        return None
    cells = [_cell_filled((value.get(r["key"]) or {}).get(c) if isinstance(value.get(r["key"]), dict) else None) for r in rows for c in columns]
    return any(cells) and not all(cells)


def partially_filled(value: Any) -> bool:
    """True when a multi-cell answer has some required cells filled and others empty (0 and False count as filled)."""
    if not isinstance(value, (dict, list)):
        return False
    cells = [not (leaf is None or (isinstance(leaf, str) and not leaf.strip())) for leaf in _leaves(value)]
    return len(cells) > 1 and any(cells) and not all(cells)


def _is_blank_row(row: Any) -> bool:
    return isinstance(row, dict) and all(not v for k, v in row.items() if k != "category")


def _empty(value: Any) -> bool:
    if isinstance(value, (dict, list)):
        return all(_empty(v) for v in (value.values() if isinstance(value, dict) else value))
    return value is None or (isinstance(value, str) and not value.strip())


def adjusted_status(doc: Dict[str, Any], table_config: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Return 'pending' (never filled in), 'in_progress' (partly answered) or None (keep stored status)."""
    if not doc or doc.get("status") != "completed" or doc.get("approval_status") in ("approved", "rejected", "pending_approval"):
        return None
    key, value = doc.get("question_key"), doc.get("value")
    auto = doc.get("auto_fill") or {}
    if auto.get("coverage") == "partial" and doc.get("updated_at") == auto.get("synced_at") and not _empty(value):
        return "in_progress"
    if key in UNTOUCHED_DEFAULT_KEYS and isinstance(value, list) and all(_is_blank_row(r) for r in value):
        return "pending"
    categories = DUAL_YES_NO_CATEGORIES.get(key)
    if categories:
        answers = value if isinstance(value, dict) else {}
        if any(not isinstance((answers.get(c) or {}).get("has_value"), bool) for c in categories):
            return "in_progress"
    by_config = partially_filled_by_config(value, table_config)
    if (by_config if by_config is not None else partially_filled(value)) and key not in UNTOUCHED_DEFAULT_KEYS:
        return "in_progress"
    return None


def resolved_status(doc: Optional[Dict[str, Any]], table_config: Optional[Dict[str, Any]] = None) -> str:
    """The one status of a question: pending / draft / in_progress / saved / approved / rejected."""
    from modules.brsr_report.live_kpi_autofill import _has_reportable_value
    if not doc:
        return "pending"
    approval = doc.get("approval_status")
    if approval in ("approved", "rejected"):
        return approval
    if doc.get("status") == "draft":
        return "draft"
    adjusted = adjusted_status(doc, table_config)
    if adjusted:
        return adjusted
    saved = doc.get("status") == "completed" or approval == "pending_approval"
    return "completed" if saved and _has_reportable_value(doc.get("value")) else "pending"


def _dependency(config: Dict[str, Any]):
    visible_if = config.get("visible_if") or {}
    if visible_if.get("question_key"):
        return visible_if["question_key"], visible_if
    conditional = config.get("conditional") or {}
    if conditional.get("depends_on") and conditional.get("show_when") == "has_no_answer":
        return conditional["depends_on"], conditional
    return None


def _dependent_visible(rule: Dict[str, Any], parent_value: Any) -> bool:
    condition = rule.get("condition") or rule.get("show_when")
    if condition == "has_rows":
        return isinstance(parent_value, list) and any(
            isinstance(row, dict) and any(v not in ("", None) for v in row.values()) for row in parent_value)
    if condition == "equals":
        return parent_value == rule.get("value")
    if condition == "not_equals":
        return parent_value != rule.get("value")
    if condition == "has_no_answer":
        if not isinstance(parent_value, dict):
            return False
        if parent_value.get("mode") == "all_together":
            return parent_value.get("all_enabled") is False
        return any((p or {}).get("enabled") is False for p in (parent_value.get("principles") or {}).values())
    return True


def mirror_hidden_dependents(response_map: Dict[str, Any], configs: list) -> None:
    """A dependent question that is hidden by its parent's answer takes the parent's response and status."""
    for config in configs:
        dependency = _dependency(config)
        if not dependency:
            continue
        parent_key, rule = dependency
        parent = response_map.get(parent_key)
        if parent is not None and _dependent_visible(rule, parent.get("value")):
            continue
        if parent is None:
            response_map.pop(config["question_key"], None)
        else:
            response_map[config["question_key"]] = {**parent, "question_key": config["question_key"]}


TRACKER_PARENT = {"performance_against_policies": "ngrbc_review_details"}


def merge_tracker_children(response_map: Dict[str, Any]) -> None:
    """Tracker lists a child question inside its parent: the parent is complete only when both are, and shows the weaker approval state."""
    for child, parent in TRACKER_PARENT.items():
        own, extra = response_map.get(parent), response_map.get(child)
        if own is None:
            continue
        if extra is None:
            response_map[parent] = {**own, "value": None, "approval_status": None, "status": "draft"}
            continue
        states = {own.get("approval_status"), extra.get("approval_status")}
        merged = next((s for s in ("rejected", "pending_approval") if s in states), None)
        if merged is None and states == {"approved"}:
            merged = "approved"
        response_map[parent] = {**own, "approval_status": merged or own.get("approval_status")}


TRACKER_EXCLUDED = set(TRACKER_PARENT) | {"brsr_a_financial_year"}
