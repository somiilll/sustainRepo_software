/**
 * C1 - Purchased Goods and Services
 * Category Module Configuration
 */

export const config = {
  code: 'c1',
  name: 'C1 - Purchased Goods and Services',
  scope: 'scope3',
  
  // UI features
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  
  // Entry modes
  supportsMonthly: true,
  supportsYearly: true,
  
  // Special features
  multiEmployee: false,
  
  // Available calculation methods
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  
  // Description for UI
  description: 'Emissions from purchased goods and services not included in other categories',
  
  // Help text
  helpText: {
    activity_basis: 'Use average emission factors based on product type and quantity',
    spend_basis: 'Calculate emissions based on spend amount using economic input-output factors',
    supplier_basis: 'Use supplier-specific emission factors when available',
  },
};

export default config;
