/**
 * Dynamic Field Input Component
 * Renders a single input field based on field configuration
 */

import React from 'react';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../../../../components/ui/tooltip';
import { Info } from 'lucide-react';

/**
 * Dynamic field input component
 * @param {Object} props
 * @param {Object} props.field - Field configuration { variable, label, type, unit, required, tooltip, options }
 * @param {*} props.value - Current field value
 * @param {Function} props.onChange - Change handler
 * @param {string} props.unit - Unit override
 * @param {Function} props.onUnitChange - Unit change handler (for fields with multiple units)
 * @param {Array} props.unitOptions - Available unit options
 * @param {boolean} props.disabled - Whether field is disabled
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.placeholder - Placeholder text
 */
export const DynamicFieldInput = ({
  field,
  value,
  onChange,
  unit,
  onUnitChange,
  unitOptions = [],
  disabled = false,
  className = '',
  placeholder,
}) => {
  const {
    variable,
    label,
    type = 'number',
    unit: fieldUnit,
    required = false,
    tooltip,
    options = [],
    min,
    max,
    step,
  } = field;
  
  const displayUnit = unit || fieldUnit;
  const inputPlaceholder = placeholder || `Enter ${label?.toLowerCase() || 'value'}`;
  
  // Handle different input types
  const renderInput = () => {
    switch (type) {
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange && onChange(e.target.value)}
            disabled={disabled}
            className={`
              w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3
              focus:outline-none focus:ring-2 focus:ring-primary
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            data-testid={`field-${variable}`}
          >
            <option value="">Select {label}</option>
            {options.map(opt => (
              <option key={opt.value || opt} value={opt.value || opt}>
                {opt.label || opt}
              </option>
            ))}
          </select>
        );
      
      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => onChange && onChange(e.target.value)}
            disabled={disabled}
            placeholder={inputPlaceholder}
            className={`
              w-full min-h-[80px] bg-stone-50 border border-stone-200 rounded-lg px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-primary
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            data-testid={`field-${variable}`}
          />
        );
      
      case 'number':
      default:
        return (
          <div className="flex gap-2">
            <Input
              type="number"
              value={value ?? ''}
              onChange={(e) => onChange && onChange(e.target.value)}
              disabled={disabled}
              placeholder={inputPlaceholder}
              min={min}
              max={max}
              step={step || 'any'}
              className={`
                flex-1 h-10 bg-stone-50 border border-stone-200 rounded-lg px-3
                ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              data-testid={`field-${variable}`}
            />
            {/* Unit display or selector */}
            {unitOptions.length > 1 ? (
              <select
                value={displayUnit || ''}
                onChange={(e) => onUnitChange && onUnitChange(e.target.value)}
                disabled={disabled}
                className="h-10 bg-stone-50 border border-stone-200 rounded-lg px-2 min-w-[80px]"
                data-testid={`field-${variable}-unit`}
              >
                {unitOptions.map(u => (
                  <option key={u.symbol || u} value={u.symbol || u}>
                    {u.display_name || u.symbol || u}
                  </option>
                ))}
              </select>
            ) : displayUnit ? (
              <div className="h-10 bg-stone-100 border border-stone-200 rounded-lg px-3 flex items-center text-stone-600 min-w-[60px]">
                {displayUnit}
              </div>
            ) : null}
          </div>
        );
    }
  };
  
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Label className="flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-stone-400 cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {renderInput()}
    </div>
  );
};

/**
 * Render multiple dynamic fields
 * @param {Object} props
 * @param {Array} props.fields - Array of field configurations
 * @param {Object} props.values - Object with field values { variable: value }
 * @param {Function} props.onChange - Change handler (variable, value)
 * @param {Object} props.units - Object with field units { variable: unit }
 * @param {Function} props.onUnitChange - Unit change handler (variable, unit)
 * @param {Object} props.unitOptionsMap - Map of unit options per field { variable: [units] }
 * @param {boolean} props.disabled - Whether all fields are disabled
 * @param {string} props.className - Additional CSS classes
 */
export const DynamicFieldGroup = ({
  fields = [],
  values = {},
  onChange,
  units = {},
  onUnitChange,
  unitOptionsMap = {},
  disabled = false,
  className = '',
  columns = 2,
}) => {
  if (!fields || fields.length === 0) return null;
  
  return (
    <div className={`grid grid-cols-${columns} gap-4 ${className}`}>
      {fields.map(field => (
        <DynamicFieldInput
          key={field.variable}
          field={field}
          value={values[field.variable]}
          onChange={(val) => onChange && onChange(field.variable, val)}
          unit={units[field.variable]}
          onUnitChange={(val) => onUnitChange && onUnitChange(field.variable, val)}
          unitOptions={unitOptionsMap[field.variable] || []}
          disabled={disabled}
        />
      ))}
    </div>
  );
};

export default DynamicFieldInput;
