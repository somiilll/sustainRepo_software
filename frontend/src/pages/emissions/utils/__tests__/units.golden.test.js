/**
 * Phase 0 golden tests — pure unit utilities.
 *
 * Locks the CURRENT behaviour of the already-extracted unit helpers so the
 * upcoming unitConversion.service extraction can be proven behaviour-neutral.
 * These assertions describe what the code does today, including its fallbacks.
 */
import {
  unitsMatch,
  isVolumeUnit,
  getConversionFactor,
  hasConversionDefined,
} from '../units';

const CENTRALIZED_UNITS = [
  { symbol: 'kg', name: 'Kilogram', aliases: ['kgs', 'Kg'], unit_type: 'mass' },
  { symbol: 'L', name: 'Litre', aliases: ['litres', 'ltr'], unit_type: 'volume' },
  { symbol: 'kL', name: 'Kilolitre', aliases: ['kilolitres'], unit_type: 'volume' },
  { symbol: 'kWh', name: 'Kilowatt Hour', aliases: [], unit_type: 'energy' },
];

describe('unitsMatch', () => {
  it('returns false when either unit is missing', () => {
    expect(unitsMatch('', 'kg', CENTRALIZED_UNITS)).toBe(false);
    expect(unitsMatch('kg', null, CENTRALIZED_UNITS)).toBe(false);
  });

  it('matches identical units case-insensitively and trims whitespace', () => {
    expect(unitsMatch('KG', ' kg ', CENTRALIZED_UNITS)).toBe(true);
  });

  it('matches through symbol / name / alias of the same centralized unit', () => {
    expect(unitsMatch('kg', 'Kilogram', CENTRALIZED_UNITS)).toBe(true);
    expect(unitsMatch('litres', 'L', CENTRALIZED_UNITS)).toBe(true);
    expect(unitsMatch('ltr', 'Litre', CENTRALIZED_UNITS)).toBe(true);
  });

  it('does not match units of different dimensions', () => {
    expect(unitsMatch('kg', 'L', CENTRALIZED_UNITS)).toBe(false);
  });

  it('does not treat kL and L as the same unit', () => {
    expect(unitsMatch('kL', 'L', CENTRALIZED_UNITS)).toBe(false);
  });
});

describe('isVolumeUnit', () => {
  it('returns false for empty input', () => {
    expect(isVolumeUnit('', CENTRALIZED_UNITS)).toBe(false);
  });

  it('detects volume via symbol, name and alias', () => {
    expect(isVolumeUnit('L', CENTRALIZED_UNITS)).toBe(true);
    expect(isVolumeUnit('Litre', CENTRALIZED_UNITS)).toBe(true);
    expect(isVolumeUnit('ltr', CENTRALIZED_UNITS)).toBe(true);
    expect(isVolumeUnit('kL', CENTRALIZED_UNITS)).toBe(true);
  });

  it('returns false for mass and energy units', () => {
    expect(isVolumeUnit('kg', CENTRALIZED_UNITS)).toBe(false);
    expect(isVolumeUnit('kWh', CENTRALIZED_UNITS)).toBe(false);
  });

  it('returns false for an unknown unit', () => {
    expect(isVolumeUnit('parsec', CENTRALIZED_UNITS)).toBe(false);
  });
});

const FORMULA_PARAMETERS = [
  {
    parameter_key: 'quantity_fuel',
    unit_conversions: [
      { from_unit: 'g', to_unit: 'kg', multiplier: 1000 },
      { from_unit: 't', to_unit: 'kg', multiplier: 0.001 },
    ],
  },
  {
    parameter_key: 'electricity_quantity',
    unit_conversions: [{ from_unit: 'MWh', to_unit: 'kWh', multiplier: 0.001 }],
  },
  { parameter_key: 'no_conversions', unit_conversions: [] },
];

describe('getConversionFactor', () => {
  it('returns 1 when no unit is selected', () => {
    expect(getConversionFactor('quantity_fuel', '', FORMULA_PARAMETERS)).toBe(1);
  });

  it('returns 1 when the parameter is unknown', () => {
    expect(getConversionFactor('does_not_exist', 'g', FORMULA_PARAMETERS)).toBe(1);
  });

  it('returns 1 when the parameter defines no conversions', () => {
    expect(getConversionFactor('no_conversions', 'g', FORMULA_PARAMETERS)).toBe(1);
  });

  it('inverts the configured multiplier (divide by multiplier)', () => {
    expect(getConversionFactor('quantity_fuel', 'g', FORMULA_PARAMETERS)).toBe(1 / 1000);
    expect(getConversionFactor('quantity_fuel', 't', FORMULA_PARAMETERS)).toBe(1 / 0.001);
  });

  it('matches units case-insensitively', () => {
    expect(getConversionFactor('quantity_fuel', 'G', FORMULA_PARAMETERS)).toBe(1 / 1000);
  });

  it('returns 1 for the base (to_unit) unit', () => {
    expect(getConversionFactor('quantity_fuel', 'kg', FORMULA_PARAMETERS)).toBe(1);
  });

  it('falls back to 1 for an unmapped unit (missing configuration)', () => {
    expect(getConversionFactor('quantity_fuel', 'lb', FORMULA_PARAMETERS)).toBe(1);
  });

  it('resolves the "_fuel" suffix variation of a parameter key', () => {
    expect(getConversionFactor('quantity', 'g', FORMULA_PARAMETERS)).toBe(1 / 1000);
  });

  it('resolves any electricity-flavoured key to electricity_quantity', () => {
    expect(getConversionFactor('electricity_consumed', 'MWh', FORMULA_PARAMETERS)).toBe(
      1 / 0.001,
    );
  });
});

describe('hasConversionDefined', () => {
  it('returns false when no unit is selected', () => {
    expect(hasConversionDefined('quantity_fuel', '', FORMULA_PARAMETERS)).toBe(false);
  });

  it('returns false when the parameter has no conversions', () => {
    expect(hasConversionDefined('no_conversions', 'g', FORMULA_PARAMETERS)).toBe(false);
  });

  it('returns true for a directly configured from_unit', () => {
    expect(hasConversionDefined('quantity_fuel', 'g', FORMULA_PARAMETERS)).toBe(true);
  });

  it('returns true for the base to_unit', () => {
    expect(hasConversionDefined('quantity_fuel', 'kg', FORMULA_PARAMETERS)).toBe(true);
  });

  it('returns false for an unmapped unit', () => {
    expect(hasConversionDefined('quantity_fuel', 'lb', FORMULA_PARAMETERS)).toBe(false);
  });
});
