from bulk_upload_scope3.models import CalculationMethod
from bulk_upload_scope3.models import CATEGORY_COLUMNS
from bulk_upload_scope3.processors.emission_calculator import (
    EmissionCalculator,
    PPP_INFLATION_METHOD,
    STANDARD_METHOD,
    resolve_bulk_currency_method,
)


def test_spent_amount_only_defaults_to_standard_currency_conversion():
    assert resolve_bulk_currency_method({"spent_amount": 1000}) == STANDARD_METHOD


def test_numeric_standard_currency_conversion_selects_standard_method():
    assert resolve_bulk_currency_method({"spent_amount": 1000, "exchange_rate": 83.25}) == STANDARD_METHOD


def test_ppp_or_inflation_value_selects_ppp_inflation():
    assert resolve_bulk_currency_method({"spent_amount": 1000, "ppp": 24.5}) == PPP_INFLATION_METHOD
    assert resolve_bulk_currency_method({"spent_amount": 1000, "inflation_rate": 1.08}) == PPP_INFLATION_METHOD


def test_both_ppp_and_inflation_values_are_persisted_as_overrides():
    row_data = {
        "spent_amount": 1000,
        "spent_currency": "INR",
        "ppp": 24.5,
        "inflation_rate": 1.08,
    }
    calculator = object.__new__(EmissionCalculator)

    inputs = calculator._build_calc_inputs(
        method=CalculationMethod.SPEND_BASIS,
        row_data=row_data,
        converted_quantity=1000,
        input_unit="INR",
        formula_doc={"definition": {"inputs": [{"variable": "spent_value"}]}},
        ef_data={},
        currency_conversion={},
        currency_method=resolve_bulk_currency_method(row_data),
    )

    assert inputs["ppp"] == {"value": 24.5, "unit": "", "is_override": True}
    assert inputs["inflation_rate"] == {"value": 1.08, "unit": "", "is_override": True}


def test_row_overrides_take_priority_over_explicit_standard_selection():
    row_data = {
        "spent_amount": 1000,
        "spend_currency_conversion_method": "standard",
        "ppp": 24.5,
    }
    assert resolve_bulk_currency_method(row_data) == PPP_INFLATION_METHOD


def test_spent_amount_header_accepts_current_and_legacy_template_labels():
    c1_spent_amount_column = next(
        column for column in CATEGORY_COLUMNS["C1"]["columns"] if column["key"] == "spent_amount"
    )

    assert c1_spent_amount_column["name"] == "Spent Amount"
    assert "Spent Amount (INR)" in c1_spent_amount_column["aliases"]


def test_standard_currency_conversion_column_is_numeric_exchange_rate():
    columns = CATEGORY_COLUMNS["C1"]["columns"]
    standard_conversion = next(
        column for column in columns if column["name"] == "Standard Currency Conversion"
    )

    assert standard_conversion["key"] == "exchange_rate"
    assert standard_conversion["type"] == "number"
    assert "Exchange Rate (Override)" in standard_conversion["aliases"]
    assert not any(column["name"] == "Exchange Rate (Override)" for column in columns)