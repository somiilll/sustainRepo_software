/**
 * C8 - Upstream Leased Assets
 * Category Module
 */

// Subcategory options shared across C8, C10, C11, C13, C14
export const SUBCATEGORY_OPTIONS = [
  { value: 'stationary_combustion', label: 'Stationary Combustion' },
  { value: 'mobile_combustion', label: 'Mobile Combustion' },
  { value: 'energy', label: 'Energy' },
  { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
  { value: 'process_emissions', label: 'Process Emissions' },
];

export const config = {
  code: 'c8',
  name: 'C8 - Upstream Leased Assets',
  scope: 'scope3',
  requiresSubcategory: true, // Requires emission source type selection
  requiresAssetName: true, // Requires asset name
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from operation of assets leased by the reporting company',
  helpText: {
    activity_basis: 'Use average emission factors based on asset type and usage',
    spend_basis: 'Calculate emissions based on lease payments',
    supplier_basis: 'Use supplier-specific emission factors',
  },
  subcategories: SUBCATEGORY_OPTIONS,
  assetField: {
    label: 'Asset Name',
    placeholder: 'Enter leased asset name',
    required: true,
  },
};

export default config;
