"""Shared waste quantity normalization for dashboard and MIS reporting."""


def to_metric_tonnes(value, unit=None) -> float:
    """Normalize stored waste quantities to metric tonnes.

    Historic waste records without a unit are stored in kilograms.
    """
    try:
        amount = float(value or 0)
    except (TypeError, ValueError):
        return 0.0

    normalized = str(unit or "kg").strip().lower().replace(" ", "")
    if normalized in {"t", "mt", "ton", "tons", "tonne", "tonnes", "metricton", "metrictonne", "metrictonnes"}:
        return amount
    if normalized in {"g", "gram", "grams"}:
        return amount / 1_000_000
    if normalized in {"lb", "lbs", "pound", "pounds"}:
        return amount / 2_204.62262
    return amount / 1_000