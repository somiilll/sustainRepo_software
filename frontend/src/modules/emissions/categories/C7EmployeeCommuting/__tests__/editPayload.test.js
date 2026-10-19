import { buildEditPayload } from '../edit';

const buildContext = (editingEmission) => ({
  formData: {
    facility_id: 'facility-1',
    category: 'C7 - Employee Commuting',
    sub_category: '',
    reporting_period_start: '2026-04',
    reporting_period_end: '2026-04',
    process_names: [],
    responsible_person: 'Somil',
  },
  editingEmission,
  editEmployees: [{
    id: 'employee-1',
    name: 'S',
    monthly_data: {
      apr: {
        inputs: { km_travelled: 21, km_travelled_unit: 'km', qty_days_travelled: 21 },
        emissions: { co2e: 0.05844132 },
      },
    },
  }],
  scope3Method: 'activity_basis',
  scope3ActivityId: 'activity-1',
  scope3ActivityType: 'bike_travel',
  filteredScope3Activities: [{ id: 'activity-1', activity: 'Motorbike - Large Size' }],
  editEmployeeMonthlyTotals: { apr: { co2e: 0.05844132 } },
  editEmployeeYearlyTotal: null,
  validProcessNames: [],
  preserveOriginalVersion: true,
  categoryId: 'category-c7',
});

describe('C7 edit payload', () => {
  test('does not send flat display primitives as dynamic field values', () => {
    const payload = buildEditPayload({
      ...buildContext({ frequency_type: 'monthly', dynamic_field_values: {} }),
      dynamicFieldValues: {
        km_travelled: '',
        km_travelled_unit: 'km',
        qty_days_travelled: '',
        qty_days_travelled_unit: '',
      },
    });

    expect(payload.dynamic_field_values).toEqual({});
    expect(payload.employees[0].monthly_data.apr.inputs.km_travelled).toBe(21);
    expect(payload.outputs.co2e.value).toBe(0.05844132);
  });

  test('preserves only canonical legacy record-level dynamic values', () => {
    const payload = buildEditPayload(buildContext({
      frequency_type: 'monthly',
      dynamic_field_values: {
        legacy_distance: { value: 21, unit: 'km' },
        invalid_legacy_unit: 'km',
      },
    }));

    expect(payload.dynamic_field_values).toEqual({
      legacy_distance: { value: 21, unit: 'km' },
    });
  });

  test('writes canonical C7 identity and clears prior-category dynamic values on conversion', () => {
    const payload = buildEditPayload({
      ...buildContext({
        frequency_type: 'monthly',
        category_code: 'waste_generated_in_operations',
        dynamic_field_values: {
          qty: { value: 50, unit: 'kg' },
        },
      }),
      preserveOriginalVersion: false,
    });

    expect(payload.category).toBe('C7 - Employee Commuting');
    expect(payload.category_code).toBe('employee_commuting');
    expect(payload.category_id).toBe('category-c7');
    expect(payload.dynamic_field_values).toEqual({});
  });
});