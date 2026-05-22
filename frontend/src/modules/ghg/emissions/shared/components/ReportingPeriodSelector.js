/**
 * Reporting Period Selector Component
 * Handles year, frequency (monthly/yearly), and year type (calendar/financial)
 */

import React, { useMemo } from 'react';
import { Label } from '../../../../../components/ui/label';
import { CALENDAR_YEAR_MONTHS, FINANCIAL_YEAR_MONTHS } from '../../../../../constants/months';

/**
 * Get available years for selection
 * @param {number} yearsBack - How many years back to show
 * @returns {Array<number>}
 */
const getAvailableYears = (yearsBack = 10) => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < yearsBack; i++) {
    years.push(currentYear - i);
  }
  return years;
};

/**
 * Reporting period selector component
 * @param {Object} props
 * @param {number|string} props.year - Selected year
 * @param {Function} props.onYearChange - Year change handler
 * @param {string} props.frequency - 'monthly' or 'yearly'
 * @param {Function} props.onFrequencyChange - Frequency change handler
 * @param {string} props.yearType - 'calendar' or 'financial'
 * @param {Function} props.onYearTypeChange - Year type change handler
 * @param {boolean} props.disabled - Whether selectors are disabled
 * @param {boolean} props.showYearType - Whether to show year type selector
 * @param {string} props.className - Additional CSS classes
 */
export const ReportingPeriodSelector = ({
  year,
  onYearChange,
  frequency = 'monthly',
  onFrequencyChange,
  yearType = 'calendar',
  onYearTypeChange,
  disabled = false,
  showYearType = true,
  showFrequency = true,
  className = '',
}) => {
  const availableYears = useMemo(() => getAvailableYears(10), []);
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Year Selection */}
      <div className="space-y-2">
        <Label>
          Reporting Year <span className="text-red-500">*</span>
        </Label>
        <select
          value={year}
          onChange={(e) => onYearChange && onYearChange(e.target.value)}
          disabled={disabled}
          className={`
            w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3
            focus:outline-none focus:ring-2 focus:ring-primary
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          data-testid="reporting-year-select"
        >
          <option value="">Select Year</option>
          {availableYears.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      
      {/* Frequency Selection */}
      {showFrequency && (
        <div className="space-y-2">
          <Label>Entry Frequency</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="monthly"
                checked={frequency === 'monthly'}
                onChange={(e) => onFrequencyChange && onFrequencyChange(e.target.value)}
                disabled={disabled}
                className="text-primary"
                data-testid="frequency-monthly"
              />
              <span className="text-sm">Monthly</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="yearly"
                checked={frequency === 'yearly'}
                onChange={(e) => onFrequencyChange && onFrequencyChange(e.target.value)}
                disabled={disabled}
                className="text-primary"
                data-testid="frequency-yearly"
              />
              <span className="text-sm">Yearly</span>
            </label>
          </div>
        </div>
      )}
      
      {/* Year Type Selection */}
      {showYearType && (
        <div className="space-y-2">
          <Label>Year Type</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="calendar"
                checked={yearType === 'calendar'}
                onChange={(e) => onYearTypeChange && onYearTypeChange(e.target.value)}
                disabled={disabled}
                className="text-primary"
                data-testid="year-type-calendar"
              />
              <span className="text-sm">Calendar Year (Jan-Dec)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value="financial"
                checked={yearType === 'financial'}
                onChange={(e) => onYearTypeChange && onYearTypeChange(e.target.value)}
                disabled={disabled}
                className="text-primary"
                data-testid="year-type-financial"
              />
              <span className="text-sm">Financial Year (Apr-Mar)</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Get months array based on year type
 * @param {string} yearType - 'calendar' or 'financial'
 * @returns {Array} Month objects
 */
export const getMonthsByYearType = (yearType) => {
  return yearType === 'financial' ? FINANCIAL_YEAR_MONTHS : CALENDAR_YEAR_MONTHS;
};

export default ReportingPeriodSelector;
