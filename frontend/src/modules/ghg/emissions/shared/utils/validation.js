/**
 * Emission Form Validation Utilities
 * 
 * Validation logic for each step of the emission entry form.
 * Extracted to keep the main component lean.
 */

import { MONTHS } from '../../../../../constants/months';

/**
 * Validate Step 1 → Step 2 transition (Basic Selection)
 */
export const validateStep1 = ({
  facilityId,
  scope,
  category,
  scope3Method,
  scope3ActivityId,
  useCustomActivity,
  scope3CustomActivity,
  biogenicScopeSelection,
  capabilities = { requiresFuel: true },
  useCustomFuel,
  fuelId,
  customFuelName,
  customEmissionFactor,
  customSource,
}) => {
  if (!facilityId) return { valid: false, message: 'Please select a facility' };
  if (!scope) return { valid: false, message: 'Please select a scope' };
  if (!category) return { valid: false, message: 'Please select a category' };

  // Scope 3 validation
  if (scope === 'scope3') {
    if (!scope3Method) return { valid: false, message: 'Please select a calculation method' };
    if (scope3Method === 'supplier_basis' && useCustomActivity) {
      if (!scope3CustomActivity?.trim()) return { valid: false, message: 'Please enter an activity name' };
    } else {
      if (!scope3ActivityId) return { valid: false, message: 'Please select an activity type' };
    }
    return { valid: true };
  }

  // Biogenic Scope 3 validation
  if (scope === 'biogenic' && biogenicScopeSelection === 'scope3') {
    if (!scope3Method) return { valid: false, message: 'Please select a calculation method' };
    if (scope3Method === 'supplier_basis' && useCustomActivity) {
      if (!scope3CustomActivity?.trim()) return { valid: false, message: 'Please enter an activity name' };
    } else {
      if (!scope3ActivityId) return { valid: false, message: 'Please select a biogenic activity' };
    }
    return { valid: true };
  }

  // Biogenic - must select scope1 or scope3
  if (scope === 'biogenic' && !biogenicScopeSelection) {
    return { valid: false, message: 'Please select a biogenic emission type (Scope 1 or Scope 3)' };
  }

  if (!capabilities.requiresFuel) {
    return { valid: true };
  }

  // Regular fuel emissions validation (Scope 1, 2, Biogenic Scope 1)
  if (!useCustomFuel && !fuelId) return { valid: false, message: 'Please select a fuel type' };
  if (useCustomFuel && !customFuelName) return { valid: false, message: 'Please enter custom fuel name' };
  // Note: EF and Source are now entered via dynamic fields in Step 3, not in Step 1

  return { valid: true };
};

/**
 * Validate Step 2 → Step 3 transition (Process & Responsibility)
 */
export const validateStep2 = ({
  requiresAssetName,
  assetName,
}) => {
  // Process names, descriptions, and ownership are optional metadata in Create.
  // Asset identity remains required where the selected category depends on it.
  if (requiresAssetName && !assetName?.trim()) {
    return { valid: false, message: 'Please enter asset name' };
  }

  return { valid: true };
};

/**
 * Validate Step 3 → Step 4 transition (Year & Monthly Data)
 */
