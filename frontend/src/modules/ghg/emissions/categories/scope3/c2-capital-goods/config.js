/**
 * C2 - Capital Goods
 * Category Module Configuration
 */

export const config = {
  code: 'c2',
  name: 'C2 - Capital Goods',
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
  description: 'Emissions from capital goods purchased or acquired',
  
  // Help text
  helpText: {
    activity_basis: 'Use average emission factors based on asset type and quantity',
    spend_basis: 'Calculate emissions based on capital expenditure using economic input-output factors',
    supplier_basis: 'Use supplier-specific emission factors when available',
  },
};

export default config;
