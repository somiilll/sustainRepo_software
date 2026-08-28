import {
  resolveDensityRequirement,
  getUnitDenominator,
  invertDensityUnit,
  normalizeReferenceForDensity,
  prepareDensityAwareCalculationInputs,
  resolveDensityFieldState,
} from '../unitHelpers';

const units = [
  { symbol: 'kg', unit_type: 'mass' },
  { symbol: 'g', unit_type: 'mass' },
  { symbol: 't', unit_type: 'mass' },
  { symbol: 'L', unit_type: 'volume' },
  { symbol: 'm3', unit_type: 'volume' },
  { symbol: 'kL', unit_type: 'volume' },
];

const fields = [
  { variable: 'qty', fieldKey: 'qty', label: 'Quantity Used', unitSource: 'fuel' },
  { variable: 'ef_quantity', fieldKey: 'ef_quantity', label: 'Emission Factor', defaultUnit: 'kgCO2/kg' },
  { variable: 'density', fieldKey: 'density', label: 'Density', isOverride: true, defaultUnit: 'kg/L' },
];

describe('density requirements from central unit metadata', () => {
  test('uses the CV denominator for Heat Basis direction', () => {
    expect(resolveDensityRequirement({
      quantityUnit: 'L', referenceUnit: getUnitDenominator('TJ/kg'), centralizedUnits: units,
    })).toEqual(expect.objectContaining({ required: true, densityUnit: 'kg/L', conversionDirection: 'volume_to_mass' }));
  });

  test('uses the EF denominator for Quantity Basis direction', () => {
    expect(resolveDensityRequirement({
      quantityUnit: 'kg', referenceUnit: getUnitDenominator('kgCO2/L'), centralizedUnits: units,
    })).toEqual(expect.objectContaining({ required: true, densityUnit: 'L/kg', conversionDirection: 'mass_to_volume' }));
    expect(resolveDensityRequirement({
      quantityUnit: 'L', referenceUnit: getUnitDenominator('kgCO2/kg'), centralizedUnits: units,
    })).toEqual(expect.objectContaining({ required: true, densityUnit: 'kg/L' }));
  });

  test('does not require density for centrally typed same-dimension conversions', () => {
    expect(resolveDensityRequirement({ quantityUnit: 'L', referenceUnit: 'L', centralizedUnits: units }).required).toBe(false);
    expect(resolveDensityRequirement({ quantityUnit: 't', referenceUnit: 'kg', centralizedUnits: units }).required).toBe(false);
  });

  test('keeps the conversion direction reversible', () => {
    expect(invertDensityUnit('kg/L')).toBe('L/kg');
    expect(invertDensityUnit('L/kg')).toBe('kg/L');
  });

  test('hides density for Carbon Composition when quantity is already mass', () => {
    expect(resolveDensityFieldState({
      calculationMethodology: 'using_carbon_composition',
      fields,
      data: { qty: 10, qty_unit: 'kg' },
      selectedFuel: { density: 0.84, density_unit: 'kg/L' },
      centralizedUnits: units,
    })).toEqual(expect.objectContaining({ visible: false, required: false }));
  });

  test('shows a fuel default as an optional override only after a mismatch', () => {
    expect(resolveDensityFieldState({
      calculationMethodology: 'using_qty_basis_ef',
      fields,
      data: { qty: 10, qty_unit: 'L', ef_quantity: 2, ef_quantity_unit: 'kgCO2/kg' },
      selectedFuel: { density: 0.84, density_unit: 'kg/L' },
      centralizedUnits: units,
    })).toEqual(expect.objectContaining({
      visible: true,
      required: false,
      hasFuelDefault: true,
      defaultDensity: { value: 0.84, unit: 'kg/L' },
    }));
  });

  test('requires density for a mismatch when the fuel has no usable default', () => {
    expect(resolveDensityFieldState({
      calculationMethodology: 'using_qty_basis_ef',
      fields,
      data: { qty: 10, qty_unit: 'kg', ef_quantity: 2, ef_quantity_unit: 'kgCO2/L' },
      selectedFuel: null,
      centralizedUnits: units,
    })).toEqual(expect.objectContaining({
      visible: true,
      required: true,
      densityUnit: 'L/kg',
    }));
  });

  test('normalizes a reverse quantity-basis factor using directional density', () => {
    const densityState = resolveDensityFieldState({
      calculationMethodology: 'using_qty_basis_ef',
      fields,
      data: { qty: 10, qty_unit: 'kg', ef_quantity: 2, ef_quantity_unit: 'kgCO2/L' },
      selectedFuel: { density: 0.5, density_unit: 'kg/L' },
      centralizedUnits: units,
    });
    expect(densityState.defaultDensity).toEqual({ value: 2, unit: 'L/kg' });
    expect(normalizeReferenceForDensity({
      referenceInput: { value: 2, unit: 'kgCO2/L' },
      densityState,
    }).referenceInput).toEqual({ value: 4, unit: 'kgCO2/kg' });

    expect(prepareDensityAwareCalculationInputs({
      inputs: {
        qty: { value: 10, unit: 'kg' },
        ef_quantity: { value: 2, unit: 'kgCO2/L' },
      },
      calculationMethodology: 'using_qty_basis_ef',
      fields,
      data: { qty: 10, qty_unit: 'kg', ef_quantity: 2, ef_quantity_unit: 'kgCO2/L' },
      selectedFuel: { density: 0.5, density_unit: 'kg/L' },
      centralizedUnits: units,
    })).toEqual(expect.objectContaining({
      inputs: expect.objectContaining({ ef_quantity: { value: 4, unit: 'kgCO2/kg' } }),
      decisionInputs: { ef_quantity_basis: 'mass' },
    }));
  });
});