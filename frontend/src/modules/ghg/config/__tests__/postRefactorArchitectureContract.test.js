import fixtures from './fixtures/form-config-fixtures.json';
import { deriveGhgFields } from '../deriveGhgFields';
import { resolveGhgCategoryOptions } from '../resolveGhgCategoryOptions';
import { resolveGhgConfig } from '../resolveGhgConfig';
import { resolveGhgFormArchitecture } from '../resolveGhgFormArchitecture';
import { resolveGhgFormContext } from '../resolveGhgFormContext';
import { resolveGhgScope3Options } from '../resolveGhgScope3Options';
import { resolveGhgUiState } from '../resolveGhgUiState';
import { validateGhgOverrides } from '../overrideSchema';
import { validateStep1 } from '../../emissions/shared/utils/validation';

const categories = fixtures.entries.map((entry) => ({
  id: entry.categoryId,
  code: entry.categoryCode,
  name: entry.categoryName,
  scope_code: entry.scopeCode,
}));
const scopes = ['scope1', 'scope2', 'scope3', 'biogenic'].map((code) => ({ code }));

const architectureFor = ({ categoryCode, scopeCode, mode, organizationOverrides = null }) => {
  const entry = fixtures.entries.find((candidate) => (
    candidate.categoryCode === categoryCode && candidate.scopeCode === scopeCode
  ));
  const scope = scopeCode === 'biogenic' ? 'biogenic' : scopeCode;
  const biogenicScopeSelection = scopeCode === 'biogenic' ? 'scope1' : null;
  const formContext = resolveGhgFormContext({
    scope,
    biogenicScopeSelection,
    categoryName: entry.categoryName,
    categoryCode: mode === 'edit' ? entry.categoryCode : undefined,
    categories,
    scopes,
    scope3Method: scopeCode === 'scope3' ? 'supplier_basis' : '',
    decisionFieldValues: { calculation_methodology: 'using_heat_basis_ncv' },
  });
  return resolveGhgFormArchitecture({
    standardConfig: entry.formConfig,
    organizationOverrides,
    formContext,
    biogenicScopeSelection,
  });
};

const sharedPaths = [
  ['stationary_combustion', 'scope1'],
  ['mobile_combustion', 'scope1'],
  ['fugitive_emissions', 'scope1'],
  ['process_emissions', 'scope1'],
  ['purchased_electricity', 'scope2'],
  ['purchased_goods_and_services', 'scope3'],
  ['capital_goods', 'scope3'],
  ['business_travel', 'scope3'],
  ['employee_commuting', 'scope3'],
  ['downstream_transportation_and_distribution', 'scope3'],
  ['use_of_sold_products', 'scope3'],
  ['stationary_combustion', 'biogenic'],
  ['mobile_combustion', 'biogenic'],
];

