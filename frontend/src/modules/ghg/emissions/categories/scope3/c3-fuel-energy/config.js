/**
 * C3 - Fuel and Energy Related Activities
 * Category Module
 */

export const config = {
  code: 'c3',
  name: 'C3 - Fuel and Energy Related Activities',
  scope: 'scope3',
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from fuel and energy related activities not included in Scope 1 or 2',
  helpText: {
    activity_basis: 'Use average emission factors based on fuel type and quantity',
    spend_basis: 'Calculate emissions based on fuel/energy spend',
    supplier_basis: 'Use supplier-specific emission factors',
  },
};

export default config;
