import pytest
from pydantic import ValidationError

from modules.emissions.contracts import EmissionRecordCreate


# EmissionRecordCreate monthly C6 travel-count guard for canonical dynamic_field_values objects
def _base_payload(reporting_period: str, dynamic_field_values: dict):
    return {
        "facility_id": "TEST_FACILITY",
        "reporting_period": reporting_period,
        "frequency_type": "monthly",
        "scope": "scope3",
        "category": "Business Travel",
        "category_code": "c6",
        "sub_category": "Business Travel",
        "dynamic_field_values": dynamic_field_values,
    }


def _yearly_payload(reporting_period: str, dynamic_field_values: dict):
    payload = _base_payload(reporting_period, dynamic_field_values)
    payload["frequency_type"] = "yearly"
    return payload


@pytest.mark.parametrize(
    "field_key,limit,invalid_value",
    [
        ("qty_days_travelled", 30, 31),
        ("nights_stayed", 30, 31),
        ("qty_nights", 30, 31),
    ],
)
def test_april_2025_rejects_canonical_objects_above_30(field_key, limit, invalid_value):
    payload = _base_payload(
        "2025-04",
        {field_key: {"value": invalid_value, "unit": ""}},
    )

    with pytest.raises(ValidationError) as exc:
        EmissionRecordCreate(**payload)

    assert f"must be between 0 and {limit} days for the reporting month" in str(exc.value)


@pytest.mark.parametrize(
    "reporting_period,field_key,accepted,rejected,rejected_limit",
    [
        ("2025-04", "qty_days_travelled", 30, 31, 30),
        ("2025-04", "nights_stayed", 30, 31, 30),
        ("2024-02", "qty_days_travelled", 29, 30, 29),
        ("2024-02", "nights_stayed", 29, 30, 29),
        ("2025-02", "qty_days_travelled", 28, 29, 28),
        ("2025-02", "nights_stayed", 28, 29, 28),
    ],
)
def test_month_boundaries_for_canonical_objects(
    reporting_period,
    field_key,
    accepted,
    rejected,
    rejected_limit,
):
    accepted_payload = _base_payload(
        reporting_period,
        {field_key: {"value": accepted, "unit": ""}},
    )
    model = EmissionRecordCreate(**accepted_payload)
    assert model.reporting_period == reporting_period

    rejected_payload = _base_payload(
        reporting_period,
        {field_key: {"value": rejected, "unit": ""}},
    )
    with pytest.raises(ValidationError) as exc:
        EmissionRecordCreate(**rejected_payload)
    assert f"must be between 0 and {rejected_limit} days for the reporting month" in str(exc.value)


def test_rejects_non_numeric_canonical_object_value():
    payload = _base_payload(
        "2025-04",
        {"qty_days_travelled": {"value": "not-a-number", "unit": ""}},
    )

    with pytest.raises(ValidationError) as exc:
        EmissionRecordCreate(**payload)

    assert "must be a valid number" in str(exc.value)


@pytest.mark.parametrize(
    "reporting_period,field_key,accepted,rejected,max_days",
    [
        ("CY2024", "qty_days_travelled", 366, 367, 366),
        ("CY2025", "nights_stayed", 365, 366, 365),
        ("FY 2023-2024", "qty_nights", 366, 367, 366),
        ("FY 2024-2025", "number_of_nights", 365, 366, 365),
    ],
)
def test_yearly_c6_travel_counts_respect_calendar_and_financial_year_boundaries(
    reporting_period,
    field_key,
    accepted,
    rejected,
    max_days,
):
    EmissionRecordCreate(**_yearly_payload(
        reporting_period,
        {field_key: {"value": accepted, "unit": ""}},
    ))

    with pytest.raises(ValidationError) as exc:
        EmissionRecordCreate(**_yearly_payload(
            reporting_period,
            {field_key: {"value": rejected, "unit": ""}},
        ))

    assert f"must be between 0 and {max_days} days for the reporting year" in str(exc.value)
