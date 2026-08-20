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

const unitRegistry = [
  { symbol: 'kg', unit_type: 'mass' },
  { symbol: 'g', unit_type: 'mass' },
  { symbol: 't', unit_type: 'mass' },
  { symbol: 'L', unit_type: 'volume' },
  { symbol: 'ml', unit_type: 'volume' },
  { symbol: 'kL', unit_type: 'volume' },
  { symbol: 'm3', unit_type: 'volume' },
  { symbol: 'cm3', unit_type: 'volume' },
  { symbol: 'kWh', unit_type: 'energy' },
];

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
    ['kg', 'g', 't', 'KG'].forEach((u) => expect(getUnitDimension(u, unitRegistry)).toBe('mass'));
  });

  it('classifies volume units', () => {
    ['l', 'ml', 'kl', 'm3', 'cm3', 'L'].forEach((u) =>
      expect(getUnitDimension(u, unitRegistry)).toBe('volume'),
    );
  });

  it('returns null for unknown or empty units', () => {
    expect(getUnitDimension('unknown', unitRegistry)).toBeNull();
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
    expect(isDensityRequiredForQtyBasis('kgCO2/L', ['kg', 'g', 't'], unitRegistry)).toBe(true);
  });

  it('does not require density when any allowed qty unit shares the EF dimension', () => {
    expect(isDensityRequiredForQtyBasis('kgCO2/L', ['L', 'kg'], unitRegistry)).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2/kg', ['kg'], unitRegistry)).toBe(false);
  });

  it('returns false when inputs are missing or dimensionless', () => {
    expect(isDensityRequiredForQtyBasis('', ['kg'], unitRegistry)).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2/L', [], unitRegistry)).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2e/INR', ['kg'], unitRegistry)).toBe(false);
    expect(isDensityRequiredForQtyBasis('kgCO2/L', ['kWh'], unitRegistry)).toBe(false);
  });
});

describe('isDensityRequiredForHeatBasis', () => {
  it('requires density when CV denominator and qty dimensions differ', () => {
    expect(isDensityRequiredForHeatBasis('TJ/L', 'kg', unitRegistry)).toBe(true);
    expect(isDensityRequiredForHeatBasis('MJ/kg', 'L', unitRegistry)).toBe(true);
  });

  it('does not require density when dimensions agree', () => {
    expect(isDensityRequiredForHeatBasis('TJ/kg', 'kg', unitRegistry)).toBe(false);
    expect(isDensityRequiredForHeatBasis('MJ/L', 'kL', unitRegistry)).toBe(false);
  });

  it('returns false when either side cannot be classified', () => {
    expect(isDensityRequiredForHeatBasis('', 'kg', unitRegistry)).toBe(false);
    expect(isDensityRequiredForHeatBasis('TJ/L', '', unitRegistry)).toBe(false);
    expect(isDensityRequiredForHeatBasis('TJ', 'kg', unitRegistry)).toBe(false);
    expect(isDensityRequiredForHeatBasis('TJ/L', 'kWh', unitRegistry)).toBe(false);
  });
});

describe('isDensityRequiredForCarbonComposition', () => {
  it('requires density only for volume quantity units', () => {
    expect(isDensityRequiredForCarbonComposition('L', unitRegistry)).toBe(true);
    expect(isDensityRequiredForCarbonComposition('kL', unitRegistry)).toBe(true);
    expect(isDensityRequiredForCarbonComposition('kg', unitRegistry)).toBe(false);
    expect(isDensityRequiredForCarbonComposition('kWh', unitRegistry)).toBe(false);
    expect(isDensityRequiredForCarbonComposition('', unitRegistry)).toBe(false);
  });
});
