/**
 * Date/Time Formatting Utility
 * 
 * Centralized date/time formatting using organization timezone.
 * All date/time displays throughout the application should use these functions.
 * 
 * USAGE:
 * import { formatDateTime, formatDate, formatTime, formatRelativeTime } from '../utils/dateTimeUtils';
 * 
 * // In component with OrganizationContext:
 * const { timezone } = useOrganization();
 * formatDateTime(timestamp, timezone);
 * 
 * // Or use the hook for convenience:
 * import { useDateFormatter } from '../hooks/useDateFormatter';
 * const { formatDateTime, formatDate } = useDateFormatter();
 */

// Default display format options
const DEFAULT_DATETIME_OPTIONS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

const DEFAULT_DATE_OPTIONS = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const DEFAULT_TIME_OPTIONS = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

const DEFAULT_DATE_LONG_OPTIONS = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

const DEFAULT_DATE_SHORT_OPTIONS = {
  month: 'short',
  day: 'numeric',
};

// Default locale - using 'en-GB' for consistent DD MMM YYYY format
// This provides a consistent format across all users regardless of browser settings
const DEFAULT_LOCALE = 'en-GB';

/**
 * Format a timestamp as a full date and time string
 * 
 * @param {string|Date|number} timestamp - UTC timestamp (ISO string, Date object, or Unix timestamp)
 * @param {string} timezone - IANA timezone string (e.g., 'Asia/Kolkata', 'America/New_York')
 * @param {object} options - Optional Intl.DateTimeFormat options to override defaults
 * @returns {string} Formatted date/time string (e.g., "15 Dec 2025, 02:30 PM")
 */
export const formatDateTime = (timestamp, timezone = 'UTC', options = {}) => {
  if (!timestamp) return '-';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    
    const formatOptions = {
      ...DEFAULT_DATETIME_OPTIONS,
      ...options,
      timeZone: timezone,
    };
    
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, formatOptions).format(date);
  } catch (error) {
    console.warn('formatDateTime error:', error);
    return '-';
  }
};

/**
 * Format a timestamp as a date-only string
 * 
 * @param {string|Date|number} timestamp - UTC timestamp
 * @param {string} timezone - IANA timezone string
 * @param {object} options - Optional Intl.DateTimeFormat options
 * @returns {string} Formatted date string (e.g., "15 Dec 2025")
 */
export const formatDate = (timestamp, timezone = 'UTC', options = {}) => {
  if (!timestamp) return '-';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    
    const formatOptions = {
      ...DEFAULT_DATE_OPTIONS,
      ...options,
      timeZone: timezone,
    };
    
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, formatOptions).format(date);
  } catch (error) {
    console.warn('formatDate error:', error);
    return '-';
  }
};

/**
 * Format a timestamp as a time-only string
 * 
 * @param {string|Date|number} timestamp - UTC timestamp
 * @param {string} timezone - IANA timezone string
 * @param {object} options - Optional Intl.DateTimeFormat options
 * @returns {string} Formatted time string (e.g., "02:30 PM")
 */
export const formatTime = (timestamp, timezone = 'UTC', options = {}) => {
  if (!timestamp) return '-';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    
    const formatOptions = {
      ...DEFAULT_TIME_OPTIONS,
      ...options,
      timeZone: timezone,
    };
    
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, formatOptions).format(date);
  } catch (error) {
    console.warn('formatTime error:', error);
    return '-';
  }
};

/**
 * Format a timestamp as a long date string (with weekday)
 * 
 * @param {string|Date|number} timestamp - UTC timestamp
 * @param {string} timezone - IANA timezone string
 * @returns {string} Formatted long date (e.g., "Monday, 15 December 2025")
 */
export const formatDateLong = (timestamp, timezone = 'UTC') => {
  if (!timestamp) return '-';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      ...DEFAULT_DATE_LONG_OPTIONS,
      timeZone: timezone,
    }).format(date);
  } catch (error) {
    console.warn('formatDateLong error:', error);
    return '-';
  }
};

/**
 * Format a timestamp as a short date string
 * 
 * @param {string|Date|number} timestamp - UTC timestamp
 * @param {string} timezone - IANA timezone string
 * @returns {string} Formatted short date (e.g., "Dec 15")
 */
