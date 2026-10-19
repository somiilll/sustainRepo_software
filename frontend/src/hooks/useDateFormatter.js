import { useCallback } from 'react';
import { useOrganization } from '../contexts/OrganizationContext';
import {
  formatDateTime as formatDateTimeUtil,
  formatDate as formatDateUtil,
  formatTime as formatTimeUtil,
  formatDateLong as formatDateLongUtil,
  formatDateShort as formatDateShortUtil,
  formatRelativeTime as formatRelativeTimeUtil,
  formatDateForInput as formatDateForInputUtil,
  getTimezoneAbbreviation as getTimezoneAbbreviationUtil,
} from '../utils/dateTimeUtils';

/**
 * useDateFormatter - Hook for date/time formatting with organization timezone
 * 
 * This hook provides formatting functions that automatically use the
 * organization's configured timezone from OrganizationContext.
 * 
 * @returns {Object} Formatting functions bound to organization timezone
 * 
 * @example
 * const { formatDateTime, formatDate, formatTime, timezone } = useDateFormatter();
 * 
 * // In JSX:
 * <span>{formatDateTime(item.created_at)}</span>
 * <span>{formatDate(item.due_date)}</span>
 */
export const useDateFormatter = () => {
  const { timezone } = useOrganization();

  /**
   * Format timestamp as full date and time
   * @param {string|Date} timestamp - UTC timestamp
   * @param {object} options - Optional Intl.DateTimeFormat options
   * @returns {string} e.g., "15 Dec 2025, 02:30 PM"
   */
  const formatDateTime = useCallback((timestamp, options = {}) => {
    return formatDateTimeUtil(timestamp, timezone, options);
  }, [timezone]);

  /**
   * Format timestamp as date only
   * @param {string|Date} timestamp - UTC timestamp
   * @param {object} options - Optional Intl.DateTimeFormat options
   * @returns {string} e.g., "15 Dec 2025"
   */
  const formatDate = useCallback((timestamp, options = {}) => {
    return formatDateUtil(timestamp, timezone, options);
  }, [timezone]);

  /**
   * Format timestamp as time only
   * @param {string|Date} timestamp - UTC timestamp
   * @param {object} options - Optional Intl.DateTimeFormat options
   * @returns {string} e.g., "02:30 PM"
   */
  const formatTime = useCallback((timestamp, options = {}) => {
    return formatTimeUtil(timestamp, timezone, options);
  }, [timezone]);

  /**
   * Format timestamp as long date with weekday
   * @param {string|Date} timestamp - UTC timestamp
   * @returns {string} e.g., "Monday, 15 December 2025"
   */
  const formatDateLong = useCallback((timestamp) => {
    return formatDateLongUtil(timestamp, timezone);
  }, [timezone]);

  /**
   * Format timestamp as short date
   * @param {string|Date} timestamp - UTC timestamp
   * @returns {string} e.g., "Dec 15"
   */
  const formatDateShort = useCallback((timestamp) => {
    return formatDateShortUtil(timestamp, timezone);
  }, [timezone]);

  /**
   * Format timestamp as relative time (doesn't use timezone)
   * @param {string|Date} timestamp - UTC timestamp
   * @returns {string} e.g., "2 hours ago"
   */
  const formatRelativeTime = useCallback((timestamp) => {
    return formatRelativeTimeUtil(timestamp);
  }, []);

  /**
   * Format date for input fields (YYYY-MM-DD)
   * @param {string|Date} timestamp - UTC timestamp
   * @returns {string} e.g., "2025-12-15"
   */
  const formatDateForInput = useCallback((timestamp) => {
    return formatDateForInputUtil(timestamp, timezone);
  }, [timezone]);

  /**
   * Get timezone abbreviation
   * @returns {string} e.g., "IST", "EST"
   */
  const getTimezoneAbbreviation = useCallback(() => {
    return getTimezoneAbbreviationUtil(timezone);
  }, [timezone]);

  return {
    formatDateTime,
    formatDate,
    formatTime,
    formatDateLong,
    formatDateShort,
    formatRelativeTime,
    formatDateForInput,
    getTimezoneAbbreviation,
    timezone,
  };
};

export default useDateFormatter;
