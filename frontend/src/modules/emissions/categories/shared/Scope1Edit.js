/**
 * Scope 1 Edit Module — Shared Helpers
 *
 * Mirrors the `Scope3FlatEdit` pattern for Scope 1 categories
 * (Stationary Combustion, Mobile Combustion, Fugitive Emissions,
 * and the generic Scope 1 fallback).
 *
 * Pure functions own:
 *   - `validateEditSubmission(ctx)` — all Scope-1-specific validations
 *     (override justifications, fuel selection, calc-engine result,
 *      override value validity, dynamic override/optional field checks,
 *      process-name requirements).
 *   - `buildEditPayload(ctx)` — byte-identical PUT payload to the
 *     legacy inline implementation in `Emissions.js`.
 *
 * IMPORTANT: behaviour, validation messages, and payload shape MUST stay
 * byte-identical with the legacy code. UI rendering of Scope 1 edit
 * remains in `Emissions.js` (existing inline JSX) — only logic is moved.
 *
 * Capability-aware: the module reference passed in via `ctx.module`
 * controls future per-category behaviour. Scope 1 has no capabilities
 * today; helpers are factored out for symmetry with Scope 3.
 */

import {
  normalizeCustomFuelDensityUnit,
  normalizeCustomFuelQuantityUnit,
} from '../../../ghg/emissions/shared/utils/unitHelpers';

// ---------- field unit resolver (same logic as legacy inline) ----------

const getFieldUnitForSave = (field, ctx) => {
  const { dynamicFieldValues, selectedFuel, centralizedUnits } = ctx;
  const storedUnit = dynamicFieldValues[`${field.variable}_unit`];
  if (storedUnit) return storedUnit;

  let fieldUnits = [];
  if (field.unitSource === 'fuel') {
    fieldUnits = selectedFuel?.allowed_units || [];
  } else if (field.unitSource === 'all_units') {
    fieldUnits = centralizedUnits.map((u) => u.symbol);
  } else {
    fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
  }
  return fieldUnits[0] || field.expectedUnit || '';
};

