const hasValue = (value) => value !== undefined && value !== null && value !== '';

const readValue = (values, keys) => {
  for (const key of keys) {
    if (hasValue(values[key])) return values[key];
  }
  return undefined;
};

const readUnit = (values, keys, fallback = '') => {
  for (const key of keys) {
    if (hasValue(values[key])) return values[key];
  }
  return fallback;
};

const toInput = (value, unit) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? { value: parsed, unit } : null;
};

const normalizeEmissionFactor = (value, unit, { energyBased = false } = {}) => {
  let normalizedValue = Number.parseFloat(value);
  if (!Number.isFinite(normalizedValue)) return null;
  let normalizedUnit = String(unit || '').replace(/\s/g, '');
  const unitMatch = normalizedUnit.match(/^(tCO2|kgCO2)\/(.+)$/i);
  if (!unitMatch) return { value: normalizedValue, unit: normalizedUnit };

  const [, numerator, rawDenominator] = unitMatch;
  let denominator = rawDenominator;
  if (numerator.toLowerCase() === 'tco2') normalizedValue *= 1000;
  if (energyBased && denominator.toLowerCase() === 'mj') {
    normalizedValue *= 1000;
    denominator = 'TJ';
  }
  normalizedUnit = `kgCO2/${denominator}`;
  return { value: normalizedValue, unit: normalizedUnit };
};

/**
 * Normalizes Custom Fuel and legacy Custom Fuel values for the calc engine.
 * The form owns custom_* names, while configured formulas use canonical keys.
 */
export const buildCustomFuelCalculationPayload = ({
  dynamicFieldValues = {},
  formData = {},
  calculationMethodology = 'using_heat_basis_ncv',
}) => {
  const values = dynamicFieldValues;
  const quantity = readValue(values, ['qty', 'quantity']) ?? formData.quantity;
  const quantityUnit = readUnit(
    values,
    ['custom_qty_unit', 'qty_unit', 'quantity_unit'],
    formData.quantity_unit || 'kg',
  );
  const inputs = {};
  const userOverrides = {};

  const addInput = (key, value, unit, { override = false } = {}) => {
    const input = toInput(value, unit);
    if (!input) return false;
    inputs[key] = input;
    if (override) userOverrides[key] = input;
    return true;
  };

  const hasQuantity = addInput('qty', quantity, quantityUnit);
  const methodology = calculationMethodology || 'using_heat_basis_ncv';
  let hasMethodInputs = false;

  if (methodology === 'using_heat_basis_ncv') {
    const ef = readValue(values, ['custom_ef', 'ef_quantity', 'ef', 'emission_factor']);
    const efUnit = readUnit(values, ['custom_ef_unit', 'ef_quantity_unit', 'ef_unit'], 'tCO2/TJ');
    const cv = readValue(values, ['custom_cv', 'cv', 'ncv', 'calorific_value']);
    const cvUnit = readUnit(values, ['custom_cv_unit', 'cv_unit', 'ncv_unit', 'calorific_value_unit'], 'TJ/kg');
    const normalizedEf = normalizeEmissionFactor(ef, efUnit, { energyBased: true });
    const hasEf = normalizedEf && addInput('ef_co2', normalizedEf.value, normalizedEf.unit, { override: true });
    if (hasEf) {
      userOverrides.emission_factor = inputs.ef_co2;
    }
    addInput('ef_ch4', 0, 'kgCH4/TJ', { override: true });
    addInput('ef_n2o', 0, 'kgN2O/TJ', { override: true });
    const hasCv = addInput('cv', cv, cvUnit, { override: true });
    hasMethodInputs = hasEf && hasCv;
  } else if (methodology === 'using_qty_basis_ef') {
    const ef = readValue(values, ['custom_ef', 'ef_quantity', 'ef', 'emission_factor']);
    const efUnit = readUnit(values, ['custom_ef_unit', 'ef_quantity_unit', 'ef_unit'], 'kgCO2/kg');
    const normalizedEf = normalizeEmissionFactor(ef, efUnit);
    hasMethodInputs = normalizedEf && addInput('ef_quantity', normalizedEf.value, normalizedEf.unit, { override: true });
    if (hasMethodInputs) userOverrides.emission_factor = inputs.ef_quantity;
  } else if (methodology === 'using_carbon_composition') {
    const carbonContent = readValue(values, ['custom_carbon_content', 'carbon_content', 'composition_of_carbon']);
    const oxidationFactor = readValue(values, ['custom_oxidation_factor', 'oxidation_factor']);
    const hasCarbonContent = addInput('carbon_content', carbonContent, '%', { override: true });
    const hasOxidationFactor = addInput('oxidation_factor', oxidationFactor, '', { override: true });
    hasMethodInputs = hasCarbonContent && hasOxidationFactor;
  }

  const density = readValue(values, ['density']);
  if (hasValue(density)) {
    addInput('density', density, readUnit(values, ['density_unit'], 'kg/L'), { override: true });
  }

  return {
    inputs,
    userOverrides,
    isReady: hasQuantity && hasMethodInputs,
  };
};