import { isFutureSupplierAssessmentPeriod } from '../modules/supplier-assessment/utils/supplierAssessmentPeriods';

describe('Supplier Assessment reporting periods', () => {
  it('hides a future financial year while retaining the current and historical years', () => {
    expect(isFutureSupplierAssessmentPeriod('FY 2027-2028', 'FY 2026-2027', 'financial_year')).toBe(true);
    expect(isFutureSupplierAssessmentPeriod('FY 2026-2027', 'FY 2026-2027', 'financial_year')).toBe(false);
    expect(isFutureSupplierAssessmentPeriod('FY 2025-2026', 'FY 2026-2027', 'financial_year')).toBe(false);
  });
});