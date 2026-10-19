"""Remove internal identifiers from API-facing Internal Data AI payloads."""


_INTERNAL_IDENTIFIER_KEYS = {
    "_id",
    "id",
    "record_id",
    "emission_record_id",
    "formula_id",
    "facility_id",
    "organization_id",
    "user_id",
    "created_by",
    "updated_by",
    "changed_by",
}


def sanitize_raw_data(value):
    """Recursively retain only presentation-safe data for the client response."""
    if isinstance(value, dict):
        return {
            key: sanitize_raw_data(item)
            for key, item in value.items()
            if key.lower() not in _INTERNAL_IDENTIFIER_KEYS
        }
    if isinstance(value, list):
        return [sanitize_raw_data(item) for item in value]
    return value


def sanitize_response(response: dict) -> dict:
    """Sanitize raw data while retaining the formatter's response contract."""
    if response.get("raw_data") is not None:
        response["raw_data"] = sanitize_raw_data(response["raw_data"])
    return response