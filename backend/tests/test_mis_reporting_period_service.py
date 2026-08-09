"""Deterministic unit coverage for MIS schedule period calculation."""
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from modules.mis_reports.reporting_period_service import ReportingPeriodService


def resolve(reporting_year_type, frequency, value):
    return ReportingPeriodService({"reporting_year_type": reporting_year_type, "financial_year_start_month": 4}, datetime.fromisoformat(value).replace(tzinfo=timezone.utc)).resolve(frequency)


def test_monthly_fy_august_current_previous_ytd_and_previous_year():
    result = resolve("financial_year", "monthly", "2026-08-31T09:00:00")
    assert result["reporting_period"]["start_date"] == "2026-08-01"
    assert result["comparison_period"]["start_date"] == "2026-07-01"
    assert result["previous_year_period"]["start_date"] == "2025-08-01"
    assert result["ytd_period"]["start_date"] == "2026-04-01"
    assert result["reporting_calendar"]["label"] == "FY 2026–27"


def test_monthly_calendar_year_august_ytd_starts_january():
    result = resolve("calendar_year", "monthly", "2026-08-31T09:00:00")
    assert result["ytd_period"]["start_date"] == "2026-01-01"
    assert result["reporting_calendar"]["label"] == "CY 2026"


def test_monthly_mid_period_uses_plain_business_month_label():
    result = resolve("financial_year", "monthly", "2026-08-10T09:00:00")
    assert result["reporting_period"]["end_date"] == "2026-08-10"
    assert result["reporting_period"]["is_partial"] is True
    assert result["reporting_period"]["label"] == "August 2026"
    assert "MTD" not in result["reporting_period"]["label"]


def test_weekly_monday_sunday_and_364_day_previous_year_mapping():
    result = resolve("financial_year", "weekly", "2026-08-09T09:00:00")
    assert result["reporting_period"]["start_date"] == "2026-08-03"
    assert result["reporting_period"]["end_date"] == "2026-08-09"
    assert result["comparison_period"]["start_date"] == "2026-07-27"
    assert result["previous_year_period"]["start_date"] == "2025-08-04"
    assert result["ytd_period"]["start_date"] == "2026-04-01"
    assert "364-day" in result["weekly_mapping"]


def test_quarterly_fy_q2_uses_april_start_calendar():
    result = resolve("financial_year", "quarterly", "2026-09-30T09:00:00")
    assert result["reporting_period"]["start_date"] == "2026-07-01"
    assert result["reporting_period"]["end_date"] == "2026-09-30"
    assert result["comparison_period"]["start_date"] == "2026-04-01"
    assert result["previous_year_period"]["start_date"] == "2025-07-01"
    assert result["ytd_period"]["start_date"] == "2026-04-01"
    assert result["reporting_period"]["label"] == "Q2 FY 2026–27"


def test_quarterly_calendar_year_q3_and_ytd():
    result = resolve("calendar_year", "quarterly", "2026-09-30T09:00:00")
    assert result["reporting_period"]["label"] == "Q3 CY 2026"
    assert result["comparison_period"]["label"] == "Q2 CY 2026"
    assert result["ytd_period"]["start_date"] == "2026-01-01"


def test_yearly_fy_rollover_is_complete_at_year_end():
    result = resolve("financial_year", "yearly", "2027-03-31T09:00:00")
    assert result["reporting_period"]["start_date"] == "2026-04-01"
    assert result["reporting_period"]["end_date"] == "2027-03-31"
    assert result["comparison_period"]["label"] == "FY 2025–26"
    assert result["reporting_period"]["is_partial"] is False


def test_leap_year_month_end_is_calculated_safely():
    result = resolve("calendar_year", "monthly", "2024-02-29T09:00:00")
    assert result["reporting_period"]["end_date"] == "2024-02-29"