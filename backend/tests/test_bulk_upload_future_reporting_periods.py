from datetime import datetime, timezone

from bulk_upload_scope3.validators.base_validator import BaseValidator


def _validator():
    return BaseValidator(db=None, organization_id="test-organization")


def test_future_reporting_month_is_rejected():
    now = datetime.now(timezone.utc)
    future_year = now.year + 1

    parsed, error = _validator().parse_reporting_month(f"{future_year}-01")

    assert parsed is None
    assert "cannot be in the future" in error


def test_current_reporting_month_is_accepted():
    now = datetime.now(timezone.utc)

    parsed, error = _validator().parse_reporting_month(now.strftime("%Y-%m"))

    assert parsed == now.strftime("%Y-%m")
    assert error is None


def test_future_calendar_and_financial_years_are_rejected():
    now = datetime.now(timezone.utc)
    future_year = now.year + 1
    current_fy_start_year = now.year if now.month >= 4 else now.year - 1

    calendar_period, calendar_type, calendar_error = _validator().parse_reporting_year(f"CY {future_year}")
    financial_period, financial_type, financial_error = _validator().parse_reporting_year(
        f"FY {current_fy_start_year + 1}-{current_fy_start_year + 2}"
    )

    assert (calendar_period, calendar_type) == (None, None)
    assert "cannot be in the future" in calendar_error
    assert (financial_period, financial_type) == (None, None)
    assert "cannot be in the future" in financial_error