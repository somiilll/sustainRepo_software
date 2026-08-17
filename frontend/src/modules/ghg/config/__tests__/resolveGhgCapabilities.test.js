import { resolveGhgCapabilities } from '../resolveGhgCapabilities';
import fixtures from './fixtures/form-config-fixtures.json';

const expectations = {
  upstream_transportation_distribution: { journeyLocations: true },
  business_travel: { activityType: true, journeyLocations: true, flightDetails: true, supplierBasisOtherActivity: true },
  employee_commuting: { activityType: true, multiEmployee: true },
  upstream_leased_assets: { subcategory: true, assetName: true },
  downstream_transportation_and_distribution: { journeyLocations: true, customerCounterparty: true },
  processing_of_sold_products: { subcategory: true },
  use_of_sold_products: { subcategory: true, typeOfProduct: true },
  downstream_leased_assets: { subcategory: true, assetName: true },
  franchises: { subcategory: true, assetName: true },
  investments: { assetName: true },
  stationary_combustion: { customFuel: true },
  mobile_combustion: { customFuel: true },
  fugitive_emissions: { customFuel: true },
  flaring__stationary_combustion: { customFuel: true },
};

describe('GHG capability baseline parity', () => {
  it.each(fixtures.dynamicCategories)('%s resolves current capabilities by code + scope', (category) => {
    const resolved = resolveGhgCapabilities({ categoryCode: category.code, scopeCode: category.scope_code });
    expect(resolved.code).toBe(category.code);
    expect(resolved.scopeCode).toBe(category.scope_code);
    expect(resolved.capabilities).toEqual(expect.objectContaining(expectations[category.code] || {}));
  });

  it('keeps Biogenic Scope 3 subcategory UI disabled while preserving identity', () => {
    const resolved = resolveGhgCapabilities({
      categoryCode: 'upstream_leased_assets', scopeCode: 'scope3', biogenicScopeSelection: 'scope3',
    });
    expect(resolved.capabilities.subcategory).toBe(false);
    expect(resolved.capabilities.assetName).toBe(true);
  });
});