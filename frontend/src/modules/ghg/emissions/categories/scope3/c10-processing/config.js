/**
 * C10 - Processing of Sold Products
 * Category Module
 */

import { SUBCATEGORY_OPTIONS } from '../c8-upstream-leased/config';

export const config = {
  code: 'c10',
  name: 'C10 - Processing of Sold Products',
  scope: 'scope3',
  requiresSubcategory: true,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from processing of intermediate products sold by the reporting company',
  helpText: {
    activity_basis: 'Use average emission factors based on processing type',
    spend_basis: 'Calculate emissions based on processing costs',
    supplier_basis: 'Use supplier-specific emission factors',
  },
  subcategories: SUBCATEGORY_OPTIONS,
};

export { SUBCATEGORY_OPTIONS };
export default config;
