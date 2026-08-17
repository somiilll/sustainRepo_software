/**
 * Scope 1 Create Module — Shared Helpers
 *
 * CREATE-flow companion to `Scope1Edit.js`. Owns validation +
 * per-month payload construction for all Scope 1 categories
 * (Stationary / Mobile / Fugitive Combustion + generic) and Scope 2
 * (Purchased Electricity / Steam / Heating / Cooling — same payload shape).
 *
 * Capability-aware: the module reference passed in via `ctx.module`
 * controls future per-category behaviour. Scope 1/2 have no capabilities
 * today; helpers are factored out for symmetry with Scope 3.
 *
 * Calc-engine invocation stays in the host page.
 */

import { buildCustomFuelCalculationPayload } from '../../../../pages/emissions/utils/customFuelCalcAdapter';

// ---------- field unit resolver (Scope 1/2: no scope3_ef branch) ----------

function resolveFieldUnit(field, data, ctx) {
  const { selectedFuel, centralizedUnits } = ctx;

  let fieldUnits = [];
  if (field.unitSource === 'fuel') {
    fieldUnits = selectedFuel?.allowed_units || [];
  } else if (field.unitSource === 'all_units') {
    fieldUnits = centralizedUnits.map((u) => u.symbol);
  } else {
    fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
  }
  return data[`${field.variable}_unit`] || fieldUnits[0] || field.expectedUnit || '';
}

// ---------- input + override extraction ----------

export function extractInputsForCalcEngine(data, ctx) {
  if (ctx.useCustomFuel) {
    const customFuelCalculation = buildCustomFuelCalculationPayload({
      dynamicFieldValues: data,
      calculationMethodology: ctx.buildDecisionInputs?.(data)?.calculation_methodology,
    });
    const quantity = customFuelCalculation.inputs.qty;
    return {
      inputs: customFuelCalculation.inputs,
      userOverrides: customFuelCalculation.userOverrides,
      primaryQuantity: quantity?.value || 0,
      primaryUnit: quantity?.unit || ctx.defaultUnit || '',
      isCustomFuelReady: customFuelCalculation.isReady,
    };
  }
  const { dynamicInputFields } = ctx;
  const inputs = {};
  const userOverrides = {};
  let primaryQuantity = 0;
  let primaryUnit = ctx.defaultUnit || '';

  dynamicInputFields.forEach((field) => {
    const value = data[field.variable] !== undefined ? data[field.variable] : data[field.fieldKey];
    if (value === undefined || value === null || value === '') return;

    const numValue = parseFloat(value);
    if (!Number.isFinite(numValue)) return;

    const unit = resolveFieldUnit(field, data, ctx);

    if (!field.isOverride && primaryQuantity === 0) {
      primaryQuantity = numValue;
      primaryUnit = unit;
    }

    if (field.isOverride) {
      const overrideKey = `override_${field.variable}`;
      if (data[overrideKey]) {
        userOverrides[field.variable] = { value: numValue, unit };
      }
    } else {
      inputs[field.variable] = { value: numValue, unit };
    }
  });

  return { inputs, userOverrides, primaryQuantity, primaryUnit };
}

export function buildDynamicFieldValues(data, ctx) {
  const { dynamicInputFields } = ctx;
  const out = {};

  dynamicInputFields.forEach((field) => {
    const value = data[field.variable] !== undefined ? data[field.variable] : data[field.fieldKey];
    const unit = resolveFieldUnit(field, data, ctx);

    if (field.isOverride) {
      const isOverridden = data[`override_${field.variable}`] || false;
      out[field.variable] = {
        value: isOverridden && value !== undefined && value !== '' ? parseFloat(value) : null,
        unit,
        is_override: isOverridden,
        justification: data[`${field.variable}_justification`] || '',
      };
    } else if (!field.required) {
      const isOptionalOverridden = data[`override_${field.variable}`] || false;
      const parsedValue = value !== undefined && value !== '' ? parseFloat(value) : null;
      out[field.variable] = {
        value: isOptionalOverridden ? parsedValue : null,
        unit,
        ...(isOptionalOverridden && parsedValue !== null && { is_override: true }),
      };
    } else {
      const parsedValue = value !== undefined && value !== '' ? parseFloat(value) : null;
      out[field.variable] = { value: parsedValue, unit };
    }
  });

  if (ctx.useCustomFuel) {
    const hasValue = (value) => value !== undefined && value !== null && value !== '';
    const parseValue = (value) => (hasValue(value) ? parseFloat(value) : null);
    const quantity = hasValue(data.qty) ? data.qty : data.quantity;
    const quantityUnit = data.custom_qty_unit || data.qty_unit || data.quantity_unit || data.unit || ctx.defaultUnit || 'kg';
    const decisionInputs = ctx.buildDecisionInputs?.(data) || {};
    const calculationMethodology = data.calculation_methodology
      || decisionInputs.calculation_methodology
      || 'using_heat_basis_ncv';

    // CustomFuelMonthFields owns these per-period inputs, so they must not
    // depend on the standard dynamic field list for persistence.
    out.qty = { value: parseValue(quantity), unit: quantityUnit };
    if (hasValue(data.custom_ef)) {
      out.custom_ef = { value: parseValue(data.custom_ef), unit: data.custom_ef_unit || '' };
    }
    if (hasValue(data.custom_cv)) {
      out.custom_cv = { value: parseValue(data.custom_cv), unit: data.custom_cv_unit || '' };
    }
    if (hasValue(data.custom_carbon_content)) {
      out.custom_carbon_content = { value: parseValue(data.custom_carbon_content), unit: '%' };
    }
    if (hasValue(data.custom_oxidation_factor)) {
      out.custom_oxidation_factor = { value: parseValue(data.custom_oxidation_factor), unit: '' };
    }
    if (hasValue(data.density)) {
      out.density = { value: parseValue(data.density), unit: data.density_unit || 'kg/L' };
    }
    out.calculation_methodology = { value: calculationMethodology, unit: '' };
  }

  return out;
}

