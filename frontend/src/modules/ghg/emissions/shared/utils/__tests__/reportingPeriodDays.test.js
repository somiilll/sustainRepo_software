import {
  getAnnualReportingPeriodDayLimit,
  isAnnualDayCountField,
  isLeapYear,
} from '../reportingPeriodDays';

describe('annual reporting-period day limits', () => {
  it('recognizes Gregorian leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('uses the selected calendar year for annual limits', () => {
    expect(getAnnualReportingPeriodDayLimit('2023', 'calendar')).toBe(365);
    expect(getAnnualReportingPeriodDayLimit('2024', 'calendar')).toBe(366);
  });

  it('uses the ending year February for financial-year limits', () => {
    expect(getAnnualReportingPeriodDayLimit('2023', 'financial')).toBe(366);
    expect(getAnnualReportingPeriodDayLimit('2024', 'financial')).toBe(365);
  });

  it('recognizes all Scope 3 annual day-count variables', () => {
    expect(isAnnualDayCountField('working_days')).toBe(true);
    expect(isAnnualDayCountField('qty_days_travelled')).toBe(true);
    expect(isAnnualDayCountField('no_of_days')).toBe(true);
    expect(isAnnualDayCountField('number_of_nights')).toBe(false);
  });
});