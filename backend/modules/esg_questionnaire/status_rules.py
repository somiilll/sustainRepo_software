"""Read-time status corrections for saved responses that were never really answered."""
from typing import Any, Dict, Optional

DUAL_YES_NO_CATEGORIES = {"p3_life_insurance_package": ("employees", "workers")}
UNTOUCHED_DEFAULT_KEYS = {"brsr_a_complaints_grievances"}


OPTIONAL_KEYS = ("remark", "weblink", "web_link", "url", "note", "comment", "description", "detail", "reason", "unit", "total", "specify", "name_of")


def _leaves(node: Any, key: str = ""):
    if key.endswith(("_previous_fy", "previous_fy", "prior_fy")):
        return
    if isinstance(node, dict):
        if "current_fy" in node and any(k.endswith("previous_fy") or k == "previous_fy" for k in node):
            node = {"current_fy": node["current_fy"]}
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


def adjusted_status(doc: Dict[str, Any]) -> Optional[str]:
    """Return 'pending' (never filled in), 'in_progress' (partly answered) or None (keep stored status)."""
    if not doc or doc.get("status") != "saved" or doc.get("approval_status") in ("approved", "rejected", "pending_approval"):
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
    if partially_filled(value) and key not in UNTOUCHED_DEFAULT_KEYS:
        return "in_progress"
    return None


def resolved_status(doc: Optional[Dict[str, Any]]) -> str:
    """The one status of a question: pending / draft / in_progress / saved / approved / rejected."""
    from modules.brsr_report.live_kpi_autofill import _has_reportable_value
    if not doc:
        return "pending"
    approval = doc.get("approval_status")
    if approval in ("approved", "rejected"):
        return approval
    if doc.get("status") == "draft":
        return "draft"
    adjusted = adjusted_status(doc)
    if adjusted:
        return adjusted
    saved = doc.get("status") == "saved" or approval == "pending_approval"
    return "saved" if saved and _has_reportable_value(doc.get("value")) else "pending"
