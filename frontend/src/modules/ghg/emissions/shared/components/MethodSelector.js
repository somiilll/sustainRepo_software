/**
 * Calculation Method Selector Component
 * Reusable calculation method selection for Scope 3 categories
 */

import React from 'react';
import { 
  CALCULATION_METHODS, 
  isActivityBased,
  isSpendBased,
  isSupplierBased
} from '../../../../constants/calculation-methods';

/**
 * Get method label - uses passed configLabels or falls back to formatting the method name
 * @param {string} method - Method identifier
 * @param {boolean} short - Use short label
 * @param {Object} configLabels - Labels from /api/config/labels
 * @returns {string} Display label
 */
const getMethodLabel = (method, short = false, configLabels = {}) => {
  if (!method) return '-';
  const labels = short ? configLabels.calculation_methods_short : configLabels.calculation_methods;
  return labels?.[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Calculation method selector component
 * @param {Object} props
 * @param {string} props.value - Currently selected method
 * @param {Function} props.onChange - Change handler
 * @param {Array} props.availableMethods - List of available methods for this category
 * @param {boolean} props.disabled - Whether selector is disabled
 * @param {boolean} props.showShortLabels - Use short labels
 * @param {string} props.className - Additional CSS classes
 * @param {Object} props.configLabels - Labels from /api/config/labels
 */
export const MethodSelector = ({
  value,
  onChange,
  availableMethods = [],
  disabled = false,
  showShortLabels = false,
  className = '',
  configLabels = {},
}) => {
  // Default methods if none provided
  const methods = availableMethods.length > 0 
    ? availableMethods 
    : [
        CALCULATION_METHODS.ACTIVITY_BASIS,
        CALCULATION_METHODS.SPEND_BASIS,
        CALCULATION_METHODS.SUPPLIER_BASIS,
      ];
  
  const handleChange = (method) => {
    if (!disabled && onChange) {
      onChange(method);
    }
  };
  
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {methods.map((method) => (
        <button
          key={method}
          type="button"
          onClick={() => handleChange(method)}
          disabled={disabled}
          className={`
            px-4 py-2 rounded-lg font-medium transition-all text-sm
            ${value === method 
              ? 'bg-blue-600 text-white shadow-md' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {getMethodLabel(method, showShortLabels, configLabels)}
        </button>
      ))}
    </div>
  );
};

/**
 * Method selector as dropdown
 */
export const MethodSelectorDropdown = ({
  value,
  onChange,
  availableMethods = [],
  disabled = false,
  className = '',
  placeholder = 'Select Method',
  configLabels = {},
}) => {
  const methods = availableMethods.length > 0 
    ? availableMethods 
    : [
        CALCULATION_METHODS.ACTIVITY_BASIS,
        CALCULATION_METHODS.SPEND_BASIS,
        CALCULATION_METHODS.SUPPLIER_BASIS,
      ];
  
  return (
    <select
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      disabled={disabled}
      className={`
        w-full px-3 py-2 border border-gray-300 rounded-md
        focus:outline-none focus:ring-2 focus:ring-blue-500
        ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
        ${className}
      `}
    >
      <option value="">{placeholder}</option>
      {methods.map((method) => (
        <option key={method} value={method}>
          {getMethodLabel(method, false, configLabels)}
        </option>
      ))}
    </select>
  );
};

/**
 * Method selector with descriptions
 */
export const MethodSelectorWithDescriptions = ({
  value,
  onChange,
  availableMethods = [],
  methodDescriptions = {},
  disabled = false,
  className = '',
  configLabels = {},
}) => {
  const methods = availableMethods.length > 0 
    ? availableMethods 
    : [
        CALCULATION_METHODS.ACTIVITY_BASIS,
        CALCULATION_METHODS.SPEND_BASIS,
        CALCULATION_METHODS.SUPPLIER_BASIS,
      ];
  
  const defaultDescriptions = {
    [CALCULATION_METHODS.ACTIVITY_BASIS]: 'Use average emission factors based on activity data',
    [CALCULATION_METHODS.SPEND_BASIS]: 'Calculate emissions based on spend amount',
    [CALCULATION_METHODS.SUPPLIER_BASIS]: 'Use supplier-specific emission factors',
  };
  
  const descriptions = { ...defaultDescriptions, ...methodDescriptions };
  
  return (
    <div className={`space-y-2 ${className}`}>
      {methods.map((method) => (
        <button
          key={method}
          type="button"
          onClick={() => !disabled && onChange && onChange(method)}
          disabled={disabled}
          className={`
            w-full p-4 rounded-lg text-left transition-all border
            ${value === method 
              ? 'bg-blue-50 border-blue-500' 
              : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className={`font-medium ${value === method ? 'text-blue-700' : 'text-gray-700'}`}>
            {getMethodLabel(method, false, configLabels)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {descriptions[method] || ''}
          </div>
        </button>
      ))}
    </div>
  );
};

export default MethodSelector;
