/**
 * Phase 0 golden tests — unit-dimension / density-requirement helpers.
 *
 * These rules decide whether the form demands a density input, which directly
 * changes the calculation inputs. Locked before any refactor touches them.
 */
import {
  isQuantityField,
  getUnitDimension,
  getUnitDenominator,
  isDensityRequiredForQtyBasis,
  isDensityRequiredForHeatBasis,
  isDensityRequiredForCarbonComposition,
} from '../unitHelpers';

describe('isQuantityField', () => {
  it('recognises the canonical quantity variables', () => {
    expect(isQuantityField({ variable: 'qty' })).toBe(true);
    expect(isQuantityField({ variable: 'qty_energy' })).toBe(true);
    expect(isQuantityField({ fieldKey: 'quantity' })).toBe(true);
  });

  it('rejects anything else, including empty input', () => {
    expect(isQuantityField({ variable: 'spent_value' })).toBe(false);
    expect(isQuantityField({})).toBe(false);
    expect(isQuantityField()).toBe(false);
  });
});

describe('getUnitDimension', () => {
  it('classifies mass units', () => {
    ['kg', 'g', 't', 'KG'].forEach((u) => expect(getUnitDimension(u)).toBe('mass'));
  });

  it('classifies volume units', () => {
    ['l', 'ml', 'kl', 'm3', 'cm3', 'L'].forEach((u) =>
      expect(getUnitDimension(u)).toBe('volume'),
    );
  });

  it('returns null for unknown or empty units', () => {
    expect(getUnitDimension('kWh')).toBeNull();
    expect(getUnitDimension('')).toBeNull();
    expect(getUnitDimension(undefined)).toBeNull();
  });
});

describe('getUnitDenominator', () => {
  it('extracts the denominator of a compound unit', () => {
    expect(getUnitDenominator('kgCO2/L')).toBe('L');
    expect(getUnitDenominator('TJ/kg')).toBe('kg');
    expect(getUnitDenominator(' MJ / L ')).toBe('L');
  });

  it('returns null when there is no denominator', () => {
    expect(getUnitDenominator('kg')).toBeNull();
    expect(getUnitDenominator('')).toBeNull();
  });
});

describe('isDensityRequiredForQtyBasis', () => {
  it('requires density when EF denominator dimension differs from every allowed qty unit', () => {
    expect(isDensityRequiredForQtyBasis('kgCO2/L', ['kg', 'g', 't'])).toBe(true);
  });

  it('does not require density when any allowed qty unit shares the EF dimension', () => {
    expect(isDensityRequiredForQtyBasis('kgCO2/L', ['L', 'kg'])).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2/kg', ['kg'])).toBe(false);
  });

  it('returns false when inputs are missing or dimensionless', () => {
    expect(isDensityRequiredForQtyBasis('', ['kg'])).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2/L', [])).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2e/INR', ['kg'])).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2/L', ['kWh'])).toBe(false);
  });
});

describe('isDensityRequiredForHeatBasis', () => {
  it('requires density when CV denominator and qty dimensions differ', () => {
    expect(isDensityRequiredForHeatBasis('TJ/L', 'kg')).toBe(true);
    expect(isDensityRequiredForHeatBasis('MJ/kg', 'L')).toBe(true);
  });

  it('does not require density when dimensions agree', () => {
    expect(isDensityRequiredForHeatBasis('TJ/kg', 'kg')).toBe(false);
    expect(isDensityRequiredForHeatBasis('MJ/L', 'kL')).toBe(false);
  });

  it('returns false when either side cannot be classified', () => {
    expect(isDensityRequiredForHeatBasis('', 'kg')).toBe(false);
    expect(isDensityRequiredForHeatBasis('TJ/L', '')).toBe(false);
    expect(isDensityRequiredForHeatBasis('TJ', 'kg')).toBe(false);
    expect(isDensityRequiredForHeatBasis('TJ/L', 'kWh')).toBe(false);
  });
});

describe('isDensityRequiredForCarbonComposition', () => {
  it('requires density only for volume quantity units', () => {
    expect(isDensityRequiredForCarbonComposition('L')).toBe(true);
    expect(isDensityRequiredForCarbonComposition('kL')).toBe(true);
    expect(isDensityRequiredForCarbonComposition('kg')).toBe(false);
    expect(isDensityRequiredForCarbonComposition('kWh')).toBe(false);
    expect(isDensityRequiredForCarbonComposition('')).toBe(false);
  });
});
