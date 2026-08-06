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

const buildDynamicValues = (ctx) => {
  const { dynamicInputFields, dynamicFieldValues } = ctx;
  const dynamicValues = {};
  if (!dynamicInputFields || dynamicInputFields.length === 0) return dynamicValues;

  dynamicInputFields.forEach((field) => {
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

  return dynamicValues;
};

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
  } = ctx;

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

  // 3. Required numeric input fields (isOverrideExplicitlyFalse)
  if (dynamicInputFields?.length > 0) {
    for (const field of dynamicInputFields) {
      if (!field.isOverrideExplicitlyFalse || field.fieldKey == 'ef_quantity') continue;
      if (field.fieldType === 'number' || !field.fieldType) {
        const value = dynamicFieldValues[field.variable];
        const numValue = parseFloat(value);
        if (!value || isNaN(numValue) || numValue <= 0) {
          return { valid: false, errorMessage: `${field.label || field.variable} must be greater than 0` };
        }
      }
    }
  }

  // 4. Process names + descriptions
  const validProcessNames = (formData.process_names || []).filter((p) => p.name && p.name.trim() !== '');
  if (validProcessNames.length === 0) {
    return { valid: false, errorMessage: 'At least one Name of Process is required' };
  }
  const missingDesc = validProcessNames.find((p) => !p.description || p.description.trim() === '');
  if (missingDesc) {
    return { valid: false, errorMessage: `Please add description for process: "${missingDesc.name}"` };
  }

  // 5. Fuel selection — Process Emissions don't require fuel
  const isProcessEmissions = formData.category?.toLowerCase().includes('process');
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
  const overrideAndOptionalFields = (dynamicInputFields || []).filter(
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
  } = ctx;

  const reportingPeriod =
    formData.reporting_period_start === formData.reporting_period_end
      ? formData.reporting_period_start
      : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;

  // Dynamic values
  const dynamicValues = buildDynamicValues(ctx);

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
    sub_category: formData.sub_category,
    fuel_type: editUseCustomFuel ? editCustomFuelName : formData.fuel_type,
    fuel_database_id: editUseCustomFuel ? null : formData.fuel_id,
    is_custom_fuel: editUseCustomFuel || false,
    custom_fuel_name: editUseCustomFuel ? editCustomFuelName : null,

    formula_id: effectiveCalculatedEmissions?.formulaId || editingEmission?.formula_id || null,

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
