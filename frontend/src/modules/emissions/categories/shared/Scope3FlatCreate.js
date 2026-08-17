/**
 * Scope 3 Flat-Field Create Module — Shared Helpers
 *
 * CREATE-flow companion to `Scope3FlatEdit.js`. Owns validation +
 * per-month payload construction for all flat-field Scope 3 categories
 * (C1–C6, C8–C15; C7 has its own multi-employee module).
 *
 * Per-category modules (e.g. `categories/C2CapitalGoods/create.js`) proxy
 * to the helpers below and pass their own `module` reference so capability
 * checks (`asset-name`, `journey-locations`) light up automatically.
 *
 * IMPORTANT: validations, payload shape, and behaviour are byte-identical
 * with the legacy inline implementation in
 * `EmissionEntryForm.js handleSubmit` (REGULAR FUEL EMISSIONS HANDLING block).
 *
 * Calc-engine invocation stays in the host page — this module only owns
 * payload shape + pre-/post-calc payload assembly.
 */

// ---------- field unit resolver (mirrors legacy CREATE) ----------

/**
 * Resolve the unit symbol for a single dynamic field given a per-month
 * `data` row + ctx. Mirrors the legacy `unitSource` switching exactly.
 */
function resolveFieldUnit(field, data, ctx) {
  const {
    selectedFuel,
    centralizedUnits,
    filteredScope3Activities,
    scope3ActivityId,
    requiresSubcategory,
    isScope3Like,
  } = ctx;

  let fieldUnits = [];
  if (field.unitSource === 'fuel') {
    if (isScope3Like && requiresSubcategory && !selectedFuel && scope3ActivityId) {
      const matchedActivity = filteredScope3Activities.find((a) => a.id === scope3ActivityId);
      fieldUnits = matchedActivity?.allowed_units || [];
    } else {
      fieldUnits = selectedFuel?.allowed_units || [];
    }
  } else if (field.unitSource === 'all_units') {
    fieldUnits = centralizedUnits.map((u) => u.symbol);
  } else if (field.unitSource === 'scope3_ef') {
    const matchedEF = filteredScope3Activities.find((a) => a.id === scope3ActivityId);
    if (matchedEF?.allowed_units?.length > 0) {
      fieldUnits = matchedEF.allowed_units;
    } else if (field.allowedUnits?.length > 0) {
      fieldUnits = field.allowedUnits;
    } else if (field.expectedUnit) {
      fieldUnits = [field.expectedUnit];
    } else {
      fieldUnits = [];
    }
  } else {
    fieldUnits = field.allowedUnits?.length > 0 ? field.allowedUnits : [field.expectedUnit].filter(Boolean);
  }
  return data[`${field.variable}_unit`] || fieldUnits[0] || field.expectedUnit || '';
}

// ---------- input + override extraction ----------

/**
 * Build `inputs` + `userOverrides` + `primaryQuantity`/`primaryUnit` from a
 * per-month `data` row. Used by the host page to call the calc engine and
 * by `buildDynamicFieldValues` below.
 */
