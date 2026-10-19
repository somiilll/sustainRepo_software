import { selectClosestScope3Factors } from '../scope3FactorYear';

const factors = [
  { id: 'steam-2025', activity: 'Heat/Steam - Loss and Generation', year_applicable: 2025 },
  { id: 'steam-2026', activity: 'Heat/Steam - Loss and Generation', year_applicable: 2026 },
  { id: 'rail-2024', activity: 'Railways', year_applicable: 2024 },
  { id: 'rail-2028', activity: 'Railways', year_applicable: 2028 },
];

describe('selectClosestScope3Factors', () => {
  it('uses the exact reporting-year factor when available', () => {
    expect(selectClosestScope3Factors(factors, 2026).map((factor) => factor.id)).toEqual([
      'steam-2026',
      'rail-2028',
    ]);
  });

  it('uses the closest year and prefers the newer year on a tie', () => {
    expect(selectClosestScope3Factors(factors, 2027).map((factor) => factor.id)).toEqual([
      'steam-2026',
      'rail-2028',
    ]);
  });
});