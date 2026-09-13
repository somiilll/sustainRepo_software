import { validateEditSubmission } from '../Scope3FlatEdit';

// Scope 3 C6 monthly edit validation for canonical dynamic values
const buildBaseContext = ({ reportingPeriod, dynamicFieldValues, dynamicInputFields, frequencyType = 'monthly' }) => ({
  module: null,
  scope3Method: 'activity_basis',
  scope3ActivityId: 'activity-1',
  spendCurrencyConversionMethod: 'ppp_inflation',
  allocationMethod: '',
  scope3CustomActivity: '',
  useCustomActivity: false,
  dynamicInputFields,
  dynamicFieldValues,
  processNames: [],
  effectiveCalculatedEmissions: {
    co2eEmissions: 1,
    co2Emissions: 1,
    ch4Emissions: 0,
    n2oEmissions: 0,
  },
  formData: {
    scope: 'scope3',
    category: 'Business Travel',
    reporting_period: reportingPeriod,
  },
  frequencyType,
  categoryCode: 'c6',
});

describe('validateEditSubmission - C6 monthly canonical object day limits', () => {
  test('rejects canonical object qty_days_travelled above month max (regression for NaN bypass)', () => {
    const result = validateEditSubmission(buildBaseContext({
      reportingPeriod: '2025-04',
      dynamicInputFields: [{ variable: 'qty_days_travelled', label: 'Days Travelled' }],
      dynamicFieldValues: {
        qty_days_travelled: { value: 30092, unit: '' },
      },
    }));

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain('cannot exceed 30 days');
  });

  test('rejects canonical object nights_stayed above month max', () => {
    const result = validateEditSubmission(buildBaseContext({
      reportingPeriod: '2025-04',
      dynamicInputFields: [{ variable: 'nights_stayed', label: 'Nights Stayed' }],
      dynamicFieldValues: {
        nights_stayed: { value: 30092, unit: '' },
      },
    }));

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain('cannot exceed 30 days');
  });

  test('rejects canonical object qty_nights alias above month max', () => {
    const result = validateEditSubmission(buildBaseContext({
      reportingPeriod: '2025-04',
      dynamicInputFields: [{ variable: 'qty_nights', label: 'Nights Stayed' }],
      dynamicFieldValues: {
        qty_nights: { value: 31, unit: '' },
      },
    }));

    expect(result.valid).toBe(false);
    expect(result.errorMessage).toContain('cannot exceed 30 days');
  });

  test('April 2025 boundary: 30 accepted and 31 rejected for qty_days_travelled', () => {
    const accepted = validateEditSubmission(buildBaseContext({
      reportingPeriod: '2025-04',
      dynamicInputFields: [{ variable: 'qty_days_travelled', label: 'Days Travelled' }],
      dynamicFieldValues: { qty_days_travelled: { value: 30, unit: '' } },
    }));

    const rejected = validateEditSubmission(buildBaseContext({
      reportingPeriod: '2025-04',
      dynamicInputFields: [{ variable: 'qty_days_travelled', label: 'Days Travelled' }],
      dynamicFieldValues: { qty_days_travelled: { value: 31, unit: '' } },
    }));

    expect(accepted.valid).toBe(true);
    expect(rejected.valid).toBe(false);
    expect(rejected.errorMessage).toContain('cannot exceed 30 days');
  });

  test('April 2025 boundary: 30 accepted and 31 rejected for nights_stayed', () => {
    const accepted = validateEditSubmission(buildBaseContext({
      reportingPeriod: '2025-04',
      dynamicInputFields: [{ variable: 'nights_stayed', label: 'Nights Stayed' }],
      dynamicFieldValues: { nights_stayed: { value: 30, unit: '' } },
    }));

    const rejected = validateEditSubmission(buildBaseContext({
      reportingPeriod: '2025-04',
      dynamicInputFields: [{ variable: 'nights_stayed', label: 'Nights Stayed' }],
      dynamicFieldValues: { nights_stayed: { value: 31, unit: '' } },
    }));

    expect(accepted.valid).toBe(true);
    expect(rejected.valid).toBe(false);
    expect(rejected.errorMessage).toContain('cannot exceed 30 days');
  });

  test.each([
    ['2024-02', 'qty_days_travelled', 'Days Travelled', 29, 30, 29],
    ['2024-02', 'nights_stayed', 'Nights Stayed', 29, 30, 29],
    ['2025-02', 'qty_days_travelled', 'Days Travelled', 28, 29, 28],
    ['2025-02', 'nights_stayed', 'Nights Stayed', 28, 29, 28],
  ])(
    'February month limits: %s %s accepts %i and rejects %i',
    (reportingPeriod, variable, label, acceptedValue, rejectedValue, maxDays) => {
      const accepted = validateEditSubmission(buildBaseContext({
        reportingPeriod,
        dynamicInputFields: [{ variable, label }],
        dynamicFieldValues: { [variable]: { value: acceptedValue, unit: '' } },
      }));

      const rejected = validateEditSubmission(buildBaseContext({
        reportingPeriod,
        dynamicInputFields: [{ variable, label }],
        dynamicFieldValues: { [variable]: { value: rejectedValue, unit: '' } },
      }));

      expect(accepted.valid).toBe(true);
      expect(rejected.valid).toBe(false);
      expect(rejected.errorMessage).toContain(`cannot exceed ${maxDays} days`);
    },
  );
});

describe('validateEditSubmission - C6 yearly canonical object day limits', () => {
  test.each([
    ['CY2024', 'qty_days_travelled', 366, 367, 366],
    ['CY2025', 'nights_stayed', 365, 366, 365],
    ['FY 2023-2024', 'qty_nights', 366, 367, 366],
    ['FY 2024-2025', 'number_of_nights', 365, 366, 365],
  ])(
    '%s %s accepts its boundary and rejects the next day',
    (reportingPeriod, variable, acceptedValue, rejectedValue, maximum) => {
      const accepted = validateEditSubmission(buildBaseContext({
        reportingPeriod,
        frequencyType: 'yearly',
        dynamicInputFields: [{ variable, label: 'Travel days' }],
        dynamicFieldValues: { [variable]: { value: acceptedValue, unit: '' } },
      }));
      const rejected = validateEditSubmission(buildBaseContext({
        reportingPeriod,
        frequencyType: 'yearly',
        dynamicInputFields: [{ variable, label: 'Travel days' }],
        dynamicFieldValues: { [variable]: { value: rejectedValue, unit: '' } },
      }));

      expect(accepted.valid).toBe(true);
      expect(rejected.valid).toBe(false);
      expect(rejected.errorMessage).toContain(`cannot exceed ${maximum} days for this reporting year`);
    },
  );
});
