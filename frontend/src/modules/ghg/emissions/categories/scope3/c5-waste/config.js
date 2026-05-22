/**
 * C5 - Waste Generated in Operations
 * Category Module
 */

export const config = {
  code: 'c5',
  name: 'C5 - Waste Generated in Operations',
  scope: 'scope3',
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from disposal and treatment of waste generated in operations',
  helpText: {
    activity_basis: 'Use average emission factors based on waste type and disposal method',
    spend_basis: 'Calculate emissions based on waste management spend',
    supplier_basis: 'Use supplier-specific emission factors from waste management providers',
  },
  wasteTypes: [
    { value: 'landfill', label: 'Landfill' },
    { value: 'incineration', label: 'Incineration' },
    { value: 'recycling', label: 'Recycling' },
    { value: 'composting', label: 'Composting' },
    { value: 'anaerobic_digestion', label: 'Anaerobic Digestion' },
  ],
};

export default config;