const isOxidationFactorField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''} ${field.label || ''}`;
  return /oxidation.*factor|factor.*oxidation/i.test(identity);
};

const resolveActiveCalculationMethodology = (ctx) => {
  const savedMethodology = ctx.dynamicFieldValues?.calculation_methodology;
  return ctx.editCalcMethodology
    || (typeof savedMethodology === 'object' ? savedMethodology?.value : savedMethodology)
    || 'using_heat_basis_ncv';
};

export function buildDynamicValues(ctx) {
  const { dynamicInputFields, dynamicFieldValues, formData } = ctx;
  // PUT replaces this object. Build it solely from the fields active in the
  // current form so a prior fuel or methodology cannot retain hidden inputs.
  const dynamicValues = {};

  (dynamicInputFields || []).forEach((field) => {
    if (field.presentationOnly) return;
    const variable = field.variable;
    const value = dynamicFieldValues[variable];
    const unit = getFieldUnitForSave(field, ctx);

    if (field.isOverride) {
      const isOverridden = dynamicFieldValues[`override_${variable}`] || false;
      dynamicValues[variable] = {
        value: isOverridden && value !== undefined && value !== '' ? parseFloat(value) : null,
        unit,
        is_override: isOverridden,
        justification: dynamicFieldValues[`${variable}_justification`] || '',
      };
    } else if (!field.required) {
      const isOptionalOverridden = dynamicFieldValues[`override_${variable}`] || false;
      const parsedValue = value !== undefined && value !== '' ? parseFloat(value) : null;
      dynamicValues[variable] = {
        value: isOptionalOverridden ? parsedValue : null,
        unit,
        ...(isOptionalOverridden && parsedValue !== null && { is_override: true }),
      };
    } else {
      const parsedValue = value !== undefined && value !== '' ? parseFloat(value) : null;
      dynamicValues[variable] = { value: parsedValue, unit };
    }
  });

  const isScope1Like = formData?.scope === 'scope1'
    || (formData?.scope === 'biogenic' && ctx.biogenicScopeSelection === 'scope1');
  if (isScope1Like) {
    const hasValue = (value) => value !== undefined && value !== null && value !== '';
    const parseValue = (value) => (hasValue(value) ? parseFloat(value) : null);
    const quantity = hasValue(dynamicFieldValues.qty)
      ? dynamicFieldValues.qty
      : (hasValue(dynamicFieldValues.quantity) ? dynamicFieldValues.quantity : ctx.formData?.quantity);
    const quantityUnit = normalizeCustomFuelQuantityUnit(dynamicFieldValues.custom_qty_unit
      || dynamicFieldValues.qty_unit
      || dynamicFieldValues.quantity_unit
      || ctx.formData?.quantity_unit
      || 'kg');
    const calculationMethodology = resolveActiveCalculationMethodology(ctx);

    dynamicValues.calculation_methodology = { value: calculationMethodology, unit: '' };

    // Process Emissions can require Density at runtime even where there is no
    // configured Density mapping. Preserve that editable virtual field on PUT.
    const hasConfiguredDensityField = (dynamicInputFields || []).some((field) => field.variable === 'density');
    if (!hasConfiguredDensityField && hasValue(dynamicFieldValues.density)) {
      dynamicValues.density = {
        value: parseValue(dynamicFieldValues.density),
        unit: dynamicFieldValues.density_unit || 'kg/L',
        is_override: Boolean(dynamicFieldValues.override_density),
      };
    }

    if (ctx.editUseCustomFuel) {
      // These fields are rendered by CustomFuelMonthFields rather than the
      // standard config-driven list, so merge them explicitly into the payload.
      dynamicValues.qty = { value: parseValue(quantity), unit: quantityUnit };
      if (hasValue(dynamicFieldValues.custom_ef)) {
        dynamicValues.custom_ef = { value: parseValue(dynamicFieldValues.custom_ef), unit: dynamicFieldValues.custom_ef_unit || '' };
      }
      if (hasValue(dynamicFieldValues.custom_cv)) {
        dynamicValues.custom_cv = { value: parseValue(dynamicFieldValues.custom_cv), unit: dynamicFieldValues.custom_cv_unit || '' };
      }
      if (hasValue(dynamicFieldValues.custom_carbon_content)) {
        dynamicValues.custom_carbon_content = { value: parseValue(dynamicFieldValues.custom_carbon_content), unit: '%' };
      }
      if (hasValue(dynamicFieldValues.custom_oxidation_factor)) {
        dynamicValues.custom_oxidation_factor = { value: parseValue(dynamicFieldValues.custom_oxidation_factor), unit: '' };
      }
      if (hasValue(dynamicFieldValues.density)) {
        dynamicValues.density = {
          value: parseValue(dynamicFieldValues.density),
          unit: normalizeCustomFuelDensityUnit(dynamicFieldValues.density_unit || 'kg/L'),
        };
      }
      if (ctx.categoryCode === 'fugitive_emissions' && hasValue(dynamicFieldValues.co2_gwp_fugitives)) {
        dynamicValues.co2_gwp_fugitives = {
          value: parseValue(dynamicFieldValues.co2_gwp_fugitives),
          unit: '',
          is_override: true,
        };
      }
    }
  }

  return dynamicValues;
}

// ---------- validation ----------

/**
 * Validate a Scope 1 edit submission.
 *
 * @param {Object} ctx
 * @param {Object} ctx.formData
 * @param {Array}  ctx.dynamicInputFields
 * @param {Object} ctx.dynamicFieldValues
 * @param {Object} ctx.effectiveCalculatedEmissions
 * @param {boolean} ctx.isOverrideCV               — DOM-read flag
 * @param {boolean} ctx.isOverrideDensity          — DOM-read flag
 * @param {boolean} ctx.overrideCalorificValue
 * @param {boolean} ctx.overrideDensity
 * @param {boolean} ctx.overrideEmissionFactorHeat
 * @param {string}  ctx.overrideJustification
 * @returns {{ valid: boolean, errorMessage?: string }}
 */
export function validateEditSubmission(ctx) {
  const {
    formData,
    dynamicInputFields,
    dynamicFieldValues,
    effectiveCalculatedEmissions,
    isOverrideCV,
    isOverrideDensity,
    overrideCalorificValue,
    overrideDensity,
    overrideEmissionFactorHeat,
    overrideJustification,
    editUseCustomFuel,
    editCustomFuelName,
    editProcessType,
    categoryCode,
  } = ctx;
  const isCustomFugitiveFuel = editUseCustomFuel && (
    categoryCode === 'fugitive_emissions'
    || String(formData.category || '').toLowerCase().includes('fugitive')
  );

  // 1. Override CV/density justifications (DOM-read)
  if (isOverrideCV && !formData.calorific_value_justification?.trim()) {
    return { valid: false, errorMessage: 'Justification is required when overriding Calorific Value' };
  }
  if (isOverrideDensity && !formData.density_justification?.trim()) {
    return { valid: false, errorMessage: 'Justification is required when overriding Density' };
  }

  // 2. Override main justification (Scope 1/2 when any override enabled)
  const hasAnyOverride = isOverrideCV || isOverrideDensity || overrideEmissionFactorHeat;
  if (hasAnyOverride && (formData.scope === 'scope1' || formData.scope === 'scope2')) {
    if (!overrideJustification?.trim() || overrideJustification.trim().length < 20) {
      return {
        valid: false,
        errorMessage: 'Override justification must be at least 20 characters when overriding default values',
      };
    }
  }

  // 3. Every required field currently rendered by the configured form must
  // have a usable value. This prevents an earlier successful calculation from
  // allowing an incomplete edit to be saved.
  if (dynamicInputFields?.length > 0 && !editUseCustomFuel) {
    for (const field of dynamicInputFields) {
      if (field.presentationOnly) continue;
      const isOxidationFactor = isOxidationFactorField(field);
      if ((!field.required || field.isOverride) && !isOxidationFactor) continue;
      const value = dynamicFieldValues[field.variable];
      if (field.fieldType === 'number' || !field.fieldType) {
        const numValue = parseFloat(value);
        if (isOxidationFactor && (
          !Number.isFinite(numValue) || numValue < 0 || numValue > 1
        )) {
          return { valid: false, errorMessage: 'Oxidation Factor must be between 0 and 1' };
        }
        if (!field.required || field.isOverride) continue;
        if (
          value === '' || value === undefined || value === null || isNaN(numValue)
          || (!isOxidationFactor && numValue <= 0)
        ) {
          return { valid: false, errorMessage: `${field.label || field.variable} must be greater than 0` };
        }
      } else if (value === '' || value === undefined || value === null) {
        return { valid: false, errorMessage: `${field.label || field.variable} is required` };
      }
    }
  }

  // Custom fuel inputs are intentionally rendered outside the configurable
  // field list, so validate their methodology-specific required values here.
  if (editUseCustomFuel) {
    const numericValue = (value) => Number.parseFloat(value);
    const isPositive = (value) => Number.isFinite(numericValue(value)) && numericValue(value) > 0;
    const quantity = dynamicFieldValues.qty ?? dynamicFieldValues.quantity ?? formData.quantity;
    if (!isPositive(quantity)) {
      return { valid: false, errorMessage: 'Quantity Used must be greater than 0' };
    }

    if (isCustomFugitiveFuel) {
      const fugitiveGwp = dynamicFieldValues.co2_gwp_fugitives ?? dynamicFieldValues.gwp_fugitives;
      if (!isPositive(fugitiveGwp)) {
        return { valid: false, errorMessage: 'GWP Fugitives must be greater than 0' };
      }
    } else {

      const methodology = resolveActiveCalculationMethodology(ctx);
      if (methodology === 'using_heat_basis_ncv') {
        if (!isPositive(dynamicFieldValues.custom_ef)) {
          return { valid: false, errorMessage: 'Emission Factor must be greater than 0' };
        }
        if (!isPositive(dynamicFieldValues.custom_cv)) {
          return { valid: false, errorMessage: 'Calorific Value must be greater than 0' };
        }
      } else if (methodology === 'using_qty_basis_ef') {
        if (!isPositive(dynamicFieldValues.custom_ef)) {
          return { valid: false, errorMessage: 'Emission Factor must be greater than 0' };
        }
      } else if (methodology === 'using_carbon_composition') {
        const carbonContent = numericValue(dynamicFieldValues.custom_carbon_content);
        const oxidationFactor = numericValue(dynamicFieldValues.custom_oxidation_factor);
        if (!Number.isFinite(carbonContent) || carbonContent <= 0 || carbonContent > 100) {
          return { valid: false, errorMessage: 'Carbon Content must be greater than 0 and no more than 100' };
        }
        if (!Number.isFinite(oxidationFactor) || oxidationFactor < 0 || oxidationFactor > 1) {
          return { valid: false, errorMessage: 'Oxidation Factor must be between 0 and 1' };
        }
      }
    }
  }

  // 4. Process details are optional metadata.
  const validProcessNames = (formData.process_names || []).filter((p) => p.name && p.name.trim() !== '');

  // 5. Fuel selection — Process Emissions don't require fuel
  const isProcessEmissions = Boolean(ctx.capabilities?.processType);
  if (isProcessEmissions && !editProcessType) {
    return { valid: false, errorMessage: 'Please select a process type' };
  }
  if (!isProcessEmissions) {
    if (!editUseCustomFuel && !formData.fuel_id) {
      return { valid: false, errorMessage: 'Please select a fuel from the database' };
    }
    if (editUseCustomFuel && !editCustomFuelName?.trim()) {
      return { valid: false, errorMessage: 'Please enter custom fuel name' };
    }
  }

  // 6. Calc engine must have produced a result
  const calc = effectiveCalculatedEmissions;
  if (!calc) {
    return { valid: false, errorMessage: 'Unable to calculate emissions. Please check all values.' };
  }

  // 7. Override values valid when enabled
  if (overrideCalorificValue && calc) {
    const overrideCV = parseFloat(formData.calorific_value);
    if (!overrideCV || overrideCV <= 0) {
      return { valid: false, errorMessage: 'Please enter a valid Calorific Value when override is enabled' };
    }
  }
  if (overrideDensity && calc) {
    const overrideD = parseFloat(formData.density);
    if (!overrideD || overrideD <= 0) {
      return { valid: false, errorMessage: 'Please enter a valid Density when override is enabled' };
    }
  }
  if (overrideEmissionFactorHeat && calc) {
    const overrideEFH = parseFloat(formData.emission_factor_heat);
    if (!overrideEFH || overrideEFH <= 0) {
      return {
        valid: false,
        errorMessage: 'Please enter a valid Custom CO₂ Emission Factor (Heat Basis) when override is enabled',
      };
    }
  }

  // 8. Dynamic override/optional fields — value required when checkbox enabled
  const overrideAndOptionalFields = editUseCustomFuel
    ? []
    : (dynamicInputFields || []).filter(
      (f) => f.isOverride || (!f.required && !f.isOverride)
    );
  for (const field of overrideAndOptionalFields) {
    const isCheckboxChecked = dynamicFieldValues[`override_${field.variable}`];
    const value = dynamicFieldValues[field.variable];
    const hasValue = value !== '' && value !== null && value !== undefined && parseFloat(value) > 0;
    if (isCheckboxChecked && !hasValue) {
      const fieldLabel = typeof field.label === 'object' ? field.label.value : field.label || field.variable;
      return {
        valid: false,
        errorMessage: `Please enter a value for "${fieldLabel}" or uncheck the Override Default checkbox`,
      };
    }
  }

  return { valid: true, validProcessNames };
}

// ---------- payload ----------

/**
 * Build the Scope 1 PUT payload — byte-identical with the legacy
 * inline implementation in `Emissions.js`.
 *
 * @param {Object} ctx — see validateEditSubmission, plus:
 * @param {Object} ctx.editingEmission
 * @param {Array}  ctx.dynamicInputFields
 * @param {Object} ctx.dynamicFieldValues
 * @param {Object} ctx.selectedFuel
 * @param {Array}  ctx.centralizedUnits
 * @returns {Object} payload
 */
export function buildEditPayload(ctx) {
  const {
    formData,
    editingEmission,
    effectiveCalculatedEmissions,
    isOverrideCV,
    isOverrideDensity,
    overrideEmissionFactorHeat,
    overrideJustification,
    editUseCustomFuel,
    editCustomFuelName,
    editProcessType,
    categoryCode,
  } = ctx;

  const reportingPeriod =
    formData.reporting_period_start === formData.reporting_period_end
      ? formData.reporting_period_start
      : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;

  // Dynamic values
  const dynamicValues = buildDynamicValues(ctx);
  const isProcessEmissions = categoryCode === 'process_emissions';
  const savedCalculationMethodology = dynamicValues.calculation_methodology;
  const calculationMethodology = typeof savedCalculationMethodology === 'object'
    ? savedCalculationMethodology?.value || null
    : savedCalculationMethodology || null;
  if (isProcessEmissions && editProcessType) {
    dynamicValues.process_type = { value: editProcessType, unit: '' };
  }

  // Outputs
  const outputs = {};
  if (effectiveCalculatedEmissions) {
    outputs.co2 = { value: effectiveCalculatedEmissions.co2Emissions || 0, unit: 'tCO2' };
    outputs.ch4 = { value: effectiveCalculatedEmissions.ch4Emissions || 0, unit: 'tCH4' };
    outputs.n2o = { value: effectiveCalculatedEmissions.n2oEmissions || 0, unit: 'tN2O' };
    outputs.co2e = { value: effectiveCalculatedEmissions.co2eEmissions || 0, unit: 'tCO2e' };
  }

  return {
    facility_id: formData.facility_id,
    reporting_period: reportingPeriod,
    frequency_type: editingEmission?.frequency_type || 'monthly',
    scope: formData.scope,
    category: formData.category,
    category_code: categoryCode || null,
    sub_category: formData.sub_category,
    fuel_type: editUseCustomFuel ? editCustomFuelName : formData.fuel_type,
    fuel_database_id: editUseCustomFuel ? null : formData.fuel_id,
    is_custom_fuel: editUseCustomFuel || false,
    custom_fuel_name: editUseCustomFuel ? editCustomFuelName : null,
    calculation_methodology: calculationMethodology,
    process_type: isProcessEmissions ? editProcessType || null : null,

    formula_id: effectiveCalculatedEmissions?.formulaId || editingEmission?.formula_id || null,
    formula_version_id: editingEmission?.formula_version_id
      ? (effectiveCalculatedEmissions?.formulaVersionId || editingEmission.formula_version_id)
      : null,
    decision_tree_version_id: editingEmission?.decision_tree_version_id || null,

    // (Biogenic spread retained — kept by Scope1Edit only when scope==='biogenic',
    // which only happens for biogenic-scope1 since biogenic-scope3 takes the
    // Scope3 module path higher up in handleSubmit.)
    ...(formData.scope === 'biogenic' && {
      biogenic_scope_selection: ctx.biogenicScopeSelection,
    }),

    dynamic_field_values: {
      ...dynamicValues,
      ...(formData.scope === 'biogenic' && {
        biogenic_scope_selection: { value: ctx.biogenicScopeSelection, unit: '' },
      }),
    },

    outputs,

    source_of_information: formData.source_of_information,
    record_source: formData.record_source ? String(formData.record_source).trim() : '',
    notes: formData.notes,
    justification: formData.justification,
    evidence_url: formData.evidence_url,
    responsible_person: formData.responsible_person,
    responsible_person_designation: formData.responsible_person_designation,
    responsible_person_contact: formData.responsible_person_contact,

    process_names: formData.process_names.filter((p) => p.name && p.name.trim() !== '').map((p) => p.name),
    process_descriptions: formData.process_names
      .filter((p) => p.name && p.name.trim() !== '')
      .map((p) => ({ name: p.name, description: p.description || '' })),

    // Override justification — Scope 1/2 only when any override enabled
    ...((formData.scope === 'scope1' || formData.scope === 'scope2') &&
      (isOverrideCV || isOverrideDensity || overrideEmissionFactorHeat) && {
        override_justification: overrideJustification,
      }),
  };
}

/**
 * Factory: binds a module reference for capability-aware overrides
 * in future. Use the same calling convention as `Scope3FlatEdit`.
 */
export function createScope1EditApi(module) {
  return {
    validateEditSubmission: (ctx) => validateEditSubmission({ ...ctx, module }),
    buildEditPayload: (ctx) => buildEditPayload({ ...ctx, module }),
  };
}

export default {
  validateEditSubmission,
  buildEditPayload,
  createScope1EditApi,
};
