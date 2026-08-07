/**
 * Unit dimension helpers for GHG emission calculations.
 */

const VOLUME_UNITS = new Set(['l', 'ml', 'kl', 'm3', 'cm3']);
const MASS_UNITS = new Set(['kg', 'g', 't']);

/**
 * Classify a single unit as 'mass', 'volume', or null.
 */
export const getUnitDimension = (unit) => {
  if (!unit) return null;
  const u = unit.toLowerCase();
  if (MASS_UNITS.has(u)) return 'mass';
  if (VOLUME_UNITS.has(u)) return 'volume';
  return null;
};

/**
 * Extract the denominator from a compound unit string like "kgCO2/L" → "L",
 * or "TJ/kg" → "kg".
 */
export const getUnitDenominator = (compoundUnit) => {
  if (!compoundUnit) return null;
  return compoundUnit.split('/')[1]?.trim() || null;
};

/**
 * For Qty Basis EF: density is required when the EF unit's denominator dimension
 * differs from the fuel's quantity unit dimension.
 *
 * Example: EF = kgCO2/L (volume denom) but fuel only allows kg,g,t (mass qty)
 *          → dimensions mismatch → density is required.
 */
export const isDensityRequiredForQtyBasis = (efUnit, qtyAllowedUnits) => {
  if (!efUnit || !qtyAllowedUnits?.length) return false;
  const denom = getUnitDenominator(efUnit);
  const denomDim = getUnitDimension(denom);
  if (!denomDim) return false;
  const qtyDims = qtyAllowedUnits.map(u => getUnitDimension(u)).filter(Boolean);
  if (!qtyDims.length) return false;
  // Density needed if every qty unit is a different dimension than EF denominator
  return qtyDims.every(d => d !== denomDim);
};

/**
 * For Heat Basis (NCV) custom fuel: density is required when the CV unit's
 * denominator dimension differs from the quantity unit dimension.
 *
 * Example: CV = TJ/L (volume denom), Qty = kg (mass) → need density.
 *          CV = TJ/kg (mass denom), Qty = kg (mass) → no density needed.
 */
export const isDensityRequiredForHeatBasis = (cvUnit, qtyUnit) => {
  if (!cvUnit || !qtyUnit) return false;
  const cvDenom = getUnitDenominator(cvUnit);
  const cvDenomDim = getUnitDimension(cvDenom);
  const qtyDim = getUnitDimension(qtyUnit);
  if (!cvDenomDim || !qtyDim) return false;
  return cvDenomDim !== qtyDim;
};

/**
 * For Carbon Composition custom fuel: density is required when the
 * quantity unit is volume-based (need to convert to mass for the formula).
 */
export const isDensityRequiredForCarbonComposition = (qtyUnit) => {
  return getUnitDimension(qtyUnit) === 'volume';
};
