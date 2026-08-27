import fixtures from './fixtures/form-config-fixtures.json';
import { resolveGhgFormContext } from '../resolveGhgFormContext';
import { resolveGhgFormArchitecture } from '../resolveGhgFormArchitecture';
import { resolveGhgUiState } from '../resolveGhgUiState';
import { GHG_FIELD_OPTION_KEYS } from '../standardGhgFormConfig';
import { validateStep1 } from '../../emissions/shared/utils/validation';
import { CATEGORY_CONFIGS } from '../../../emissions/categories/scope3-definitions';
import { resolveGhgCapabilities } from '../resolveGhgCapabilities';

const categories = fixtures.entries.map((entry) => ({
  id: entry.categoryId,
  code: entry.categoryCode,
  name: entry.categoryName,
  scope_code: entry.scopeCode,
}));
const scopes = [
  { id: 'scope1', code: 'scope1' },
  { id: 'scope2', code: 'scope2' },
  { id: 'scope3', code: 'scope3' },
  { id: 'biogenic', code: 'biogenic' },
];

const findEntry = (categoryCode, scopeCode) => fixtures.entries.find(
  (entry) => entry.categoryCode === categoryCode && entry.scopeCode === scopeCode,
);

const resolveLivePath = ({ categoryCode, scopeCode, mode, organizationOverrides = null }) => {
  const entry = findEntry(categoryCode, scopeCode);
  const scope = scopeCode === 'biogenic' ? 'biogenic' : scopeCode;
  const context = resolveGhgFormContext({
    scope,
    biogenicScopeSelection: scopeCode === 'biogenic' ? 'scope1' : null,
    categoryName: entry.categoryName,
    categoryCode: mode === 'edit' ? entry.categoryCode : undefined,
    categories,
    scopes,
  });
  return resolveGhgFormArchitecture({
    standardConfig: entry.formConfig,
    organizationOverrides,
    formContext: context,
    biogenicScopeSelection: scopeCode === 'biogenic' ? 'scope1' : null,
  });
};

const createAndEdit = (categoryCode, scopeCode = 'scope1') => ({
  create: resolveLivePath({ categoryCode, scopeCode, mode: 'create' }),
  edit: resolveLivePath({ categoryCode, scopeCode, mode: 'edit' }),
});

