const ANNUAL_DAY_COUNT_FIELDS = new Set([
  'working_days',
  'qty_days_travelled',
  'no_of_days',
]);

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