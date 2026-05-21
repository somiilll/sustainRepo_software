/**
 * Scope Selector Component
 * Reusable scope selection for emission entry forms
 */

import React from 'react';
import { SCOPES, SCOPE_LABELS } from '../../../../constants/scopes';

/**
 * Scope selector component
 * @param {Object} props
 * @param {string} props.value - Currently selected scope
 * @param {Function} props.onChange - Change handler
 * @param {Array} props.availableScopes - List of available scopes
 * @param {boolean} props.hasScope3Access - Whether user has Scope 3 access
 * @param {boolean} props.disabled - Whether selector is disabled
 * @param {string} props.className - Additional CSS classes
 */
export const ScopeSelector = ({
  value,
  onChange,
  availableScopes = [],
  hasScope3Access = false,
  disabled = false,
  className = '',
}) => {
  // Default available scopes if not provided
  const scopes = availableScopes.length > 0 
    ? availableScopes 
    : [SCOPES.SCOPE1, SCOPES.SCOPE2];
  
  // Add Scope 3 if user has access
  const effectiveScopes = hasScope3Access && !scopes.includes(SCOPES.SCOPE3)
    ? [...scopes, SCOPES.SCOPE3]
    : scopes;
  
  const handleChange = (newScope) => {
    if (!disabled && onChange) {
      onChange(newScope);
    }
  };
  
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {effectiveScopes.map((scope) => (
        <button
          key={scope}
          type="button"
          onClick={() => handleChange(scope)}
          disabled={disabled}
          className={`
            px-4 py-2 rounded-lg font-medium transition-all
            ${value === scope 
              ? 'bg-emerald-600 text-white shadow-md' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {SCOPE_LABELS[scope] || scope}
        </button>
      ))}
    </div>
  );
};

/**
 * Scope selector as dropdown (alternative style)
 */
export const ScopeSelectorDropdown = ({
  value,
  onChange,
  availableScopes = [],
  hasScope3Access = false,
  disabled = false,
  className = '',
}) => {
  const scopes = availableScopes.length > 0 
    ? availableScopes 
    : [SCOPES.SCOPE1, SCOPES.SCOPE2];
  
  const effectiveScopes = hasScope3Access && !scopes.includes(SCOPES.SCOPE3)
    ? [...scopes, SCOPES.SCOPE3]
    : scopes;
  
  return (
    <select
      value={value}
      onChange={(e) => onChange && onChange(e.target.value)}
      disabled={disabled}
      className={`
        w-full px-3 py-2 border border-gray-300 rounded-md
        focus:outline-none focus:ring-2 focus:ring-emerald-500
        ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
        ${className}
      `}
    >
      <option value="">Select Scope</option>
      {effectiveScopes.map((scope) => (
        <option key={scope} value={scope}>
          {SCOPE_LABELS[scope] || scope}
        </option>
      ))}
    </select>
  );
};

export default ScopeSelector;
