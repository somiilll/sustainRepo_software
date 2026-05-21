/**
 * Unit Utilities
 * Centralized unit-related helper functions
 */

/**
 * Check if unit is volume-based
 * @param {string} unit - Unit symbol
 * @param {Array} centralizedUnits - List of centralized unit definitions
 * @returns {boolean}
 */
export const isVolumeUnit = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => 
    u.symbol?.toLowerCase() === unit?.toLowerCase()
  );
  return unitDef?.unit_type === 'volume';
};

/**
 * Check if unit is mass-based
 * @param {string} unit - Unit symbol
 * @param {Array} centralizedUnits - List of centralized unit definitions
 * @returns {boolean}
 */
export const isMassUnit = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => 
    u.symbol?.toLowerCase() === unit?.toLowerCase()
  );
  return unitDef?.unit_type === 'mass';
};

/**
 * Check if unit is energy-based
 * @param {string} unit - Unit symbol
 * @param {Array} centralizedUnits - List of centralized unit definitions
 * @returns {boolean}
 */
export const isEnergyUnit = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => 
    u.symbol?.toLowerCase() === unit?.toLowerCase()
  );
  return unitDef?.unit_type === 'energy';
};

/**
 * Get unit type
 * @param {string} unit - Unit symbol
 * @param {Array} centralizedUnits - List of centralized unit definitions
 * @returns {string|null}
 */
export const getUnitType = (unit, centralizedUnits = []) => {
  const unitDef = centralizedUnits.find(u => 
    u.symbol?.toLowerCase() === unit?.toLowerCase()
  );
  return unitDef?.unit_type || null;
};

/**
 * Get units by type
 * @param {string} unitType - Unit type (mass, volume, energy, etc.)
 * @param {Array} centralizedUnits - List of centralized unit definitions
 * @returns {Array}
 */
export const getUnitsByType = (unitType, centralizedUnits = []) => {
  return centralizedUnits.filter(u => u.unit_type === unitType);
};

/**
 * Format unit for display
 * @param {string} unit - Unit symbol
 * @param {Array} centralizedUnits - List of centralized unit definitions
 * @returns {string}
 */
export const formatUnit = (unit, centralizedUnits = []) => {
  if (!unit) return '';
  
  const unitDef = centralizedUnits.find(u => 
    u.symbol?.toLowerCase() === unit?.toLowerCase()
  );
  
  return unitDef?.display_name || unitDef?.symbol || unit;
};

/**
 * Check if unit is unitless (count, ratio, etc.)
 * @param {string} unit - Unit symbol
 * @returns {boolean}
 */
export const isUnitless = (unit) => {
  const unitlessUnits = ['count', 'number', 'ratio', '1', '', null, undefined];
  return unitlessUnits.includes(unit?.toLowerCase());
};

/**
 * Get default unit for a field type
 * @param {string} fieldType - Field type
 * @returns {string}
 */
export const getDefaultUnit = (fieldType) => {
  const defaults = {
    mass: 'kg',
    volume: 'L',
    energy: 'kWh',
    distance: 'km',
    area: 'm2',
    currency: 'USD',
  };
  return defaults[fieldType] || '';
};

export default {
  isVolumeUnit,
  isMassUnit,
  isEnergyUnit,
  getUnitType,
  getUnitsByType,
  formatUnit,
  isUnitless,
  getDefaultUnit,
};
