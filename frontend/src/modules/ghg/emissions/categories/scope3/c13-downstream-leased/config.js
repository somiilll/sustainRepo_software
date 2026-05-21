/**
 * C13 - Downstream Leased Assets
 * Category Module
 */

import { SUBCATEGORY_OPTIONS } from '../c8-upstream-leased/config';

export const config = {
  code: 'c13',
  name: 'C13 - Downstream Leased Assets',
  scope: 'scope3',
  requiresSubcategory: true,
  requiresAssetName: true,
  requiresLocation: false,
  hasActivityType: false,
  supportsMonthly: true,
  supportsYearly: true,
  multiEmployee: false,
  methods: ['activity_basis', 'spend_basis', 'supplier_basis'],
  description: 'Emissions from operation of assets owned by the reporting company and leased to other entities',
  helpText: {
    activity_basis: 'Use average emission factors based on asset type',
    spend_basis: 'Calculate emissions based on lease income',
    supplier_basis: 'Use supplier-specific emission factors',
  },
  subcategories: SUBCATEGORY_OPTIONS,
  assetField: {
    label: 'Asset Name',
    placeholder: 'Enter leased asset name',
    required: true,
  },
};

export { SUBCATEGORY_OPTIONS };
export default config;
