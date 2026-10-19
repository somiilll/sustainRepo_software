import { resolveGhgCapabilities } from '../resolveGhgCapabilities';
import { resolveGhgCategoryOptions } from '../resolveGhgCategoryOptions';
import { resolveGhgFormArchitecture } from '../resolveGhgFormArchitecture';
import { resolveGhgFormContext } from '../resolveGhgFormContext';
import { resolveGhgUiState } from '../resolveGhgUiState';
import { STANDARD_PROCESS_TYPE_OPTIONS } from '../standardGhgFormConfig';
import { validateGhgOverrides } from '../overrideSchema';

const categories = [
  { id: 'stationary', code: 'stationary_combustion', name: 'Stationary Combustion', scope_code: 'scope1' },
  { id: 'process', code: 'process_emissions', name: 'Process Emissions', scope_code: 'scope1' },
];
const scopes = [{ id: 'scope1', code: 'scope1' }];
const standardConfig = { formulas: [], decision_fields: [], input_field_mappings: [] };

const architectureFor = (categoryName, organizationOverrides = null) => resolveGhgFormArchitecture({
  standardConfig,
  organizationOverrides,
  formContext: resolveGhgFormContext({
    scope: 'scope1', categoryName, categories, scopes,
  }),
});

describe('GHG organization capability configuration seam', () => {
  test('keeps the central Custom Fuel capability list unchanged without an organization override', () => {
    ['stationary_combustion', 'mobile_combustion', 'fugitive_emissions', 'flaring__stationary_combustion'].forEach((categoryCode) => {
      expect(resolveGhgCapabilities({ categoryCode, scopeCode: 'scope1' }).capabilities.customFuel).toBe(true);
    });
  });

  test('can disable Custom Fuel in the effective Create/Edit capability and UI state', () => {
    const overrides = { capabilityOverrides: { customFuel: false } };
    const create = architectureFor('Stationary Combustion', overrides);
    const edit = architectureFor('Stationary Combustion', overrides);

    expect(create.capabilities.customFuel).toBe(false);
    expect(edit.capabilities).toEqual(create.capabilities);
    expect(resolveGhgUiState({ capabilities: create.capabilities, scope: 'scope1' }).showCustomFuel).toBe(false);
    expect(resolveGhgUiState({ capabilities: edit.capabilities, scope: 'scope1', processType: '' }).showCustomFuel).toBe(false);
  });

  test('keeps a historical Custom Fuel selection renderable while the new-selection toggle is hidden', () => {
    const architecture = architectureFor('Stationary Combustion', { capabilityOverrides: { customFuel: false } });
    const ui = resolveGhgUiState({ capabilities: architecture.capabilities, scope: 'scope1' });
    expect(ui.showCustomFuel).toBe(false);
    expect(architecture.capabilities.customFuel).toBe(false);
  });

  test('uses existing disabledCategories behavior to hide Process Emissions', () => {
    expect(resolveGhgCategoryOptions({
      standardCategories: ['Stationary Combustion', 'Process Emissions'],
      scopeCode: 'scope1',
      categoryDefinitions: categories,
      organizationOverrides: { disabledCategories: ['process_emissions'] },
    })).toEqual(['Stationary Combustion']);
  });

  test('keeps the standard Process Type registry stable', () => {
    expect(STANDARD_PROCESS_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      'venting', 'n2o_overall_combustion', 'ch4_overall_combustion',
    ]);
  });

  test('filters Process Types identically for Create and Edit', () => {
    const overrides = { processTypeOptions: ['venting', 'ch4_overall_combustion'] };
    const create = architectureFor('Process Emissions', overrides);
    const edit = architectureFor('Process Emissions', overrides);
    const expected = ['venting', 'ch4_overall_combustion'];

    expect(create.capabilities.processTypeOptions.map((option) => option.value)).toEqual(expected);
    expect(edit.capabilities.processTypeOptions).toEqual(create.capabilities.processTypeOptions);
    expect(resolveGhgUiState({ capabilities: create.capabilities, scope: 'scope1' }).processTypeOptions.map((option) => option.value)).toEqual(expected);
    expect(resolveGhgUiState({ capabilities: edit.capabilities, scope: 'scope1' }).processTypeOptions.map((option) => option.value)).toEqual(expected);
  });

  test('keeps a disabled historical Process Type readable but not selectable', () => {
    const architecture = architectureFor('Process Emissions', { processTypeOptions: ['venting'] });
    const ui = resolveGhgUiState({
      capabilities: architecture.capabilities,
      scope: 'scope1',
      processType: 'ch4_overall_combustion',
    });
    expect(ui.processTypeOptions.map((option) => option.value)).toEqual(['venting']);
    expect(ui.renderableProcessTypeOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'ch4_overall_combustion', disabled: true }),
    ]));
  });

  test('rejects unknown and calculation-domain organization overrides', () => {
    expect(validateGhgOverrides({ processTypeOptions: ['venting', 'calcination'] }).valid).toBe(false);
    expect(validateGhgOverrides({ processTypeOptions: ['custom_formula_type'] }).valid).toBe(false);
    expect(validateGhgOverrides({ capabilityOverrides: { customFuel: true } }).valid).toBe(false);
    ['formulaOverrides', 'decisionTreeOverrides', 'calculationInputs', 'emissionFactorOverrides', 'unitOverrides', 'calculationExpressions', 'calcEngineOverrides'].forEach((key) => {
      expect(validateGhgOverrides({ [key]: { any: 'value' } }).valid).toBe(false);
    });
  });
});