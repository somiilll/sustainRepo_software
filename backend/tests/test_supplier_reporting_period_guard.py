import pytest

from modules.supplier_assessment.ghg_submission_service import (
    describe_reporting_period,
    reporting_period_values,
    supplier_emission_period_allowed,
    supplier_period_error,
)


def test_financial_year_assignment_resolves_april_through_march():
    assignment = describe_reporting_period("FY 2025-26")

    assert assignment["reporting_year_type"] == "financial"
    assert assignment["reporting_year"] == "2025"
    assert assignment["reporting_period"] == "FY 2025-26"
    assert assignment["allowed_months"] == [
        "2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09",
        "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
    ]


def test_financial_year_restricts_monthly_and_yearly_values():
    assigned = "FY 2025-26"

    assert supplier_emission_period_allowed("2025-04", "monthly", assigned)
    assert supplier_emission_period_allowed("2026-03", "monthly", assigned)
    assert not supplier_emission_period_allowed("2025-03", "monthly", assigned)
    assert not supplier_emission_period_allowed("2026-04", "monthly", assigned)
    assert supplier_emission_period_allowed("FY 2025-26", "yearly", assigned)
    assert not supplier_emission_period_allowed("CY2026", "yearly", assigned)
    assert not supplier_emission_period_allowed("2026-01", "yearly", assigned)


def test_calendar_year_assignment_resolves_all_twelve_months():
    assignment = describe_reporting_period("CY 2026")

    assert assignment["reporting_year_type"] == "calendar"
    assert assignment["reporting_year"] == "2026"
    assert assignment["reporting_period"] == "CY2026"
    assert assignment["allowed_months"][0] == "2026-01"
    assert assignment["allowed_months"][-1] == "2026-12"
    assert supplier_emission_period_allowed("2026-08", "monthly", "CY 2026")
    assert supplier_emission_period_allowed("CY2026", "yearly", "CY 2026")
    assert not supplier_emission_period_allowed("2027-01", "monthly", "CY 2026")


def test_period_values_include_annual_label_for_submission_queries():
    values = reporting_period_values("FY 2025-26")

    assert values[0] == "FY 2025-26"
    assert len(values) == 13


@pytest.mark.parametrize("frequency", ["monthly", "yearly"])
def test_period_error_names_the_assigned_period(frequency):
    assert "FY 2025-26" in supplier_period_error("FY 2025-26", frequency)