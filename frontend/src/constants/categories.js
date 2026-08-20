/**
 * Category Constants
 * Centralized category definitions for Scope 3 emissions
 */

// Scope 3 Category identifiers
export const SCOPE3_CATEGORIES = {
  C1: 'C1 - Purchased Goods and Services',
  C2: 'C2 - Capital Goods',
  C3: 'C3 - Fuel and Energy Related Activities',
  C4: 'C4 - Upstream Transportation and Distribution',
  C5: 'C5 - Waste Generated in Operations',
  C6: 'C6 - Business Travel',
  C7: 'C7 - Employee Commuting',
  C8: 'C8 - Upstream Leased Assets',
  C9: 'C9 - Downstream Transportation and Distribution',
  C10: 'C10 - Processing of Sold Products',
  C11: 'C11 - Use of Sold Products',
  C12: 'C12 - End-of-Life Treatment of Sold Products',
  C13: 'C13 - Downstream Leased Assets',
  C14: 'C14 - Franchises',
  C15: 'C15 - Investments',
};

// Short category codes for internal use
export const CATEGORY_CODES = {
  C1: 'c1',
  C2: 'c2',
  C3: 'c3',
  C4: 'c4',
  C5: 'c5',
  C6: 'c6',
  C7: 'c7',
  C8: 'c8',
  C9: 'c9',
  C10: 'c10',
  C11: 'c11',
  C12: 'c12',
  C13: 'c13',
  C14: 'c14',
  C15: 'c15',
};

import { resolveGhgCapabilities } from '../modules/ghg/config/resolveGhgCapabilities';

const capabilityCodes = (capability) => Object.values(CATEGORY_CODES).filter((code) =>
  resolveGhgCapabilities({ categoryCode: code, scopeCode: 'scope3' }).capabilities[capability],
);

// Transitional exports for inactive compatibility consumers. They are derived
// from the canonical resolver rather than maintained as capability lists.
export const SUBCATEGORY_CATEGORIES = capabilityCodes('subcategory');
export const ASSET_NAME_CATEGORIES = capabilityCodes('assetName');
export const LOCATION_CATEGORIES = capabilityCodes('journeyLocations');
export const ACTIVITY_TYPE_CATEGORIES = capabilityCodes('activityType');
export const MULTI_EMPLOYEE_CATEGORIES = capabilityCodes('multiEmployee');

// Subcategory options for applicable categories
export const SUBCATEGORY_OPTIONS = {
  c8: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c10: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c11: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c13: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
  c14: [
    { value: 'stationary_combustion', label: 'Stationary Combustion' },
    { value: 'mobile_combustion', label: 'Mobile Combustion' },
    { value: 'energy', label: 'Energy' },
    { value: 'fugitive_emissions', label: 'Fugitive Emissions' },
    { value: 'process_emissions', label: 'Process Emissions' },
  ],
};

/**
 * Check if category requires subcategory selection
 * @param {string} category - Category name
 * @returns {boolean}
 */
export const requiresSubcategory = (category) => {
  return resolveGhgCapabilities({ categoryCode: getCategoryCode(category), scopeCode: 'scope3' }).capabilities.subcategory;
};

/**
 * Check if category requires asset name
 * @param {string} category - Category name
 * @returns {boolean}
 */
export const requiresAssetName = (category) => {
  return resolveGhgCapabilities({ categoryCode: getCategoryCode(category), scopeCode: 'scope3' }).capabilities.assetName;
};

/**
 * Check if category requires location fields
 * @param {string} category - Category name
 * @returns {boolean}
 */
export const requiresLocation = (category) => {
  return resolveGhgCapabilities({ categoryCode: getCategoryCode(category), scopeCode: 'scope3' }).capabilities.journeyLocations;
};

/**
 * Check if category supports activity type
 * @param {string} category - Category name
 * @returns {boolean}
 */
export const hasActivityType = (category) => {
  return resolveGhgCapabilities({ categoryCode: getCategoryCode(category), scopeCode: 'scope3' }).capabilities.activityType;
};

/**
 * Check if category is C7 Employee Commuting
 * @param {string} category - Category name
 * @returns {boolean}
 */
export const isC7Category = (category) => {
  const catLower = category?.toLowerCase() || '';
  return catLower.includes('c7') || catLower.includes('employee commuting');
};

/**
 * Check if category is C6 Business Travel
 * @param {string} category - Category name
 * @returns {boolean}
 */
export const isC6Category = (category) => {
  return getCategoryCode(category) === 'c6';
};

/**
 * Get category code from full name
 * @param {string} category - Full category name
 * @returns {string} Category code (c1, c2, etc.)
 */
export const getCategoryCode = (category) => {
  const catLower = category?.toLowerCase() || '';
  for (const code of Object.values(CATEGORY_CODES)) {
    if (catLower.includes(code)) {
      return code;
    }
  }
  return '';
};

/**
 * Get subcategory options for a category
 * @param {string} category - Category name
 * @returns {Array} Subcategory options
 */
export const getSubcategoryOptions = (category) => {
  const code = getCategoryCode(category);
  return SUBCATEGORY_OPTIONS[code] || [];
};

export default SCOPE3_CATEGORIES;
