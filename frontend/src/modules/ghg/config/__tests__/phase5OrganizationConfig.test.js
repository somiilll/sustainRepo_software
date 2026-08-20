import { resolveGhgConfig, resolveGhgFieldOptions } from '../resolveGhgConfig';
import { resolveGhgCategoryOptions } from '../resolveGhgCategoryOptions';
import { resolveGhgFormArchitecture } from '../resolveGhgFormArchitecture';
import { resolveGhgFormContext } from '../resolveGhgFormContext';
import { deriveGhgFields } from '../deriveGhgFields';
import { extractInputsForCalcEngine } from '../../../emissions/categories/shared/Scope1Create';

const standardConfig = {
  formulas: [{ id: 'f1', name: 'Activity', inputs: [{ variable: 'qty' }] }],
  decision_fields: [],
  input_field_mappings: [{
    id: 'qty', field_key: 'qty', field_label: 'Quantity', maps_to_variable: 'qty',
    field_type: 'number', is_required: true, display_order: 1, default_unit: 'kg',
  }],
};

const categories = [
  { id: 'scope1', code: 'scope1' },
];
const categoryDefinitions = [
  { id: 'stationary', code: 'stationary_combustion', name: 'Stationary Combustion', scope_code: 'scope1' },
  { id: 'mobile', code: 'mobile_combustion', name: 'Mobile Combustion', scope_code: 'scope1' },
];
const context = () => resolveGhgFormContext({
  scope: 'scope1', categoryName: 'Stationary Combustion', categories: categoryDefinitions, scopes: categories,
  decisionFieldValues: { calculation_methodology: 'using_heat_basis_ncv' },
});

describe('Phase 5 organization-ready configuration boundary', () => {
  const overrides = {
    hiddenFields: ['unused'],
    requiredFields: ['qty'],
    fieldLabels: { qty: 'Organization Quantity' },
    fieldOptions: { scope3_subcategory: [{ value: 'energy', label: 'Energy' }] },
    customFields: [{ field_key: 'cost_centre', field_label: 'Cost centre', field_type: 'text', is_required: false }],
  };

  test('Create and Edit resolve identical field configuration through the shared architecture', () => {
    const create = resolveGhgFormArchitecture({ standardConfig, organizationOverrides: overrides, formContext: context() });
    const edit = resolveGhgFormArchitecture({ standardConfig, organizationOverrides: overrides, formContext: context() });
    const createFields = deriveGhgFields({ formConfig: create.resolvedConfig, context: create.formContext });
    const editFields = deriveGhgFields({ formConfig: edit.resolvedConfig, context: edit.formContext });

    expect(create.resolvedConfig).toEqual(edit.resolvedConfig);
    expect(createFields).toEqual(editFields);
    expect(createFields.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ variable: 'qty', label: 'Organization Quantity', required: true }),
      expect.objectContaining({ variable: 'cost_centre', presentationOnly: true, unitSource: 'none' }),
    ]));
    expect(createFields.formulaId).toBe('f1');
  });

  test('disabled categories resolve from configuration, never organization identity', () => {
    expect(resolveGhgCategoryOptions({
      standardCategories: ['Stationary Combustion', 'Mobile Combustion'],
      scopeCode: 'scope1', categoryDefinitions,
      organizationOverrides: { disabledCategories: ['mobile_combustion'] },
    })).toEqual(['Stationary Combustion']);
  });

  test('standard behavior is identity-stable and invalid overrides fall back safely', () => {
    expect(resolveGhgConfig({ standardConfig, organizationOverrides: null })).toBe(standardConfig);
    expect(resolveGhgConfig({ standardConfig, organizationOverrides: { formulaOverrides: { f1: 'evil' } } })).toBe(standardConfig);
    expect(resolveGhgFieldOptions({
      standardFieldOptions: { scope3_subcategory: [{ value: 'energy', label: 'Energy' }] },
      organizationOverrides: { unitOverrides: { qty: 'L' } },
    }).scope3_subcategory[0].value).toBe('energy');
  });

  test('presentation-only custom values never become calculation inputs', () => {
    const result = extractInputsForCalcEngine({ qty: '12', cost_centre: 'HQ-01' }, {
      dynamicInputFields: [
        { variable: 'qty', fieldKey: 'qty', required: true, expectedUnit: 'kg' },
        { variable: 'cost_centre', fieldKey: 'cost_centre', fieldType: 'text', presentationOnly: true },
      ],
      selectedFuel: null,
      centralizedUnits: [],
      defaultUnit: 'kg',
    });
    expect(result.inputs).toEqual({ qty: { value: 12, unit: 'kg' } });
  });
});