/**
 * Reporting Year Utilities
 * 
 * Shared utilities for handling Financial Year (FY) and Calendar Year (CY) formats.
 * Used across ESG Questionnaire, Facility Production, and table renderers.
 */

// Month configurations
export const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
export const CY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const FY_MONTHS_FULL = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
export const CY_MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Get the current reporting year based on year type
 * @param {string} yearType - 'financial_year' or 'calendar_year'
 * @returns {string} Current year in appropriate format
 */
export const getCurrentReportingYear = (yearType = 'financial_year') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  if (yearType === 'calendar_year') {
    return `CY ${currentYear}`;
  } else {
    // Financial year: Apr-Mar
    // If current month is Jan-Mar (0-2), we're in FY that started previous year
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    return `FY ${fyStartYear}-${fyStartYear + 1}`;
  }
};

/**
 * Generate list of reporting years
 * @param {string} yearType - 'financial_year' or 'calendar_year'
 * @param {number} count - Number of years to generate (default 5)
 * @returns {string[]} Array of year strings
 */
export const generateReportingYears = (yearType = 'financial_year', count = 5) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const years = [];
  
  if (yearType === 'calendar_year') {
    for (let i = 0; i < count; i++) {
      years.push(`CY ${currentYear - i}`);
    }
  } else {
    // Financial year
    const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
    for (let i = 0; i < count; i++) {
      const startYear = fyStartYear - i;
      years.push(`FY ${startYear}-${startYear + 1}`);
    }
  }
  
  return years;
};

/**
 * Parse a reporting year string to get start/end years
 * @param {string} reportingYear - Year string like "FY 2025-2026" or "CY 2025"
 * @returns {{ yearType: string, startYear: number, endYear: number }}
 */
export const parseReportingYear = (reportingYear) => {
  if (!reportingYear) return null;
  
  // Handle CY format: "CY 2025"
  const cyMatch = reportingYear.match(/CY\s*(\d{4})/);
  if (cyMatch) {
    const year = parseInt(cyMatch[1]);
    return { yearType: 'calendar_year', startYear: year, endYear: year };
  }
  
  // Handle FY format: "FY 2025-2026"
  const fyMatch = reportingYear.match(/FY\s*(\d{4})-(\d{4})/);
  if (fyMatch) {
    return { 
      yearType: 'financial_year', 
      startYear: parseInt(fyMatch[1]), 
      endYear: parseInt(fyMatch[2]) 
    };
  }
  
  // Handle legacy FY format: "2025-26"
  const legacyFyMatch = reportingYear.match(/^(\d{4})-(\d{2})$/);
  if (legacyFyMatch) {
    const startYear = parseInt(legacyFyMatch[1]);
    return { 
      yearType: 'financial_year', 
      startYear, 
      endYear: startYear + 1 
    };
  }
  
  return null;
};

/**
 * Get previous reporting year
 * @param {string} reportingYear - Current year string
 * @returns {string} Previous year in same format
 */
export const getPreviousReportingYear = (reportingYear) => {
  const parsed = parseReportingYear(reportingYear);
  if (!parsed) return reportingYear;
  
  if (parsed.yearType === 'calendar_year') {
    return `CY ${parsed.startYear - 1}`;
  } else {
    return `FY ${parsed.startYear - 1}-${parsed.startYear}`;
  }
};

/**
 * Get next reporting year
 * @param {string} reportingYear - Current year string
 * @returns {string} Next year in same format
 */
export const getNextReportingYear = (reportingYear) => {
  const parsed = parseReportingYear(reportingYear);
  if (!parsed) return reportingYear;
  
  if (parsed.yearType === 'calendar_year') {
    return `CY ${parsed.startYear + 1}`;
  } else {
    return `FY ${parsed.startYear + 1}-${parsed.startYear + 2}`;
  }
};

/**
 * Get FY labels for table columns (current and previous year)
 * @param {string} reportingYear - Year string
 * @returns {{ current: string, previous: string }}
 */
