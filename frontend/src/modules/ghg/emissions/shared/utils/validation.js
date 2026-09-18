/**
 * Emission Form Validation Utilities
 * 
 * Validation logic for each step of the emission entry form.
 * Extracted to keep the main component lean.
 */

import { MONTHS } from '../../../../../constants/months';
import { isMonthlyEntryStarted } from './monthlyCompletion';
import { resolveDensityFieldState } from './unitHelpers';
import {
  getAnnualReportingPeriodDayLimit,
  getMonthlyReportingPeriodDayLimit,
  isAnnualDayCountField,
} from './reportingPeriodDays';

const isBlankValue = (value) => value === '' || value === null || value === undefined;

const getFieldLabel = (field = {}) => (
  typeof field.label === 'object' ? field.label.value : (field.label || field.variable || field.fieldKey)
);

const isCarbonCompositionField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''} ${field.label || ''}`;
  return /carbon.*(?:content|composition)|composition.*carbon/i.test(identity);
};

const isOxidationFactorField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''} ${field.label || ''}`;
  return /oxidation.*factor|factor.*oxidation/i.test(identity);
};

const isFloorAreaShareField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''} ${field.label || ''}`;
  return /floor.*(?:area|share)|(?:area|share).*floor/i.test(identity);
};

const isInvestmentPercentageField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''} ${field.label || ''}`;
  return /investment.*(?:percentage|percent|share)|(?:percentage|percent|share).*investment/i.test(identity);
};

const validateConfiguredFieldRange = (field, value, periodSuffix = '') => {
  if (isBlankValue(value)) return null;
  const parsedValue = Number.parseFloat(value);
  if (!Number.isFinite(parsedValue)) return `${getFieldLabel(field)} must be a valid number${periodSuffix}`;
  if (isCarbonCompositionField(field) && (parsedValue < 0 || parsedValue > 100)) {
    return `Carbon Composition must be between 0 and 100${periodSuffix}`;
  }
  if (isOxidationFactorField(field) && (parsedValue < 0 || parsedValue > 1)) {
    return `Oxidation Factor must be between 0 and 1${periodSuffix}`;
  }
  if (isFloorAreaShareField(field) && (parsedValue < 0 || parsedValue > 100)) {
    return `Floor Area Share % must be between 0 and 100${periodSuffix}`;
  }
  if (isInvestmentPercentageField(field) && (parsedValue <= 0 || parsedValue > 100)) {
    return `Investment Percentage must be greater than 0 and no more than 100${periodSuffix}`;
  }
  return null;
};

const validateLegacyOverrideValues = (data = {}, periodSuffix = '') => {
  const overrideFields = [
    ['overrideCalorificValue', 'calorificValue', 'Calorific Value'],
    ['overrideDensity', 'density', 'Density'],
    ['overrideEmissionFactorHeat', 'emissionFactorHeat', 'Custom CO₂ Emission Factor (Heat Basis)'],
    ['useCustomEmissionFactor', 'customEmissionFactor', 'Custom Emission Factor'],
    ['override_density', 'density', 'Density'],
  ];
  for (const [enabledKey, valueKey, label] of overrideFields) {
    if (data[enabledKey] && isBlankValue(data[valueKey])) return `${label} is missing${periodSuffix}`;
  }
  return null;
};

