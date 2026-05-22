/**
 * DynamicFieldRenderer - Renders dynamic input fields based on form config
 * 
 * This component renders a single dynamic field with proper handling for:
 * - Unit selectors (dropdown vs fixed vs text input)
 * - Override checkboxes
 * - Various field types (number, text, select)
 * - Validation for integer-only fields
 */

import React from 'react';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import { toast } from 'sonner';

// Fields that must be whole numbers (integers)
const INTEGER_ONLY_FIELDS = [
  'qty_passenger', 'qty_passengers', 'qty_nights', 'qty_room', 'qty_rooms',
  'number_of_passengers', 'number_of_nights', 'number_of_rooms',
  'qty_days_travelled', 'working_days', 'passengers_travelled'
];

/**
 * Calculate available units for a field based on its configuration
 */
export const getFieldUnits = ({
  field,
  scope,
  scope3Method,
  scope3ActivityId,
  requiresSubcategory,
  selectedFuel,
  filteredScope3Activities,
  centralizedUnits,
  biogenicScopeSelection,
}) => {
  const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
  let fieldUnits = [];

  if (field.unitSource === 'fuel') {
    if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
      const matchedActivity = filteredScope3Activities.find(a => a.id === scope3ActivityId);
      fieldUnits = matchedActivity?.allowed_units || [];
    } else {
      fieldUnits = selectedFuel?.allowed_units || [];
    }
  } else if (field.unitSource === 'all_units') {
    fieldUnits = centralizedUnits.map(u => u.symbol);
    // Filter for emission factor fields in supplier_basis
    if (field.variable === 'emission_factor_supplier_based' && scope3Method === 'supplier_basis') {
      fieldUnits = fieldUnits.filter(u => {
        const upperUnit = u.toUpperCase();
        return upperUnit.startsWith('TCO2E') || upperUnit.startsWith('TCO2');
      });
    }
  } else if (field.unitSource === 'scope3_ef') {
    const matchedEF = filteredScope3Activities.find(a => a.id === scope3ActivityId);
    if (matchedEF?.allowed_units?.length > 0) {
      fieldUnits = matchedEF.allowed_units;
    } else if (field.allowedUnits?.length > 0) {
      fieldUnits = field.allowedUnits;
    } else if (field.expectedUnit) {
      fieldUnits = [field.expectedUnit];
    }
  } else {
    fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
  }

  return fieldUnits;
};

/**
 * DynamicFieldRenderer Component
 */
