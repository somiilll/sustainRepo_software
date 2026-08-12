"""Read-time normalization for the platform's existing emission-record shapes."""
from typing import Any, Optional


def _numeric(value: Any) -> Optional[float | int]:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            number = float(value)
            return int(number) if number.is_integer() else number
        except ValueError:
            return None
    return None


def resolve_record_quantity(record: dict) -> dict:
    """Normalize quantity without mutating legacy or current emission records."""
    dynamic_qty = ((record.get("dynamic_field_values") or {}).get("qty") or {})
    dynamic_value = _numeric(dynamic_qty.get("value"))
    if dynamic_value is not None:
        return {
            "value": dynamic_value,
            "unit": dynamic_qty.get("unit") or None,
            "source": "dynamic_field_values.qty",
        }

    legacy_value = _numeric(record.get("quantity"))
    if legacy_value is not None:
        return {
            "value": legacy_value,
            "unit": record.get("quantity_unit") or record.get("unit") or None,
            "source": "legacy_quantity",
        }

    return {"value": None, "unit": None, "source": "unavailable"}


def resolve_emission_unit(
    record: dict,
    *,
    formula_definition: Optional[dict] = None,
    calculation_audit: Optional[dict] = None,
) -> dict:
    """Resolve an emissions unit from stored evidence, in evidence-priority order."""
    audit_output = ((calculation_audit or {}).get("outputs") or {}).get("co2e") or {}
    if isinstance(audit_output, dict) and audit_output.get("unit"):
        return {"unit": audit_output["unit"], "source": "calculation_audit"}

    definition = formula_definition or {}
    if "definition" in definition and isinstance(definition.get("definition"), dict):
        definition = definition["definition"]
    for output in definition.get("outputs", []) if isinstance(definition, dict) else []:
        if output.get("variable") == "co2e" and output.get("unit"):
            return {"unit": output["unit"], "source": "formula_definition"}

    for field in ("co2e_unit", "emissions_unit", "unit"):
        if record.get(field):
            return {"unit": record[field], "source": f"record.{field}"}
    return {"unit": None, "source": "unavailable"}