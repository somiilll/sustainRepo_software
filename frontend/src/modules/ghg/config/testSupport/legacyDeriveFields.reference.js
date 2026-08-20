/**
 * FROZEN REFERENCE — do not "improve" this file.
 *
 * A byte-faithful copy of the field-derivation logic as it existed inline in
 * `EmissionEntryForm.js` (the `dynamicInputFieldsResult` memo, lines 1254–1509)
 * immediately before the Phase 1 extraction.
 *
 * It exists only so `deriveGhgFields.equivalence.test.js` can prove that the
 * extracted `deriveGhgFields` produces identical output for every category and
 * every reachable decision path. It is never imported by application code.
 */
import { isDensityRequiredForQtyBasis } from '../../emissions/shared/utils/unitHelpers';


export function legacyDeriveDynamicInputFields({
  formConfig,
  dynamicCategories,
  dynamicScopes,
  category,
  scope,
  biogenicScopeSelection,
  scope3Method,
  scope3ActivityType,
  scope3Subcategory,
  typeOfProduct,
  decisionFieldValues,
  useCustomFuel,
  selectedFuel,
}) {
  if (!formConfig?.input_field_mappings?.length) return { fields: [], formulaId: null };

  const isBiogenicScope1 = scope === 'biogenic' && biogenicScopeSelection === 'scope1';
  const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const effectiveScope = isBiogenicScope3 ? 'scope3' : scope;
  const isScope3Like = effectiveScope === 'scope3';

  const categoryObj = dynamicCategories.find(
    (c) => c.name === category && c.scope_code === effectiveScope,
  );
  const categoryId = categoryObj?.id;
  const scopeObj = dynamicScopes.find((s) => s.code === effectiveScope);
  const scopeId = scopeObj?.id;

  let requiredInputVars = null;
  let matchedFormula = null;

  const traverseDecisionTree = (node, fieldValues) => {
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

  if (isScope3Like && scope3Method && formConfig?.formulas?.length) {
    if (formConfig.decision_tree) {
      const decisionValues = {
        calculation_method_scope3: scope3Method,
        activity_type: scope3ActivityType || undefined,
        subcategory_selection: scope3Subcategory || undefined,
        type_of_product: typeOfProduct || undefined,
      };
      const formulaId = traverseDecisionTree(formConfig.decision_tree, decisionValues);
      if (formulaId) {
        matchedFormula = formConfig.formulas.find((f) => f.id === formulaId);
      }
    }

    if (!matchedFormula) {
      const activityTypeToFormulaMap = {
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
      if (
        scope3Method === 'activity_basis' &&
        scope3ActivityType &&
        activityTypeToFormulaMap[scope3ActivityType]
      ) {
        const searchTerms = activityTypeToFormulaMap[scope3ActivityType];
        matchedFormula = formConfig.formulas.find((f) => {
          const formulaName = f.name?.toLowerCase() || '';
          return searchTerms.some((term) => formulaName.includes(term.toLowerCase()));
        });
      }
    }

    if (!matchedFormula) {
      const methodToFormulaMap = {
        spend_basis: ['spend', 'Spent'],
        activity_basis: ['activity'],
        supplier_basis: ['supplier', 'Supplier'],
      };
      const searchTerms = methodToFormulaMap[scope3Method] || [];
      matchedFormula = formConfig.formulas.find((f) => {
        const formulaName = f.name?.toLowerCase() || '';
        return searchTerms.some((term) => formulaName.includes(term.toLowerCase()));
      });
    }

    if (matchedFormula?.inputs?.length) {
      requiredInputVars = matchedFormula.inputs.map((inp) => inp.variable);
    }
  } else if (
    (scope === 'scope1' || scope === 'scope2' || isBiogenicScope1) &&
    formConfig?.formulas?.length
  ) {
    if (formConfig.decision_tree) {
      const scope1DecisionValues = {
        calculation_methodology:
          decisionFieldValues.calculation_methodology || 'using_heat_basis_ncv',
        ...decisionFieldValues,
      };
      const formulaId = traverseDecisionTree(formConfig.decision_tree, scope1DecisionValues);
      if (formulaId) {
        matchedFormula = formConfig.formulas.find((f) => f.id === formulaId);
      }
    }

    if (!matchedFormula) {
      if (isBiogenicScope1) {
        matchedFormula = formConfig.formulas.find((f) =>
          f.name?.toLowerCase().includes('biogenic'),
        );
        if (!matchedFormula && formConfig.formulas.length > 0) {
          matchedFormula = formConfig.formulas[0];
        }
      } else {
        const currentCategoryName = (category || categoryObj?.name || '').toLowerCase();
        const isStationaryOrMobile =
          currentCategoryName.includes('stationary') ||
          currentCategoryName.includes('mobile') ||
          currentCategoryName.includes('flaring');

        if (isStationaryOrMobile) {
          matchedFormula = formConfig.formulas.find(
            (f) =>
              f.name?.toLowerCase().includes('heat basis') ||
              f.name?.toLowerCase().includes('heat-basis'),
          );
        }
        if (!matchedFormula) {
          matchedFormula = formConfig.formulas.find(
            (f) =>
              f.properties?.length > 0 &&
              f.properties.some((p) =>
                ['cv', 'density'].includes(
                  p.variable?.toLowerCase() || p.key?.toLowerCase(),
                ),
              ),
          );
        }
        if (!matchedFormula) {
          matchedFormula = formConfig.formulas.find(
            (f) =>
              f.name?.toLowerCase().includes('quantity') ||
              f.name?.toLowerCase().includes('activity'),
          );
        }
        if (!matchedFormula && formConfig.formulas.length > 0) {
          matchedFormula = formConfig.formulas[0];
        }
      }
    }

    if (matchedFormula?.inputs?.length) {
      requiredInputVars = matchedFormula.inputs.map((inp) => inp.variable);
    }
  }

  const formulaId = matchedFormula?.id || null;

  const decisionFieldNames = (formConfig.decision_fields || []).map((d) => d.field_name);
  const applicableMappings = formConfig.input_field_mappings.filter((m) => {
    const appliesToCategory =
      !m.applies_to_categories?.length || m.applies_to_categories.includes(categoryId);
    const appliesToScope =
      !m.applies_to_scopes?.length || m.applies_to_scopes.includes(scopeId);
    if (!appliesToCategory || !appliesToScope || m.is_active === false) return false;

    if (useCustomFuel) {
      const handledByCustomFuel = [
        'density',
        'cv',
        'ef_quantity',
        'carbon_content',
        'oxidation_factor',
      ];
      if (handledByCustomFuel.includes(m.maps_to_variable)) return false;
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
        if (m.maps_to_variable === 'density') {
          const calcMethod = decisionFieldValues.calculation_methodology;
          if (calcMethod === 'using_qty_basis_ef') {
            const fuelHasDensity = selectedFuel?.density != null && selectedFuel.density > 0;
            if (fuelHasDensity) return false;
            return true;
          }
          return (matchedFormula.inputs || []).some((inp) => inp.allow_dimension_conversion);
        }
        return false;
      }
      if (requiredInputVars.includes(m.maps_to_variable)) return true;
      if (m.maps_to_context && decisionFieldNames.includes(m.maps_to_context)) return true;
      return false;
    }

    const currentCategoryName = (category || '').toLowerCase();
    if ((scope === 'scope1' || scope === 'scope2') && currentCategoryName.includes('process')) {
      return false;
    }

    return true;
  });

  applicableMappings.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const isQtyBasis = decisionFieldValues.calculation_methodology === 'using_qty_basis_ef';
  const quantityMapping = formConfig.input_field_mappings.find(
    (mapping) => mapping.maps_to_variable === 'qty' || mapping.maps_to_variable === 'quantity',
  );
  const quantityUnits = selectedFuel?.allowed_units?.length
    ? selectedFuel.allowed_units
    : quantityMapping?.allowed_units || [quantityMapping?.default_unit].filter(Boolean);
  const fields = applicableMappings.map((m) => {
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
  });

  return { fields, formulaId };
}
