/**
 * Unit-aware helpers for GHG forms.
 * Unit types come from the central Calc Engine unit registry, never from
 * category-specific mass/volume lists.
 */

const hasValue = (value) => value !== undefined && value !== null && value !== '';

const DENSITY_METHOD_REFERENCE = Object.freeze({
  using_heat_basis_ncv: 'calorific_value',
  using_qty_basis_ef: 'emission_factor',
  using_carbon_composition: 'mass',
});

const fieldIdentity = (field = {}) => `${field.variable || ''} ${field.fieldKey || ''} ${field.label || ''}`;

export const isDensityField = (field = {}) => /(^|\s|_)density(\s|_|$)/i.test(fieldIdentity(field));

export const isCalorificValueField = (field = {}) => (
  /(^|_)(cv|calorific|ncv)(_|$)/i.test(`${field.variable || ''} ${field.fieldKey || ''}`)
  || /calorific|\bcv\b|\bncv\b/i.test(field.label || '')
);

export const isEmissionFactorField = (field = {}) => (
  /(^|_)(ef|emission_factor)(_|$)/i.test(`${field.variable || ''} ${field.fieldKey || ''}`)
  || /emission factor|\bef\b/i.test(field.label || '')
);

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
  return [field.variable, field.fieldKey].some((identity) => (
    /^(qty|quantity)(_|$)/.test(String(identity || '').toLowerCase())
  ));
};

/** Returns the unit registry type, such as mass or volume. */
export const getUnitDimension = (unit, centralizedUnits = []) => {
  const definition = getUnitDefinition(unit, centralizedUnits);
  if (!definition) return null;
  if (definition.unit_type) return String(definition.unit_type).toLowerCase();
  const vector = definition.dimension_vector || definition.derived_dimension_vector || {};
  if (vector.mass) return 'mass';
  if (vector.volume) return 'volume';
  if (vector.energy) return 'energy';
  return null;
};

/** Extracts the denominator from a compound unit such as kgCO2/L or TJ/kg. */
export const getUnitDenominator = (compoundUnit) => {
  if (!compoundUnit) return null;
  return String(compoundUnit).split('/')[1]?.trim() || null;
};

/**
 * Returns the denominator dimension used to route Process Emissions Quantity
 * Basis EF formulas. The decision tree uses this internal value rather than a
 * user-facing form choice, so the selected EF unit remains the source of truth.
 */
export const resolveCompoundDenominatorBasis = (compoundUnit, centralizedUnits = []) => {
  const denominator = getUnitDenominator(compoundUnit);
  const dimension = getUnitDimension(denominator, centralizedUnits);
  return dimension === 'mass' || dimension === 'volume' ? dimension : null;
};

/** Backwards-compatible Quantity Basis EF routing helper. */
export const resolveProcessEfDenominatorBasis = (efUnit, centralizedUnits = []) => (
  resolveCompoundDenominatorBasis(efUnit, centralizedUnits)
);

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

const getFieldDataUnit = (field, data = {}, selectedFuel = null) => {
  if (!field) return '';
  const valueKey = field.variable || field.fieldKey;
  const fieldKey = field.fieldKey || field.variable;
  const configuredUnit = field.defaultUnit || field.default_unit || field.expectedUnit;
  if (field.unitSource === 'fuel') {
    return data[`${valueKey}_unit`]
      || data[`${fieldKey}_unit`]
      || data.unit
      || selectedFuel?.allowed_units?.[0]
      || configuredUnit
      || '';
  }
  return data[`${valueKey}_unit`]
    || data[`${fieldKey}_unit`]
    || configuredUnit
    || field.allowedUnits?.[0]
    || '';
};

const orientDensity = ({ value, unit }, conversionDirection, centralizedUnits = []) => {
  const parsedValue = Number.parseFloat(value);
  const [numerator, denominator] = String(unit || '').split('/').map((part) => part?.trim());
  if (!Number.isFinite(parsedValue) || parsedValue <= 0 || !numerator || !denominator) return null;

  const numeratorDimension = getUnitDimension(numerator, centralizedUnits);
  const denominatorDimension = getUnitDimension(denominator, centralizedUnits);
  const desiredDimensions = conversionDirection === 'mass_to_volume'
    ? ['volume', 'mass']
    : ['mass', 'volume'];

  if (numeratorDimension === desiredDimensions[0] && denominatorDimension === desiredDimensions[1]) {
    return { value: parsedValue, unit: `${numerator}/${denominator}` };
  }
  if (numeratorDimension === desiredDimensions[1] && denominatorDimension === desiredDimensions[0]) {
    return { value: 1 / parsedValue, unit: `${denominator}/${numerator}` };
  }
  return null;
};

/**
 * Resolves one row's conditional Density state from the actual unit pair.
 * Density is invisible for matching dimensions and becomes relevant only for
 * a mass/volume mismatch. A valid fuel density is oriented to the required
 * conversion direction and remains the default until explicitly overridden.
 */
