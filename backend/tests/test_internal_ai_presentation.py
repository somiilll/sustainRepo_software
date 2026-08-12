from modules.internal_data_ai.services.formulas import build_methodology_summary


def test_methodology_summary_uses_labels_not_calculation_keys_or_units():
    formula = {
        "name": "Stationary Combustion – Heat Basis",
        "definition": {
            "steps": [
                {"name": "co2", "expression": "qty * ef_co2 * cv / 1000"},
                {"name": "co2e", "expression": "co2 * gwp_co2"},
            ]
        },
    }
    variables = [{"key": "qty", "label": "Quantity Used"}]
    properties = [
        {"key": "ef_co2", "label": "CO₂ Emission Factor"},
        {"key": "cv", "label": "Calorific Value"},
        {"key": "gwp_co2", "label": "CO₂ Global Warming Potential"},
    ]

    result = build_methodology_summary(formula, variables, properties)

    assert result["name"] == "Stationary Combustion – Heat Basis"
    assert result["steps"][0] == {
        "result": "CO₂",
        "formula": "Quantity Used * CO₂ Emission Factor * Calorific Value / 1000",
    }
    assert "qty" not in str(result)
    assert "ef_co2" not in str(result)