export const getYearLabels = (reportingYear) => {
  const parsed = parseReportingYear(reportingYear);
  if (!parsed) {
    return { current: 'Current Year', previous: 'Previous Year' };
  }
  
  if (parsed.yearType === 'calendar_year') {
    return {
      current: `CY ${parsed.startYear}`,
      previous: `CY ${parsed.startYear - 1}`
    };
  } else {
    return {
      current: `FY ${parsed.startYear}-${parsed.startYear + 1}`,
      previous: `FY ${parsed.startYear - 1}-${parsed.startYear}`
    };
  }
};

/**
 * Get months array based on year type
 * @param {string} yearType - 'financial_year' or 'calendar_year'
 * @param {boolean} full - Use full month names
 * @returns {string[]} Array of month names
 */
export const getMonthsForYearType = (yearType = 'financial_year', full = false) => {
  if (yearType === 'calendar_year') {
    return full ? CY_MONTHS_FULL : CY_MONTHS;
  }
  return full ? FY_MONTHS_FULL : FY_MONTHS;
};

/**
 * Get the calendar year for a month in a reporting year
 * For FY: Apr-Dec = startYear, Jan-Mar = startYear + 1
 * For CY: All months = startYear
 * @param {string} monthKey - Month abbreviation (Jan, Feb, etc.)
 * @param {string} reportingYear - Year string
 * @returns {number} Calendar year for the month
 */
export const getMonthCalendarYear = (monthKey, reportingYear) => {
  const parsed = parseReportingYear(reportingYear);
  if (!parsed) return new Date().getFullYear();
  
  if (parsed.yearType === 'calendar_year') {
    return parsed.startYear;
  }
  
  // Financial year: Jan-Mar belong to next calendar year
  const fyJanMarMonths = ['Jan', 'Feb', 'Mar', 'January', 'February', 'March'];
  if (fyJanMarMonths.includes(monthKey)) {
    return parsed.startYear + 1;
  }
  return parsed.startYear;
};

/**
 * Check if a month is in the future
 * @param {string} monthKey - Month abbreviation
 * @param {string} reportingYear - Year string
 * @returns {boolean}
 */
export const isFutureMonth = (monthKey, reportingYear) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  
  const monthCalendarYear = getMonthCalendarYear(monthKey, reportingYear);
  
  // Map month key to 0-11 index
  const monthMap = {
    'Jan': 0, 'January': 0,
    'Feb': 1, 'February': 1,
    'Mar': 2, 'March': 2,
    'Apr': 3, 'April': 3,
    'May': 4,
    'Jun': 5, 'June': 5,
    'Jul': 6, 'July': 6,
    'Aug': 7, 'August': 7,
    'Sep': 8, 'September': 8,
    'Oct': 9, 'October': 9,
    'Nov': 10, 'November': 10,
    'Dec': 11, 'December': 11,
  };
  
  const monthIndex = monthMap[monthKey];
  if (monthIndex === undefined) return false;
  
  if (monthCalendarYear > currentYear) return true;
  if (monthCalendarYear < currentYear) return false;
  return monthIndex > currentMonth;
};

/**
 * Determine effective year type for a component
 * BRSR framework forces FY unless explicitly enabled for CY
 * @param {string} orgYearType - Organization's reporting_year_type setting
 * @param {string} framework - Framework name (e.g., 'BRSR', 'GRI')
 * @param {boolean} allowBrsrCalendarYear - Future flag to enable CY for BRSR
 * @returns {string} Effective year type to use
 */
export const getEffectiveYearType = (orgYearType, framework = null, allowBrsrCalendarYear = false) => {
  // BRSR is India-specific and requires FY (unless future flag enables CY)
  if (framework === 'BRSR' && !allowBrsrCalendarYear) {
    return 'financial_year';
  }
  
  return orgYearType || 'financial_year';
};

/**
 * Format a year for display based on year type
 * @param {number} year - The year number
 * @param {string} yearType - 'financial_year' or 'calendar_year'
 * @returns {string} Formatted year string
 */
export const formatYear = (year, yearType = 'financial_year') => {
  if (yearType === 'calendar_year') {
    return `CY ${year}`;
  }
  return `FY ${year}-${year + 1}`;
};

