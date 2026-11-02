"""Read-time status corrections for saved responses that were never really answered."""
from typing import Any, Dict, Optional

DUAL_YES_NO_CATEGORIES = {"p3_life_insurance_package": ("employees", "workers")}
UNTOUCHED_DEFAULT_KEYS = {"brsr_a_complaints_grievances"}


def _is_blank_row(row: Any) -> bool:
    return isinstance(row, dict) and all(not v for k, v in row.items() if k != "category")


def adjusted_status(doc: Dict[str, Any]) -> Optional[str]:
    """Return 'pending' (never filled in), 'draft' (partly answered) or None (keep stored status)."""
    if not doc or doc.get("status") != "saved" or doc.get("approval_status") in ("approved", "rejected", "pending_approval"):
        return None
    key, value = doc.get("question_key"), doc.get("value")
    if key in UNTOUCHED_DEFAULT_KEYS and isinstance(value, list) and all(_is_blank_row(r) for r in value):
        return "pending"
    categories = DUAL_YES_NO_CATEGORIES.get(key)
    if categories:
        answers = value if isinstance(value, dict) else {}
        if any(not isinstance((answers.get(c) or {}).get("has_value"), bool) for c in categories):
            return "draft"
    return None
