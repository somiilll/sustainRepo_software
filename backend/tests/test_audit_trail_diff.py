from shared.audit_trail.diff import flatten, planned_value_changes, unflatten


def _paths(changes):
    return {c.path: (c.old, c.new) for c in changes}


def test_flatten_and_unflatten_roundtrip():
    nested = {"a": {"b": 1, "c": {"d": 2}}, "e": None}
    assert unflatten(flatten(nested)) == nested


def test_set_changes_only_changed_leaves():
    old = {"row": {"current_fy": 10, "previous_fy": 5}}
    set_fields = {"value.row.current_fy": 10.0, "value.row.previous_fy": 6}
    assert _paths(planned_value_changes(old, set_fields, {})) == {"row.previous_fy": (5, 6)}


def test_first_write_is_recorded_as_addition():
    changes = planned_value_changes(None, {"value.row.current_fy": 3}, {})
    assert _paths(changes) == {"row.current_fy": (None, 3)}


def test_unset_subtree_records_every_removed_leaf():
    old = {"row": {"current_fy": 1, "unit": "kl"}}
    changes = planned_value_changes(old, {}, {"value.row": ""})
    assert _paths(changes) == {"row.current_fy": (1, None), "row.unit": ("kl", None)}


def test_unset_of_absent_value_is_not_a_change():
    assert planned_value_changes({"row": {}}, {}, {"value.row.current_fy": ""}) == []


def test_float_noise_is_ignored():
    old = {"x": {"v": 0.1 + 0.2}}
    assert planned_value_changes(old, {"value.x.v": 0.3}, {}) == []


def test_full_value_replacement_diffs_leaves():
    changes = planned_value_changes({"a": 1}, {"value": {"a": 2, "b": 3}}, {})
    assert _paths(changes) == {"value.a": (1, 2), "value.b": (None, 3)}
