/** Canonical, presentation-only capabilities keyed by (code, scope_code). */
const NONE = Object.freeze({
  subcategory: false, assetName: false, journeyLocations: false,
  activityType: false, multiEmployee: false, typeOfProduct: false,
  customerCounterparty: false, flightDetails: false, customFuel: false,
  supplierBasisOtherActivity: false,
});

const scope3 = (caps = {}) => ({ ...NONE, ...caps });

export const STANDARD_GHG_CAPABILITIES = Object.freeze({
  'upstream_transportation_distribution|scope3': scope3({ journeyLocations: true }),
  'business_travel|scope3': scope3({ activityType: true, journeyLocations: true, flightDetails: true, supplierBasisOtherActivity: true }),
  'employee_commuting|scope3': scope3({ activityType: true, multiEmployee: true }),
  'upstream_leased_assets|scope3': scope3({ subcategory: true, assetName: true }),
  'downstream_transportation_and_distribution|scope3': scope3({ journeyLocations: true, customerCounterparty: true }),
  'processing_of_sold_products|scope3': scope3({ subcategory: true }),
  'use_of_sold_products|scope3': scope3({ subcategory: true, typeOfProduct: true }),
  'downstream_leased_assets|scope3': scope3({ subcategory: true, assetName: true }),
  'franchises|scope3': scope3({ subcategory: true, assetName: true }),
  'investments|scope3': scope3({ assetName: true }),
  'stationary_combustion|scope1': { ...NONE, customFuel: true },
  'mobile_combustion|scope1': { ...NONE, customFuel: true },
  'fugitive_emissions|scope1': { ...NONE, customFuel: true },
  'flaring__stationary_combustion|scope1': { ...NONE, customFuel: true },
  'stationary_combustion|biogenic': { ...NONE, customFuel: true },
  'mobile_combustion|biogenic': { ...NONE, customFuel: true },
});

// Transitional aliases only for the existing Scope 3 module registry. The
// resolved category identity remains the backend code + effective scope.
const MODULE_CODE_ALIASES = Object.freeze({
  c1: 'purchased_goods_and_services', c2: 'capital_goods',
  c3: 'fuel_and_energy_related_activities_not_included_in_scope_1_or_scope_2',
  c4: 'upstream_transportation_distribution', c5: 'waste_generated_in_operations',
  c6: 'business_travel', c7: 'employee_commuting', c8: 'upstream_leased_assets',
  c9: 'downstream_transportation_and_distribution', c10: 'processing_of_sold_products',
  c11: 'use_of_sold_products', c12: 'end_of_life_treatment_of_sold_products',
  c13: 'downstream_leased_assets', c14: 'franchises', c15: 'investments',
});

export const resolveGhgCapabilities = ({
  categoryCode,
  scopeCode,
  biogenicScopeSelection,
  organizationOverrides,
} = {}) => {
  const code = MODULE_CODE_ALIASES[categoryCode] || categoryCode;
  const base = STANDARD_GHG_CAPABILITIES[`${code}|${scopeCode}`] || NONE;
  // Biogenic Scope 3 intentionally uses direct activity selection. This is a
  // context rule, not a second category identity.
  const capabilities = biogenicScopeSelection === 'scope3'
    ? { ...base, subcategory: false }
    : { ...base };
  // Capability overrides are deliberately reserved for a future organization
  // document; no organization conditional or override behavior exists today.
  return { code, scopeCode, capabilities, organizationOverridesApplied: false };
};

export default resolveGhgCapabilities;