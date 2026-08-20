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
      categoryCode: 'stationary_combustion',
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
    expect(payload.category_code).toBe('stationary_combustion');
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
      categoryCode: 'stationary_combustion',
    });

    expect(payload.calculation_methodology).toBe('using_carbon_composition');
    expect(payload.dynamic_field_values.calculation_methodology).toEqual({
      value: 'using_carbon_composition', unit: '',
    });
  });

  it('retains a virtual Process Emissions density when saving an edit', () => {
    const payload = buildEditPayload({
      formData: {
        facility_id: 'facility-1',
        reporting_period_start: '2025-02',
        reporting_period_end: '2025-02',
        scope: 'scope1',
        category: 'Process Emissions',
        sub_category: '',
        fuel_id: '',
        fuel_type: '',
        process_names: [],
      },
      editingEmission: { frequency_type: 'monthly', dynamic_field_values: {} },
      dynamicInputFields: [
        { variable: 'qty', fieldKey: 'qty', required: true, expectedUnit: 'kg', unitSource: 'static' },
        { variable: 'ef_quantity', fieldKey: 'ef_quantity', required: true, expectedUnit: 'kgCO2/L', unitSource: 'static' },
      ],
      dynamicFieldValues: {
        qty: '100',
        qty_unit: 'kg',
        ef_quantity: '0.7',
        ef_quantity_unit: 'kgCO2/L',
        density: '1.25',
        density_unit: 'L/kg',
        override_density: true,
      },
      selectedFuel: null,
      centralizedUnits: [],
      editUseCustomFuel: false,
      editCalcMethodology: 'using_qty_basis_ef',
      editProcessType: 'venting',
      categoryCode: 'process_emissions',
    });

    expect(payload.dynamic_field_values.density).toEqual({
      value: 1.25,
      unit: 'L/kg',
      is_override: true,
    });
    expect(payload.category_code).toBe('process_emissions');
    expect(payload.process_type).toBe('venting');
  });
});