"""Read calculation inputs already stored on authorized emission records."""


_PROPERTY_KEYS = {
    "calorific_value": ("cv", "calorific_value"),
}


async def lookup(org_id: str, facility_ids: list = None, emission_records: list = None, **kwargs) -> dict:
    requested_metric = kwargs.get("requested_metric") or kwargs.get("metric") or ""
    property_keys = _PROPERTY_KEYS.get(requested_metric, ())
    results = []
    for record in emission_records or []:
        inputs = record.get("calculation_inputs") or {}
        for key in property_keys:
            value = inputs.get(key)
            if isinstance(value, dict) and value.get("value") is not None:
                results.append({
                    "property": requested_metric,
                    "value": value.get("value"),
                    "unit": value.get("unit"),
                    "facility": record.get("facility"),
                    "reporting_period": record.get("reporting_period"),
                    "source": f"dynamic_field_values.{key}",
                })
                break
    return {"property": requested_metric, "total_found": len(results), "values": results}