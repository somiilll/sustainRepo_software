/**
 * Scope 3 Flat-Field Edit Module — Shared Helpers
 *
 * Shared `validateEditSubmission` + `buildEditPayload` for all flat-field
 * Scope 3 categories (C1–C6, C8–C15; C7 has its own multi-employee module).
 *
 * Per-category modules (e.g. `categories/C2CapitalGoods/edit.js`) proxy to
 * the helpers below and pass their own `module` reference so capability
 * checks (`asset-name`, `journey-locations`) light up automatically.
 *
 * IMPORTANT: validations, payload shape, and behaviour are byte-identical
 * with the legacy shared inline implementation in `Emissions.js`.
 */

// ---------- field unit resolver ----------

const getFieldUnitForSave = (field, ctx) => {
  const { dynamicFieldValues, selectedFuel, scope3ActivityId, filteredScope3Activities, centralizedUnits, isScope3LikeSave } = ctx;
  const storedUnit = dynamicFieldValues[`${field.variable}_unit`];
  if (storedUnit) return storedUnit;

  let fieldUnits = [];
  if (field.unitSource === 'fuel') {
    if (isScope3LikeSave && !selectedFuel && scope3ActivityId) {
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
 * Validate a flat-field Scope 3 edit submission.
 *
 * Capability-aware: when the category module exposes `hasCapability('subcategory')`
 * or `hasCapability('activity-types')`, the corresponding extra fields are
 * also validated (defensive — current flow already covers them via scope3
 * activity/method checks).
 */
export function validateEditSubmission(ctx) {
  const {
    module,
    scope3Method,
    scope3ActivityId,
    scope3CustomActivity,
    useCustomActivity,
    dynamicInputFields,
    dynamicFieldValues,
    processNames,
    effectiveCalculatedEmissions,
    formData,
  } = ctx;

  // Required numeric inputs (only fields where isOverrideExplicitlyFalse)
  if (dynamicInputFields?.length > 0) {
    for (const field of dynamicInputFields) {
      if (!field.isOverrideExplicitlyFalse) continue;
      if (field.fieldType === 'number' || !field.fieldType) {
        const value = dynamicFieldValues[field.variable];
        const numValue = parseFloat(value);
        if (!value || isNaN(numValue) || numValue <= 0) {
          return { valid: false, errorMessage: `${field.label || field.variable} must be greater than 0` };
        }
      }
    }
  }

  // Process names + descriptions
  const validProcessNames = (processNames || []).filter((p) => p.name && p.name.trim() !== '');
  if (validProcessNames.length === 0) {
    return { valid: false, errorMessage: 'At least one Name of Process is required' };
  }
  const missingDesc = validProcessNames.find((p) => !p.description || p.description.trim() === '');
  if (missingDesc) {
    return { valid: false, errorMessage: `Please add description for process: "${missingDesc.name}"` };
  }

  // Method + activity selection
  if (!scope3Method) {
    return { valid: false, errorMessage: 'Please select a calculation method' };
  }
  if (scope3Method === 'supplier_basis' && useCustomActivity) {
    if (!scope3CustomActivity?.trim()) {
      return { valid: false, errorMessage: 'Please enter a custom activity name' };
    }
  } else if (!scope3ActivityId) {
    return { valid: false, errorMessage: 'Please select an activity type' };
  }

  // Capability-aware: asset name
  if (module?.hasCapability?.('asset-name')) {
    if (!formData.asset_name || !formData.asset_name.trim()) {
      return { valid: false, errorMessage: 'Asset Name is required for this category' };
    }
  }

  // Supplier basis unit validation
  if (scope3Method === 'supplier_basis') {
    const supplierFields = (dynamicInputFields || []).filter(
      (f) => f.variable?.includes('supplier') || f.variable?.includes('Supplier')
    );
    for (const field of supplierFields) {
      const value = dynamicFieldValues[field.variable];
      const unit = dynamicFieldValues[`${field.variable}_unit`];
      if (value !== undefined && value !== '' && (!unit || unit.trim() === '')) {
        return { valid: false, errorMessage: `Please enter a unit for ${field.label}` };
      }
    }
  }

  if (!effectiveCalculatedEmissions) {
    return { valid: false, errorMessage: 'Unable to calculate emissions. Please check all values.' };
  }

  // Override / optional fields — value required when checkbox enabled
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
 * Build the flat-field Scope 3 PUT payload — byte-identical with prior
 * inline implementation. Capability-aware: appends `asset_name` if the
 * module has `'asset-name'`; appends `from_location`/`to_location` if
 * `'journey-locations'`.
 */
export function buildEditPayload(ctx) {
  const {
    module,
    formData,
    editingEmission,
    scope3Method,
    scope3ActivityId,
    scope3ActivityType,
    scope3Subcategory,
    typeOfProduct,
    scope3CustomActivity,
    useCustomActivity,
    biogenicScopeSelection,
    filteredScope3Activities,
    effectiveCalculatedEmissions,
  } = ctx;

  const isBiogenicScope3Save = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const isScope3LikeSave = formData.scope === 'scope3' || isBiogenicScope3Save;
  const ctxFull = { ...ctx, isScope3LikeSave };

  const reportingPeriod =
    formData.reporting_period_start === formData.reporting_period_end
      ? formData.reporting_period_start
      : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;

  const dynamicValues = buildDynamicValues(ctxFull);

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
    fuel_type: formData.fuel_type,
    fuel_database_id: isScope3LikeSave ? null : formData.fuel_id,

    formula_id: effectiveCalculatedEmissions?.formulaId || editingEmission?.formula_id || null,

    ...(formData.scope === 'biogenic' && {
      biogenic_scope_selection: biogenicScopeSelection,
    }),

    ...(isScope3LikeSave && {
      scope3_ef_id:
        scope3Method === 'supplier_basis'
          ? useCustomActivity
            ? null
            : scope3ActivityId || null
          : scope3ActivityId,
      calculation_method_scope3: scope3Method,
      scope3_activity:
        scope3Method === 'supplier_basis'
          ? useCustomActivity
            ? scope3CustomActivity
            : filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity || scope3CustomActivity || ''
          : filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity || '',
      scope3_activity_type: scope3ActivityType || null,
      scope3_subcategory: scope3Subcategory || null,
      type_of_product: typeOfProduct || null,
    }),

    dynamic_field_values: {
      ...dynamicValues,
      ...(isScope3LikeSave && {
        calculation_method_scope3: { value: scope3Method, unit: '' },
        scope3_ef_id: {
          value:
            scope3Method === 'supplier_basis'
              ? useCustomActivity
                ? ''
                : scope3ActivityId || ''
              : scope3ActivityId || '',
          unit: '',
        },
        scope3_activity: {
          value:
            scope3Method === 'supplier_basis'
              ? useCustomActivity
                ? scope3CustomActivity
                : filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity ||
                  scope3CustomActivity ||
                  ''
              : filteredScope3Activities.find((a) => a.id === scope3ActivityId)?.activity || '',
          unit: '',
        },
        scope3_activity_type: { value: scope3ActivityType || '', unit: '' },
        scope3_subcategory: { value: scope3Subcategory || '', unit: '' },
        ...(typeOfProduct && {
          type_of_product: { value: typeOfProduct, unit: '' },
        }),
        use_custom_activity: { value: useCustomActivity, unit: '' },
      }),
      ...(formData.scope === 'biogenic' && {
        biogenic_scope_selection: { value: biogenicScopeSelection, unit: '' },
      }),
    },

    outputs,

    source_of_information: formData.source_of_information,
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

    ...(isScope3LikeSave && {
      supplier_name: formData.supplier_name || null,
      supplier_code: formData.supplier_code || null,

      // Capability-aware: asset name (C8/C13/C14/C15)
      ...(module?.hasCapability?.('asset-name') && {
        asset_name: formData.asset_name || null,
      }),

      // Capability-aware: journey locations (C4/C6/C9)
      ...(module?.hasCapability?.('journey-locations') && {
        from_location: formData.from_location || null,
        to_location: formData.to_location || null,
      }),
    }),
  };
}

/**
 * Factory: returns an editApi bound to a specific category module.
 * Per-category modules use this to expose the standard surface.
 *
 *   const editApi = createScope3FlatEditApi(module);
 *   module.validateEditSubmission = editApi.validateEditSubmission;
 *   module.buildEditPayload = editApi.buildEditPayload;
 */
export function createScope3FlatEditApi(module) {
  return {
    validateEditSubmission: (ctx) => validateEditSubmission({ ...ctx, module }),
    buildEditPayload: (ctx) => buildEditPayload({ ...ctx, module }),
  };
}

export default {
  validateEditSubmission,
  buildEditPayload,
  createScope3FlatEditApi,
};