export const formatDateShort = (timestamp, timezone = 'UTC') => {
  if (!timestamp) return '-';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      ...DEFAULT_DATE_SHORT_OPTIONS,
      timeZone: timezone,
    }).format(date);
  } catch (error) {
    console.warn('formatDateShort error:', error);
    return '-';
  }
};

/**
 * Format a timestamp as a relative time string (e.g., "2 hours ago", "in 3 days")
 * 
 * @param {string|Date|number} timestamp - UTC timestamp
 * @returns {string} Relative time string
 */
export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '-';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffSecs = Math.round(diffMs / 1000);
    const diffMins = Math.round(diffSecs / 60);
    const diffHours = Math.round(diffMins / 60);
    const diffDays = Math.round(diffHours / 24);
    const diffWeeks = Math.round(diffDays / 7);
    const diffMonths = Math.round(diffDays / 30);
    const diffYears = Math.round(diffDays / 365);
    
    const rtf = new Intl.RelativeTimeFormat(DEFAULT_LOCALE, { numeric: 'auto' });
    
    if (Math.abs(diffSecs) < 60) {
      return rtf.format(diffSecs, 'second');
    } else if (Math.abs(diffMins) < 60) {
      return rtf.format(diffMins, 'minute');
    } else if (Math.abs(diffHours) < 24) {
      return rtf.format(diffHours, 'hour');
    } else if (Math.abs(diffDays) < 7) {
      return rtf.format(diffDays, 'day');
    } else if (Math.abs(diffWeeks) < 4) {
      return rtf.format(diffWeeks, 'week');
    } else if (Math.abs(diffMonths) < 12) {
      return rtf.format(diffMonths, 'month');
    } else {
      return rtf.format(diffYears, 'year');
    }
  } catch (error) {
    console.warn('formatRelativeTime error:', error);
    return '-';
  }
};

/**
 * Format a timestamp for display in forms/inputs (ISO format)
 * 
 * @param {string|Date|number} timestamp - UTC timestamp
 * @param {string} timezone - IANA timezone string
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
export const formatDateForInput = (timestamp, timezone = 'UTC') => {
  if (!timestamp) return '';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    
    // Get parts in the target timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).formatToParts(date);
    
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.warn('formatDateForInput error:', error);
    return '';
  }
};

/**
 * Format a number with locale-appropriate separators
 * 
 * @param {number} value - Number to format
 * @param {object} options - Optional Intl.NumberFormat options
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, options = {}) => {
  if (value == null || isNaN(value)) return '-';
  
  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, options).format(value);
  } catch (error) {
    console.warn('formatNumber error:', error);
    return String(value);
  }
};

/**
 * Format currency with proper symbol and separators
 * 
 * @param {number} value - Amount to format
 * @param {string} currency - Currency code (e.g., 'INR', 'USD')
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, currency = 'INR') => {
  if (value == null || isNaN(value)) return '-';
  
  try {
    return new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    console.warn('formatCurrency error:', error);
    return String(value);
  }
};

/**
 * Get timezone abbreviation for display
 * 
 * @param {string} timezone - IANA timezone string
 * @returns {string} Timezone abbreviation (e.g., "IST", "EST")
 */
export const getTimezoneAbbreviation = (timezone = 'UTC') => {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(now);
    
    return parts.find(p => p.type === 'timeZoneName')?.value || timezone;
  } catch (error) {
    return timezone;
  }
};

/**
 * Parse a date string in the organization's timezone and return a UTC Date
 * 
 * @param {string} dateStr - Date string (YYYY-MM-DD or similar)
 * @param {string} timezone - IANA timezone string
 * @returns {Date} UTC Date object
 */
export const parseLocalDate = (dateStr, timezone = 'UTC') => {
  if (!dateStr) return null;
  
  try {
    // For simple YYYY-MM-DD format, parse manually to avoid timezone issues
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      const [, year, month, day] = match;
      // Create a date string with timezone info
      const dateWithTz = new Date(`${year}-${month}-${day}T12:00:00`);
      return dateWithTz;
    }
    
    return new Date(dateStr);
  } catch (error) {
    console.warn('parseLocalDate error:', error);
    return null;
  }
};

// Export default locale for reference
export const DATE_LOCALE = DEFAULT_LOCALE;
