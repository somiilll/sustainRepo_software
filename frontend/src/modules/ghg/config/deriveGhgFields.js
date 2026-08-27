/**
 * Single shared GHG field-derivation path.
 *
 * Standard/resolved form config + explicit form context -> the fields to render
 * and the formula that will run.
 *
 * This is a verbatim extraction of the logic that lived inline in
 * `EmissionEntryForm.js` (the `dynamicInputFieldsResult` memo). Every fallback,
 * every ordering rule and both name-sniffing asymmetries are preserved on
 * purpose — behaviour must not change. Equivalence with the pre-extraction
 * implementation is asserted in
 * `__tests__/deriveGhgFields.equivalence.test.js` across all 24 categories and
 * all 158 reachable decision paths.
 *
 * Pure: no React, no network, no module state.
 */

/** Walk a decision tree with the given field values. Returns a formula id or null. */
export const traverseDecisionTree = (node, fieldValues) => {
  if (!node) return null;
  if (node.formula_id) return node.formula_id;
  const fieldName = node.field_name;
  if (!fieldName) return null;
  const selectedValue = fieldValues[fieldName];
  if (!selectedValue) return null;
  const selectedOption = (node.options || {})[selectedValue];
  if (!selectedOption) return null;
  if (selectedOption.formula_id) return selectedOption.formula_id;
  if (selectedOption.next) return traverseDecisionTree(selectedOption.next, fieldValues);
  return null;
};

// Activity type -> formula name patterns, used only when the decision tree does
// not resolve a formula. Note: scope3_ef uses the singular `hotel_stay`.
const ACTIVITY_TYPE_TO_FORMULA_TERMS = {
  hotel_stay: ['hotel'],
  air_travel: ['passenger', 'distance'],
  water_travel: ['passenger', 'distance'],
  taxi_travel: ['passenger', 'distance'],
  bus_travel: ['passenger', 'distance'],
  rail_travel: ['passenger', 'distance'],
  car_travel: ['km travelled', 'km_travelled'],
  bike_travel: ['km travelled', 'km_travelled'],
  wfh: ['wfh', 'work from home'],
};

const METHOD_TO_FORMULA_TERMS = {
  spend_basis: ['spend', 'Spent'],
  spend_based: ['spend', 'Spent'],
  activity_basis: ['activity'],
  supplier_basis: ['supplier', 'Supplier'],
};

const SUBCATEGORY_TO_FORMULA_TERMS = {
  fugitive_emissions: ['fugitive'],
  stationary_combustion: ['stationary'],
  mobile_combustion: ['mobile'],
  energy: ['energy', 'electricity'],
  electricity: ['energy', 'electricity'],
};

// Custom fuel handles these per month in CustomFuelMonthFields, so they are
// suppressed from the standard field list.
const HANDLED_BY_CUSTOM_FUEL = ['density', 'cv', 'ef_quantity', 'carbon_content', 'oxidation_factor'];

const findByNameTerms = (formulas, terms) =>
  formulas.find((f) => {
    const name = f.name?.toLowerCase() || '';
    return terms.some((term) => name.includes(term.toLowerCase()));
  });

const resolveScope3Formula = (formConfig, context) => {
  const {
    scope3Method,
    spendCurrencyConversionMethod,
    scope3ActivityType,
    scope3Subcategory,
    typeOfProduct,
    savedFormulaId,
  } = context;
  let matchedFormula = null;

  if (formConfig.decision_tree) {
    const formulaId = traverseDecisionTree(formConfig.decision_tree, {
      calculation_method_scope3: scope3Method,
      spend_currency_conversion_method: spendCurrencyConversionMethod,
      activity_type: scope3ActivityType || undefined,
      subcategory_selection: scope3Subcategory || undefined,
      type_of_product: typeOfProduct || undefined,
    });
    if (formulaId) {
      matchedFormula = formConfig.formulas.find((f) => f.id === formulaId);
    }
  }

  // Some historical Scope 3 records predate complete decision-tree metadata.
  // Keep their category-specific fallback in the shared resolver rather than in
  // the Edit component, so both flows retain one canonical derivation path.
  if (
    !matchedFormula &&
    scope3Method === 'activity_basis' &&
    scope3Subcategory &&
    SUBCATEGORY_TO_FORMULA_TERMS[scope3Subcategory]
  ) {
    matchedFormula = findByNameTerms(
      formConfig.formulas,
      SUBCATEGORY_TO_FORMULA_TERMS[scope3Subcategory],
    );
  }

  // Nested trees (C6/C7) may need matching on the activity type instead.
  if (
    !matchedFormula &&
    scope3Method === 'activity_basis' &&
    scope3ActivityType &&
    ACTIVITY_TYPE_TO_FORMULA_TERMS[scope3ActivityType]
  ) {
    matchedFormula = findByNameTerms(
      formConfig.formulas,
      ACTIVITY_TYPE_TO_FORMULA_TERMS[scope3ActivityType],
    );
  }

  // Hydrated records retain their saved formula only when it still belongs to
  // the current method or selected subcategory. This prevents a saved formula
  // from surviving an Edit-time method/category change.
  if (!matchedFormula && savedFormulaId) {
    const savedFormula = formConfig.formulas.find((formula) => formula.id === savedFormulaId);
    const methodMatches = METHOD_TO_FORMULA_TERMS[scope3Method] || [];
    const subcategoryMatches = SUBCATEGORY_TO_FORMULA_TERMS[scope3Subcategory] || [];
    if (
      savedFormula &&
      (findByNameTerms([savedFormula], methodMatches) ||
        findByNameTerms([savedFormula], subcategoryMatches))
    ) {
      matchedFormula = savedFormula;
    }
  }

  if (!matchedFormula) {
    matchedFormula = findByNameTerms(
      formConfig.formulas,
      METHOD_TO_FORMULA_TERMS[scope3Method] || [],
    );
  }

  return matchedFormula;
};

