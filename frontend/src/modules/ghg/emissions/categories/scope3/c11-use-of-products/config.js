/**
 * C11 - Use of Sold Products
 * Category Module
 */

import { SUBCATEGORY_OPTIONS } from '../c8-upstream-leased/config';

export const config = {
  code: 'c11',
  name: 'C11 - Use of Sold Products',
  scope: 'scope3',
  requiresSubcategory: true,
  requiresAssetName: false,
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from use of goods and services sold by the reporting company',
  helpText: {
    activity_basis: 'Use average emission factors based on product usage',
    spend_basis: 'Calculate emissions based on sales data',
    supplier_basis: 'Use supplier-specific emission factors',
  },
  subcategories: SUBCATEGORY_OPTIONS,
};

export { SUBCATEGORY_OPTIONS };
export default config;
