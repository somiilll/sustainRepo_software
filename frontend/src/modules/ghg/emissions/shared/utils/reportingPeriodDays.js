const ANNUAL_DAY_COUNT_FIELDS = new Set([
  'working_days',
  'qty_days_travelled',
  'no_of_days',
]);

const MONTH_NUMBERS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

export const isLeapYear = (year) => {
  const numericYear = Number.parseInt(year, 10);
  if (!Number.isFinite(numericYear)) return false;
  return (numericYear % 4 === 0 && numericYear % 100 !== 0) || numericYear % 400 === 0;
};

export const getAnnualReportingPeriodDayLimit = (
  reportingYear,
  reportingYearType = 'calendar',
) => {
  const startYear = Number.parseInt(reportingYear, 10);
  if (!Number.isFinite(startYear)) return 366;
  const februaryYear = reportingYearType === 'financial' ? startYear + 1 : startYear;
  return isLeapYear(februaryYear) ? 366 : 365;
};

export const getReportingCalendarYearForMonth = (
  monthKey,
  reportingYear,
  reportingYearType = 'calendar',
) => {
  const startYear = Number.parseInt(reportingYear, 10);
  if (!Number.isFinite(startYear)) return null;
  const normalizedMonth = String(monthKey || '').trim().toLowerCase();
  const monthNumber = MONTH_NUMBERS[normalizedMonth] || Number.parseInt(normalizedMonth, 10);
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) return null;
  return reportingYearType === 'financial' && monthNumber <= 3 ? startYear + 1 : startYear;
};

export const getMonthlyReportingPeriodDayLimit = (
  monthKey,
  reportingYear,
  reportingYearType = 'calendar',
) => {
  const normalizedMonth = String(monthKey || '').trim().toLowerCase();
  const monthNumber = MONTH_NUMBERS[normalizedMonth] || Number.parseInt(normalizedMonth, 10);
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) return 31;
  const calendarYear = getReportingCalendarYearForMonth(
    monthKey,
    reportingYear,
    reportingYearType,
  );
  if (!calendarYear) return monthNumber === 2 ? 29 : new Date(Date.UTC(2001, monthNumber, 0)).getUTCDate();
  return new Date(Date.UTC(calendarYear, monthNumber, 0)).getUTCDate();
};

export const isAnnualDayCountField = (fieldOrVariable) => {
  if (fieldOrVariable && typeof fieldOrVariable === 'object') {
    const rules = fieldOrVariable.validationRules || fieldOrVariable.validation_rules || {};
    if (rules.annual_period_day_limit === true) return true;
  }
  const variable = typeof fieldOrVariable === 'string'
    ? fieldOrVariable
    : fieldOrVariable?.variable || fieldOrVariable?.fieldKey || fieldOrVariable?.key;
  return ANNUAL_DAY_COUNT_FIELDS.has(variable);
};