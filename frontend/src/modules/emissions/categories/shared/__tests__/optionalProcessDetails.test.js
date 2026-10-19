/* global describe, expect, it */
import { validateCreateSubmission as validateScope1Create } from '../Scope1Create';
import { validateCreateSubmission as validateScope3Create } from '../Scope3FlatCreate';
import { validateEditSubmission as validateScope1Edit } from '../Scope1Edit';
import { validateEditSubmission as validateScope3Edit } from '../Scope3FlatEdit';
import { validateEditSubmission as validateC7Edit } from '../../C7EmployeeCommuting/edit';

describe('Emission process details', () => {
  it('does not require process names or descriptions for Scope 1/2 creation', () => {
    expect(validateScope1Create({
      formData: {},
      fuelId: 'fuel-1',
      useCustomFuel: false,
      processNames: [{ name: '', description: '' }],
      scope: 'scope1',
      buildDecisionInputs: () => ({}),
    })).toEqual({ valid: true, validProcessNames: [] });
  });

  it('does not require a description when a Scope 3 process name is supplied', () => {
    expect(validateScope3Create({
      module: { hasCapability: () => false },
      formData: {},
      processNames: [{ name: 'Boiler', description: '' }],
    })).toEqual({
      valid: true,
      validProcessNames: [{ name: 'Boiler', description: '' }],
    });
  });

  it('does not require process details for Scope 1 edits', () => {
    expect(validateScope1Edit({
      formData: { scope: 'scope1', fuel_id: 'fuel-1', process_names: [{ name: '', description: '' }] },
      dynamicInputFields: [],
      dynamicFieldValues: {},
      effectiveCalculatedEmissions: { co2eEmissions: 1 },
      isOverrideCV: false,
      isOverrideDensity: false,
      overrideCalorificValue: false,
      overrideDensity: false,
      overrideEmissionFactorHeat: false,
      overrideJustification: '',
      editUseCustomFuel: false,
      editCustomFuelName: '',
      capabilities: {},
    })).toEqual({ valid: true, validProcessNames: [] });
  });

  it('does not require process details for flat Scope 3 edits', () => {
    expect(validateScope3Edit({
      module: { hasCapability: () => false },
      scope3Method: 'activity_basis',
      scope3ActivityId: 'activity-1',
      scope3CustomActivity: '',
      useCustomActivity: false,
      dynamicInputFields: [],
      dynamicFieldValues: {},
      processNames: [{ name: '', description: '' }],
      effectiveCalculatedEmissions: { co2eEmissions: 1 },
      formData: {},
    })).toEqual({ valid: true, validProcessNames: [] });
  });

  it('does not require process details for C7 edits', () => {
    expect(validateC7Edit({
      editingEmission: { frequency_type: 'monthly' },
      processNames: [{ name: '', description: '' }],
      editEmployees: [{
        name: 'Aman',
        monthly_data: { jan: { inputs: { km_travelled: 10 }, emissions: { co2e: 1 } } },
      }],
    })).toEqual({ valid: true, validProcessNames: [] });
  });
});