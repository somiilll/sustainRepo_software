import { validateStep3 } from '../validation';

const dayField = {
  variable: 'working_days',
  fieldKey: 'working_days',
  label: 'Working Days',
  required: true,
  isOverride: false,
};

const baseParams = {
  isC7EmployeeCommuting: false,
  employees: [],
  scope3Method: 'activity_basis',
  dynamicInputFields: [dayField],
  frequencyType: 'yearly',
  monthlyData: {},
  filledMonthsCount: 0,
  centralizedUnits: [],
};

describe('Scope 3 annual day-count validation', () => {
  it('accepts 366 days in a leap calendar year', () => {
    expect(validateStep3({
      ...baseParams,
      reportingYear: '2024',
      reportingYearType: 'calendar',
      yearlyData: { working_days: '366' },
    })).toEqual({ valid: true });
  });

  it('rejects 366 days in a non-leap calendar year', () => {
    expect(validateStep3({
      ...baseParams,
      reportingYear: '2023',
      reportingYearType: 'calendar',
      yearlyData: { working_days: '366' },
    })).toEqual({
      valid: false,
      message: 'Working Days cannot exceed 365 days for the reporting period',
    });
  });

  it('accepts 366 days for FY 2023-24 because it includes February 29', () => {
    expect(validateStep3({
      ...baseParams,
      reportingYear: '2023',
      reportingYearType: 'financial',
      yearlyData: { working_days: '366' },
    })).toEqual({ valid: true });
  });

  it('rejects excessive C7 employee annual day values', () => {
    expect(validateStep3({
      ...baseParams,
      isC7EmployeeCommuting: true,
      employees: [{
        name: 'Employee One',
        yearly_data: {
          inputs: { working_days: '366' },
          emissions: { co2e: 1 },
        },
      }],
      reportingYear: '2023',
      reportingYearType: 'calendar',
      yearlyData: {},
    })).toEqual({
      valid: false,
      message: 'Working Days cannot exceed 365 days for the reporting period',
    });
  });
});