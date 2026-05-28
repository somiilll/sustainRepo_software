/**
 * Calculation Method Constants
 * Method identifiers only - labels are fetched from /api/config/labels
 */

// Calculation method identifiers (use only *_basis, not *_based)
export const CALCULATION_METHODS = {
  SPEND_BASIS: 'spend_basis',
  ACTIVITY_BASIS: 'activity_basis',
  SUPPLIER_BASIS: 'supplier_basis',
  DISTANCE_BASIS: 'distance_basis',
  FUEL_BASIS: 'fuel_basis',
  ASSET_BASIS: 'asset_basis',
  AVERAGE_DATA: 'average_data',
};

/**
 * Check if method is supplier-based (requires custom EF input)
 * @param {string} method - Method identifier
 * @returns {boolean}
 */
export const isSupplierBased = (method) => {
  return method === CALCULATION_METHODS.SUPPLIER_BASIS;
};

/**
 * Check if method is spend-based
 * @param {string} method - Method identifier
 * @returns {boolean}
 */
export const isSpendBased = (method) => {
  return method === CALCULATION_METHODS.SPEND_BASIS;
};

/**
 * Check if method is activity/average-based
 * @param {string} method - Method identifier
 * @returns {boolean}
 */
export const isActivityBased = (method) => {
  return method === CALCULATION_METHODS.ACTIVITY_BASIS || 
         method === CALCULATION_METHODS.AVERAGE_DATA;
};

export default CALCULATION_METHODS;
