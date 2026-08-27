/**
 * DynamicFieldRenderer - Renders dynamic input fields based on form config
 * 
 * This component renders a single dynamic field with proper handling for:
 * - Unit selectors (dropdown vs fixed vs text input)
 * - Override checkboxes
 * - Various field types (number, text, select)
 * - Validation for integer-only fields
 */

import React, { useEffect } from 'react';
import { Input } from '../../../../../components/ui/input';
import { Label } from '../../../../../components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../../../../components/ui/tooltip';
import { Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  getUnitDenominator,
  isQuantityField,
  resolveDensityRequirement,
} from '../utils/unitHelpers';
import { buildNativeOptionsHtml } from '../utils/nativeSelectOptions';

// Field-level help text shown on hover next to the label as an "i" icon.
// Keyed by `field.variable` so it works whether the label is "Inflation
// Rate", "PPP", "Purchase Power Value", etc.
const FIELD_HELP = {
  inflation_rate:
    'Adjusts values to match the EF publication year. If left empty, system defaults will apply. Enter 1 to turn off inflation adjustment.',
  ppp:
    'Accounts for country-specific purchasing power differences. If left empty, system defaults will be used. To disable this adjustment, input the USD/INR exchange rate for the reporting period.',
};

// Integer-only validation is now driven by the input-field-mapping admin
// config (set unit_source = "none" for count / unitless fields). The
// `DynamicFieldRenderer` enforces whole numbers via isUnitlessCountField.

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
  useCustomFuel = false,
}) => {
  const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
  let fieldUnits = [];

  // No unit (count / unitless) and freeform-text unit are handled at the
  // renderer level, not via a units list.
  if (field.unitSource === 'none' || field.unitSource === 'text') {
    return [];
  }

  // Custom fuel: restrict units based on field type
  if (useCustomFuel) {
    // Quantity field: only mass-based units (kg, g, t)
    if (field.variable === 'qty' || field.variable === 'qty_energy') {
      return ['kg', 'g', 't'];
    }
    // Emission factor field: only kgCO2e/kg (mass-based)
    if (field.variable === 'ef_quantity') {
      return ['kgCO2e/kg'];
    }
    // Other fields: use default behavior
  }

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
  useCustomFuel = false,
  // Compound unit support — when set, dropdown options are suffixed with
  // "/<compoundSuffix>". Computed by the parent from the linked field's unit.
  compoundSuffix = '',
}) => {
  const isQtyField = isQuantityField(field);
  const hideStandardQuantityUnit = useCustomFuel && isQtyField;

  // Per-field flags driven by the input-field-mapping admin config.
  const isNoUnitField = field.unitSource === 'none';
  const isTextUnitField = field.unitSource === 'text';

  // Calculate field units
  const rawFieldUnits = getFieldUnits({
    field,
    scope,
    scope3Method,
    scope3ActivityId,
    requiresSubcategory,
    selectedFuel,
    filteredScope3Activities,
    centralizedUnits,
    biogenicScopeSelection,
    useCustomFuel,
  });

  // If this field is configured as compound, suffix every option.
  const fieldUnits = (field.compoundWithVariable && compoundSuffix)
    ? rawFieldUnits.map(u => `${u}/${compoundSuffix}`)
    : rawFieldUnits;
  
  // Determine display options
  const isSupplierBasisField = scope3Method === 'supplier_basis' && 
    (field.variable?.includes('supplier') || field.variable?.includes('Supplier'));
  
  const showUnitSelector = !hideStandardQuantityUnit && !isNoUnitField && !isTextUnitField && fieldUnits.length > 0 && !isSupplierBasisField &&
    (!field.isOverride || (field.isOverride && field.expectedUnit));
  
  const showFixedUnit = !hideStandardQuantityUnit && !isNoUnitField && !isTextUnitField && field.isOverride && field.expectedUnit && fieldUnits.length <= 1;
  const showSupplierUnitInput = !hideStandardQuantityUnit && isSupplierBasisField && !field.variable?.endsWith('_unit');
  // Freeform text unit input driven by admin config (independent of supplier basis).
  const showTextUnitInput = !hideStandardQuantityUnit && isTextUnitField && !field.variable?.endsWith('_unit');
  const showOverrideCheckbox = !field.presentationOnly && (field.isOverride || (!field.required && !field.isOverride));
  // Only enforce integer validation for pure count fields (e.g., "No. of rooms", "No. of days")
  // Fields with validation_rules.max <= 1 or percentage fields are NOT count fields
  const isUnitlessCountField = isNoUnitField && 
    !field.validationRules?.max && 
    !field.variable?.includes('factor') && 
    !field.variable?.includes('carbon') &&
    !field.variable?.includes('composition');

  // For Qty Basis EF: density is dynamically required when EF unit denominator
  // dimension mismatches the fuel's quantity unit dimension for this month
  const selectedQuantityUnit = data.qty_unit
    || data.quantity_unit
    || data.unit
    || field.densityQuantityUnits?.[0]
    || '';
  const densityRequirement = resolveDensityRequirement({
    quantityUnit: selectedQuantityUnit,
    referenceUnit: getUnitDenominator(data.ef_quantity_unit),
    centralizedUnits,
  });
  const densityRequired = field.densityQtyBasisCheck && densityRequirement.required;
  const isFieldRequired = field.required || densityRequired;

  // Apply default value when field is first rendered and has no current value
  useEffect(() => {
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      const currentValue = data[field.variable];
      // Only apply default if no value exists yet
      if (currentValue === undefined || currentValue === null || currentValue === '') {
        updateMonthData(monthKey, field.variable, field.defaultValue);
      }
    }
  }, [field.variable, field.defaultValue, monthKey, data, updateMonthData]);

  // Auto-enable density override when it becomes required (dimension mismatch)
  useEffect(() => {
    if (densityRequired && !data[`override_${field.variable}`]) {
      updateMonthData(monthKey, `override_${field.variable}`, true);
    }
  }, [densityRequired, data, field.variable, monthKey, updateMonthData]);

  useEffect(() => {
    if (densityRequired && densityRequirement.densityUnit && data[`${field.variable}_unit`] !== densityRequirement.densityUnit) {
      updateMonthData(monthKey, `${field.variable}_unit`, densityRequirement.densityUnit);
    }
  }, [data, densityRequired, densityRequirement.densityUnit, field.variable, monthKey, updateMonthData]);

  const handleValueChange = (e) => {
    const val = e.target.value;
    
    // Integer validation for count fields only
    if (isUnitlessCountField && val !== '' && val !== null) {
      const numVal = parseFloat(val);
      if (!Number.isInteger(numVal)) {
        const fieldName = field.label?.replace?.(/_/g, ' ')?.replace?.(/\b\w/g, l => l.toUpperCase()) || field.variable;
        toast.error(`${fieldName} must be a whole number`);
        return;
      }
    }
    
    // Validation rules: max value check (e.g., oxidation_factor <= 1)
    if (field.validationRules?.max !== undefined && val !== '' && val !== null) {
      const numVal = parseFloat(val);
      if (numVal > field.validationRules.max) {
        const fieldName = field.label || field.variable;
        toast.error(`${fieldName} cannot be greater than ${field.validationRules.max}`);
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
    <div key={field.id || field.variable} className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="font-medium flex items-center gap-1.5">
          {field.label}
          {isFieldRequired && <span className="text-red-500 ml-1">*</span>}
          {FIELD_HELP[field.variable] && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${field.label} info`}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-stone-400 hover:text-emerald-600 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    data-testid={`field-help-${field.variable}`}
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  className="max-w-xs text-xs leading-relaxed"
                >
                  {FIELD_HELP[field.variable]}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </Label>
        
        {showOverrideCheckbox && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-700">
            <input
              type="checkbox"
              id={`override-${field.variable}-${monthKey}`}
              checked={data[`override_${field.variable}`] || false}
              onChange={handleOverrideChange}
              className="h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              data-testid={`override-${field.fieldKey}-${monthKey}`}
            />
            Override Default
          </label>
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
          dangerouslySetInnerHTML={{
            __html: buildNativeOptionsHtml(field.options, {
              placeholder: `Select ${field.label}`,
              getValue: (option) => option.value || option,
              getLabel: (option) => option.label || option,
            }),
          }}
        />
      ) : (
        <div className={(showUnitSelector || showSupplierUnitInput || showFixedUnit || showTextUnitInput) ? "flex overflow-hidden rounded-md border border-stone-200 bg-stone-50 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100" : ""}>
          <Input
            type={field.fieldType === 'text' ? 'text' : 'number'}
            step={field.fieldType === 'number' ? (isUnitlessCountField ? '1' : 'any') : undefined}
            min={field.fieldType === 'number' ? '0' : undefined}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            value={data[field.variable] || data[field.fieldKey] || ''}
            onChange={handleValueChange}
            onKeyDown={(e) => { if (field.fieldType === 'number' && e.key === '-') e.preventDefault(); }}
            disabled={isDisabled}
            className={`${(showUnitSelector || showSupplierUnitInput || showFixedUnit || showTextUnitInput) ? 'h-10 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0' : 'bg-stone-50'} ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
            data-testid={`input-${field.fieldKey}-${monthKey}`}
          />
          
          {/* Unit dropdown selector */}
          {showUnitSelector && (
            <select
              value={(() => {
                // Get the stored unit value
                const storedUnit = data[`${field.variable}_unit`] || data.unit || '';
                // Find case-insensitive match in fieldUnits, or fall back to first option
                const matchedUnit = fieldUnits.find(u => u.toLowerCase() === storedUnit.toLowerCase());
                return matchedUnit || fieldUnits[0];
              })()}
              onChange={(e) => {
                updateMonthData(monthKey, `${field.variable}_unit`, e.target.value);
                if (isQtyField) {
                  updateMonthData(monthKey, 'unit', e.target.value);
                }
              }}
              disabled={isDisabled}
              className={`h-10 min-w-24 shrink-0 border-0 border-l border-l-stone-200 bg-transparent px-3 text-sm outline-none ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
              data-testid={`unit-${field.fieldKey}-${monthKey}`}
              dangerouslySetInnerHTML={{ __html: buildNativeOptionsHtml(fieldUnits) }}
            />
          )}
          
          {/* Fixed unit display */}
          {showFixedUnit && (
            <div className={`flex h-10 min-w-24 shrink-0 items-center border-l border-l-stone-200 bg-stone-100 px-3 text-sm text-stone-600 ${isDisabled ? 'opacity-50' : ''}`}>
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
              className={`h-10 min-w-24 rounded-none border-0 border-l border-l-stone-200 bg-transparent shadow-none focus-visible:ring-0 ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
              data-testid={`unit-text-${field.fieldKey}-${monthKey}`}
            />
          )}

          {/* Free text unit input driven by admin config (unit_source = "text") */}
          {showTextUnitInput && !showSupplierUnitInput && (
            <Input
              type="text"
              placeholder="Unit"
              value={data[`${field.variable}_unit`] || ''}
              onChange={(e) => updateMonthData(monthKey, `${field.variable}_unit`, e.target.value)}
              disabled={isDisabled}
              className={`h-10 min-w-24 rounded-none border-0 border-l border-l-stone-200 bg-transparent shadow-none focus-visible:ring-0 ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
              data-testid={`unit-text-input-${field.fieldKey}-${monthKey}`}
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
