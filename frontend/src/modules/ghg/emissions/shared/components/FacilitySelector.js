/**
 * Facility Selector Component
 * Reusable facility dropdown for emission entry forms
 */

import React from 'react';
import { Label } from '../../../../../components/ui/label';

/**
 * Facility selector dropdown
 * @param {Object} props
 * @param {string} props.value - Selected facility ID
 * @param {Function} props.onChange - Change handler
 * @param {Array} props.facilities - List of facilities
 * @param {boolean} props.disabled - Whether selector is disabled
 * @param {boolean} props.required - Whether field is required
 * @param {string} props.className - Additional CSS classes
 */
export const FacilitySelector = ({
  value,
  onChange,
  facilities = [],
  disabled = false,
  required = true,
  className = '',
  showLabel = true,
}) => {
  // Filter out inactive facilities
  const activeFacilities = facilities.filter(f => f.is_active !== false);
  
  return (
    <div className={`space-y-2 ${className}`}>
      {showLabel && (
        <Label>
          Facility {required && <span className="text-red-500">*</span>}
        </Label>
      )}
      <select
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        disabled={disabled}
        className={`
          w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3
          focus:outline-none focus:ring-2 focus:ring-primary
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        data-testid="emission-facility-select"
      >
        <option value="">Select Facility</option>
        {activeFacilities.map(f => (
          <option key={f.id} value={f.id}>
            {f.name} {f.country ? `(${f.country})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
};

export default FacilitySelector;
