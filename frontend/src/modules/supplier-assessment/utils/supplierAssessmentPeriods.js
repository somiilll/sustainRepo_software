export const isFutureSupplierAssessmentPeriod = (period, defaultPeriod, reportingYearType) => {
  const yearMatch = String(period || '').match(/(?:FY|CY)\s*(\d{4})/i);
  const defaultYearMatch = String(defaultPeriod || '').match(/(?:FY|CY)\s*(\d{4})/i);
  if (!yearMatch || !defaultYearMatch) return false;
  if (reportingYearType === 'calendar_year' && !String(period).startsWith('CY')) return false;
  if (reportingYearType !== 'calendar_year' && !String(period).startsWith('FY')) return false;
  return Number(yearMatch[1]) > Number(defaultYearMatch[1]);
};