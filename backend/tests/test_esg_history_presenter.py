from modules.esg_records.history_presenter import FieldHistoryPresenter

TABLE_FIELD = {
    "field_key": "incident_records_by_person_type", "label": "Health & safety incidents by person type", "type": "table",
    "table_columns": [{"key": "person_type", "label": "Person type"}, {"key": "hours", "label": "Hours worked"}, {"key": "incidents", "label": "Incidents"}],
}
LEGACY = {"field_key": "emp_hours", "label": "Hours worked", "group": "Employees", "type": "number", "hide_if_table_has_rows": "incident_records_by_person_type"}
PLAIN = {"field_key": "notes_field", "label": "Hours worked", "group": "Workers", "type": "number"}


def _diff(key, old, new):
    return {"field": f"field_values.{key}", "display_name": key, "old_value": old, "new_value": new}


def test_table_diff_is_reported_per_cell_without_table_dump():
    old = [{"person_type": "Employee", "hours": 134, "incidents": 20}, {"person_type": "Worker", "hours": 234, "incidents": 30}]
    new = [{"person_type": "Employee", "hours": 1349888, "incidents": 20}, {"person_type": "Worker", "hours": 234, "incidents": 30}]
    result = FieldHistoryPresenter([TABLE_FIELD]).present([_diff("incident_records_by_person_type", old, new)], {}, {})
    assert [(d["display_name"], d["old_value"], d["new_value"]) for d in result] == [("Employee › Hours worked", 134, 1349888)]


def test_legacy_fields_hidden_when_table_has_rows():
    values = {"incident_records_by_person_type": [{"person_type": "Employee", "hours": 5}]}
    result = FieldHistoryPresenter([TABLE_FIELD, LEGACY]).present([_diff("emp_hours", 1, 5)], {}, values)
    assert result == []


def test_legacy_fields_shown_when_table_empty():
    result = FieldHistoryPresenter([TABLE_FIELD, LEGACY]).present([_diff("emp_hours", 1, 5)], {}, {})
    assert result[0]["display_name"] == "Employees › Hours worked"


def test_group_qualifies_duplicate_labels_and_unknown_fields_pass_through():
    presenter = FieldHistoryPresenter([PLAIN])
    assert presenter.present([_diff("notes_field", 1, 2)], {}, {})[0]["display_name"] == "Workers › Hours worked"
    assert presenter.present([_diff("other", 1, 2)], {}, {})[0]["display_name"] == "other"


def test_added_table_row_reports_each_filled_cell():
    new = [{"person_type": "Worker", "hours": 7, "incidents": None}]
    result = FieldHistoryPresenter([TABLE_FIELD]).present([_diff("incident_records_by_person_type", None, new)], {}, {})
    assert [(d["display_name"], d["old_value"], d["new_value"]) for d in result] == [("Worker › Hours worked", None, 7)]


def test_child_field_without_group_is_prefixed_with_parent_label():
    parent = {"field_key": "rehab_total", "label": "Rehabilitated (Total)", "type": "number"}
    child = {"field_key": "rehab_emp", "label": "Employees", "type": "number", "parent_key": "rehab_total"}
    result = FieldHistoryPresenter([parent, child]).present([_diff("rehab_emp", 2, 6)], {}, {})
    assert result[0]["display_name"] == "Rehabilitated (Total) › Employees"