export function buildDecisionContext(data, ctx) {
  const {
    scope,
    category,
    facilityId,
    reportingPeriod,
    fuelId,
    selectedFuel,
    biogenicScopeSelection,
    buildDecisionInputs,
    useCustomFuel,
    customFuelName,
  } = ctx;

  // For Scope 1/2: no scope3 fields; biogenic-scope1 keeps scope='biogenic' in record but
  // calc-engine uses scope1 for formula resolution.
  const effectiveScope =
    scope === 'biogenic' && biogenicScopeSelection === 'scope1' ? 'scope1' : scope;

  const decisionInputs = buildDecisionInputs(data);

  const context = {
    fuel_name: useCustomFuel ? customFuelName : selectedFuel?.fuel_name,
    fuel_id: useCustomFuel ? null : fuelId,
    scope: effectiveScope,
    category,
    facility_id: facilityId,
    reporting_period: reportingPeriod,
    is_custom_fuel: useCustomFuel || false,
  };

  return { decisionInputs, context, effectiveScope };
}

// ---------- validation ----------

/**
 * Pre-loop validation for Scope 1/2 + biogenic-scope1 CREATE.
 *
 * Mirrors the legacy gating: process-name, override justification,
 * fuel selection, calc prerequisite. Per-month override value validity
 * is checked downstream during the per-month loop (caller iterates).
 */
export function validateCreateSubmission(ctx) {
  const {
    formData,
    fuelId,
    useCustomFuel,
    customFuelName,
    processNames,
    isOverrideCV,
    isOverrideDensity,
    overrideEmissionFactorHeat,
    overrideJustification,
    scope,
    buildDecisionInputs,
  } = ctx;

  // Process names + descriptions
  const validProcessNames = (processNames || []).filter((p) => p.name && p.name.trim() !== '');
  if (validProcessNames.length === 0) {
    return { valid: false, errorMessage: 'At least one Name of Process is required' };
  }
  const missingDesc = validProcessNames.find((p) => !p.description || p.description.trim() === '');
  if (missingDesc) {
    return { valid: false, errorMessage: `Please add description for process: "${missingDesc.name}"` };
  }

  // Fuel selection — Process Emissions don't require fuel
  const isProcessEmissions = Boolean(ctx.capabilities?.processType);
  if (!isProcessEmissions) {
    if (!fuelId && !useCustomFuel) {
      return { valid: false, errorMessage: 'Please select a fuel from the database' };
    }
    if (useCustomFuel && !customFuelName?.trim()) {
      return { valid: false, errorMessage: 'Please enter a custom fuel name' };
    }
  } else if (!buildDecisionInputs?.({}).process_type) {
    return { valid: false, errorMessage: 'Please select a process type' };
  }

  // Override justification (Scope 1/2 only)
  const hasAnyOverride = isOverrideCV || isOverrideDensity || overrideEmissionFactorHeat;
  if (hasAnyOverride && (scope === 'scope1' || scope === 'scope2')) {
    if (!overrideJustification?.trim() || overrideJustification.trim().length < 20) {
      return {
        valid: false,
        errorMessage: 'Override justification must be at least 20 characters when overriding default values',
      };
    }
  }

  // Override CV/density justifications
  if (isOverrideCV && !formData?.calorific_value_justification?.trim()) {
    return { valid: false, errorMessage: 'Justification is required when overriding Calorific Value' };
  }
  if (isOverrideDensity && !formData?.density_justification?.trim()) {
    return { valid: false, errorMessage: 'Justification is required when overriding Density' };
  }

  return { valid: true, validProcessNames };
}

