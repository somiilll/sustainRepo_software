/* global describe, expect, it */
import { buildCreatePayload } from '../Scope1Create';
import { buildEditPayload } from '../Scope1Edit';

const requiredFields = [{
  variable: 'qty',
  fieldKey: 'qty',
  required: true,
  expectedUnit: 'L',
  unitSource: 'fuel',
}];

describe('Scope 1 calculation methodology persistence', () => {
  it('includes the selected methodology in standard-fuel create records', () => {
    const payload = buildCreatePayload({ qty: '12', qty_unit: 'L' }, {
      facilityId: 'facility-1',
      reportingPeriod: '2025-02',
      scope: 'scope1',
      category: 'Stationary Combustion',
      biogenicScopeSelection: '',
      fuelId: 'fuel-1',
      selectedFuel: { fuel_name: 'Diesel', allowed_units: ['L'] },
      useCustomFuel: false,
      dynamicInputFields: requiredFields,
      centralizedUnits: [],
      buildDecisionInputs: () => ({ calculation_methodology: 'using_qty_basis_ef' }),
      validProcesses: [],
    });

    expect(payload.calculation_methodology).toBe('using_qty_basis_ef');
    expect(payload.dynamic_field_values.calculation_methodology).toEqual({
      value: 'using_qty_basis_ef', unit: '',
    });
  });

  it('includes the selected methodology in standard-fuel edit records', () => {
    const payload = buildEditPayload({
      formData: {
        facility_id: 'facility-1',
        reporting_period_start: '2025-02',
        reporting_period_end: '2025-02',
        scope: 'scope1',
        category: 'Stationary Combustion',
        sub_category: 'Diesel',
        fuel_id: 'fuel-1',
        fuel_type: 'Diesel',
        process_names: [],
      },
      editingEmission: { frequency_type: 'monthly', dynamic_field_values: {} },
      dynamicInputFields: requiredFields,
      dynamicFieldValues: { qty: '12', qty_unit: 'L' },
      selectedFuel: { allowed_units: ['L'] },
      centralizedUnits: [],
      editUseCustomFuel: false,
      editCalcMethodology: 'using_carbon_composition',
    });

    expect(payload.calculation_methodology).toBe('using_carbon_composition');
    expect(payload.dynamic_field_values.calculation_methodology).toEqual({
      value: 'using_carbon_composition', unit: '',
    });
  });
});