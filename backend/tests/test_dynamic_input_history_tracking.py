from shared.helpers.audit_helpers import (
    DYNAMIC_HISTORY_EXCLUDED_FIELDS,
    compute_field_changes,
    compute_user_input_changes,
)


def _input_changes(old_dfv, new_dfv):
    return [
        change for change in compute_field_changes(
            {"dynamic_field_values": old_dfv},
            {"dynamic_field_values": new_dfv},
            fields_to_track=["dynamic_field_values"],
            input_label_map={"qty_days_travelled": "No. of Days Travelled"},
        )
        if change.get("field") == "input_values"
    ]


def test_tracks_c6_days_without_required_or_override_flags():
    changes = _input_changes(
        {"qty_days_travelled": {"value": 29, "unit": ""}},
        {"qty_days_travelled": {"value": 28, "unit": ""}},
    )
    assert changes == [{
        "field": "input_values",
        "input_key": "qty_days_travelled",
        "display_name": "No. of Days Travelled",
        "old_value": {"value": 29, "unit": ""},
        "new_value": {"value": 28, "unit": ""},
        "field_type": "input_value",
        "old_is_override": False,
        "new_is_override": False,
    }]


def test_tracks_future_user_input_without_code_changes():
    changes = _input_changes(
        {"future_user_field": {"value": 1, "unit": "widgets"}},
        {"future_user_field": {"value": 2, "unit": "widgets"}},
    )
    assert changes[0]["input_key"] == "future_user_field"


def test_skips_untouched_database_defaults():
    changes = _input_changes(
        {"density": {"value": 1.1, "unit": "kg/L", "is_override": False}},
        {"density": {"value": 1.2, "unit": "kg/L", "is_override": False}},
    )
    assert changes == []


def test_tracks_default_override_transitions():
    changes = _input_changes(
        {"density": {"value": None, "unit": "kg/L", "is_override": False}},
        {"density": {"value": 1.2, "unit": "kg/L", "is_override": True}},
    )
    assert changes[0]["old_value"]["value"] == "Default Value Used"
    assert changes[0]["new_value"]["value"] == 1.2


def test_excludes_internal_and_duplicate_fields_only():
    for key in DYNAMIC_HISTORY_EXCLUDED_FIELDS:
        assert _input_changes(
            {key: {"value": "old", "unit": ""}},
            {key: {"value": "new", "unit": ""}},
        ) == []


def test_c7_nested_inputs_track_future_fields_and_units():
    changes = compute_user_input_changes(
        {"future_commute_field": 10, "future_commute_field_unit": "km"},
        {"future_commute_field": 12, "future_commute_field_unit": "mi"},
        employee_name="Alex",
    )
    assert changes[0]["input_key"] == "future_commute_field"
    assert changes[0]["display_name"] == "Future Commute Field (Alex)"
    assert changes[0]["new_value"] == {"value": 12, "unit": "mi"}