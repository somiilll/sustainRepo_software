/**
 * C9 - Downstream Transportation and Distribution
 * Category Module
 */

import { TRANSPORT_ACTIVITY_TYPE_OPTIONS } from '../../../../config/standardGhgFormConfig';

export const config = {
  code: 'c9',
  name: 'C9 - Downstream Transportation and Distribution',
  scope: 'scope3',
  requiresSubcategory: false,
  requiresAssetName: false,
  requiresLocation: true, // Requires from/to location
  hasActivityType: true,
  activityTypes: TRANSPORT_ACTIVITY_TYPE_OPTIONS,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis', 'distance_basis'],
  description: 'Emissions from transportation and distribution of sold products',
  helpText: {
    activity_basis: 'Use average emission factors based on transport mode',
    spend_basis: 'Calculate emissions based on transportation spend',
    supplier_basis: 'Use supplier-specific emission factors',
    distance_basis: 'Calculate based on distance and transport mode',
  },
  locationFields: {
    from: { label: 'Origin', placeholder: 'Enter origin location', required: true },
    to: { label: 'Destination', placeholder: 'Enter destination location', required: true },
  },
};

export default config;
