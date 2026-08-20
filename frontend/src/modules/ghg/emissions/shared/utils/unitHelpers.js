/**
 * Unit-aware helpers for GHG forms.
 * Unit types come from the central Calc Engine unit registry, never from
 * category-specific mass/volume lists.
 */

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const getUnitDefinition = (unit, centralizedUnits = []) => {
  if (!unit) return null;
  const normalized = String(unit).trim().toLowerCase();
  return centralizedUnits.find((definition) => (
    definition.symbol?.trim().toLowerCase() === normalized
    || definition.aliases?.some((alias) => String(alias).trim().toLowerCase() === normalized)
  )) || null;
};

/** Identifies the standard quantity field across configured GHG forms. */
export const isQuantityField = (field = {}) => {
  const fieldIdentity = String(field.variable || field.fieldKey || '').toLowerCase();
  return /^(qty|quantity)(_|$)/.test(fieldIdentity);
};

/** Returns the unit registry type, such as mass or volume. */
export const getUnitDimension = (unit, centralizedUnits = []) => (
  getUnitDefinition(unit, centralizedUnits)?.unit_type || null
);

/** Extracts the denominator from a compound unit such as kgCO2/L or TJ/kg. */
export const getUnitDenominator = (compoundUnit) => {
  if (!compoundUnit) return null;
  return String(compoundUnit).split('/')[1]?.trim() || null;
};

/**
 * Resolves whether a property-based density conversion is needed and, if so,
 * the directional unit a user must provide. For instance:
 * - quantity L → formula needs kg: kg/L
 * - quantity kg → formula needs L: L/kg
 */
export const resolveDensityRequirement = ({
  quantityUnit,
  referenceUnit,
  centralizedUnits = [],
} = {}) => {
  const quantityDimension = getUnitDimension(quantityUnit, centralizedUnits);
  const referenceDimension = getUnitDimension(referenceUnit, centralizedUnits);

  if (!quantityDimension || !referenceDimension || quantityDimension === referenceDimension) {
    return { required: false, densityUnit: '', conversionDirection: null };
  }

  const isMassVolumePair = new Set([quantityDimension, referenceDimension]);
  if (isMassVolumePair.size !== 2 || !isMassVolumePair.has('mass') || !isMassVolumePair.has('volume')) {
    return { required: false, densityUnit: '', conversionDirection: null };
  }

  return {
    required: true,
    densityUnit: `${referenceUnit}/${quantityUnit}`,
    conversionDirection: `${quantityDimension}_to_${referenceDimension}`,
  };
};

export const isDensityRequiredForQtyBasis = (efUnit, qtyAllowedUnits, centralizedUnits = []) => {
  const denominator = getUnitDenominator(efUnit);
  return (qtyAllowedUnits || []).length > 0 && (qtyAllowedUnits || []).every((quantityUnit) => (
    resolveDensityRequirement({ quantityUnit, referenceUnit: denominator, centralizedUnits }).required
  ));
};

export const isDensityRequiredForHeatBasis = (cvUnit, qtyUnit, centralizedUnits = []) => (
  resolveDensityRequirement({
    quantityUnit: qtyUnit,
    referenceUnit: getUnitDenominator(cvUnit),
    centralizedUnits,
  }).required
);

export const isDensityRequiredForCarbonComposition = (qtyUnit, centralizedUnits = []) => (
  resolveDensityRequirement({ quantityUnit: qtyUnit, referenceUnit: 'kg', centralizedUnits }).required
);

export const invertDensityUnit = (densityUnit) => {
  const [numerator, denominator] = String(densityUnit || '').split('/').map((part) => part?.trim());
  return numerator && denominator ? `${denominator}/${numerator}` : '';
};