const periodContainsReportingValue = (period, reportingPeriod) => (
  (period.month_keys || []).includes(reportingPeriod)
  || (period.frequency === 'yearly' && period.reporting_year === reportingPeriod)
  || period.period_key === reportingPeriod
);

export const isEmissionInSubmittedSupplierPeriod = (emission, submissionPeriods = []) => {
  const reportingPeriod = emission?.reporting_period;
  if (!reportingPeriod) return false;
  return submissionPeriods.some((period) => (
    period.status === 'submitted' && periodContainsReportingValue(period, reportingPeriod)
  ));
};

export const resolveSubmittedSupplierEmissionIds = (emissions = [], submissionPeriods = []) => new Set(
  emissions
    .filter((emission) => isEmissionInSubmittedSupplierPeriod(emission, submissionPeriods))
    .map((emission) => emission.id)
);