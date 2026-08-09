"""Single source of truth for MIS schedule reporting periods and comparisons."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict

from dateutil.relativedelta import relativedelta


@dataclass(frozen=True)
class DateRange:
    start: date
    end: date
    label: str
    is_partial: bool = False

    def as_dict(self) -> Dict[str, Any]:
        return {"start_date": self.start.isoformat(), "end_date": self.end.isoformat(), "label": self.label, "is_partial": self.is_partial}


class ReportingPeriodService:
    """Resolve current, comparison, prior-year, and YTD periods consistently."""

    WEEK_DEFINITION = "Monday–Sunday; previous-year equivalent uses a 364-day (52-week) offset."

    def __init__(self, organization: Dict[str, Any] | None, execution_at: datetime | None = None):
        organization = organization or {}
        self.reporting_type = "CY" if organization.get("reporting_year_type") == "calendar_year" else "FY"
        # April is the confirmed current FY configuration; a stored value takes precedence for future organizations.
        self.fiscal_start_month = int(organization.get("financial_year_start_month") or 4)
        if not 1 <= self.fiscal_start_month <= 12:
            raise ValueError("financial_year_start_month must be between 1 and 12")
        self.execution_date = (execution_at or datetime.now(timezone.utc)).date()

    def calendar_range(self, anchor: date | None = None) -> tuple[date, date, str]:
        anchor = anchor or self.execution_date
        if self.reporting_type == "CY":
            return date(anchor.year, 1, 1), date(anchor.year, 12, 31), f"CY {anchor.year}"
        start_year = anchor.year if anchor.month >= self.fiscal_start_month else anchor.year - 1
        start = date(start_year, self.fiscal_start_month, 1)
        end = start + relativedelta(years=1) - timedelta(days=1)
        return start, end, f"FY {start_year}–{str(end.year)[-2:]}"

    @staticmethod
    def _month_range(anchor: date) -> tuple[date, date]:
        start = anchor.replace(day=1)
        return start, start + relativedelta(months=1) - timedelta(days=1)

    def _monthly(self) -> tuple[DateRange, DateRange, DateRange, DateRange, str]:
        start, nominal_end = self._month_range(self.execution_date)
        current = DateRange(start, min(nominal_end, self.execution_date), self.execution_date.strftime("%B %Y"), self.execution_date < nominal_end)
        previous_start, previous_end = self._month_range(start - timedelta(days=1))
        prior_start, prior_end = self._month_range(start - relativedelta(years=1))
        ytd_start, _, calendar_label = self.calendar_range(self.execution_date)
        return current, DateRange(previous_start, previous_end, previous_start.strftime("%B %Y")), DateRange(prior_start, prior_end, prior_start.strftime("%B %Y")), DateRange(ytd_start, current.end, calendar_label), calendar_label

    def _weekly(self) -> tuple[DateRange, DateRange, DateRange, DateRange, str]:
        start = self.execution_date - timedelta(days=self.execution_date.weekday())
        nominal_end = start + timedelta(days=6)
        current_end = min(nominal_end, self.execution_date)
        current = DateRange(start, current_end, f"{start.strftime('%d %b')} – {current_end.strftime('%d %b %Y')}" + (" — Week to Date" if current_end < nominal_end else ""), current_end < nominal_end)
        previous_start = start - timedelta(days=7)
        previous = DateRange(previous_start, previous_start + timedelta(days=6), f"{previous_start.strftime('%d %b')} – {(previous_start + timedelta(days=6)).strftime('%d %b %Y')}")
        prior_start = start - timedelta(days=364)
        prior_year = DateRange(prior_start, prior_start + (current_end - start), f"{prior_start.strftime('%d %b')} – {(prior_start + (current_end - start)).strftime('%d %b %Y')}")
        ytd_start, _, calendar_label = self.calendar_range(self.execution_date)
        return current, previous, prior_year, DateRange(ytd_start, current_end, f"{calendar_label} YTD"), calendar_label

    def _daily(self) -> tuple[DateRange, DateRange, DateRange, DateRange, str]:
        current = DateRange(self.execution_date, self.execution_date, self.execution_date.strftime("%d %b %Y"))
        previous_date = self.execution_date - timedelta(days=1)
        previous = DateRange(previous_date, previous_date, previous_date.strftime("%d %b %Y"))
        prior_date = self.execution_date - relativedelta(years=1)
        prior_year = DateRange(prior_date, prior_date, prior_date.strftime("%d %b %Y"))
        ytd_start, _, calendar_label = self.calendar_range(self.execution_date)
        return current, previous, prior_year, DateRange(ytd_start, self.execution_date, f"{calendar_label} YTD"), calendar_label

    def _quarterly(self) -> tuple[DateRange, DateRange, DateRange, DateRange, str]:
        calendar_start, _, calendar_label = self.calendar_range(self.execution_date)
        months_since_start = (self.execution_date.year - calendar_start.year) * 12 + self.execution_date.month - calendar_start.month
        quarter_index = months_since_start // 3
        start = calendar_start + relativedelta(months=quarter_index * 3)
        nominal_end = start + relativedelta(months=3) - timedelta(days=1)
        current_end = min(nominal_end, self.execution_date)
        quarter_label = f"Q{quarter_index + 1} {calendar_label}" + (" — Quarter to Date" if current_end < nominal_end else "")
        current = DateRange(start, current_end, quarter_label, current_end < nominal_end)
        previous_end = start - timedelta(days=1)
        previous_start = start - relativedelta(months=3)
        prior_start = start - relativedelta(years=1)
        prior_end = nominal_end - relativedelta(years=1)
        prior_calendar_label = self.calendar_range(prior_start)[2]
        return current, DateRange(previous_start, previous_end, f"Q{4 if quarter_index == 0 else quarter_index} {self.calendar_range(previous_start)[2]}"), DateRange(prior_start, prior_end, f"Q{quarter_index + 1} {prior_calendar_label}"), DateRange(calendar_start, current_end, f"{calendar_label} YTD"), calendar_label

    def _yearly(self) -> tuple[DateRange, DateRange, DateRange, DateRange, str]:
        start, nominal_end, calendar_label = self.calendar_range(self.execution_date)
        current_end = min(nominal_end, self.execution_date)
        current = DateRange(start, current_end, calendar_label + (" — Year to Date" if current_end < nominal_end else ""), current_end < nominal_end)
        previous_start, previous_end, previous_label = self.calendar_range(start - timedelta(days=1))
        return current, DateRange(previous_start, previous_end, previous_label), DateRange(previous_start, previous_end, previous_label), DateRange(start, current_end, f"{calendar_label} YTD"), calendar_label

    def resolve(self, frequency: str) -> Dict[str, Any]:
        calculators = {"daily": self._daily, "weekly": self._weekly, "monthly": self._monthly, "quarterly": self._quarterly, "yearly": self._yearly}
        if frequency not in calculators:
            raise ValueError(f"MIS frequency '{frequency}' is not supported for period reporting")
        current, previous, previous_year, ytd, calendar_label = calculators[frequency]()
        previous_ytd = DateRange(ytd.start - relativedelta(years=1), ytd.end - relativedelta(years=1), f"Previous {calendar_label.split()[0]} YTD")
        return {
            "frequency": frequency,
            "reporting_calendar": {"type": self.reporting_type, "label": calendar_label, "financial_year_start_month": self.fiscal_start_month if self.reporting_type == "FY" else None},
            "reporting_period": current.as_dict(), "comparison_period": previous.as_dict(), "previous_year_period": previous_year.as_dict(), "ytd_period": ytd.as_dict(), "previous_ytd_period": previous_ytd.as_dict(),
            "weekly_mapping": self.WEEK_DEFINITION if frequency == "weekly" else None,
        }

    @staticmethod
    def filters_for(base_filters: Dict[str, Any], period: Dict[str, Any], frequency: str) -> Dict[str, Any]:
        result = {**base_filters, "reporting_period_start": period["start_date"][:7], "reporting_period_end": period["end_date"][:7], "period_frequency": frequency, "period_start_date": period["start_date"], "period_end_date": period["end_date"], "strict_period": True}
        return result