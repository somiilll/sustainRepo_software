/**
 * Yearly Data Entry Component
 * Handles yearly (annual aggregate) data input
 */

import React, { useCallback } from 'react';
import { Button } from '../../../../../components/ui/button';
import { Card } from '../../../../../components/ui/card';
import { Calculator, Leaf } from 'lucide-react';
import { DynamicFieldInput } from '../components/DynamicFieldInput';

/**
 * Yearly data entry component
 * @param {Object} props
 * @param {Array} props.fields - Array of field configurations
 * @param {Object} props.yearlyData - Yearly data { field1: value, field2: value, ... }
 * @param {Function} props.onYearlyDataChange - Data change handler (field, value)
 * @param {Object} props.emissions - Calculated emissions { co2e, co2, ch4, n2o }
 * @param {Function} props.onCalculate - Calculate handler
 * @param {string} props.reportingYear - Reporting year
 * @param {boolean} props.disabled - Whether inputs are disabled
 * @param {boolean} props.isCalculating - Whether calculation is in progress
 * @param {Object} props.unitOptions - Unit options per field { field: [units] }
 * @param {Object} props.selectedUnits - Selected units per field { field: unit }
 * @param {Function} props.onUnitChange - Unit change handler (field, unit)
 * @param {string} props.className - Additional CSS classes
 */
export const YearlyDataEntry = ({
  fields = [],
  yearlyData = {},
  onYearlyDataChange,
  emissions = null,
  onCalculate,
  reportingYear,
  disabled = false,
  isCalculating = false,
  unitOptions = {},
  selectedUnits = {},
  onUnitChange,
  className = '',
}) => {
  // Check if we have data entered
  const hasData = Object.values(yearlyData).some(v => v !== '' && v !== null && v !== undefined);
  
  // Check if we have calculated emissions
  const hasEmissions = emissions?.co2e != null;
  
  // Handle field change
  const handleFieldChange = useCallback((field, value) => {
    if (onYearlyDataChange) {
      onYearlyDataChange(field, value);
    }
  }, [onYearlyDataChange]);
  
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Year indicator */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-stone-700">
          Annual Data for {reportingYear}
        </h3>
        {hasEmissions && (
          <div className="flex items-center gap-2 text-emerald-700">
            <Leaf className="h-4 w-4" />
            <span className="font-medium">{parseFloat(emissions.co2e).toFixed(4)} tCO2e</span>
          </div>
        )}
      </div>
      
      {/* Input fields */}
      <Card className={`p-4 ${hasEmissions ? 'border-emerald-200 bg-emerald-50/50' : ''}`}>
        <div className="grid grid-cols-2 gap-4">
          {fields.map(field => (
            <DynamicFieldInput
              key={field.variable}
              field={field}
              value={yearlyData[field.variable]}
              onChange={(val) => handleFieldChange(field.variable, val)}
              unit={selectedUnits[field.variable]}
              onUnitChange={(unit) => onUnitChange && onUnitChange(field.variable, unit)}
              unitOptions={unitOptions[field.variable] || []}
              disabled={disabled}
            />
          ))}
        </div>
        
        {/* Calculate button */}
        <div className="flex justify-end mt-4">
          <Button
            type="button"
            variant={hasEmissions ? 'outline' : 'default'}
            onClick={() => onCalculate && onCalculate()}
            disabled={disabled || isCalculating || !hasData}
            className="flex items-center gap-2"
          >
            {isCalculating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Calculating...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4" />
                {hasEmissions ? 'Recalculate' : 'Calculate Emissions'}
              </>
            )}
          </Button>
        </div>
      </Card>
      
      {/* Emissions summary */}
      {hasEmissions && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="h-5 w-5 text-emerald-600" />
            <h4 className="font-medium text-emerald-800">Calculated Emissions</h4>
          </div>
          
          <div className="text-2xl font-bold text-emerald-700 mb-2">
            {parseFloat(emissions.co2e).toFixed(4)} <span className="text-base font-normal">tCO2e</span>
          </div>
          
          {/* Gas breakdown */}
          {(emissions.co2 != null || emissions.ch4 != null || emissions.n2o != null) && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200">
              <div className="text-center">
                <div className="text-xs text-emerald-600">CO2</div>
                <div className="text-sm font-medium text-emerald-800">
                  {emissions.co2 != null ? parseFloat(emissions.co2).toFixed(4) : '-'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-emerald-600">CH4</div>
                <div className="text-sm font-medium text-emerald-800">
                  {emissions.ch4 != null ? parseFloat(emissions.ch4).toFixed(6) : '-'}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-emerald-600">N2O</div>
                <div className="text-sm font-medium text-emerald-800">
                  {emissions.n2o != null ? parseFloat(emissions.n2o).toFixed(6) : '-'}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default YearlyDataEntry;
