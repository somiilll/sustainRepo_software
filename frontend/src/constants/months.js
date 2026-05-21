/**
 * Month Constants
 * Centralized month definitions for calendar and financial year modes
 */

export const MONTHS = [
  { key: '01', name: 'January', short: 'Jan' },
  { key: '02', name: 'February', short: 'Feb' },
  { key: '03', name: 'March', short: 'Mar' },
  { key: '04', name: 'April', short: 'Apr' },
  { key: '05', name: 'May', short: 'May' },
  { key: '06', name: 'June', short: 'Jun' },
  { key: '07', name: 'July', short: 'Jul' },
  { key: '08', name: 'August', short: 'Aug' },
  { key: '09', name: 'September', short: 'Sep' },
  { key: '10', name: 'October', short: 'Oct' },
  { key: '11', name: 'November', short: 'Nov' },
  { key: '12', name: 'December', short: 'Dec' }
];

// Calendar year months (Jan-Dec)
export const CALENDAR_YEAR_MONTHS = MONTHS;

// Financial year months (Apr-Mar)
export const FINANCIAL_YEAR_MONTHS = [
  { key: '04', name: 'April', short: 'Apr' },
  { key: '05', name: 'May', short: 'May' },
  { key: '06', name: 'June', short: 'Jun' },
  { key: '07', name: 'July', short: 'Jul' },
  { key: '08', name: 'August', short: 'Aug' },
  { key: '09', name: 'September', short: 'Sep' },
  { key: '10', name: 'October', short: 'Oct' },
  { key: '11', name: 'November', short: 'Nov' },
  { key: '12', name: 'December', short: 'Dec' },
  { key: '01', name: 'January', short: 'Jan' },
  { key: '02', name: 'February', short: 'Feb' },
  { key: '03', name: 'March', short: 'Mar' }
];

/**
 * Get months array based on year type
 * @param {string} yearType - 'calendar' or 'financial'
 * @returns {Array} Month objects
 */
export const getMonthsByYearType = (yearType) => {
  return yearType === 'financial' ? FINANCIAL_YEAR_MONTHS : CALENDAR_YEAR_MONTHS;
};

/**
 * Get month name by key
 * @param {string} key - Month key (01-12)
 * @param {boolean} short - Use short name
 * @returns {string} Month name
 */
export const getMonthName = (key, short = false) => {
  const month = MONTHS.find(m => m.key === key);
  return month ? (short ? month.short : month.name) : '';
};

/**
 * Get month key by name
 * @param {string} name - Month name (full or short)
 * @returns {string} Month key (01-12)
 */
export const getMonthKey = (name) => {
  const lowerName = name?.toLowerCase();
  const month = MONTHS.find(m => 
    m.name.toLowerCase() === lowerName || 
    m.short.toLowerCase() === lowerName
  );
  return month?.key || '';
};

export default MONTHS;
