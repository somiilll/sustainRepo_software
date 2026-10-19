"""Deterministic guards for classifier-provided Internal AI entities."""
import re


_CATEGORY_ALIASES = {
    "stationary combustion": ("stationary combustion", "stationary"),
    "mobile combustion": ("mobile combustion", "mobile"),
    "flaring": ("flaring",),
    "fugitive emissions": ("fugitive emissions", "fugitive"),
    "process emissions": ("process emissions",),
}


def category_is_explicitly_mentioned(question: str, category: str) -> bool:
    """Return whether the user, rather than the classifier, supplied a category filter."""
    normalized_question = (question or "").lower()
    normalized_category = (category or "").strip().lower()
    if not normalized_category:
        return False
    aliases = _CATEGORY_ALIASES.get(normalized_category, (normalized_category,))
    return any(re.search(rf"\b{re.escape(alias)}\b", normalized_question) for alias in aliases)