export const validateStep3 = ({
  isC7EmployeeCommuting,
  employees,
  scope3Method,
  dynamicInputFields,
  frequencyType,
  yearlyData,
  monthlyData,
  filledMonthsCount,
  isProcessEmissions,
  selectedTemplate,
  updateMonthData,
}) => {
  // For C7 Employee Commuting
  if (isC7EmployeeCommuting) {
    if (employees.length === 0) {
      return { valid: false, message: 'Please add at least one employee' };
    }

    // For supplier_basis: validate units for all employees
    if (scope3Method === 'supplier_basis') {
      const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);

      if (frequencyType === 'yearly') {
        for (const emp of employees) {
          const inputs = emp.yearly_data?.inputs || {};
          const hasYearlyData = Object.values(inputs).some(v => 
            v !== '' && v !== null && v !== undefined && v !== 0
          );

          if (hasYearlyData) {
            for (const field of requiredFields) {
              const value = inputs[field.variable];
              const unit = inputs[`${field.variable}_unit`];
              if (value && value !== '' && value !== 0) {
                if (!unit || unit.trim() === '') {
                  const empName = emp.name || 'Unnamed employee';
                  return { valid: false, message: `Please enter unit for "${field.label}" for ${empName}` };
                }
              }
            }
          }
        }
      } else {
        for (const emp of employees) {
          for (const [monthKey, monthData] of Object.entries(emp.monthly_data || {})) {
            const inputs = monthData?.inputs || {};
            const hasMonthData = Object.values(inputs).some(v => 
              v !== '' && v !== null && v !== undefined && v !== 0
            );

            if (hasMonthData) {
              for (const field of requiredFields) {
                const value = inputs[field.variable];
                const unit = inputs[`${field.variable}_unit`];
                if (value && value !== '' && value !== 0) {
                  if (!unit || unit.trim() === '') {
                    const empName = emp.name || 'Unnamed employee';
                    const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
                    return { valid: false, message: `Please enter unit for "${field.label}" for ${empName} in ${monthName}` };
                  }
                }
              }
            }
          }
        }
      }
    }

    // Check based on frequency type
    if (frequencyType === 'yearly') {
      const hasYearlyData = employees.some(emp => 
        emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined
      );
      if (!hasYearlyData) {
        return { valid: false, message: 'Please calculate emissions for at least one employee' };
      }
    } else {
      const hasCalculatedData = employees.some(emp => 
        Object.values(emp.monthly_data || {}).some(m => m?.emissions?.co2e !== null && m?.emissions?.co2e !== undefined)
      );
      if (!hasCalculatedData) {
        return { valid: false, message: 'Please calculate emissions for at least one employee month' };
      }
    }
    return { valid: true };
  }

  // For yearly mode (non-C7)
  if (frequencyType === 'yearly') {
    const hasYearlyInput = Object.values(yearlyData || {}).some(v => v !== '' && v !== null && v !== undefined);
    if (!hasYearlyInput) {
      return { valid: false, message: 'Please enter annual data values' };
    }

    // Enforce every required (*) field — must mirror the asterisks shown in
    // the UI. Previously only "any value present" was checked, which let
    // partially-filled yearly entries through.
    const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);
    for (const field of requiredFields) {
      const value = yearlyData?.[field.variable] ?? yearlyData?.[field.fieldKey];
      const hasValue = value !== '' && value !== null && value !== undefined;
      if (!hasValue) {
        const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
        return { valid: false, message: `Please fill in "${fieldLabel}"` };
      }
    }

    // For supplier_basis: Validate units
    if (scope3Method === 'supplier_basis') {
      const qtyValue = yearlyData?.activity_value_supplier_based;
      const qtyUnit = yearlyData?.activity_value_supplier_based_unit || yearlyData?.unit;
      if (qtyValue && (!qtyUnit || qtyUnit.trim() === '')) {
        return { valid: false, message: 'Please enter unit for "Quantity Used"' };
      }

      const efValue = yearlyData?.emission_factor_supplier_based;
      const efUnit = yearlyData?.emission_factor_supplier_based_unit;
      if (efValue && (!efUnit || efUnit.trim() === '')) {
        return { valid: false, message: 'Please enter unit for "Emission Factor"' };
      }
    }

    // Validate override fields
    const overrideAndOptionalFields = dynamicInputFields.filter(f => f.isOverride || (!f.required && !f.isOverride));
    for (const field of overrideAndOptionalFields) {
      const overrideKey = `override_${field.variable}`;
      const isCheckboxChecked = yearlyData[overrideKey] === true || yearlyData[overrideKey] === 'true';
      const value = yearlyData[field.variable];
      const hasValue = value !== '' && value !== null && value !== undefined && value !== 0;

      if (isCheckboxChecked && !hasValue) {
        const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
        return { valid: false, message: `Please enter a value for "${fieldLabel}" or uncheck the Override Default checkbox` };
      }
    }

    return { valid: true };
  }

  // Monthly mode validation
  if (filledMonthsCount === 0) return { valid: false, message: 'Please enter data for at least one month' };

  // Validate mandatory formula fields for each filled month
  if (dynamicInputFields.length > 0) {
    const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);

    for (const [monthKey, data] of Object.entries(monthlyData)) {
      const hasAnyRequiredData = requiredFields.some(field => {
        const value = data[field.variable] || data[field.fieldKey];
        return value !== '' && value !== null && value !== undefined;
      });

      if (hasAnyRequiredData) {
        for (const field of requiredFields) {
          const value = data[field.variable] || data[field.fieldKey];
          if (value === '' || value === null || value === undefined) {
            const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
            const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
            return { valid: false, message: `Please fill in "${fieldLabel}" for ${monthName}` };
          }
        }

        // For supplier_basis: Validate units
        if (scope3Method === 'supplier_basis') {
          const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;

          const qtyField = requiredFields.find(f => 
            f.variable === 'activity_value_supplier_based' || 
            f.variable?.toLowerCase().includes('quantity') ||
            f.label?.toLowerCase?.().includes('quantity')
          );
          if (qtyField) {
            const qtyValue = data[qtyField.variable] || data[qtyField.fieldKey];
            const qtyUnit = data[`${qtyField.variable}_unit`] || data.activity_value_supplier_based_unit;
            if (qtyValue && (!qtyUnit || qtyUnit.trim() === '')) {
              return { valid: false, message: `Please enter unit for "Quantity Used" in ${monthName}` };
            }
          }

          const efField = requiredFields.find(f => 
            f.variable === 'emission_factor_supplier_based' || 
            f.variable?.toLowerCase().includes('emission_factor') ||
            f.label?.toLowerCase?.().includes('emission factor')
          );
          if (efField) {
            const efValue = data[efField.variable] || data[efField.fieldKey];
            const efUnit = data[`${efField.variable}_unit`] || data.emission_factor_supplier_based_unit;
            if (efValue && (!efUnit || efUnit.trim() === '')) {
              return { valid: false, message: `Please enter unit for "Emission Factor" in ${monthName}` };
            }
          }
        }
      }
    }
  }

  // Validate override and optional fields - if checkbox is checked, value must be entered
  const overrideAndOptionalFields = dynamicInputFields.filter(f => f.isOverride || (!f.required && !f.isOverride));
  for (const [monthKey, data] of Object.entries(monthlyData)) {
    for (const field of overrideAndOptionalFields) {
      const isCheckboxChecked = data[`override_${field.variable}`];
      const value = data[field.variable] || data[field.fieldKey];
      const hasValue = value !== '' && value !== null && value !== undefined && value !== 0;

      if (isCheckboxChecked && !hasValue) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        const fieldLabel = typeof field.label === 'object' ? field.label.value : (field.label || field.variable);
        return { valid: false, message: `Please enter a value for "${fieldLabel}" in ${monthName} or uncheck the Override Default checkbox` };
      }
    }
  }

  // Validate that custom EF months have justification (only for regular emissions).
  // Auto-unselect overrides whose value was cleared (mutates state via updateMonthData
  // callback — preserved from legacy inline validation for byte-identical behaviour).
  if (!isProcessEmissions) {
    for (const [monthKey, data] of Object.entries(monthlyData)) {
      // Auto-unselect custom EF if no value entered
      if (data.useCustomEmissionFactor && !data.customEmissionFactor) {
        updateMonthData?.(monthKey, 'useCustomEmissionFactor', false);
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Custom Emission Factor in ${monthName} was unselected because no value was entered. Please review and try again.` };
      }
      if (data.quantity && data.useCustomEmissionFactor && !data.customEmissionFactorSource?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter source/justification for custom emission factor in ${monthName}` };
      }
      // Auto-unselect calorific value override if no value entered
      if (data.overrideCalorificValue && !data.calorificValue) {
        updateMonthData?.(monthKey, 'overrideCalorificValue', false);
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Calorific Value override in ${monthName} was unselected because no value was entered. Please review and try again.` };
      }
      if (data.quantity && data.overrideCalorificValue && data.calorificValue && !data.calorificValueJustification?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter justification for calorific value override in ${monthName}` };
      }
      // Auto-unselect density override if no value entered
      if (data.overrideDensity && !data.density) {
        updateMonthData?.(monthKey, 'overrideDensity', false);
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Density override in ${monthName} was unselected because no value was entered. Please review and try again.` };
      }
      if (data.quantity && data.overrideDensity && data.density && !data.densityJustification?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter justification for density override in ${monthName}` };
      }
      // Auto-unselect emission factor (heat basis) override if no value entered
      if (data.overrideEmissionFactorHeat && !data.emissionFactorHeat) {
        updateMonthData?.(monthKey, 'overrideEmissionFactorHeat', false);
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Custom CO2 Emission Factor (Heat Basis) override in ${monthName} was unselected because no value was entered. Please review and try again.` };
      }
      if (data.quantity && data.overrideEmissionFactorHeat && data.emissionFactorHeat && !data.emissionFactorHeatJustification?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter justification for Custom CO2 Emission Factor (Heat Basis) override in ${monthName}` };
      }
    }
  }

  return { valid: true };
};

/**
 * Main validation dispatcher
 */
export const canProceedToStep = (step, validationParams) => {
  switch (step) {
    case 2:
      return validateStep1(validationParams);
    case 3:
      return validateStep2(validationParams);
    case 4:
      return validateStep3(validationParams);
    default:
      return { valid: true };
  }
};

export default canProceedToStep;
