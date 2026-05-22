/**
 * Pure unit and conversion utilities — extracted from src/pages/Emissions.js
 * during the E1 modularization phase.
 *
 * These functions take their dependencies as explicit arguments (no closure
 * capture), so they can be unit-tested in isolation and re-used across pages.
 *
 * Behaviour byte-identical to the legacy inline versions.
 */

/**
 * Check whether two unit strings resolve to the same canonical unit using the
 * centralized units list (matches symbol, name, or any alias case-insensitively).
 *
 * @param {string} unit1
 * @param {string} unit2
 * @param {Array<{symbol:string, name:string, aliases?:string[]}>} centralizedUnits
 * @returns {boolean}
 */
export const unitsMatch = (unit1, unit2, centralizedUnits) => {
  if (!unit1 || !unit2) return false;
  const u1 = unit1.toLowerCase().trim();
  const u2 = unit2.toLowerCase().trim();

  // Direct match
  if (u1 === u2) return true;

  // Check if both belong to the same unit (via aliases from centralized units)
  for (const unit of centralizedUnits) {
    const allNames = [
      unit.symbol.toLowerCase(),
      unit.name.toLowerCase(),
      ...(unit.aliases || []).map(a => a.toLowerCase()),
    ];
    const hasU1 = allNames.includes(u1);
    const hasU2 = allNames.includes(u2);
    if (hasU1 && hasU2) return true;
  }

  return false;
};

/**
 * Determine whether a unit string is a volume-type unit, looking up via the
 * centralized units list (matches symbol/name/aliases).
 *
 * @param {string} unitStr
 * @param {Array<{symbol:string, name:string, aliases?:string[], unit_type:string}>} centralizedUnits
 * @returns {boolean}
 */
export const isVolumeUnit = (unitStr, centralizedUnits) => {
  if (!unitStr) return false;
  const u = unitStr.toLowerCase().trim();

  for (const unit of centralizedUnits) {
    if (unit.unit_type === 'volume') {
      const allNames = [
        unit.symbol.toLowerCase(),
        unit.name.toLowerCase(),
        ...(unit.aliases || []).map(a => a.toLowerCase()),
      ];
      if (allNames.includes(u)) return true;
    }
  }
  return false;
};

/**
 * Internal helper: locate a formula parameter for a given paramKey using a
 * tolerant matching strategy (exact key, common variations, electricity hint).
 *
 * @param {string} paramKey
 * @param {Array<{parameter_key:string, unit_conversions?:Array}>} formulaParameters
 * @returns {Object|null}
 */
const _findFormulaParameter = (paramKey, formulaParameters) => {
  // Order matters: first check exact match, then related keys
  let param = formulaParameters.find(p => p.parameter_key === paramKey);

  // If no exact match, try common variations
  if (!param) {
    param = formulaParameters.find(p =>
      p.parameter_key === paramKey.replace('_fuel', '') ||
      p.parameter_key === paramKey.replace('quantity', 'quantity_fuel')
    );
  }

  // For electricity_quantity specifically, also check if paramKey references it
  if (!param && (paramKey === 'electricity_quantity' || paramKey.includes('electricity'))) {
    param = formulaParameters.find(p => p.parameter_key === 'electricity_quantity');
  }

  return param || null;
};

/**
 * Compute the conversion factor for a parameter value into the formula's base
 * unit, using SuperAdmin-defined `unit_conversions` on the formula parameter.
 *
 * Returns 1 when:
 *   - selectedUnit is missing,
 *   - no parameter matches paramKey,
 *   - the parameter has no conversions defined,
 *   - selectedUnit IS the base unit (no conversion needed),
 *   - or no conversion rule matches (fallback — implies missing config).
 *
 * @param {string} paramKey
 * @param {string} selectedUnit
 * @param {Array} formulaParameters
 * @returns {number}
 */
export const getConversionFactor = (paramKey, selectedUnit, formulaParameters) => {
  if (!selectedUnit) return 1;

  const param = _findFormulaParameter(paramKey, formulaParameters);

  if (!param || !param.unit_conversions || param.unit_conversions.length === 0) {
    return 1; // No conversion defined, use as-is
  }

  // Find the conversion rule for the selected unit
  const conversion = param.unit_conversions.find(c =>
    c.from_unit.toLowerCase() === selectedUnit.toLowerCase()
  );

  if (conversion && conversion.multiplier !== 0) {
    // The multiplier represents "how many from_unit = 1 to_unit"
    // So to convert from from_unit to to_unit, we DIVIDE by multiplier
    // Example: 1000 g with multiplier 1000 → 1000/1000 = 1 kg
    return 1 / conversion.multiplier;
  }

  // Check if selected unit is the target unit (base unit - no conversion needed)
  const isBaseUnit = param.unit_conversions.some(c =>
    c.to_unit.toLowerCase() === selectedUnit.toLowerCase()
  );

  if (isBaseUnit) {
    return 1; // Already in base unit
  }

  return 1; // Default: no conversion (but this means config is missing)
};

/**
 * Check whether a unit conversion is *defined* for a parameter+unit pair (as
 * opposed to fetching the multiplier itself). Treats the formula's base unit
 * as "defined" because no conversion is needed.
 *
 * @param {string} paramKey
 * @param {string} selectedUnit
 * @param {Array} formulaParameters
 * @returns {boolean}
 */
export const hasConversionDefined = (paramKey, selectedUnit, formulaParameters) => {
  if (!selectedUnit) return false;

  const param = _findFormulaParameter(paramKey, formulaParameters);

  if (!param || !param.unit_conversions || param.unit_conversions.length === 0) {
    return false;
  }

  // Check if conversion exists for this unit OR if it's the target unit (base unit)
  const hasDirectConversion = param.unit_conversions.some(c =>
    c.from_unit.toLowerCase() === selectedUnit.toLowerCase()
  );

  // Also check if selected unit is the target unit (base unit needs no conversion)
  const isBaseUnit = param.unit_conversions.some(c =>
    c.to_unit.toLowerCase() === selectedUnit.toLowerCase()
  );

  return hasDirectConversion || isBaseUnit;
};

const unitUtils = {
  unitsMatch,
  isVolumeUnit,
  getConversionFactor,
  hasConversionDefined,
};

export default unitUtils;
