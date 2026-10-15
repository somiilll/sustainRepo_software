"""Total vs by-source rules for Water -> Consumption records."""
from typing import Any, Dict, Optional

TOTAL_KEY = "quantity"
SOURCE_KEYS = (
    "water_consumed_through_ground_water",
    "water_consumed_through_surface_water",
    "water_consumed_through_third_party_water",
    "water_consumed_through_seawater_desalinated_water",
)
STRESS_KEY = "quantity_consumed_in_water_stress_area"
TOLERANCE = 0.01


def _num(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid number: {value}")


def apply_water_consumption_rules(
    category: Optional[str],
    subcategory: Optional[str],
    field_values: Dict[str, Any],
    is_draft: bool = False,
) -> Dict[str, Any]:
    """Auto-fill total from sources, or validate a manually entered total against them."""
    if (category or "").lower() != "water" or (subcategory or "").lower() != "consumption":
        return field_values

    total = _num(field_values.get(TOTAL_KEY))
    sources = [_num(field_values.get(k)) for k in SOURCE_KEYS]
    entered = [s for s in sources if s is not None]
    stress = _num(field_values.get(STRESS_KEY))

    if any(v < 0 for v in entered + [x for x in (total, stress) if x is not None]):
        raise ValueError("Water consumption values cannot be negative")

    if is_draft:
        return field_values

    if total is None and not entered:
        raise ValueError("Enter Total Water Consumed, or at least one source value")

    if entered:
        source_sum = sum(entered)
        if total is None:
            field_values = {**field_values, TOTAL_KEY: round(source_sum, 6)}
            total = source_sum
        elif abs(total - source_sum) > max(TOLERANCE, abs(source_sum) * 1e-6):
            raise ValueError(
                f"Total Water Consumed ({total:g}) must equal the sum of the sources ({source_sum:g}). "
                "Fix the sources or enter only the total."
            )

    if stress is not None and total is not None and stress > total + TOLERANCE:
        raise ValueError("Quantity consumed in water stress area cannot exceed Total Water Consumed")

    return field_values
