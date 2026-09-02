/* global describe, expect, it */

import {
  resolveMonthlySelectableUnit,
} from '../../../utils/monthlyFieldUnits';
import {
  getProcessTemplateFieldUnit,
  normalizeProcessTemplateMonthlyField,
} from '../../../utils/processTemplateMonthlyFields';

describe('Process Emissions monthly field normalization', () => {
  it('uses the active fuel unit shown after switching from yearly to monthly', () => {
    expect(resolveMonthlySelectableUnit({
      configuredUnit: 'kg',
      allowedUnits: ['L'],
    })).toBe('L');
  });

  it('preserves an allowed unit already stored in the monthly row', () => {
    expect(resolveMonthlySelectableUnit({
      storedUnit: 'kL',
      configuredUnit: 'kg',
      allowedUnits: ['L', 'kL'],
    })).toBe('kL');
  });

  it('prefers the active configured unit over a stale allowed monthly unit', () => {
    expect(resolveMonthlySelectableUnit({
      storedUnit: 'kg',
      configuredUnit: 'L',
      allowedUnits: ['kg', 'L'],
    })).toBe('L');
  });

  it('gives the rendered Quantity field one canonical state identity', () => {
    expect(normalizeProcessTemplateMonthlyField({
      key: 'quantity_used_process_emissions',
      label: 'Quantity Used',
      unit: 'kg',
    })).toEqual(expect.objectContaining({
      source: 'process_template',
      role: 'quantity',
      valueKey: 'quantity_used_process_emissions',
      unitKey: 'quantity_used_process_emissions_unit',
      variable: 'quantity_used_process_emissions',
      fieldKey: 'quantity_used_process_emissions',
      defaultUnit: 'kg',
      allowedUnits: ['kg', 'g', 't', 'L', 'kL', 'ml', 'm3', 'cm3'],
    }));
  });

  it('retains CV metadata rather than applying quantity unit options', () => {
    expect(normalizeProcessTemplateMonthlyField({
      key: 'cv_input',
      label: 'CV',
      unit: 'TJ/kg',
    })).toEqual(expect.objectContaining({
      role: 'cv',
      valueKey: 'cv_input',
      unitKey: 'cv_input_unit',
      defaultUnit: 'TJ/kg',
      allowedUnits: ['TJ/kg'],
    }));
  });

  it('preserves configured EF unit options for Quantity Basis', () => {
    expect(normalizeProcessTemplateMonthlyField({
      key: 'ef_input',
      label: 'Emission Factor',
      unit: 'kgCO2/kg',
      allowed_units: ['kgCO2/kg', 'kgCO2/L'],
    })).toEqual(expect.objectContaining({
      role: 'ef',
      unitKey: 'ef_input_unit',
      allowedUnits: ['kgCO2/kg', 'kgCO2/L'],
    }));
  });

  it('uses the unit selected in the Process Emissions monthly row for saving', () => {
    expect(getProcessTemplateFieldUnit(
      { quantity_used_process_emissions_unit: 'kg' },
      { key: 'quantity_used_process_emissions', unit: 'L' },
    )).toBe('kg');
  });
});