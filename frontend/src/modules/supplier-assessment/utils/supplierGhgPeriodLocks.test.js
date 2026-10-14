import { isEmissionInSubmittedSupplierPeriod, resolveSubmittedSupplierEmissionIds } from './supplierGhgPeriodLocks';

describe('supplier GHG period locks', () => {
  const periods = [
    { period_key: '2026-04', reporting_year: 'FY 2026-2027', month_keys: ['2026-04'], status: 'submitted' },
    { period_key: 'FY 2026-2027-Q1', reporting_year: 'FY 2026-2027', month_keys: ['2026-04', '2026-05', '2026-06'], status: 'submitted' },
    { period_key: 'FY 2026-2027-Q2', reporting_year: 'FY 2026-2027', month_keys: ['2026-07', '2026-08', '2026-09'], status: 'in_progress' },
    { period_key: 'FY 2025-2026', reporting_year: 'FY 2025-2026', month_keys: ['2025-04'], frequency: 'yearly', status: 'submitted' },
  ];

  it('locks monthly and quarterly emission rows only when their period is submitted', () => {
    expect(isEmissionInSubmittedSupplierPeriod({ reporting_period: '2026-04' }, periods)).toBe(true);
    expect(isEmissionInSubmittedSupplierPeriod({ reporting_period: '2026-05' }, periods)).toBe(true);
    expect(isEmissionInSubmittedSupplierPeriod({ reporting_period: '2026-07' }, periods)).toBe(false);
  });

  it('locks yearly records using the reporting year', () => {
    expect(isEmissionInSubmittedSupplierPeriod({ reporting_period: 'FY 2025-2026' }, periods)).toBe(true);
  });

  it('returns IDs only for records in submitted periods', () => {
    expect(resolveSubmittedSupplierEmissionIds([
      { id: 'locked', reporting_period: '2026-05' },
      { id: 'editable', reporting_period: '2026-07' },
    ], periods)).toEqual(new Set(['locked']));
  });
});