export const DynamicFieldRenderer = ({
  field,
  monthKey,
  data,
  updateMonthData,
  // Props for unit calculation
  scope,
  scope3Method,
  scope3ActivityId,
  requiresSubcategory,
  selectedFuel,
  filteredScope3Activities,
  centralizedUnits,
  biogenicScopeSelection,
}) => {
  const isQtyField = field.variable === 'qty' || field.variable === 'qty_energy';
  
  // Calculate field units
  const fieldUnits = getFieldUnits({
    field,
    scope,
    scope3Method,
    scope3ActivityId,
    requiresSubcategory,
    selectedFuel,
    filteredScope3Activities,
    centralizedUnits,
    biogenicScopeSelection,
  });
  
  // Determine display options
  const isSupplierBasisField = scope3Method === 'supplier_basis' && 
    (field.variable?.includes('supplier') || field.variable?.includes('Supplier'));
  
  const showUnitSelector = fieldUnits.length > 0 && !isSupplierBasisField && 
    (!field.isOverride || (field.isOverride && field.expectedUnit));
  
  const showFixedUnit = field.isOverride && field.expectedUnit && fieldUnits.length <= 1;
  const showSupplierUnitInput = isSupplierBasisField && !field.variable?.endsWith('_unit');
  const showOverrideCheckbox = field.isOverride || (!field.required && !field.isOverride);
  const isUnitlessCountField = INTEGER_ONLY_FIELDS.includes(field.variable);

  const handleValueChange = (e) => {
    const val = e.target.value;
    
    // Integer validation for count fields
    if (isUnitlessCountField && val !== '' && val !== null) {
      const numVal = parseFloat(val);
      if (!Number.isInteger(numVal)) {
        const fieldName = field.label?.replace?.(/_/g, ' ')?.replace?.(/\b\w/g, l => l.toUpperCase()) || field.variable;
        toast.error(`${fieldName} must be a whole number`);
        return;
      }
    }
    
    if (field.fieldType === 'text' || val === '' || parseFloat(val) >= 0) {
      updateMonthData(monthKey, field.variable, val);
    }
  };

  const handleOverrideChange = (e) => {
    updateMonthData(monthKey, `override_${field.variable}`, e.target.checked);
    if (e.target.checked && !data[`${field.variable}_unit`]) {
      // Initialize unit when override is enabled
      if (fieldUnits.length > 0) {
        updateMonthData(monthKey, `${field.variable}_unit`, fieldUnits[0]);
      }
    }
  };

  const isDisabled = showOverrideCheckbox && !data[`override_${field.variable}`];

  return (
    <div key={field.id || field.variable} className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="font-medium">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </Label>
        
        {showOverrideCheckbox && (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`override-${field.variable}-${monthKey}`}
              checked={data[`override_${field.variable}`] || false}
              onChange={handleOverrideChange}
              className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <label 
              htmlFor={`override-${field.variable}-${monthKey}`} 
              className="text-xs text-amber-600 font-medium"
            >
              Override Default
            </label>
          </div>
        )}
      </div>
      
      {/* Select field type */}
      {field.fieldType === 'select' && field.options?.length > 0 ? (
        <select
          value={data[field.variable] || data[field.fieldKey] || ''}
          onChange={(e) => updateMonthData(monthKey, field.variable, e.target.value)}
          disabled={isDisabled}
          className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid={`select-${field.fieldKey}-${monthKey}`}
        >
          <option value="">Select {field.label}</option>
          {field.options.map(opt => (
            <option key={opt.value || opt} value={opt.value || opt}>
              {opt.label || opt}
            </option>
          ))}
        </select>
      ) : (
        <div className={(showUnitSelector || showSupplierUnitInput || showFixedUnit) ? "grid grid-cols-3 gap-2" : ""}>
          <Input
            type={field.fieldType === 'text' ? 'text' : 'number'}
            step={field.fieldType === 'number' ? (isUnitlessCountField ? '1' : 'any') : undefined}
            min={field.fieldType === 'number' ? '0' : undefined}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            value={data[field.variable] || data[field.fieldKey] || ''}
            onChange={handleValueChange}
            onKeyDown={(e) => { if (field.fieldType === 'number' && e.key === '-') e.preventDefault(); }}
            disabled={isDisabled}
            className={`bg-stone-50 ${(showUnitSelector || showSupplierUnitInput || showFixedUnit) ? 'col-span-2' : ''} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            data-testid={`input-${field.fieldKey}-${monthKey}`}
          />
          
          {/* Unit dropdown selector */}
          {showUnitSelector && (
            <select
              value={data[`${field.variable}_unit`] || data.unit || fieldUnits[0]}
              onChange={(e) => {
                updateMonthData(monthKey, `${field.variable}_unit`, e.target.value);
                if (isQtyField) {
                  updateMonthData(monthKey, 'unit', e.target.value);
                }
              }}
              disabled={isDisabled}
              className={`w-full h-10 bg-stone-50 border border-stone-200 rounded-lg px-3 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid={`unit-${field.fieldKey}-${monthKey}`}
            >
              {fieldUnits.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          )}
          
          {/* Fixed unit display */}
          {showFixedUnit && (
            <div className={`flex items-center h-10 bg-stone-100 border border-stone-200 rounded-lg px-3 text-stone-600 ${isDisabled ? 'opacity-50' : ''}`}>
              <span>{field.expectedUnit || fieldUnits[0]}</span>
            </div>
          )}
          
          {/* Free text unit input for supplier basis */}
          {showSupplierUnitInput && (
            <Input
              type="text"
              placeholder="Unit"
              value={data[`${field.variable}_unit`] || ''}
              onChange={(e) => updateMonthData(monthKey, `${field.variable}_unit`, e.target.value)}
              disabled={isDisabled}
              className={`bg-stone-50 ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              data-testid={`unit-text-${field.fieldKey}-${monthKey}`}
            />
          )}
        </div>
      )}
      
      {/* Help text */}
      {field.helpText && (
        <p className="text-xs text-stone-400">{field.helpText}</p>
      )}
    </div>
  );
};

export default DynamicFieldRenderer;