describe('Post-refactor GHG architecture contract', () => {
  test.each(sharedPaths)('%s / %s keeps Create and Edit on one canonical architecture', (categoryCode, scopeCode) => {
    const create = architectureFor({ categoryCode, scopeCode, mode: 'create' });
    const edit = architectureFor({ categoryCode, scopeCode, mode: 'edit' });
    const createFields = deriveGhgFields({ formConfig: create.resolvedConfig, context: create.formContext });
    const editFields = deriveGhgFields({ formConfig: edit.resolvedConfig, context: edit.formContext });

    expect(create.formContext).toEqual(edit.formContext);
    expect(create.resolvedConfig).toEqual(edit.resolvedConfig);
    expect(create.resolvedFieldOptions).toEqual(edit.resolvedFieldOptions);
    expect(create.capabilities).toEqual(edit.capabilities);
    expect(createFields).toEqual(editFields);
    expect(createFields.fields.map((field) => ({
      variable: field.variable,
      required: field.required,
      options: field.options,
      validationRules: field.validationRules,
    }))).toEqual(editFields.fields.map((field) => ({
      variable: field.variable,
      required: field.required,
      options: field.options,
      validationRules: field.validationRules,
    })));

    const validationInput = {
      facilityId: 'facility',
      scope: create.formContext.scope,
      category: 'display-name-is-not-a-validation-rule',
      biogenicScopeSelection: scopeCode === 'biogenic' ? 'scope1' : null,
      capabilities: create.capabilities,
      fuelId: create.capabilities.requiresFuel ? 'fuel' : '',
      useCustomFuel: false,
      scope3Method: 'supplier_basis',
      scope3ActivityId: 'activity',
    };
    expect(validateStep1(validationInput)).toEqual(validateStep1({
      ...validationInput,
      capabilities: edit.capabilities,
    }));

    const uiInput = {
      capabilities: create.capabilities,
      scope: create.formContext.scope,
      biogenicScopeSelection: scopeCode === 'biogenic' ? 'scope1' : null,
      scope3Method: 'activity_basis',
      requiresSubcategory: create.capabilities.subcategory,
      scope3Subcategory: create.capabilities.subcategory ? 'energy' : '',
      processType: 'venting',
      scope3ActivityType: 'air_travel',
      frequencyType: 'monthly',
    };
    expect(resolveGhgUiState(uiInput)).toEqual(resolveGhgUiState({
      ...uiInput,
      capabilities: edit.capabilities,
    }));
  });

  test('the shared Scope 3 resolver produces identical presentation options for Create and Edit', () => {
    const input = {
      scope: 'scope3',
      category: 'C11 - Use of Sold Products',
      scope3Method: 'activity_basis',
      capabilities: { subcategory: true, typeOfProduct: true },
      requiresSubcategory: true,
      fieldOptions: { scope3_subcategory: [{ value: 'energy', label: 'Energy' }] },
      scope3EFData: [{
        category: 'C11 - Use of Sold Products', method: 'activity_basis', activity_type: 'energy',
      }],
    };
    expect(resolveGhgScope3Options(input)).toEqual(resolveGhgScope3Options(input));
  });

  test('a representative organization override reaches both forms without changing calculation configuration', () => {
    const overrides = {
      hiddenFields: ['unused_field'],
      requiredFields: ['qty'],
      fieldLabels: { qty: 'Organization quantity' },
      fieldOptions: { scope3_subcategory: [{ value: 'energy', label: 'Organization Energy' }] },
      disabledCategories: ['mobile_combustion'],
      disabledSubcategories: ['electricity'],
      customFields: [{ field_key: 'cost_centre', field_label: 'Cost centre', field_type: 'text' }],
    };
    const create = architectureFor({
      categoryCode: 'stationary_combustion', scopeCode: 'scope1', mode: 'create', organizationOverrides: overrides,
    });
    const edit = architectureFor({
      categoryCode: 'stationary_combustion', scopeCode: 'scope1', mode: 'edit', organizationOverrides: overrides,
    });

    expect(create.resolvedConfig).toEqual(edit.resolvedConfig);
    expect(create.capabilities).toEqual(edit.capabilities);
    expect(create.resolvedConfig.formulas).toBe(fixtures.entries.find((entry) => (
      entry.categoryCode === 'stationary_combustion' && entry.scopeCode === 'scope1'
    )).formConfig.formulas);
    expect(resolveGhgCategoryOptions({
      standardCategories: ['Stationary Combustion', 'Mobile Combustion'],
      scopeCode: 'scope1',
      categoryDefinitions: categories,
      organizationOverrides: overrides,
    })).toEqual(['Stationary Combustion']);
  });

  test('calculation-domain and capability override attempts reject safely', () => {
    [
      'formulaOverrides',
      'decisionTreeOverrides',
      'emissionFactorOverrides',
      'unitOverrides',
      'calculationAlgorithmOverrides',
      'capabilityOverrides',
    ].forEach((key) => {
      expect(validateGhgOverrides({ [key]: { any: 'value' } }).valid).toBe(false);
    });
    const standardConfig = fixtures.entries[0].formConfig;
    expect(resolveGhgConfig({
      standardConfig,
      organizationOverrides: { capabilityOverrides: { multiEmployee: false } },
    })).toBe(standardConfig);
  });
});