/* global describe, expect, it */

import {
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
});