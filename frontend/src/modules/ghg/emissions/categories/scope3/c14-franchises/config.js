/**
 * C14 - Franchises
 * Category Module
 */

import { SUBCATEGORY_OPTIONS } from '../c8-upstream-leased/config';

export const config = {
  code: 'c14',
  name: 'C14 - Franchises',
  scope: 'scope3',
  requiresSubcategory: true,
  requiresAssetName: true, // Franchise name
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from operation of franchises not included in Scope 1 and 2',
  helpText: {
    activity_basis: 'Use average emission factors based on franchise activity',
    spend_basis: 'Calculate emissions based on franchise fees/revenue',
    supplier_basis: 'Use supplier-specific emission factors',
  },
  subcategories: SUBCATEGORY_OPTIONS,
  assetField: {
    label: 'Franchise Name',
    placeholder: 'Enter franchise name',
    required: true,
  },
};

export { SUBCATEGORY_OPTIONS };
export default config;
