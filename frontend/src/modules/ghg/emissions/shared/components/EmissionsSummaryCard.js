/**
 * Emissions Summary Card Component
 * Displays calculated emissions summary
 */

import React from 'react';
import { Card } from '../../../../../components/ui/card';
import { Calculator, Leaf } from 'lucide-react';

/**
 * Format emissions value for display
 * @param {number} value - Emissions value
 * @param {number} decimals - Decimal places
 * @returns {string} Formatted value
 */
const formatEmissions = (value, decimals = 4) => {
  if (value == null || isNaN(value)) return '-';
  return parseFloat(value).toFixed(decimals);
};

/**
 * Emissions summary card
 * @param {Object} props
 * @param {number} props.co2 - CO2 emissions (tonnes)
 * @param {number} props.ch4 - CH4 emissions (tonnes CO2e)
 * @param {number} props.n2o - N2O emissions (tonnes CO2e)
 * @param {number} props.total - Total CO2e emissions
 * @param {string} props.unit - Unit of measurement (default: tCO2e)
 * @param {boolean} props.showBreakdown - Whether to show gas breakdown
 * @param {boolean} props.isCalculating - Whether calculation is in progress
 * @param {string} props.title - Card title
 * @param {string} props.className - Additional CSS classes
 */
export const EmissionsSummaryCard = ({
  co2,
  ch4,
  n2o,
  total,
  unit = 'tCO2e',
  showBreakdown = true,
  isCalculating = false,
  title = 'Calculated Emissions',
  className = '',
}) => {
  const hasEmissions = total != null && !isNaN(total);
  
  return (
    <Card className={`p-4 ${hasEmissions ? 'bg-emerald-50 border-emerald-200' : 'bg-stone-50 border-stone-200'} ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        {hasEmissions ? (
          <Leaf className="h-5 w-5 text-emerald-600" />
        ) : (
          <Calculator className="h-5 w-5 text-stone-400" />
        )}
        <h3 className={`font-medium ${hasEmissions ? 'text-emerald-800' : 'text-stone-600'}`}>
          {title}
        </h3>
      </div>
      
      {isCalculating ? (
        <div className="flex items-center gap-2 text-stone-500">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <span>Calculating...</span>
        </div>
      ) : hasEmissions ? (
        <div className="space-y-2">
          {/* Total */}
          <div className="text-2xl font-bold text-emerald-700">
            {formatEmissions(total)} <span className="text-base font-normal">{unit}</span>
          </div>
          
          {/* Breakdown */}
          {showBreakdown && (co2 != null || ch4 != null || n2o != null) && (
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200">
              <div className="text-center">
                <div className="text-xs text-emerald-600">CO2</div>
                <div className="text-sm font-medium text-emerald-800">
                  {formatEmissions(co2, 4)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-emerald-600">CH4</div>
                <div className="text-sm font-medium text-emerald-800">
                  {formatEmissions(ch4, 6)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-emerald-600">N2O</div>
                <div className="text-sm font-medium text-emerald-800">
                  {formatEmissions(n2o, 6)}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-stone-500 text-sm">
          Enter data and click Calculate to see emissions
        </p>
      )}
    </Card>
  );
};

/**
 * Monthly emissions summary
 * @param {Object} props
 * @param {Object} props.monthlyTotals - Object with month keys and co2e values
 * @param {number} props.yearlyTotal - Yearly total
 * @param {string} props.unit - Unit of measurement
 * @param {string} props.className - Additional CSS classes
 */
export const MonthlyEmissionsSummary = ({
  monthlyTotals = {},
  yearlyTotal,
  unit = 'tCO2e',
  className = '',
}) => {
  const months = Object.entries(monthlyTotals)
    .filter(([, data]) => data?.co2e != null)
    .sort(([a], [b]) => {
      const monthOrder = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      return monthOrder.indexOf(a) - monthOrder.indexOf(b);
    });
  
  if (months.length === 0) {
    return null;
  }
  
  return (
    <Card className={`p-4 bg-emerald-50 border-emerald-200 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Leaf className="h-5 w-5 text-emerald-600" />
          <h3 className="font-medium text-emerald-800">Monthly Emissions</h3>
        </div>
        {yearlyTotal != null && (
          <div className="text-lg font-bold text-emerald-700">
            Total: {formatEmissions(yearlyTotal)} {unit}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-4 gap-2">
        {months.map(([month, data]) => (
          <div key={month} className="bg-white rounded p-2 text-center border border-emerald-100">
            <div className="text-xs text-emerald-600 uppercase">{month}</div>
            <div className="text-sm font-medium text-emerald-800">
              {formatEmissions(data.co2e, 4)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default EmissionsSummaryCard;
