/**
 * C4 - Upstream Transportation and Distribution
 * Category Module
 */

export const config = {
  code: 'c4',
  name: 'C4 - Upstream Transportation and Distribution',
  scope: 'scope3',
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: true, // Requires from/to location
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis', 'distance_basis'],
  description: 'Emissions from transportation and distribution of purchased goods',
  helpText: {
    activity_basis: 'Use average emission factors based on transport mode and weight/distance',
    spend_basis: 'Calculate emissions based on transportation spend',
    supplier_basis: 'Use supplier-specific emission factors',
    distance_basis: 'Calculate based on distance travelled and transport mode',
  },
  locationFields: {
    from: { label: 'Origin', placeholder: 'Enter origin location', required: true },
    to: { label: 'Destination', placeholder: 'Enter destination location', required: true },
  },
};

export default config;