// ---------- payload (per-month) ----------

/**
 * Build the POST payload for a SINGLE month after calc-engine results
 * are known. Caller iterates months and calls this once per month.
 */
export function buildCreatePayload(monthData, ctx) {
  const {
    facilityId,
    reportingPeriod,
    scope,
    category,
    biogenicScopeSelection,
    fuelId,
    selectedFuel,
    useCustomFuel,
    customFuelName,
    customSource,
    recordSource,
    notes,
    responsiblePerson,
    responsiblePersonDesignation,
    responsiblePersonContact,
    validProcesses,
    isOverrideCV,
    isOverrideDensity,
    overrideEmissionFactorHeat,
    overrideJustification,
    buildDecisionInputs,
    // calc-engine outputs
    calculatedCO2,
    calculatedCH4,
    calculatedN2O,
    calculatedCO2e,
    resolvedFormulaId,
  } = ctx;

  const dynamicFieldValues = buildDynamicFieldValues(monthData, ctx);
  const decisionInputs = buildDecisionInputs ? buildDecisionInputs(monthData) : {};
  const processType = decisionInputs.process_type || null;

  if (processType) {
    dynamicFieldValues.process_type = { value: processType, unit: '' };
  }

  const outputs = {
    co2: { value: calculatedCO2 || 0, unit: 'tCO2' },
    ch4: { value: calculatedCH4 || 0, unit: 'tCH4' },
    n2o: { value: calculatedN2O || 0, unit: 'tN2O' },
    co2e: { value: calculatedCO2e || 0, unit: 'tCO2e' },
  };

  const hasAnyOverride = isOverrideCV || isOverrideDensity || overrideEmissionFactorHeat;

  return {
    facility_id: facilityId,
    reporting_period: reportingPeriod,
    scope, // Keep original scope (biogenic stays biogenic)
    category,
    sub_category: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
    fuel_type: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
    fuel_database_id: useCustomFuel ? null : fuelId,
    is_custom_fuel: useCustomFuel || false,
    custom_fuel_name: useCustomFuel ? customFuelName : null,
    process_type: processType,

    formula_id: resolvedFormulaId,

    ...(scope === 'biogenic' && {
      biogenic_scope_selection: biogenicScopeSelection,
    }),

    dynamic_field_values: {
      ...dynamicFieldValues,
      ...(scope === 'biogenic' && {
        biogenic_scope_selection: { value: biogenicScopeSelection, unit: '' },
      }),
    },

    outputs,

    source_of_information: useCustomFuel ? customSource : selectedFuel?.source || '',
    record_source: recordSource ? String(recordSource).trim() : '',
    notes,
    justification: useCustomFuel ? `Custom fuel type: ${customFuelName}` : null,
    evidence_url: monthData.evidences?.map((e) => e.url).join(',') || '',
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation,
    responsible_person_contact: responsiblePersonContact,
    process_names: validProcesses.map((p) => p.name),
    process_descriptions: validProcesses.map((p) => ({ name: p.name, description: p.description || '' })),

    // Override justification — Scope 1/2 only when any override enabled
    ...((scope === 'scope1' || scope === 'scope2') && hasAnyOverride && {
      override_justification: overrideJustification,
    }),
  };
}

/**
 * Factory: returns a createApi bound to a specific module.
 * Mirrors `createScope1EditApi`.
 */
export function createScope1CreateApi(module) {
  return {
    validateCreateSubmission: (ctx) => validateCreateSubmission({ ...ctx, module }),
    buildCreatePayload: (monthData, ctx) => buildCreatePayload(monthData, { ...ctx, module }),
    extractInputsForCalcEngine: (data, ctx) => extractInputsForCalcEngine(data, { ...ctx, module }),
    buildDynamicFieldValues: (data, ctx) => buildDynamicFieldValues(data, { ...ctx, module }),
    buildDecisionContext: (data, ctx) => buildDecisionContext(data, { ...ctx, module }),
  };
}

export default {
  validateCreateSubmission,
  buildCreatePayload,
  extractInputsForCalcEngine,
  buildDynamicFieldValues,
  buildDecisionContext,
  createScope1CreateApi,
};
