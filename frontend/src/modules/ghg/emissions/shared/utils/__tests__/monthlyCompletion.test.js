import { isMonthlyEntryComplete } from '../monthlyCompletion';

const fields = [
  { variable: 'quantity', fieldKey: 'quantity', required: true, isOverride: false },
  { variable: 'emission_factor', fieldKey: 'emissionFactor', required: true, isOverride: false },
  { variable: 'density', fieldKey: 'density', required: false, isOverride: true },
];

describe('isMonthlyEntryComplete', () => {
  it('does not complete a month with only one required value', () => {
    expect(isMonthlyEntryComplete({ quantity: '100' }, fields)).toBe(false);
  });

  it('does not mark a Process Emissions month complete when required runtime density is blank', () => {
    expect(isMonthlyEntryComplete({
      quantity: '100',
      emission_factor: '2',
      runtime_density_required: true,
      density_unit: 'kg/L',
    }, fields)).toBe(false);
  });

  it('completes a month only after every required value is present', () => {
    expect(isMonthlyEntryComplete({ quantity: '100', emission_factor: '0.42' }, fields)).toBe(true);
  });

  it('treats zero as an entered required value', () => {
    expect(isMonthlyEntryComplete({ quantity: 0, emission_factor: 0 }, fields)).toBe(true);
  });
});