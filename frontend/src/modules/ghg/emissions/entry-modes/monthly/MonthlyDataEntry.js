/**
 * Monthly Data Entry Component
 * Handles monthly data input with accordion-based UI
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../../../../components/ui/accordion';
import { Button } from '../../../../../components/ui/button';
import { Calculator, Check, AlertCircle } from 'lucide-react';
import { DynamicFieldInput } from '../components/DynamicFieldInput';
import { CALENDAR_YEAR_MONTHS, FINANCIAL_YEAR_MONTHS } from '../../../../../constants/months';

/**
 * Check if a month is in the future
 * @param {string} monthKey - Month key (01-12)
 * @param {number|string} year - Year
 * @param {string} yearType - 'calendar' or 'financial'
 * @returns {boolean}
 */
const isFutureMonth = (monthKey, year, yearType = 'calendar') => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
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
 * Monthly data entry component
 * @param {Object} props
 * @param {Array} props.fields - Array of field configurations
 * @param {Object} props.monthlyData - Monthly data { '01': { field1: value, ... }, ... }
 * @param {Function} props.onMonthlyDataChange - Data change handler (monthKey, field, value)
 * @param {Object} props.monthlyEmissions - Monthly calculated emissions { '01': { co2e: value }, ... }
 * @param {Function} props.onCalculateMonth - Calculate handler for a month (monthKey)
 * @param {string} props.reportingYear - Reporting year
 * @param {string} props.yearType - 'calendar' or 'financial'
 * @param {boolean} props.disabled - Whether inputs are disabled
 * @param {boolean} props.isCalculating - Whether calculation is in progress
 * @param {Object} props.unitOptions - Unit options per field { field: [units] }
 * @param {Object} props.selectedUnits - Selected units per field { field: unit }
 * @param {Function} props.onUnitChange - Unit change handler (field, unit)
 * @param {string} props.className - Additional CSS classes
 */
export const MonthlyDataEntry = ({
  fields = [],
  monthlyData = {},
  onMonthlyDataChange,
  monthlyEmissions = {},
  onCalculateMonth,
  reportingYear,
  yearType = 'calendar',
  disabled = false,
  isCalculating = false,
  unitOptions = {},
  selectedUnits = {},
  onUnitChange,
  className = '',
}) => {
  const [expandedMonths, setExpandedMonths] = useState([]);
  
  // Get months based on year type
  const months = useMemo(() => {
    return yearType === 'financial' ? FINANCIAL_YEAR_MONTHS : CALENDAR_YEAR_MONTHS;
  }, [yearType]);
  
  // Check if month has data
  const monthHasData = useCallback((monthKey) => {
    const data = monthlyData[monthKey] || {};
    return Object.values(data).some(v => v !== '' && v !== null && v !== undefined);
  }, [monthlyData]);
  
  // Check if month has calculated emissions
  const monthHasEmissions = useCallback((monthKey) => {
    return monthlyEmissions[monthKey]?.co2e != null;
  }, [monthlyEmissions]);
  
  // Get completion status for a month
  const getMonthStatus = useCallback((monthKey) => {
    if (isFutureMonth(monthKey, reportingYear, yearType)) {
      return 'future';
    }
    if (monthHasEmissions(monthKey)) {
      return 'calculated';
    }
    if (monthHasData(monthKey)) {
      return 'has-data';
    }
    return 'empty';
  }, [reportingYear, yearType, monthHasData, monthHasEmissions]);
  
  // Handle field change
  const handleFieldChange = useCallback((monthKey, field, value) => {
    if (onMonthlyDataChange) {
      onMonthlyDataChange(monthKey, field, value);
    }
  }, [onMonthlyDataChange]);
  
  return (
    <div className={`space-y-2 ${className}`}>
      <Accordion
        type="multiple"
        value={expandedMonths}
        onValueChange={setExpandedMonths}
        className="space-y-2"
      >
        {months.map((month) => {
          const status = getMonthStatus(month.key);
          const isFuture = status === 'future';
          const isCalculated = status === 'calculated';
          const hasData = status === 'has-data' || isCalculated;
          const emissions = monthlyEmissions[month.key];
          const data = monthlyData[month.key] || {};
          
          return (
            <AccordionItem
              key={month.key}
              value={month.key}
              className={`
                border rounded-lg overflow-hidden
                ${isFuture ? 'opacity-50 bg-stone-50' : ''}
                ${isCalculated ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200'}
              `}
            >
              <AccordionTrigger
                className={`
                  px-4 py-3 hover:no-underline
                  ${isCalculated ? 'text-emerald-800' : ''}
                `}
                disabled={isFuture}
              >
                <div className="flex items-center justify-between w-full pr-2">
                  <div className="flex items-center gap-2">
                    {isCalculated && <Check className="h-4 w-4 text-emerald-600" />}
                    {hasData && !isCalculated && <AlertCircle className="h-4 w-4 text-amber-500" />}
                    <span className="font-medium">{month.name}</span>
                    {isFuture && <span className="text-xs text-stone-400">(Future)</span>}
                  </div>
                  {isCalculated && emissions?.co2e != null && (
                    <span className="text-sm font-medium text-emerald-700">
                      {parseFloat(emissions.co2e).toFixed(4)} tCO2e
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-4">
                  {/* Input fields */}
                  <div className="grid grid-cols-2 gap-4">
                    {fields.map(field => (
                      <DynamicFieldInput
                        key={field.variable}
                        field={field}
                        value={data[field.variable]}
                        onChange={(val) => handleFieldChange(month.key, field.variable, val)}
                        unit={selectedUnits[field.variable]}
                        onUnitChange={(unit) => onUnitChange && onUnitChange(field.variable, unit)}
                        unitOptions={unitOptions[field.variable] || []}
                        disabled={disabled || isFuture}
                      />
                    ))}
                  </div>
                  
                  {/* Calculate button */}
                  {!isFuture && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant={isCalculated ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => onCalculateMonth && onCalculateMonth(month.key)}
                        disabled={disabled || isCalculating || !hasData}
                        className="flex items-center gap-2"
                      >
                        <Calculator className="h-4 w-4" />
                        {isCalculated ? 'Recalculate' : 'Calculate'}
                      </Button>
                    </div>
                  )}
                  
                  {/* Show calculated result */}
                  {isCalculated && emissions && (
                    <div className="mt-2 p-2 bg-emerald-100 rounded text-center">
                      <span className="text-sm text-emerald-800">
                        Emissions: <strong>{parseFloat(emissions.co2e).toFixed(4)} tCO2e</strong>
                      </span>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

export default MonthlyDataEntry;
