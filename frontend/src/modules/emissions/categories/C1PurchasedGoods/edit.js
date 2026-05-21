/**
 * C1 Purchased Goods and Services — Edit-flow business logic
 *
 * Mirrors the C7 pattern: pure functions own validation + payload construction
 * for the C1 edit dialog. UI rendering uses the shared
 * `Scope3DynamicFieldsRenderer` (wired in module init).
 *
 * IMPORTANT: validations, payload shape, and behaviour are byte-identical
 * with the previous shared inline implementation in `Emissions.js`.
 *
 * NOTE: This file establishes the contract for flat-field categories. When
 * C2..C15 migrate, the shared helpers below can be promoted to
 * `/categories/shared/Scope3FlatEdit.js` and re-used.
 */

// ---------- helpers ----------

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
 * Validate the C1 edit submission.
 *
 * @param {Object} ctx
 * @param {string} ctx.scope3Method
 * @param {string} ctx.scope3ActivityId
 * @param {string} ctx.scope3CustomActivity
 * @param {boolean} ctx.useCustomActivity
 * @param {Array}  ctx.dynamicInputFields
 * @param {Object} ctx.dynamicFieldValues
 * @param {Array}  ctx.processNames           formData.process_names
 * @param {Object} ctx.effectiveCalculatedEmissions
 * @returns {{ valid: boolean, errorMessage?: string, validProcessNames?: Array }}
 */
export function validateEditSubmission(ctx) {
  const {
    scope3Method,
    scope3ActivityId,
    scope3CustomActivity,
    useCustomActivity,
    dynamicInputFields,
    dynamicFieldValues,
    processNames,
    effectiveCalculatedEmissions,
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

  // Supplier basis unit validation
  if (scope3Method === 'supplier_basis') {
    const supplierFields = (dynamicInputFields || []).filter((f) =>
      f.variable?.includes('supplier') || f.variable?.includes('Supplier')
    );
    for (const field of supplierFields) {
      const value = dynamicFieldValues[field.variable];
      const unit = dynamicFieldValues[`${field.variable}_unit`];
      if (value !== undefined && value !== '' && (!unit || unit.trim() === '')) {
        return { valid: false, errorMessage: `Please enter a unit for ${field.label}` };
      }
    }
  }

  // Calc engine must have produced a result
  if (!effectiveCalculatedEmissions) {
    return { valid: false, errorMessage: 'Unable to calculate emissions. Please check all values.' };
  }

  // Dynamic override / optional fields — value required when checkbox enabled
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
 * Build the C1 PUT payload — byte-identical with prior inline implementation.
 *
 * @param {Object} ctx — see validateEditSubmission + the following:
 * @param {Object} ctx.formData
 * @param {Object} ctx.editingEmission
 * @param {string} ctx.scope3ActivityType
 * @param {string} ctx.scope3Subcategory
 * @param {string} ctx.biogenicScopeSelection
 * @param {Array}  ctx.filteredScope3Activities
 * @returns {Object} payload
 */
export function buildEditPayload(ctx) {
  const {
    formData,
    editingEmission,
    scope3Method,
    scope3ActivityId,
    scope3ActivityType,
    scope3Subcategory,
    scope3CustomActivity,
    useCustomActivity,
    biogenicScopeSelection,
    filteredScope3Activities,
    effectiveCalculatedEmissions,
    dynamicInputFields,
  } = ctx;

  const isBiogenicScope3Save = formData.scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const isScope3LikeSave = formData.scope === 'scope3' || isBiogenicScope3Save;
  const ctxFull = { ...ctx, isScope3LikeSave };

  const reportingPeriod =
    formData.reporting_period_start === formData.reporting_period_end
      ? formData.reporting_period_start
      : `${formData.reporting_period_start} to ${formData.reporting_period_end}`;

  // Dynamic field values
  const dynamicValues = buildDynamicValues(ctxFull);

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

    // C1 has no asset_name, no from/to location, no employee fields
    ...(isScope3LikeSave && {
      supplier_name: formData.supplier_name || null,
      supplier_code: formData.supplier_code || null,
    }),
  };
}

export const editApi = {
  validateEditSubmission,
  buildEditPayload,
};

export default editApi;
