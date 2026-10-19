/**
 * Phase 1 regression gate — extracted field derivation must be identical to the
 * pre-extraction implementation.
 *
 * Runs `deriveGhgFields` and the frozen legacy reference over:
 *   * all 24 active categories (real `GET /api/calc-engine/form-config` responses)
 *   * every reachable decision path per category (158 in total)
 *   * x4 fuel/custom-fuel variants
 *
 * Any difference in the field list, field order, field properties or the
 * resolved formula id fails the build.
 */
import { deriveGhgFields } from '../deriveGhgFields';
import { resolveGhgFormContext } from '../resolveGhgFormContext';
import { legacyDeriveDynamicInputFields } from '../testSupport/legacyDeriveFields.reference';
import fixtures from './fixtures/form-config-fixtures.json';

const { dynamicCategories, dynamicScopes, entries } = fixtures;

// Fuel variants exercise the Qty-Basis density branch, which is the only part of
// the derivation that reads the selected fuel.
const FUEL_VARIANTS = [
  { name: 'no fuel', useCustomFuel: false, selectedFuel: null },
  {
    name: 'fuel without density',
    useCustomFuel: false,
    selectedFuel: { id: 'f1', allowed_units: ['kg', 'L'], density: null },
  },
  {
    name: 'fuel with density',
    useCustomFuel: false,
    selectedFuel: { id: 'f2', allowed_units: ['kg'], density: 0.85 },
  },
  {
    name: 'custom fuel',
    useCustomFuel: true,
    selectedFuel: null,
  },
];

/** The scope the Create form holds in state for a given category scope code. */
const formScopeFor = (scopeCode) => (scopeCode === 'biogenic' ? 'biogenic' : scopeCode);
const biogenicSelectionFor = (scopeCode) => (scopeCode === 'biogenic' ? 'scope1' : '');

const buildCases = () => {
  const cases = [];
  entries.forEach((entry) => {
    entry.selections.forEach((selection, selectionIndex) => {
      FUEL_VARIANTS.forEach((variant) => {
        cases.push({
          id: `${entry.categoryName} [${entry.scopeCode}] path#${selectionIndex} / ${variant.name}`,
          entry,
          selection,
          variant,
        });
      });
    });
  });

  // Biogenic Scope 3 is reached through a Scope 3 category with scope='biogenic',
  // which is a distinct branch of the derivation — cover it explicitly.
  entries
    .filter((e) => e.scopeCode === 'scope3')
    .forEach((entry) => {
      entry.selections.forEach((selection, selectionIndex) => {
        cases.push({
          id: `${entry.categoryName} [biogenic->scope3] path#${selectionIndex}`,
          entry,
          selection,
          variant: FUEL_VARIANTS[0],
          overrideScope: 'biogenic',
          overrideBiogenicSelection: 'scope3',
        });
      });
    });

  return cases;
};

const CASES = buildCases();

const runBoth = ({ entry, selection, variant, overrideScope, overrideBiogenicSelection }) => {
  const scope = overrideScope || formScopeFor(entry.scopeCode);
  const biogenicScopeSelection =
    overrideBiogenicSelection !== undefined
      ? overrideBiogenicSelection
      : biogenicSelectionFor(entry.scopeCode);

  const legacy = legacyDeriveDynamicInputFields({
    formConfig: entry.formConfig,
    dynamicCategories,
    dynamicScopes,
    category: entry.categoryName,
    scope,
    biogenicScopeSelection,
    scope3Method: selection.scope3Method,
    scope3ActivityType: selection.scope3ActivityType,
    scope3Subcategory: selection.scope3Subcategory,
    typeOfProduct: selection.typeOfProduct,
    decisionFieldValues: selection.decisionFieldValues,
    useCustomFuel: variant.useCustomFuel,
    selectedFuel: variant.selectedFuel,
  });

  const context = resolveGhgFormContext({
    scope,
    biogenicScopeSelection,
    categoryName: entry.categoryName,
    categories: dynamicCategories,
    scopes: dynamicScopes,
    scope3Method: selection.scope3Method,
    scope3ActivityType: selection.scope3ActivityType,
    scope3Subcategory: selection.scope3Subcategory,
    typeOfProduct: selection.typeOfProduct,
    decisionFieldValues: selection.decisionFieldValues,
    useCustomFuel: variant.useCustomFuel,
    selectedFuel: variant.selectedFuel,
  });
  const next = deriveGhgFields({ formConfig: entry.formConfig, context });

  return { legacy, next };
};

describe('field derivation — fixture sanity', () => {
  it('covers all active categories and their decision paths', () => {
    expect(entries.length).toBe(24);
    expect(CASES.length).toBeGreaterThan(600);
  });
});

describe('deriveGhgFields is identical to the pre-Phase-1 implementation', () => {
  it.each(CASES.map((c) => [c.id, c]))('%s', (_id, testCase) => {
    const { legacy, next } = runBoth(testCase);
    expect(next.formulaId).toEqual(legacy.formulaId);
    expect(next.fields).toEqual(legacy.fields);
  });
});

describe('canonical identity resolution matches name-based resolution today', () => {
  it.each(
    entries.map((e) => [`${e.categoryName} [${e.scopeCode}]`, e]),
  )('%s resolves to the same category id by code and by name', (_id, entry) => {
    const scope = formScopeFor(entry.scopeCode);
    const byName = resolveGhgFormContext({
      scope,
      biogenicScopeSelection: biogenicSelectionFor(entry.scopeCode),
      categoryName: entry.categoryName,
      categories: dynamicCategories,
      scopes: dynamicScopes,
    });
    const byCode = resolveGhgFormContext({
      scope,
      biogenicScopeSelection: biogenicSelectionFor(entry.scopeCode),
      categoryName: 'DELIBERATELY WRONG NAME',
      categoryCode: entry.categoryCode,
      categories: dynamicCategories,
      scopes: dynamicScopes,
    });
    expect(byName.categoryId).toBe(entry.categoryId);
    expect(byCode.categoryId).toBe(entry.categoryId);
  });
});
