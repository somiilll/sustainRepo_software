/* global describe, expect, it */

import {
  buildDecisionContext,
  buildDynamicFieldValues,
  extractInputsForCalcEngine,
} from '../Scope1Create';

const baseContext = {
  dynamicInputFields: [
    { variable: 'qty', fieldKey: 'qty', required: true, expectedUnit: 'L' },
  ],
  selectedFuel: null,
  centralizedUnits: [],
  defaultUnit: 'L',
};

describe('Scope 1 runtime density forwarding', () => {
  it('sends virtual Process Emissions density to the calc engine as a user override', () => {
    const result = extractInputsForCalcEngine({
      qty: '100',
      density: '0.71',
      density_unit: 'kg/L',
      override_density: true,
    }, baseContext);

    expect(result.inputs.qty).toEqual({ value: 100, unit: 'L' });
    expect(result.userOverrides.density).toEqual({ value: 0.71, unit: 'kg/L' });
  });

  it('persists virtual Process Emissions density for later Edit hydration', () => {
    const values = buildDynamicFieldValues({
      qty: '100',
      density: '1.25',
      density_unit: 'L/kg',
      override_density: true,
    }, baseContext);

    expect(values.density).toEqual({
      value: 1.25,
      unit: 'L/kg',
      is_override: true,
    });
  });

  it('persists Carbon Content density with its directional unit', () => {
    const values = buildDynamicFieldValues({
      qty: '100',
      composition_of_carbon: '85',
      density: '0.82',
      density_unit: 'kg/L',
      override_density: true,
    }, {
      ...baseContext,
      dynamicInputFields: [
        ...baseContext.dynamicInputFields,
        { variable: 'composition_of_carbon', fieldKey: 'composition_of_carbon', required: true, expectedUnit: '%' },
      ],
    });

    expect(values.density).toEqual({
      value: 0.82,
      unit: 'kg/L',
      is_override: true,
    });
  });

  it('keeps Custom Fuel density in its calculation override and saved field values', () => {
    const context = { ...baseContext, useCustomFuel: true };
    const data = {
      qty: '100',
      custom_qty_unit: 'L',
      custom_ef: '2.5',
      custom_ef_unit: 'kgCO2/kg',
      density: '0.82',
      density_unit: 'kg/L',
    };

    expect(extractInputsForCalcEngine(data, context).userOverrides.density).toEqual({
      value: 0.82,
      unit: 'kg/L',
    });
    expect(buildDynamicFieldValues(data, context).density).toEqual({
      value: 0.82,
      unit: 'kg/L',
    });
  });

  it('adds the volume basis to Custom Fuel Quantity Basis EF calculation requests', () => {
    const data = {
      qty: '100',
      custom_qty_unit: 'L',
      custom_ef: '2.68',
      custom_ef_unit: 'kgCO2/L',
    };
    const result = buildDecisionContext(data, {
      ...baseContext,
      centralizedUnits: [
        { symbol: 'kg', unit_type: 'mass' },
        { symbol: 'L', unit_type: 'volume' },
      ],
      scope: 'scope1',
      category: 'Stationary Combustion',
      categoryCode: 'stationary_combustion',
      facilityId: 'facility-1',
      reportingPeriod: '2026-01',
      fuelId: null,
      useCustomFuel: true,
      customFuelName: 'Volume fuel',
      buildDecisionInputs: () => ({ calculation_methodology: 'using_qty_basis_ef' }),
    });

    expect(result.decisionInputs).toEqual({
      calculation_methodology: 'using_qty_basis_ef',
      ef_quantity_basis: 'volume',
    });
  });
});