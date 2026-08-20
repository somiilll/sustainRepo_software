import { deriveGhgFields } from '../deriveGhgFields';
import { resolveGhgFormContext } from '../resolveGhgFormContext';
import fixtures from './fixtures/form-config-fixtures.json';

const { dynamicCategories, dynamicScopes, entries } = fixtures;

const formScopeFor = (scopeCode) => (scopeCode === 'biogenic' ? 'biogenic' : scopeCode);
const biogenicSelectionFor = (scopeCode) => (scopeCode === 'biogenic' ? 'scope1' : '');

const buildEditContext = (entry, selection, { savedFormulaId = null, useCustomFuel = false } = {}) =>
  resolveGhgFormContext({
    scope: formScopeFor(entry.scopeCode),
    biogenicScopeSelection: biogenicSelectionFor(entry.scopeCode),
    categoryName: 'intentionally ignored when code is present',
    categoryCode: entry.categoryCode,
    categories: dynamicCategories,
    scopes: dynamicScopes,
    scope3Method: selection.scope3Method,
    scope3ActivityType: selection.scope3ActivityType,
    scope3Subcategory: selection.scope3Subcategory,
    typeOfProduct: selection.typeOfProduct,
    decisionFieldValues: selection.decisionFieldValues,
    selectedFuel: { id: 'edit-fuel', allowed_units: ['kg'] },
    savedFormulaId,
    useCustomFuel,
  });

describe('Edit field derivation — shared config architecture', () => {
  it.each(entries)('%s resolves by canonical code and scope', (entry) => {
    const context = buildEditContext(entry, entry.selections[0]);
    expect(context.categoryId).toBe(entry.categoryId);
    expect(context.categoryDefinition?.scope_code).toBe(entry.scopeCode);
  });

  it.each(
    entries.flatMap((entry) =>
      entry.selections.map((selection, index) => [
        `${entry.categoryName} path #${index}`,
        entry,
        selection,
      ]),
    ),
  )('%s keeps an active decision-path formula stable during Edit hydration', (_name, entry, selection) => {
    const initialContext = buildEditContext(entry, selection);
    const initial = deriveGhgFields({ formConfig: entry.formConfig, context: initialContext });
    const hydratedContext = buildEditContext(entry, selection, { savedFormulaId: initial.formulaId });
    const hydrated = deriveGhgFields({ formConfig: entry.formConfig, context: hydratedContext });

    expect(hydrated.formulaId).toBe(initial.formulaId);
    expect(hydrated.fields).toEqual(initial.fields);
  });

  it('retains a compatible saved Scope 3 formula but discards it after a method change', () => {
    const formConfig = {
      formulas: [
        { id: 'activity', name: 'Activity Formula', inputs: [{ variable: 'activity_value' }] },
        { id: 'spend', name: 'Spend Formula', inputs: [{ variable: 'spent_value' }] },
      ],
      input_field_mappings: [
        { id: 'activity', field_key: 'activity', field_label: 'Activity', maps_to_variable: 'activity_value', is_required: true },
        { id: 'spend', field_key: 'spend', field_label: 'Spend', maps_to_variable: 'spent_value', is_required: true },
      ],
    };
    const base = {
      scope: 'scope3',
      categoryCode: 'purchased_goods_and_services',
      categories: dynamicCategories,
      scopes: dynamicScopes,
      savedFormulaId: 'activity',
    };

    const hydrated = deriveGhgFields({
      formConfig,
      context: resolveGhgFormContext({ ...base, scope3Method: 'activity_basis' }),
    });
    const changedMethod = deriveGhgFields({
      formConfig,
      context: resolveGhgFormContext({ ...base, scope3Method: 'spend_basis' }),
    });

    expect(hydrated.formulaId).toBe('activity');
    expect(hydrated.fields.map((field) => field.variable)).toEqual(['activity_value']);
    expect(changedMethod.formulaId).toBe('spend');
    expect(changedMethod.fields.map((field) => field.variable)).toEqual(['spent_value']);
  });

  it('suppresses custom-fuel fields through the shared Edit context', () => {
    const entry = entries.find((item) => item.scopeCode === 'scope1');
    const selection = entry.selections[0];
    const standard = deriveGhgFields({
      formConfig: entry.formConfig,
      context: buildEditContext(entry, selection),
    });
    const custom = deriveGhgFields({
      formConfig: entry.formConfig,
      context: buildEditContext(entry, selection, { useCustomFuel: true }),
    });
    const customFuelVariables = ['density', 'cv', 'ef_quantity', 'carbon_content', 'oxidation_factor'];

    expect(standard.fields.length).toBeGreaterThanOrEqual(custom.fields.length);
    expect(custom.fields.some((field) => customFuelVariables.includes(field.variable))).toBe(false);
  });
});