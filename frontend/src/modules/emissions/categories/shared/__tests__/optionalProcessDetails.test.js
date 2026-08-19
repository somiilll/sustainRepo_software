/* global describe, expect, it */
import { validateCreateSubmission as validateScope1Create } from '../Scope1Create';
import { validateCreateSubmission as validateScope3Create } from '../Scope3FlatCreate';

describe('Create emission process details', () => {
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
});