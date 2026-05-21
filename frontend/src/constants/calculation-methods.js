/**
 * Calculation Method Constants
 * Centralized calculation method definitions
 */

// Calculation method identifiers
export const CALCULATION_METHODS = {
  SPEND_BASIS: 'spend_basis',
  ACTIVITY_BASIS: 'activity_basis',
  SUPPLIER_BASIS: 'supplier_basis',
  DISTANCE_BASIS: 'distance_basis',
  FUEL_BASIS: 'fuel_basis',
  ASSET_BASIS: 'asset_basis',
  AVERAGE_DATA: 'average_data',
};

// Method display labels (full)
export const METHOD_LABELS = {
  [CALCULATION_METHODS.SPEND_BASIS]: 'Spend Based',
  [CALCULATION_METHODS.ACTIVITY_BASIS]: 'Activity Based',
  [CALCULATION_METHODS.SUPPLIER_BASIS]: 'Supplier Based',
  [CALCULATION_METHODS.DISTANCE_BASIS]: 'Distance Based',
  [CALCULATION_METHODS.FUEL_BASIS]: 'Fuel Based',
  [CALCULATION_METHODS.ASSET_BASIS]: 'Asset Based',
  [CALCULATION_METHODS.AVERAGE_DATA]: 'Average Data Based',
  // Legacy aliases
  'spend_based': 'Spend Based',
  'activity_based': 'Activity Based',
  'supplier_based': 'Supplier Based',
  'distance_based': 'Distance Based',
  'fuel_based': 'Fuel Based',
  'asset_based': 'Asset Based',
};

// Method short labels
export const METHOD_LABELS_SHORT = {
  [CALCULATION_METHODS.SPEND_BASIS]: 'Spend',
  [CALCULATION_METHODS.ACTIVITY_BASIS]: 'Average',
  [CALCULATION_METHODS.SUPPLIER_BASIS]: 'Supplier',
  [CALCULATION_METHODS.DISTANCE_BASIS]: 'Distance',
  [CALCULATION_METHODS.FUEL_BASIS]: 'Fuel',
  [CALCULATION_METHODS.ASSET_BASIS]: 'Asset',
  [CALCULATION_METHODS.AVERAGE_DATA]: 'Average',
  // Legacy aliases
  'spend_based': 'Spend',
  'activity_based': 'Average',
  'supplier_based': 'Supplier',
  'distance_based': 'Distance',
  'fuel_based': 'Fuel',
  'asset_based': 'Asset',
};

/**
 * Get method label
 * @param {string} method - Method identifier
 * @param {boolean} short - Use short label
 * @returns {string} Display label
 */
export const getMethodLabel = (method, short = false) => {
  if (!method) return '-';
  const labels = short ? METHOD_LABELS_SHORT : METHOD_LABELS;
  return labels[method] || method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Check if method is supplier-based (requires custom EF input)
 * @param {string} method - Method identifier
 * @returns {boolean}
 */
export const isSupplierBased = (method) => {
  return method === CALCULATION_METHODS.SUPPLIER_BASIS || method === 'supplier_based';
};

/**
 * Check if method is spend-based
 * @param {string} method - Method identifier
 * @returns {boolean}
 */
export const isSpendBased = (method) => {
  return method === CALCULATION_METHODS.SPEND_BASIS || method === 'spend_based';
};

/**
 * Check if method is activity/average-based
 * @param {string} method - Method identifier
 * @returns {boolean}
 */
export const isActivityBased = (method) => {
  return method === CALCULATION_METHODS.ACTIVITY_BASIS || 
         method === 'activity_based' || 
         method === CALCULATION_METHODS.AVERAGE_DATA;
};

export default CALCULATION_METHODS;