/**
 * Get FY labels for table columns (current and previous year) based on year type
 * This is used by table renderers to dynamically label FY columns
 * @param {Object} options - Options object
 * @param {string} options.reportingYear - The reporting year string (e.g., "FY 2025-2026" or "CY 2025")
 * @param {string} options.yearType - 'financial_year' or 'calendar_year'
 * @param {string} options.framework - Optional framework name (e.g., 'BRSR')
 * @returns {{ current: string, previous: string, yearType: string }}
 */
export const getYearLabelsForTable = ({ reportingYear, yearType = 'financial_year', framework = null } = {}) => {
  // Determine effective year type (BRSR forces FY)
  const effectiveYearType = getEffectiveYearType(yearType, framework);
  
  // If no reporting year provided, generate current based on effective year type
  if (!reportingYear) {
    const current = getCurrentReportingYear(effectiveYearType);
    const previous = getPreviousReportingYear(current);
    return { current, previous, yearType: effectiveYearType };
  }
  
  // Parse the provided reporting year
  const parsed = parseReportingYear(reportingYear);
  if (!parsed) {
    return { 
      current: 'Current Year', 
      previous: 'Previous Year',
      yearType: effectiveYearType
    };
  }
  
  // Generate labels based on parsed year
  if (parsed.yearType === 'calendar_year') {
    return {
      current: `CY ${parsed.startYear}`,
      previous: `CY ${parsed.startYear - 1}`,
      yearType: 'calendar_year'
    };
  }
  
  return {
    current: `FY ${parsed.startYear}-${parsed.startYear + 1}`,
    previous: `FY ${parsed.startYear - 1}-${parsed.startYear}`,
    yearType: 'financial_year'
  };
};

/**
 * Convert legacy FY format to new format
 * e.g., "2025-26" -> "FY 2025-2026"
 * @param {string} legacyYear - Legacy format year string
 * @returns {string} New format year string
 */
export const convertLegacyYearFormat = (legacyYear) => {
  if (!legacyYear) return null;
  
  // Already in new format
  if (legacyYear.startsWith('FY ') || legacyYear.startsWith('CY ')) {
    return legacyYear;
  }
  
  // Legacy format: "2025-26"
  const match = legacyYear.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const startYear = parseInt(match[1]);
    return `FY ${startYear}-${startYear + 1}`;
  }
  
  return legacyYear;
};

/**
 * Generate FY options for dropdown selects
 * @param {string} yearType - 'financial_year' or 'calendar_year'
 * @param {number} count - Number of years to generate
 * @param {string} format - 'display' for full format, 'legacy' for short format (deprecated)
 * @returns {Array<{value: string, label: string}>}
 */
export const generateYearOptions = (yearType = 'financial_year', count = 5, format = 'display') => {
  const years = generateReportingYears(yearType, count);
  
  return years.map(year => ({
    value: year,
    label: year
  }));
};

/**
 * Get month data structure for a reporting year
 * Used by FacilityProductionSection and similar components for monthly data entry
 * @param {string} yearType - 'financial_year' or 'calendar_year'
 * @param {string} reportingYear - The reporting year string
 * @returns {Array<{key: string, label: string, calendarYear: number}>}
 */
export const getMonthsWithCalendarYears = (yearType = 'financial_year', reportingYear = null) => {
  const months = getMonthsForYearType(yearType);
  const parsed = reportingYear ? parseReportingYear(reportingYear) : null;
  const baseYear = parsed?.startYear || new Date().getFullYear();
  
  return months.map(month => ({
    key: month,
    label: month,
    calendarYear: getMonthCalendarYear(month, reportingYear || getCurrentReportingYear(yearType))
  }));
};

/**
 * Replace year placeholders in column labels
 * Converts "Current FY" or "Previous FY" to actual year strings like "FY 2025-2026"
 * @param {string} label - The column label
 * @param {{ current: string, previous: string }} yearLabels - Year labels object
 * @returns {string} Label with actual years
 */
export const replaceYearPlaceholders = (label, yearLabels) => {
  if (!label || !yearLabels) return label;
  
  let result = label;
  
  // Replace current year placeholders
  result = result.replace(/Current FY|current FY|Current Year|current year/gi, yearLabels.current);
  
  // Replace previous year placeholders
  result = result.replace(/Previous FY|previous FY|Previous Year|previous year/gi, yearLabels.previous);
  
  return result;
};