const resolveScope12Formula = (formConfig, context) => {
  const {
    decisionFieldValues,
    isBiogenicScope1,
    isStationaryMobileOrFlaringCategory,
    savedFormulaId,
  } = context;
  let matchedFormula = null;

  if (formConfig.decision_tree) {
    const formulaId = traverseDecisionTree(formConfig.decision_tree, {
      calculation_methodology:
        decisionFieldValues.calculation_methodology || 'using_heat_basis_ncv',
      // Quantity Basis EF routes at calculation time from the selected EF unit.
      // Until a unit is selected, use the mass branch so the shared Quantity
      // Basis fields render without adding a second user-facing selector.
      ...((context.isProcessCategory || context.isStationaryMobileOrFlaringCategory)
        && decisionFieldValues.calculation_methodology === 'using_qty_basis_ef'
        && !decisionFieldValues.ef_quantity_basis
        ? { ef_quantity_basis: 'mass' }
        : {}),
      // Heat Basis CV routing follows the selected denominator at calculation
      // time. Use mass while the form has not yet materialized its CV unit.
      ...(decisionFieldValues.calculation_methodology === 'using_heat_basis_ncv'
        && !decisionFieldValues.cv_quantity_basis
        ? { cv_quantity_basis: 'mass' }
        : {}),
      ...decisionFieldValues,
    });
    if (formulaId) {
      matchedFormula = formConfig.formulas.find((f) => f.id === formulaId);
    }
  }

  if (matchedFormula) return matchedFormula;

  if (savedFormulaId) {
    const savedFormula = formConfig.formulas.find((formula) => formula.id === savedFormulaId);
    if (savedFormula) return savedFormula;
  }

  if (isBiogenicScope1) {
    matchedFormula = formConfig.formulas.find((f) =>
      f.name?.toLowerCase().includes('biogenic'),
    );
    if (!matchedFormula && formConfig.formulas.length > 0) {
      matchedFormula = formConfig.formulas[0];
    }
    return matchedFormula;
  }

  if (isStationaryMobileOrFlaringCategory) {
    matchedFormula = findByNameTerms(formConfig.formulas, ['heat basis', 'heat-basis']);
  }
  if (!matchedFormula) {
    matchedFormula = formConfig.formulas.find(
      (f) =>
        f.properties?.length > 0 &&
        f.properties.some((p) =>
          ['cv', 'density'].includes(p.variable?.toLowerCase() || p.key?.toLowerCase()),
        ),
    );
  }
  if (!matchedFormula) {
    matchedFormula = findByNameTerms(formConfig.formulas, ['quantity', 'activity']);
  }
  if (!matchedFormula && formConfig.formulas.length > 0) {
    matchedFormula = formConfig.formulas[0];
  }
  return matchedFormula;
};

const isMappingApplicable = ({
  mapping: m,
  formConfig,
  context,
  matchedFormula,
  requiredInputVars,
  decisionFieldNames,
}) => {
  const { categoryId, scopeId, useCustomFuel, selectedFuel, decisionFieldValues } = context;

  const appliesToCategory =
    !m.applies_to_categories?.length || m.applies_to_categories.includes(categoryId);
  const appliesToScope =
    !m.applies_to_scopes?.length || m.applies_to_scopes.includes(scopeId);
  if (!appliesToCategory || !appliesToScope || m.is_active === false) return false;

  if (useCustomFuel && HANDLED_BY_CUSTOM_FUEL.includes(m.maps_to_variable)) return false;

  // Property-based Heat/Quantity conversions can need density even when a
  // Process Emissions formula does not list it as a formula variable. Keep the
  // mapped field available; the runtime unit resolver decides when to show it.
  if (
    m.maps_to_variable === 'density'
    && ['using_heat_basis_ncv', 'using_qty_basis_ef'].includes(decisionFieldValues.calculation_methodology)
    && !selectedFuel?.density
  ) {
    return true;
  }

  if (matchedFormula && requiredInputVars?.length) {
    if (m.is_override) {
      const formulaProperties = matchedFormula.properties || [];
      if (
        formulaProperties.some(
          (p) => p.variable === m.maps_to_variable || p.key === m.maps_to_variable,
        )
      ) {
        return true;
      }
      // Density is a runtime conditional field for Qty Basis. The actual unit
      // pair is chosen in the form, so the UI resolves requiredness later from
      // central unit metadata rather than guessing from a category/fuel list.
      if (m.maps_to_variable === 'density') {
        if (decisionFieldValues.calculation_methodology === 'using_qty_basis_ef') {
          const fuelHasDensity = selectedFuel?.density != null && selectedFuel.density > 0;
          return !fuelHasDensity;
        }
        return (matchedFormula.inputs || []).some((inp) => inp.allow_dimension_conversion);
      }
      return false;
    }
    if (requiredInputVars.includes(m.maps_to_variable)) return true;
    if (m.maps_to_context && decisionFieldNames.includes(m.maps_to_context)) return true;
    return false;
  }

  // No formula resolved yet — Process Emissions hides everything until the
  // process type is chosen. Uses the raw scope, as before.
  if (
    (context.scope === 'scope1' || context.scope === 'scope2') &&
    context.isProcessCategory
  ) {
    return false;
  }

  return true;
};

