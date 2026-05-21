/**
 * Date Utilities
 * Centralized date/time helper functions
 */

/**
 * Check if a month/year combination is in the future
 * @param {string} monthKey - Month key (01-12)
 * @param {number|string} year - Year
 * @param {string} yearType - 'calendar' or 'financial'
 * @returns {boolean}
 */
export const isFutureMonth = (monthKey, year, yearType = 'calendar') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  
  let selectedYear = parseInt(year);
  const selectedMonth = parseInt(monthKey);
  
  // For financial year: Jan-Mar belong to next calendar year
  if (yearType === 'financial' && selectedMonth >= 1 && selectedMonth <= 3) {
    selectedYear = selectedYear + 1;
  }
  
  if (selectedYear > currentYear) return true;
  if (selectedYear === currentYear && selectedMonth > currentMonth) return true;
  return false;
};

/**
 * Get current reporting year based on year type
 * @param {string} yearType - 'calendar' or 'financial'
 * @returns {number}
 */
export const getCurrentReportingYear = (yearType = 'calendar') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  if (yearType === 'financial') {
    // Financial year starts in April
    // If current month is Jan-Mar, we're in the previous financial year
    return currentMonth < 4 ? currentYear - 1 : currentYear;
  }
  
  return currentYear;
};

/**
 * Get available years for selection (past 10 years)
 * @param {string} yearType - 'calendar' or 'financial'
 * @returns {Array<number>}
 */
export const getAvailableYears = (yearType = 'calendar') => {
  const currentYear = getCurrentReportingYear(yearType);
  const years = [];
  
  for (let i = 0; i < 10; i++) {
    years.push(currentYear - i);
  }
  
  return years;
};

/**
 * Format reporting period for display
 * @param {string} reportingPeriod - Period string (e.g., "2024-01", "FY2024-04")
 * @returns {string} Formatted display string
 */
export const formatReportingPeriod = (reportingPeriod) => {
  if (!reportingPeriod) return '';
  
  // Handle financial year format: FY2024-04
  if (reportingPeriod.startsWith('FY')) {
    const [fy, month] = reportingPeriod.split('-');
    const year = fy.replace('FY', '');
    return `${getMonthShortName(month)} FY${year}`;
  }
  
  // Handle calendar year format: 2024-01
  const [year, month] = reportingPeriod.split('-');
  return `${getMonthShortName(month)} ${year}`;
};

/**
 * Get short month name from key
 * @param {string} monthKey - Month key (01-12)
 * @returns {string}
 */
const getMonthShortName = (monthKey) => {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const index = parseInt(monthKey) - 1;
  return monthNames[index] || monthKey;
};

/**
 * Parse reporting period string
 * @param {string} reportingPeriod - Period string
 * @returns {Object} { year, month, yearType }
 */
export const parseReportingPeriod = (reportingPeriod) => {
  if (!reportingPeriod) return { year: null, month: null, yearType: 'calendar' };
  
  // Handle financial year format: FY2024-04
  if (reportingPeriod.startsWith('FY')) {
    const [fy, month] = reportingPeriod.split('-');
    return {
      year: parseInt(fy.replace('FY', '')),
      month,
      yearType: 'financial',
    };
  }
  
  // Handle calendar year format: 2024-01
  const [year, month] = reportingPeriod.split('-');
  return {
    year: parseInt(year),
    month,
    yearType: 'calendar',
  };
};

/**
 * Build reporting period string
 * @param {number|string} year - Year
 * @param {string} month - Month key (01-12)
 * @param {string} yearType - 'calendar' or 'financial'
 * @returns {string}
 */
export const buildReportingPeriod = (year, month, yearType = 'calendar') => {
  if (yearType === 'financial') {
    return `FY${year}-${month}`;
  }
  return `${year}-${month}`;
};

export default {
  isFutureMonth,
  getCurrentReportingYear,
  getAvailableYears,
  formatReportingPeriod,
  parseReportingPeriod,
  buildReportingPeriod,
};