describe('Phase 4.1 live Create/Edit capability paths', () => {
  test.each([
    ['process_emissions', 'scope1'],
    ['stationary_combustion', 'scope1'],
    ['mobile_combustion', 'scope1'],
    ['fugitive_emissions', 'scope1'],
    ['employee_commuting', 'scope3'],
    ['business_travel', 'scope3'],
  ])('%s resolves identical Create/Edit capabilities', (categoryCode, scopeCode) => {
    const { create, edit } = createAndEdit(categoryCode, scopeCode);
    expect(edit.formContext.effectiveScope).toBe(scopeCode);
    expect(edit.capabilities).toEqual(create.capabilities);
    expect(edit.resolvedFieldOptions).toEqual(create.resolvedFieldOptions);
  });

  test('Edit uses effectiveScope and keeps Scope 1 and Biogenic identities distinct', () => {
    const scope1 = resolveLivePath({ categoryCode: 'stationary_combustion', scopeCode: 'scope1', mode: 'edit' });
    const biogenic = resolveLivePath({ categoryCode: 'stationary_combustion', scopeCode: 'biogenic', mode: 'edit' });
    expect(scope1.capabilityResolution.scopeCode).toBe('scope1');
    expect(biogenic.capabilityResolution.scopeCode).toBe('biogenic');
    expect(scope1.formContext.categoryDefinition.id).not.toBe(biogenic.formContext.categoryDefinition.id);
  });

  test('Process fields and validation are capability-driven', () => {
    const { create, edit } = createAndEdit('process_emissions');
    [create, edit].forEach((architecture) => {
      const ui = resolveGhgUiState({
        capabilities: architecture.capabilities,
        scope: 'scope1',
        processType: 'venting',
      });
      expect(ui).toMatchObject({
        showProcessType: true,
        showCalculationMethodology: true,
        showFuelSelection: false,
        showCustomFuel: false,
      });
      expect(validateStep1({
        facilityId: 'facility',
        scope: 'scope1',
        category: 'renamed-process-category',
        capabilities: architecture.capabilities,
      })).toEqual({ valid: true });
    });
  });

  test('Process behavior survives a display-name rename because it uses the category code', () => {
    const entry = findEntry('process_emissions', 'scope1');
    const context = resolveGhgFormContext({
      scope: 'scope1',
      categoryName: 'Renamed venting category',
      categoryCode: 'process_emissions',
      categories: [{ ...entry, code: 'process_emissions', name: 'Renamed venting category' }],
      scopes,
    });

    expect(context.isProcessCategory).toBe(true);
  });

  test.each(['stationary_combustion', 'mobile_combustion'])(
    '%s requires fuel and exposes custom-fuel controls',
    (categoryCode) => {
      const { create, edit } = createAndEdit(categoryCode);
      [create, edit].forEach((architecture) => {
        const ui = resolveGhgUiState({ capabilities: architecture.capabilities, scope: 'scope1' });
        expect(ui).toMatchObject({
          showCalculationMethodology: true,
          showFuelSelection: true,
          showCustomFuel: true,
          showManualFactorOverrides: true,
        });
        expect(validateStep1({
          facilityId: 'facility',
          scope: 'scope1',
          category: 'display-name-does-not-drive-validation',
          capabilities: architecture.capabilities,
          useCustomFuel: false,
          fuelId: '',
        }).valid).toBe(false);
      });
    },
  );

  test('Fugitive keeps fuel/custom-fuel but hides manual factor overrides', () => {
    const { create, edit } = createAndEdit('fugitive_emissions');
    [create, edit].forEach((architecture) => {
      expect(resolveGhgUiState({ capabilities: architecture.capabilities, scope: 'scope1' })).toMatchObject({
        showFuelSelection: true,
        showCustomFuel: true,
        showManualFactorOverrides: false,
      });
    });
  });

  test('C7 employee fields and multi-employee capability match in Create/Edit', () => {
    const { create, edit } = createAndEdit('employee_commuting', 'scope3');
    [create, edit].forEach((architecture) => {
      expect(architecture.capabilities.multiEmployee).toBe(true);
      expect(resolveGhgUiState({ capabilities: architecture.capabilities, scope: 'scope3' }).showEmployeeFields).toBe(true);
    });
  });

  test('C6 flight capability propagates for monthly and yearly Create/Edit', () => {
    const { create, edit } = createAndEdit('business_travel', 'scope3');
    [create, edit].forEach((architecture) => {
      const monthly = resolveGhgUiState({
        capabilities: architecture.capabilities,
        scope: 'scope3',
        scope3ActivityType: 'air_travel',
        frequencyType: 'monthly',
      });
      const yearly = resolveGhgUiState({
        capabilities: architecture.capabilities,
        scope: 'scope3',
        scope3ActivityType: 'air_travel',
        frequencyType: 'yearly',
      });
      expect(monthly.showMonthlyFlightDetails).toBe(true);
      expect(yearly.showYearlyFlightDetails).toBe(true);
    });
  });

  test('existing fieldOptions overrides reach both Create and Edit through one path', () => {
    const overrides = {
      fieldOptions: {
        [GHG_FIELD_OPTION_KEYS.SUBCATEGORY]: [{ value: 'org_option', label: 'Organization Option' }],
      },
    };
    const create = resolveLivePath({
      categoryCode: 'upstream_leased_assets',
      scopeCode: 'scope3',
      mode: 'create',
      organizationOverrides: overrides,
    });
    const edit = resolveLivePath({
      categoryCode: 'upstream_leased_assets',
      scopeCode: 'scope3',
      mode: 'edit',
      organizationOverrides: overrides,
    });
    expect(create.resolvedFieldOptions).toEqual(edit.resolvedFieldOptions);
    expect(create.capabilityResolution.organizationOverridesApplied).toBe(true);
    expect(create.resolvedFieldOptions[GHG_FIELD_OPTION_KEYS.SUBCATEGORY][0].value).toBe('org_option');
  });
});

describe('canonical capability authority for Scope 3 registry metadata', () => {
  test.each(Object.entries(CATEGORY_CONFIGS))('%s derives registry flags from resolveGhgCapabilities', (code, config) => {
    const capabilities = resolveGhgCapabilities({ categoryCode: code, scopeCode: 'scope3' }).capabilities;
    expect(config.requiresSubcategory).toBe(capabilities.subcategory);
    expect(config.requiresAssetName).toBe(capabilities.assetName);
    expect(config.requiresLocation).toBe(capabilities.journeyLocations);
    expect(config.supportsMultiEmployee).toBe(capabilities.multiEmployee);
    expect(Boolean(config.activityTypes)).toBe(capabilities.activityType);
  });
});
