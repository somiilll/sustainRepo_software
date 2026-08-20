/**
 * Phase 0 golden tests — custom-fuel calculation adapter.
 *
 * This adapter is live in four places (create submit, edit submit, edit audit
 * persistence, Scope 1 create module) and performs real unit maths
 * (tCO2 -> kgCO2, MJ -> TJ). Locking it protects custom-fuel numbers.
 */
import { buildCustomFuelCalculationPayload } from '../customFuelCalcAdapter';

describe('buildCustomFuelCalculationPayload — heat basis (NCV)', () => {
  it('normalises tCO2/TJ to kgCO2/TJ and marks EF/CV as overrides', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: {
        qty: 500,
        custom_qty_unit: 'kg',
        custom_ef: 74.1,
        custom_ef_unit: 'tCO2/TJ',
        custom_cv: 0.000043,
        custom_cv_unit: 'TJ/kg',
      },
    });

    expect(result.isReady).toBe(true);
    expect(result.inputs.qty).toEqual({ value: 500, unit: 'kg' });
    expect(result.inputs.ef_co2).toEqual({ value: 74100, unit: 'kgCO2/TJ' });
    expect(result.inputs.cv).toEqual({ value: 0.000043, unit: 'TJ/kg' });
    expect(result.inputs.ef_ch4).toEqual({ value: 0, unit: 'kgCH4/TJ' });
    expect(result.inputs.ef_n2o).toEqual({ value: 0, unit: 'kgN2O/TJ' });
    expect(result.userOverrides.emission_factor).toEqual(result.inputs.ef_co2);
    expect(result.userOverrides.cv).toEqual(result.inputs.cv);
  });

  it('converts an MJ-denominated emission factor to TJ', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: {
        qty: 10,
        custom_ef: 2,
        custom_ef_unit: 'kgCO2/MJ',
        custom_cv: 1,
        custom_cv_unit: 'TJ/kg',
      },
    });
    expect(result.inputs.ef_co2).toEqual({ value: 2000, unit: 'kgCO2/TJ' });
  });

  it('strips whitespace from unit strings', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: {
        qty: 10,
        custom_ef: 1,
        custom_ef_unit: 'kg CO2 / TJ',
        custom_cv: 1,
        custom_cv_unit: 'TJ/kg',
      },
    });
    expect(result.inputs.ef_co2.unit).toBe('kgCO2/TJ');
  });

  it('is not ready when the calorific value is missing', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: { qty: 10, custom_ef: 1, custom_ef_unit: 'kgCO2/TJ' },
    });
    expect(result.isReady).toBe(false);
  });

  it('defaults the quantity unit to kg and falls back to formData', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: { custom_ef: 1, custom_ef_unit: 'kgCO2/TJ', custom_cv: 1 },
      formData: { quantity: 42 },
    });
    expect(result.inputs.qty).toEqual({ value: 42, unit: 'kg' });
    expect(result.inputs.cv.unit).toBe('TJ/kg');
  });
});

describe('buildCustomFuelCalculationPayload — quantity basis EF', () => {
  it('normalises tCO2/kg to kgCO2/kg', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: { qty: 100, custom_ef: 0.0741, custom_ef_unit: 'tCO2/kg' },
      calculationMethodology: 'using_qty_basis_ef',
    });
    expect(result.isReady).toBe(true);
    expect(result.inputs.ef_quantity).toEqual({ value: 74.1, unit: 'kgCO2/kg' });
    expect(result.userOverrides.emission_factor).toEqual(result.inputs.ef_quantity);
    expect(result.inputs.cv).toBeUndefined();
  });

  it('does not apply the MJ->TJ conversion outside heat basis', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: { qty: 1, custom_ef: 2, custom_ef_unit: 'kgCO2/MJ' },
      calculationMethodology: 'using_qty_basis_ef',
    });
    expect(result.inputs.ef_quantity).toEqual({ value: 2, unit: 'kgCO2/MJ' });
  });

  it('derives volume routing from a volume-based EF denominator', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: { qty: 100, custom_ef: 2.68, custom_ef_unit: 'kgCO2/L' },
      calculationMethodology: 'using_qty_basis_ef',
      centralizedUnits: [
        { symbol: 'kg', unit_type: 'mass' },
        { symbol: 'L', unit_type: 'volume' },
      ],
    });

    expect(result.inputs.ef_quantity).toEqual({ value: 2.68, unit: 'kgCO2/L' });
    expect(result.decisionInputs).toEqual({ ef_quantity_basis: 'volume' });
  });
});

describe('buildCustomFuelCalculationPayload — carbon composition', () => {
  it('sends carbon content as % and oxidation factor as dimensionless', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: {
        qty: 100,
        custom_carbon_content: 85,
        custom_oxidation_factor: 1,
      },
      calculationMethodology: 'using_carbon_composition',
    });
    expect(result.isReady).toBe(true);
    expect(result.inputs.carbon_content).toEqual({ value: 85, unit: '%' });
    expect(result.inputs.oxidation_factor).toEqual({ value: 1, unit: '' });
    expect(result.userOverrides.carbon_content).toEqual(result.inputs.carbon_content);
  });

  it('is not ready when the oxidation factor is missing', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: { qty: 100, custom_carbon_content: 85 },
      calculationMethodology: 'using_carbon_composition',
    });
    expect(result.isReady).toBe(false);
  });
});

describe('buildCustomFuelCalculationPayload — density', () => {
  it('adds density as an override with kg/L default when supplied', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: {
        qty: 100,
        custom_ef: 1,
        custom_ef_unit: 'kgCO2/kg',
        density: 0.85,
      },
      calculationMethodology: 'using_qty_basis_ef',
    });
    expect(result.inputs.density).toEqual({ value: 0.85, unit: 'kg/L' });
    expect(result.userOverrides.density).toEqual(result.inputs.density);
  });

  it('omits density entirely when not supplied', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: { qty: 100, custom_ef: 1, custom_ef_unit: 'kgCO2/kg' },
      calculationMethodology: 'using_qty_basis_ef',
    });
    expect(result.inputs.density).toBeUndefined();
    expect(result.userOverrides.density).toBeUndefined();
  });
});

describe('buildCustomFuelCalculationPayload — legacy key aliases', () => {
  it('accepts canonical keys as well as custom_* keys', () => {
    const result = buildCustomFuelCalculationPayload({
      dynamicFieldValues: {
        quantity: 250,
        quantity_unit: 'L',
        emission_factor: 1,
        ef_unit: 'kgCO2/TJ',
        calorific_value: 0.00004,
        calorific_value_unit: 'TJ/kg',
      },
    });
    expect(result.inputs.qty).toEqual({ value: 250, unit: 'L' });
    expect(result.inputs.ef_co2).toEqual({ value: 1, unit: 'kgCO2/TJ' });
    expect(result.inputs.cv).toEqual({ value: 0.00004, unit: 'TJ/kg' });
    expect(result.isReady).toBe(true);
  });

  it('still injects the zero CH4/N2O heat-basis factors for empty input, and is not ready', () => {
    expect(buildCustomFuelCalculationPayload({})).toEqual({
      inputs: {
        ef_ch4: { value: 0, unit: 'kgCH4/TJ' },
        ef_n2o: { value: 0, unit: 'kgN2O/TJ' },
      },
      userOverrides: {
        ef_ch4: { value: 0, unit: 'kgCH4/TJ' },
        ef_n2o: { value: 0, unit: 'kgN2O/TJ' },
      },
      decisionInputs: {},
      isReady: false,
    });
  });
});
