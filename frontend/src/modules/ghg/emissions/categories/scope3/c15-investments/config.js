/**
 * C15 - Investments
 * Category Module
 */

export const config = {
  code: 'c15',
  name: 'C15 - Investments',
  scope: 'scope3',
  requiresSubcategory: false,
  requiresAssetName: true, // Investment/Company name
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from operation of investments not included in Scope 1 and 2',
  helpText: {
    activity_basis: 'Use average emission factors based on investment type',
    spend_basis: 'Calculate emissions based on investment value',
    supplier_basis: 'Use investee-specific emission factors',
  },
  investmentTypes: [
    { value: 'equity', label: 'Equity Investments' },
    { value: 'debt', label: 'Debt Investments' },
    { value: 'project_finance', label: 'Project Finance' },
  ],
  assetField: {
    label: 'Investment Name',
    placeholder: 'Enter investment/company name',
    required: true,
  },
};

export default config;
