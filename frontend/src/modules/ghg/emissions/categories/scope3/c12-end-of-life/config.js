/**
 * C12 - End-of-Life Treatment of Sold Products
 * Category Module
 */

export const config = {
  code: 'c12',
  name: 'C12 - End-of-Life Treatment of Sold Products',
  scope: 'scope3',
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from waste disposal and treatment of products sold by the reporting company',
  helpText: {
    activity_basis: 'Use average emission factors based on disposal method',
    spend_basis: 'Calculate emissions based on disposal costs',
    supplier_basis: 'Use supplier-specific emission factors',
  },
  disposalMethods: [
    { value: 'landfill', label: 'Landfill' },
    { value: 'incineration', label: 'Incineration' },
    { value: 'recycling', label: 'Recycling' },
    { value: 'composting', label: 'Composting' },
  ],
};

export default config;