const validateCustomFuelMethodFields = (data = {}, methodology, periodSuffix = '') => {
  const requiredFieldsByMethod = {
    using_heat_basis_ncv: [
      ['custom_ef', 'Emission Factor'],
      ['custom_cv', 'Calorific Value'],
    ],
    using_qty_basis_ef: [['custom_ef', 'Emission Factor']],
    using_carbon_composition: [
      ['custom_carbon_content', 'Carbon Composition'],
      ['custom_oxidation_factor', 'Oxidation Factor'],
    ],
  };
  for (const [key, label] of requiredFieldsByMethod[methodology] || []) {
    if (isBlankValue(data[key])) return `${label} is missing${periodSuffix}`;
  }
  if (methodology === 'using_carbon_composition') {
    const carbonContent = Number.parseFloat(data.custom_carbon_content);
    if (!Number.isFinite(carbonContent) || carbonContent < 0 || carbonContent > 100) {
      return `Carbon Composition must be between 0 and 100${periodSuffix}`;
    }
    const oxidationFactor = Number.parseFloat(data.custom_oxidation_factor);
    if (!Number.isFinite(oxidationFactor) || oxidationFactor < 0 || oxidationFactor > 1) {
      return `Oxidation Factor must be between 0 and 1${periodSuffix}`;
    }
  }
  if (data.density_unit && isBlankValue(data.density)) return `Density is missing${periodSuffix}`;
  return null;
};

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
  calculationMethodology,
  selectedFuel,
  centralizedUnits = [],
  reportingYear,
  reportingYearType,
  useCustomFuel,
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
      const annualDayLimit = getAnnualReportingPeriodDayLimit(reportingYear, reportingYearType);
      for (const employee of employees) {
        const inputs = employee.yearly_data?.inputs || {};
        for (const field of dynamicInputFields.filter(isAnnualDayCountField)) {
          const value = Number.parseFloat(inputs[field.variable]);
          if (Number.isFinite(value) && value > annualDayLimit) {
            return {
              valid: false,
              message: `${field.label} cannot exceed ${annualDayLimit} days for the reporting period`,
            };
          }
        }
      }
      const hasYearlyData = employees.some(emp => 
        emp.yearly_data?.emissions?.co2e !== null && emp.yearly_data?.emissions?.co2e !== undefined
      );
      if (!hasYearlyData) {
        return { valid: false, message: 'Please calculate emissions for at least one employee' };
      }
    } else {
      for (const employee of employees) {
        for (const [monthKey, monthData] of Object.entries(employee.monthly_data || {})) {
          const inputs = monthData?.inputs || {};
          const maxDays = getMonthlyReportingPeriodDayLimit(
            monthKey,
            reportingYear,
            reportingYearType,
          );
          for (const field of dynamicInputFields.filter(isAnnualDayCountField)) {
            const value = Number.parseFloat(inputs[field.variable]);
            if (Number.isFinite(value) && value > maxDays) {
              const monthName = MONTHS.find((month) => month.key === monthKey)?.name || monthKey;
              return {
                valid: false,
                message: `${field.label} cannot exceed ${maxDays} days for ${monthName}`,
              };
            }
          }
        }
      }
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
      if (isBlankValue(value)) {
        return { valid: false, message: `${getFieldLabel(field)} is missing` };
      }
      const rangeError = validateConfiguredFieldRange(field, value);
      if (rangeError) return { valid: false, message: rangeError };
    }

    const annualDayLimit = getAnnualReportingPeriodDayLimit(reportingYear, reportingYearType);
    for (const field of dynamicInputFields.filter(isAnnualDayCountField)) {
      const value = Number.parseFloat(yearlyData?.[field.variable] ?? yearlyData?.[field.fieldKey]);
      if (Number.isFinite(value) && value > annualDayLimit) {
        return {
          valid: false,
          message: `${field.label} cannot exceed ${annualDayLimit} days for the reporting period`,
        };
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
      const value = yearlyData[field.variable] ?? yearlyData[field.fieldKey];

      if (isCheckboxChecked && isBlankValue(value)) {
        return { valid: false, message: `${getFieldLabel(field)} is missing` };
      }
      if (isCheckboxChecked) {
        const rangeError = validateConfiguredFieldRange(field, value);
        if (rangeError) return { valid: false, message: rangeError };
      }
    }

    const yearlyLegacyOverrideError = validateLegacyOverrideValues(yearlyData);
    if (yearlyLegacyOverrideError) return { valid: false, message: yearlyLegacyOverrideError };

    if (useCustomFuel) {
      const customFuelError = validateCustomFuelMethodFields(yearlyData, calculationMethodology);
      if (customFuelError) return { valid: false, message: customFuelError };
    }

    const densityState = resolveDensityFieldState({
      calculationMethodology: yearlyData?.calculation_methodology || calculationMethodology,
      fields: dynamicInputFields,
      data: yearlyData,
      selectedFuel,
      centralizedUnits,
    });
    if (densityState.visible && !densityState.effectiveDensity) {
      return {
        valid: false,
        message: `Please enter Density (${densityState.densityUnit}) for the annual entry because the quantity and factor units use different dimensions`,
      };
    }

    return { valid: true };
  }

  // Validate mandatory formula fields for each filled month
  if (dynamicInputFields.length > 0) {
    const requiredFields = dynamicInputFields.filter(f => f.required && !f.isOverride);

    for (const [monthKey, data] of Object.entries(monthlyData)) {
      if (isMonthlyEntryStarted(data, dynamicInputFields)) {
        for (const field of requiredFields) {
          const value = data[field.variable] ?? data[field.fieldKey];
          if (isBlankValue(value)) {
            const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
            return { valid: false, message: `${getFieldLabel(field)} is missing for ${monthName}` };
          }
          const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
          const rangeError = validateConfiguredFieldRange(field, value, ` for ${monthName}`);
          if (rangeError) return { valid: false, message: rangeError };
        }

        const maxDays = getMonthlyReportingPeriodDayLimit(
          monthKey,
          reportingYear,
          reportingYearType,
        );
        for (const field of dynamicInputFields.filter(isAnnualDayCountField)) {
          const value = Number.parseFloat(data[field.variable] ?? data[field.fieldKey]);
          if (Number.isFinite(value) && value > maxDays) {
            const monthName = MONTHS.find((month) => month.key === monthKey)?.name || monthKey;
            return {
              valid: false,
              message: `${field.label} cannot exceed ${maxDays} days for ${monthName}`,
            };
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

  // Runtime Density is not always present in the configured mapping list for
  // Process Emissions. Once the selected mass/volume units require it, do not
  // permit a record to be saved without a positive user-provided value.
  for (const [monthKey, data] of Object.entries(monthlyData)) {
    if (!isMonthlyEntryStarted(data, dynamicInputFields)) continue;
    const densityState = resolveDensityFieldState({
      calculationMethodology: data?.calculation_methodology || calculationMethodology,
      fields: dynamicInputFields,
      data,
      selectedFuel,
      centralizedUnits,
    });
    if (densityState.visible && !densityState.effectiveDensity) {
      const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
      return {
        valid: false,
        message: `Please enter Density (${densityState.densityUnit}) for ${monthName} because the quantity and factor units use different dimensions`,
      };
    }
    if (data?.runtime_density_required !== true) continue;
    const density = Number.parseFloat(data.density);
    if (!Number.isFinite(density) || density <= 0) {
      const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
      return { valid: false, message: `Please enter Density for ${monthName}` };
    }
  }

  // Validate override and optional fields - if checkbox is checked, value must be entered
  const overrideAndOptionalFields = dynamicInputFields.filter(f => f.isOverride || (!f.required && !f.isOverride));
  for (const [monthKey, data] of Object.entries(monthlyData)) {
    if (!isMonthlyEntryStarted(data, dynamicInputFields)) continue;
    for (const field of overrideAndOptionalFields) {
      const isCheckboxChecked = data[`override_${field.variable}`];
      const value = data[field.variable] ?? data[field.fieldKey];

      if (isCheckboxChecked && isBlankValue(value)) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `${getFieldLabel(field)} is missing for ${monthName}` };
      }
      if (isCheckboxChecked) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        const rangeError = validateConfiguredFieldRange(field, value, ` for ${monthName}`);
        if (rangeError) return { valid: false, message: rangeError };
      }
    }
  }

  // Validate override values and their justifications without changing the user's selection.
  if (!isProcessEmissions) {
    for (const [monthKey, data] of Object.entries(monthlyData)) {
      const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
      const legacyOverrideError = validateLegacyOverrideValues(data, ` for ${monthName}`);
      if (legacyOverrideError) return { valid: false, message: legacyOverrideError };

      if (data.useCustomEmissionFactor && !data.customEmissionFactor) {
        return { valid: false, message: `Custom Emission Factor is missing for ${monthName}` };
      }
      if (data.quantity && data.useCustomEmissionFactor && !data.customEmissionFactorSource?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter source/justification for custom emission factor in ${monthName}` };
      }
      if (data.overrideCalorificValue && !data.calorificValue) {
        return { valid: false, message: `Calorific Value is missing for ${monthName}` };
      }
      if (data.quantity && data.overrideCalorificValue && data.calorificValue && !data.calorificValueJustification?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter justification for calorific value override in ${monthName}` };
      }
      if (data.overrideDensity && !data.density) {
        return { valid: false, message: `Density is missing for ${monthName}` };
      }
      if (data.quantity && data.overrideDensity && data.density && !data.densityJustification?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter justification for density override in ${monthName}` };
      }
      if (data.overrideEmissionFactorHeat && !data.emissionFactorHeat) {
        return { valid: false, message: `Custom CO₂ Emission Factor (Heat Basis) is missing for ${monthName}` };
      }
      if (data.quantity && data.overrideEmissionFactorHeat && data.emissionFactorHeat && !data.emissionFactorHeatJustification?.trim()) {
        const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
        return { valid: false, message: `Please enter justification for Custom CO2 Emission Factor (Heat Basis) override in ${monthName}` };
      }
    }
  }

  if (useCustomFuel) {
    for (const [monthKey, data] of Object.entries(monthlyData)) {
      if (!isMonthlyEntryStarted(data, dynamicInputFields)) continue;
      const monthName = MONTHS.find(m => m.key === monthKey)?.name || monthKey;
      const customFuelError = validateCustomFuelMethodFields(data, calculationMethodology, ` for ${monthName}`);
      if (customFuelError) return { valid: false, message: customFuelError };
    }
  }

  // Do this after inspecting partially-entered months so users receive the
  // missing-field message instead of a generic no-data message.
  if (filledMonthsCount === 0) return { valid: false, message: 'Please enter data for at least one month' };

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
