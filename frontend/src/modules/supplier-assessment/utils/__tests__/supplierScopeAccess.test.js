import {
  filterSupplierVisibleCategories,
  resolveSupplierGhgOverrides,
} from '../supplierScopeAccess';

describe('supplier GHG policy presentation', () => {
  const supplierConfig = {
    categories: {
      scope1: [{ value: 'flaring__stationary_combustion', label: 'Flaring (Stationary Combustion)' }],
    },
    permissions: { allow_custom_fuels: false },
  };

  it('hides Process Emissions and retains only an explicitly allowed special category', () => {
    expect(filterSupplierVisibleCategories(
      ['Stationary Combustion', 'Process Emissions', 'Flaring (Stationary Combustion)'],
      'scope1',
      supplierConfig,
    )).toEqual(['Stationary Combustion', 'Flaring (Stationary Combustion)']);
  });

  it('fails closed for custom fuel until the supplier program explicitly permits it', () => {
    expect(resolveSupplierGhgOverrides(null, supplierConfig).capabilityOverrides.customFuel).toBe(false);
    expect(resolveSupplierGhgOverrides(null, { permissions: { allow_custom_fuels: true } })).toBeNull();
  });
});