/**
 * Unit dimension helpers for GHG emission calculations.
 */

const VOLUME_UNITS = new Set(['l', 'ml', 'kl', 'm3', 'cm3']);
const MASS_UNITS = new Set(['kg', 'g', 't']);

/**
 * For Qty Basis EF methodology: determines if density is required when
 * the EF unit's denominator dimension differs from the fuel's quantity
 * unit dimension.
 *
 * Example: EF = kgCO2/L (volume denom) but fuel only allows kg,g,t (mass qty)
 *          → dimensions mismatch → density is required.
 *
 * @param {string} efUnit - Selected EF unit, e.g. "kgCO2/L" or "kgCO2/kg"
 * @param {string[]} qtyAllowedUnits - Fuel's allowed quantity units, e.g. ["L","ml","kl"]
 * @returns {boolean}
 */
export const isDensityRequiredForQtyBasis = (efUnit, qtyAllowedUnits) => {
  if (!efUnit || !qtyAllowedUnits?.length) return false;
  const denominator = efUnit.split('/')[1]?.toLowerCase();
  if (!denominator) return false;
  const efDenomIsVolume = VOLUME_UNITS.has(denominator);
  const efDenomIsMass = MASS_UNITS.has(denominator);
  if (!efDenomIsVolume && !efDenomIsMass) return false;
  const qtyLower = qtyAllowedUnits.map(u => u.toLowerCase());
  const qtyAllMass = qtyLower.every(u => MASS_UNITS.has(u));
  const qtyAllVolume = qtyLower.every(u => VOLUME_UNITS.has(u));
  return (efDenomIsVolume && qtyAllMass) || (efDenomIsMass && qtyAllVolume);
};
