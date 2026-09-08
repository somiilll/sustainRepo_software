from bulk_upload_scope3.processors.scope12_processor import Scope12RowProcessor


def test_carbon_composition_fields_match_manual_entry_shape():
    row_data = {
        "carbon_content": 90,
        "oxidation_factor": 0.7,
    }
    inputs = {
        "qty": {"value": 300, "unit": "L"},
    }

    Scope12RowProcessor._add_carbon_composition_inputs(row_data, inputs)
    dynamic_values = Scope12RowProcessor._build_scope1_dynamic_field_values(
        row_data=row_data,
        inputs=inputs,
        user_overrides={},
        derived_methodology="using_carbon_composition",
    )

    assert dynamic_values["carbon_content"] == {"value": 90.0, "unit": "%"}
    assert dynamic_values["oxidation_factor"] == {"value": 0.7, "unit": ""}
    assert "is_override" not in dynamic_values["carbon_content"]
    assert "is_override" not in dynamic_values["oxidation_factor"]


def test_genuine_override_fields_keep_override_metadata():
    row_data = {
        "cv": 42,
        "density": 0.85,
    }
    inputs = {
        "qty": {"value": 300, "unit": "L"},
    }
    user_overrides = {
        "cv": {"value": 42, "unit": "MJ/kg", "is_override": True},
        "density": {"value": 0.85, "unit": "kg/L", "is_override": True},
    }

    dynamic_values = Scope12RowProcessor._build_scope1_dynamic_field_values(
        row_data=row_data,
        inputs=inputs,
        user_overrides=user_overrides,
        derived_methodology="using_heat_basis_ncv",
    )

    assert dynamic_values["cv"]["is_override"] is True
    assert dynamic_values["density"]["is_override"] is True


def test_ef_quantity_matches_manual_entry_shape():
    row_data = {
        "ef_quantity": 2.5,
    }
    inputs = {
        "qty": {"value": 300, "unit": "L"},
        "ef_quantity": {"value": 2.5, "unit": "kgCO2/L"},
    }
    user_overrides = {
        "ef_quantity": {
            "value": 2.5,
            "unit": "kgCO2/L",
            "is_override": True,
        },
    }

    dynamic_values = Scope12RowProcessor._build_scope1_dynamic_field_values(
        row_data=row_data,
        inputs=inputs,
        user_overrides=user_overrides,
        derived_methodology="using_qty_basis_ef",
    )

    assert dynamic_values["ef_quantity"] == {
        "value": 2.5,
        "unit": "kgCO2/L",
    }
    assert "is_override" not in dynamic_values["ef_quantity"]