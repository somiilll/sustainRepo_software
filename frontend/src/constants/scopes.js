/**
 * Scope Constants
 * Centralized scope definitions for GHG emissions
 */

// Scope identifiers
export const SCOPES = {
  SCOPE1: 'scope1',
  SCOPE2: 'scope2',
  SCOPE3: 'scope3',
  BIOGENIC: 'biogenic',
};

// Scope display names
export const SCOPE_LABELS = {
  [SCOPES.SCOPE1]: 'Scope 1',
  [SCOPES.SCOPE2]: 'Scope 2',
  [SCOPES.SCOPE3]: 'Scope 3',
  [SCOPES.BIOGENIC]: 'Biogenic',
};

// Scope descriptions
export const SCOPE_DESCRIPTIONS = {
  [SCOPES.SCOPE1]: 'Direct emissions from owned or controlled sources',
  [SCOPES.SCOPE2]: 'Indirect emissions from purchased electricity, steam, heating & cooling',
  [SCOPES.SCOPE3]: 'All other indirect emissions in the value chain',
  [SCOPES.BIOGENIC]: 'Emissions from biogenic sources',
};

// Scope colors for charts/UI
export const SCOPE_COLORS = {
  [SCOPES.SCOPE1]: '#ef4444', // red-500
  [SCOPES.SCOPE2]: '#f97316', // orange-500
  [SCOPES.SCOPE3]: '#eab308', // yellow-500
  [SCOPES.BIOGENIC]: '#22c55e', // green-500
};

/**
 * Check if scope is valid
 * @param {string} scope - Scope identifier
 * @returns {boolean}
 */
export const isValidScope = (scope) => {
  return Object.values(SCOPES).includes(scope);
};

/**
 * Get scope label
 * @param {string} scope - Scope identifier
 * @returns {string} Display label
 */
export const getScopeLabel = (scope) => {
  return SCOPE_LABELS[scope] || scope;
};

export default SCOPES;
