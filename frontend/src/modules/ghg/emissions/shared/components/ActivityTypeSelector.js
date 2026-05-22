/**
 * Activity Type Selector Component
 * For categories that require activity type selection (C6, C7)
 */

import React from 'react';
import { Label } from '../../../../../components/ui/label';

/**
 * Default activity types for C6/C7
 */
export const DEFAULT_ACTIVITY_TYPES = [
  { value: 'air_travel', label: 'Air Travel' },
  { value: 'rail_travel', label: 'Rail Travel' },
  { value: 'road_travel', label: 'Road Travel' },
  { value: 'bus_travel', label: 'Bus Travel' },
  { value: 'car_travel', label: 'Car Travel' },
  { value: 'bike_travel', label: 'Bike/Motorcycle' },
  { value: 'ferry_travel', label: 'Ferry Travel' },
  { value: 'hotel_stay', label: 'Hotel Stay' },
];

/**
 * Activity type selector component
 * @param {Object} props
 * @param {string} props.value - Selected activity type
 * @param {Function} props.onChange - Change handler
 * @param {Array} props.activityTypes - Available activity types
 * @param {boolean} props.disabled - Whether selector is disabled
 * @param {boolean} props.required - Whether field is required
 * @param {string} props.label - Label text
 * @param {string} props.className - Additional CSS classes
 */
export const ActivityTypeSelector = ({
  value,
  onChange,
  activityTypes = DEFAULT_ACTIVITY_TYPES,
  disabled = false,
  required = true,
  label = 'Activity Type',
  className = '',
  showLabel = true,
}) => {
  return (
    <div className={`space-y-2 ${className}`}>
      {showLabel && (
        <Label>
          {label} {required && <span className="text-red-500">*</span>}
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
        data-testid="activity-type-select"
      >
        <option value="">Select Activity Type</option>
        {activityTypes.map(type => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Activity type as button group (alternative style)
 */
export const ActivityTypeButtonGroup = ({
  value,
  onChange,
  activityTypes = DEFAULT_ACTIVITY_TYPES,
  disabled = false,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {activityTypes.map(type => (
        <button
          key={type.value}
          type="button"
          onClick={() => !disabled && onChange && onChange(type.value)}
          disabled={disabled}
          className={`
            px-3 py-2 rounded-lg text-sm font-medium transition-all
            ${value === type.value 
              ? 'bg-primary text-white shadow-md' 
              : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          {type.label}
        </button>
      ))}
    </div>
  );
};

export default ActivityTypeSelector;
