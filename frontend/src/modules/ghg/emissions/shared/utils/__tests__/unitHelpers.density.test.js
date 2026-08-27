import {
  resolveDensityRequirement,
  getUnitDenominator,
  invertDensityUnit,
} from '../unitHelpers';

const units = [
  { symbol: 'kg', unit_type: 'mass' },
  { symbol: 'g', unit_type: 'mass' },
  { symbol: 't', unit_type: 'mass' },
  { symbol: 'L', unit_type: 'volume' },
  { symbol: 'm3', unit_type: 'volume' },
  { symbol: 'kL', unit_type: 'volume' },
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
});