export function extractInputsForCalcEngine(data, ctx) {
  const { dynamicInputFields } = ctx;
  const inputs = {};
  const userOverrides = {};
  let primaryQuantity = 0;
  let primaryUnit = ctx.defaultUnit || '';

  dynamicInputFields.forEach((field) => {
    if (field.presentationOnly) return;
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

/**
 * Build the `dynamic_field_values` dict embedded in the POST payload.
 * Exposed separately because the host page needs the same shape after
 * calc-engine returns.
 */
export function buildDynamicFieldValues(data, ctx) {
  const { dynamicInputFields } = ctx;
  const out = {};

  dynamicInputFields.forEach((field) => {
    if (field.presentationOnly) return;
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

  return out;
}

// ---------- decision context (Scope 3) ----------

/**
 * Build the `decision_inputs` + `context` objects for the calc-engine call.
 * Mirrors the legacy `buildDecisionInputs(data)` + context-spread block.
 */
export function buildDecisionContext(data, ctx) {
  const {
    scope,
    category,
    facilityId,
    reportingPeriod,
    fuelId,
    selectedFuel,
    biogenicScopeSelection,
    scope3Method,
    scope3ActivityId,
    scope3CustomActivity,
    useCustomActivity,
    scope3Subcategory,
    requiresSubcategory,
    filteredScope3Activities,
    buildDecisionInputs,
  } = ctx;

  const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');
  const effectiveScope = isScope3Like ? 'scope3' : scope;

  const decisionInputs = buildDecisionInputs(data);

  const matchedEF = filteredScope3Activities.find((a) => a.id === scope3ActivityId);
  let fuelNameForContext = selectedFuel?.fuel_name;
  if (
    isScope3Like &&
    requiresSubcategory &&
    scope3Method !== 'supplier_basis' &&
    scope3Subcategory === 'fugitive_emissions' &&
    matchedEF?.activity
  ) {
    fuelNameForContext = matchedEF.activity;
  }

  const context = {
    fuel_name: fuelNameForContext,
    fuel_id: fuelId,
    scope: effectiveScope,
    category,
    facility_id: facilityId,
    reporting_period: reportingPeriod,
    ...(isScope3Like && {
      calculation_method_scope3: scope3Method,
      scope3_ef_id: scope3ActivityId,
      activity:
        scope3Method === 'supplier_basis' && useCustomActivity
          ? scope3CustomActivity
          : matchedEF?.activity,
      scope3_ef_default_unit: matchedEF?.default_unit || '',
    }),
  };

  return { decisionInputs, context, effectiveScope, isScope3Like };
}

// ---------- validation (single-record / final pre-loop) ----------

/**
 * Pre-loop validation. The legacy code uses `canProceedToStep(5)` to
 * gate global form readiness — this helper only adds Scope-3-specific
 * extras (asset-name when capability set).
 *
 * @returns {{ valid: boolean, errorMessage?: string }}
 */
export function validateCreateSubmission(ctx) {
  const { module, formData, processNames } = ctx;

  const validProcessNames = (processNames || []).filter((p) => p.name && p.name.trim() !== '');
  if (validProcessNames.length === 0) {
    return { valid: false, errorMessage: 'At least one Name of Process is required' };
  }
  const missingDesc = validProcessNames.find((p) => !p.description || p.description.trim() === '');
  if (missingDesc) {
    return { valid: false, errorMessage: `Please add description for process: "${missingDesc.name}"` };
  }

  // Capability-aware: asset name (C8/C13/C14/C15)
  if (module?.hasCapability?.('asset-name')) {
    const assetName = ctx.assetName || formData?.asset_name;
    if (!assetName || !String(assetName).trim()) {
      return { valid: false, errorMessage: 'Asset Name is required for this category' };
    }
  }

  return { valid: true, validProcessNames };
}

// ---------- payload (per-month) ----------

/**
 * Build the PUT/POST-shaped payload for a SINGLE month after calc-engine
 * results are known. Caller iterates months and calls this once per month.
 *
 * Capability-aware: appends `asset_name` if `module.hasCapability('asset-name')`,
 * `from_location`/`to_location` if `'journey-locations'`, employee fields
 * if `category === 'Employee Commuting'`.
 *
 * Byte-identical with legacy CREATE payload structure.
 */
export function buildCreatePayload(monthData, ctx) {
  const {
    module,
    facilityId,
    reportingPeriod,
    scope,
    category,
    biogenicScopeSelection,
    scope3Method,
    scope3ActivityId,
    scope3ActivityType,
    scope3Subcategory,
    typeOfProduct,
    scope3CustomActivity,
    useCustomActivity,
    filteredScope3Activities,
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
    supplierName,
    supplierCode,
    employeeName,
    employeeId,
    assetName,
    fromLocation,
    toLocation,
    // calc-engine outputs
    calculatedCO2,
    calculatedCH4,
    calculatedN2O,
    calculatedCO2e,
    resolvedFormulaId,
  } = ctx;

  const isScope3Like = scope === 'scope3' || (scope === 'biogenic' && biogenicScopeSelection === 'scope3');

  const dynamicFieldValues = buildDynamicFieldValues(monthData, ctx);

  const outputs = {
    co2: { value: calculatedCO2 || 0, unit: 'tCO2' },
    ch4: { value: calculatedCH4 || 0, unit: 'tCH4' },
    n2o: { value: calculatedN2O || 0, unit: 'tN2O' },
    co2e: { value: calculatedCO2e || 0, unit: 'tCO2e' },
  };

  return {
    facility_id: facilityId,
    reporting_period: reportingPeriod,
    scope, // Keep original scope for record (biogenic stays biogenic)
    category,
    sub_category: isScope3Like
      ? filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity || ''
      : useCustomFuel
      ? customFuelName
      : selectedFuel?.fuel_name || '',
    fuel_type: useCustomFuel ? customFuelName : selectedFuel?.fuel_name || '',
    fuel_database_id: isScope3Like ? null : useCustomFuel ? null : fuelId,

    formula_id: resolvedFormulaId,

    ...(scope === 'biogenic' && {
      biogenic_scope_selection: biogenicScopeSelection,
    }),

    ...(isScope3Like && {
      calculation_method_scope3: scope3Method,
      scope3_ef_id: scope3Method === 'supplier_basis' ? null : scope3ActivityId,
      scope3_activity:
        scope3Method === 'supplier_basis' && useCustomActivity
          ? scope3CustomActivity
          : filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity || '',
      scope3_activity_type: scope3ActivityType || '',
      scope3_subcategory: scope3Subcategory || '',
      type_of_product: typeOfProduct || '',
    }),

    dynamic_field_values: {
      ...dynamicFieldValues,
      ...(isScope3Like && {
        calculation_method_scope3: { value: scope3Method, unit: '' },
        scope3_ef_id: {
          value: scope3Method === 'supplier_basis' && useCustomActivity ? '' : scope3ActivityId,
          unit: '',
        },
        scope3_activity: {
          value:
            scope3Method === 'supplier_basis' && useCustomActivity
              ? scope3CustomActivity
              : filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity || '',
          unit: '',
        },
        scope3_activity_type: { value: scope3ActivityType || '', unit: '' },
        scope3_subcategory: { value: scope3Subcategory || '', unit: '' },
        ...(typeOfProduct && {
          type_of_product: { value: typeOfProduct, unit: '' },
        }),
      }),
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

    ...(isScope3Like && {
      supplier_name: supplierName || null,
      supplier_code: supplierCode || null,

      // Employee Commuting (C7) — defensive; C7 normally has its own module
      ...(category === 'Employee Commuting' && {
        employee_name: employeeName || null,
        employee_id: employeeId || null,
      }),

      // Capability-aware: asset name (C8/C13/C14/C15)
      ...(module?.hasCapability?.('asset-name') && {
        asset_name: assetName || null,
      }),

      // Capability-aware: journey locations (C4/C6/C9)
      ...(module?.hasCapability?.('journey-locations') && {
        from_location: monthData?.from_location || fromLocation || null,
        to_location: monthData?.to_location || toLocation || null,
      }),
    }),

    // Flight details (per-month airport data for C6 air_travel)
    ...(monthData?.from_airport && {
      from_airport: monthData.from_airport,
    }),
    ...(monthData?.to_airport && {
      to_airport: monthData.to_airport,
    }),
    ...(monthData?.km_travelled != null && monthData?.from_airport && {
      flight_distance: {
        value: monthData.km_travelled,
        unit: 'km',
        method: monthData.flight_distance_method || (monthData.flight_distance_manual ? 'MANUAL' : 'HAVERSINE'),
        overridden: !!monthData.flight_distance_overridden,
      },
    }),
  };
}

/**
 * Factory: returns a createApi bound to a specific category module.
 * Mirrors `createScope3FlatEditApi`.
 */
export function createScope3FlatCreateApi(module) {
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
  createScope3FlatCreateApi,
};