export const resolveDensityFieldState = ({
  calculationMethodology,
  fields = [],
  data = {},
  selectedFuel = null,
  centralizedUnits = [],
} = {}) => {
  const referenceType = DENSITY_METHOD_REFERENCE[calculationMethodology];
  if (!referenceType) return { visible: false, required: false };

  const quantityField = fields.find(isQuantityField);
  const referenceField = referenceType === 'calorific_value'
    ? fields.find(isCalorificValueField)
    : referenceType === 'emission_factor'
      ? fields.find(isEmissionFactorField)
      : null;
  const quantityUnit = getFieldDataUnit(quantityField, data, selectedFuel);
  const referenceUnit = referenceType === 'mass'
    ? 'kg'
    : getUnitDenominator(getFieldDataUnit(referenceField, data, selectedFuel));
  const requirement = resolveDensityRequirement({ quantityUnit, referenceUnit, centralizedUnits });
  if (!requirement.required) {
    return { ...requirement, visible: false, required: false, quantityUnit, referenceUnit };
  }

  const fuelDensity = orientDensity({
    value: selectedFuel?.density,
    unit: selectedFuel?.density_unit,
  }, requirement.conversionDirection, centralizedUnits);
  const overrideEnabled = data.override_density === true || data.override_density === 'true';
  const rowDensity = orientDensity({
    value: data.density,
    unit: data.density_unit || requirement.densityUnit,
  }, requirement.conversionDirection, centralizedUnits);
  const effectiveDensity = overrideEnabled || !fuelDensity ? rowDensity : fuelDensity;

  return {
    ...requirement,
    visible: true,
    required: !fuelDensity,
    hasFuelDefault: Boolean(fuelDensity),
    overrideEnabled,
    defaultDensity: fuelDensity,
    rowDensity,
    effectiveDensity,
    quantityUnit,
    referenceUnit,
  };
};

/**
 * The frozen calculator only transforms activity volume to mass. For the
 * inverse unit pair, normalize a per-volume reference (for example an EF) to
 * a per-mass reference using the already-resolved directional density.
 */
export const normalizeReferenceForDensity = ({ referenceInput, densityState } = {}) => {
  if (!referenceInput || !densityState?.visible) return { referenceInput };
  if (densityState.conversionDirection !== 'mass_to_volume') return { referenceInput };
  if (!densityState.effectiveDensity) {
    return {
      error: `Density (${densityState.densityUnit}) is required because Quantity uses ${densityState.quantityUnit} while the factor uses ${densityState.referenceUnit}`,
    };
  }

  const [referenceNumerator, referenceDenominator] = String(referenceInput.unit || '').split('/').map((part) => part?.trim());
  const [densityNumerator, densityDenominator] = String(densityState.effectiveDensity.unit || '').split('/').map((part) => part?.trim());
  if (!referenceNumerator || !referenceDenominator || referenceDenominator.toLowerCase() !== densityNumerator?.toLowerCase()) {
    return {
      error: `Density must use ${referenceDenominator || densityState.referenceUnit} as its volume unit for this conversion`,
    };
  }

  return {
    referenceInput: {
      value: Number(referenceInput.value) * densityState.effectiveDensity.value,
      unit: `${referenceNumerator}/${densityDenominator}`,
    },
  };
};

export const prepareDensityAwareCalculationInputs = ({
  inputs = {},
  calculationMethodology,
  fields = [],
  data = {},
  selectedFuel = null,
  centralizedUnits = [],
} = {}) => {
  const densityState = resolveDensityFieldState({
    calculationMethodology,
    fields,
    data,
    selectedFuel,
    centralizedUnits,
  });
  const preparedInputs = { ...inputs };
  const decisionInputs = {};

  if (calculationMethodology === 'using_qty_basis_ef' && preparedInputs.ef_quantity) {
    const normalizedReference = normalizeReferenceForDensity({
      referenceInput: preparedInputs.ef_quantity,
      densityState,
    });
    if (normalizedReference.error) {
      return { inputs: preparedInputs, decisionInputs, densityState, error: normalizedReference.error };
    }
    preparedInputs.ef_quantity = normalizedReference.referenceInput;
    const basis = resolveCompoundDenominatorBasis(preparedInputs.ef_quantity.unit, centralizedUnits);
    if (basis) decisionInputs.ef_quantity_basis = basis;
  }

  if (calculationMethodology === 'using_heat_basis_ncv') {
    const cvUnit = preparedInputs.cv?.unit || selectedFuel?.calorific_value_unit;
    const basis = resolveCompoundDenominatorBasis(cvUnit, centralizedUnits);
    if (basis) decisionInputs.cv_quantity_basis = basis;
  }

  return { inputs: preparedInputs, decisionInputs, densityState };
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

/**
 * The frozen calculation engine accepts physical density as kg/L, while the
 * form also permits the equally valid inverse L/kg direction. Convert only
 * the engine-bound representation; persistence retains the user's value and
 * directional unit for accurate Edit hydration and audit history.
 */
export const normalizeDensityForCalcEngine = (density) => {
  const value = Number.parseFloat(density?.value);
  const unit = String(density?.unit || '').replace(/\s/g, '');
  if (!Number.isFinite(value) || value <= 0 || unit.toLowerCase() !== 'l/kg') {
    return density;
  }
  return { value: 1 / value, unit: 'kg/L' };
};