const toField = (m, { isQtyBasis, quantityUnits }) => {
  const field = {
    id: m.id,
    variable: m.maps_to_variable,
    fieldKey: m.field_key,
    label: m.field_label,
    expectedUnit: m.default_unit,
    required: m.is_required,
    isOverride: m.is_override || false,
    fieldType: m.field_type || 'number',
    allowedUnits: m.allowed_units || [],
    unitSource: m.unit_source || 'static',
    compoundWithVariable: m.compound_with_variable || null,
    placeholder: m.placeholder || `Enter ${m.field_label}`,
    helpText: m.help_text || '',
    mapsToContext: m.maps_to_context,
    mapsToContextValueWhenFilled: m.maps_to_context_value_when_filled || 'true',
    mapsToContextValueWhenEmpty: m.maps_to_context_value_when_empty || 'false',
    options: m.options || [],
    validationRules: m.validation_rules || {},
    defaultValue: m.default_value,
  };
  if (isQtyBasis && m.maps_to_variable === 'density') {
    field.densityQtyBasisCheck = true;
    field.densityQuantityUnits = quantityUnits;
  }
  return field;
};

const toPresentationField = (field, index) => ({
  id: field.id || `organization-custom-${field.field_key}-${index}`,
  variable: field.field_key,
  fieldKey: field.field_key,
  label: field.field_label,
  expectedUnit: '',
  required: Boolean(field.is_required),
  isOverride: false,
  fieldType: field.field_type || 'text',
  allowedUnits: [],
  unitSource: 'none',
  compoundWithVariable: null,
  placeholder: field.placeholder || `Enter ${field.field_label}`,
  helpText: field.help_text || '',
  options: field.options || [],
  validationRules: field.validation_rules || {},
  defaultValue: field.default_value,
  presentationOnly: true,
});

export const deriveGhgFields = ({ formConfig, context } = {}) => {
  if (!formConfig?.input_field_mappings?.length && !formConfig?.presentation_custom_fields?.length) {
    return { fields: [], formulaId: null, matchedFormula: null };
  }

  let matchedFormula = null;
  if (context.isScope3Like && context.scope3Method && formConfig.formulas?.length) {
    matchedFormula = resolveScope3Formula(formConfig, context);
  } else if (
    (context.scope === 'scope1' ||
      context.scope === 'scope2' ||
      context.isBiogenicScope1) &&
    formConfig.formulas?.length
  ) {
    matchedFormula = resolveScope12Formula(formConfig, context);
  }

  const requiredInputVars = matchedFormula?.inputs?.length
    ? matchedFormula.inputs.map((inp) => inp.variable)
    : null;

  const decisionFieldNames = (formConfig.decision_fields || []).map((d) => d.field_name);

  const applicableMappings = (formConfig.input_field_mappings || []).filter((mapping) =>
    isMappingApplicable({
      mapping,
      formConfig,
      context,
      matchedFormula,
      requiredInputVars,
      decisionFieldNames,
    }),
  );

  applicableMappings.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const isQtyBasis =
    context.decisionFieldValues.calculation_methodology === 'using_qty_basis_ef';
  const quantityMapping = (formConfig.input_field_mappings || []).find(
    (mapping) => mapping.maps_to_variable === 'qty' || mapping.maps_to_variable === 'quantity',
  );
  const quantityUnits = context.selectedFuel?.allowed_units?.length
    ? context.selectedFuel.allowed_units
    : quantityMapping?.allowed_units || [quantityMapping?.default_unit].filter(Boolean);

  const calculationFields = applicableMappings.map((m) => toField(m, { isQtyBasis, quantityUnits }));
  // C7 is a dedicated multi-employee workflow with its own serialized input
  // contract. Organization custom fields are intentionally unavailable there.
  const presentationFields = context.categoryDefinition?.code === 'c7'
    ? []
    : (formConfig.presentation_custom_fields || []).map(toPresentationField);

  return {
    fields: [...calculationFields, ...presentationFields],
    formulaId: matchedFormula?.id || null,
    matchedFormula: matchedFormula || null,
  };
};

export default deriveGhgFields;
