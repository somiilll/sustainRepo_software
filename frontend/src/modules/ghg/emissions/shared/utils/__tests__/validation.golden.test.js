/**
 * Phase 0 golden tests — step validation messages.
 *
 * Phase 6 will replace this imperative validation with a declarative rule
 * engine. The user-visible messages must not change, so every message string
 * and every gate is locked here first.
 */
import {
  validateStep1,
  validateStep2,
  validateStep3,
  canProceedToStep,
} from '../validation';

const step1 = (overrides = {}) =>
  validateStep1({
    facilityId: 'fac-1',
    scope: 'scope1',
    category: 'Stationary Combustion',
    fuelId: 'fuel-1',
    processNames: [],
    ...overrides,
  });

describe('validateStep1 — selection gate', () => {
  it('accepts a complete Scope 1 selection', () => {
    expect(step1()).toEqual({ valid: true });
  });

  it('enforces facility, scope and category in that order', () => {
    expect(step1({ facilityId: '' })).toEqual({
      valid: false,
      message: 'Please select a facility',
    });
    expect(step1({ scope: '' })).toEqual({
      valid: false,
      message: 'Please select a scope',
    });
    expect(step1({ category: '' })).toEqual({
      valid: false,
      message: 'Please select a category',
    });
  });

  it('requires a Scope 3 calculation method and activity', () => {
    expect(step1({ scope: 'scope3', category: 'C1 - Purchased Goods and Services' })).toEqual(
      { valid: false, message: 'Please select a calculation method' },
    );
    expect(
      step1({
        scope: 'scope3',
        category: 'C1 - Purchased Goods and Services',
        scope3Method: 'activity_basis',
      }),
    ).toEqual({ valid: false, message: 'Please select an activity type' });
    expect(
      step1({
        scope: 'scope3',
        category: 'C1 - Purchased Goods and Services',
        scope3Method: 'activity_basis',
        scope3ActivityId: 'ef-1',
      }),
    ).toEqual({ valid: true });
  });

  it('requires a custom activity name for supplier_basis with custom activity', () => {
    expect(
      step1({
        scope: 'scope3',
        category: 'C1',
        scope3Method: 'supplier_basis',
        useCustomActivity: true,
        scope3CustomActivity: '   ',
      }),
    ).toEqual({ valid: false, message: 'Please enter an activity name' });
  });

  it('requires a biogenic sub-scope selection', () => {
    expect(step1({ scope: 'biogenic', biogenicScopeSelection: '' })).toEqual({
      valid: false,
      message: 'Please select a biogenic emission type (Scope 1 or Scope 3)',
    });
  });

  it('uses the dedicated biogenic Scope 3 activity message', () => {
    expect(
      step1({
        scope: 'biogenic',
        biogenicScopeSelection: 'scope3',
        scope3Method: 'activity_basis',
      }),
    ).toEqual({ valid: false, message: 'Please select a biogenic activity' });
  });

  it('skips the fuel requirement when the resolved capability disables it', () => {
    expect(step1({
      category: 'Process Emissions',
      fuelId: '',
      capabilities: { requiresFuel: false },
    })).toEqual({ valid: true });
  });

  it('requires a fuel, or a custom fuel name when custom fuel is on', () => {
    expect(step1({ fuelId: '' })).toEqual({
      valid: false,
      message: 'Please select a fuel type',
    });
    expect(step1({ fuelId: '', useCustomFuel: true, customFuelName: '' })).toEqual({
      valid: false,
      message: 'Please enter custom fuel name',
    });
    expect(step1({ fuelId: '', useCustomFuel: true, customFuelName: 'Blend A' })).toEqual({
      valid: true,
    });
  });
});

const step2 = (overrides = {}) =>
  validateStep2({
    isProcessEmissions: false,
    processNames: [{ name: 'Boiler', description: 'Steam generation' }],
    responsiblePerson: 'Asha',
    requiresAssetName: false,
    assetName: '',
    ...overrides,
  });

describe('validateStep2 — optional process metadata gate', () => {
  it('accepts a complete step 2', () => {
    expect(step2()).toEqual({ valid: true });
  });

  it('accepts blank process and responsible-person metadata for process emissions', () => {
    expect(step2({ isProcessEmissions: true, processNames: [], responsiblePerson: ' ' })).toEqual({ valid: true });
  });

  it('accepts blank process and responsible-person metadata for regular emissions', () => {
    expect(step2({ processNames: [], responsiblePerson: '' })).toEqual({ valid: true });
  });

  it('accepts omitted names, descriptions, and responsible-person metadata', () => {
    expect(step2({ processNames: [{ name: 'Kiln', description: '' }], responsiblePerson: '' })).toEqual({ valid: true });
  });

  it('requires an asset name for asset-capable categories', () => {
    expect(step2({ requiresAssetName: true, assetName: ' ' })).toEqual({
      valid: false,
      message: 'Please enter asset name',
    });
    expect(step2({ requiresAssetName: true, assetName: 'Warehouse 2' })).toEqual({
      valid: true,
    });
  });
});

const QTY_FIELD = { variable: 'qty', label: 'Quantity Used', required: true, isOverride: false };
const CV_OVERRIDE = { variable: 'cv', label: 'Calorific Value', required: false, isOverride: true };

const step3 = (overrides = {}) =>
  validateStep3({
    isC7EmployeeCommuting: false,
    employees: [],
    scope3Method: '',
    dynamicInputFields: [QTY_FIELD],
    frequencyType: 'monthly',
    yearlyData: {},
    monthlyData: { '04': { qty: '100' } },
    filledMonthsCount: 1,
    isProcessEmissions: false,
    ...overrides,
  });

describe('validateStep3 — data gate (monthly)', () => {
  it('accepts a filled month', () => {
    expect(step3()).toEqual({ valid: true });
  });

  it('requires at least one filled month', () => {
    expect(step3({ filledMonthsCount: 0 })).toEqual({
      valid: false,
      message: 'Please enter data for at least one month',
    });
  });

  it('names the missing required field and the month', () => {
    const result = step3({
      dynamicInputFields: [QTY_FIELD, { variable: 'ef_quantity', label: 'Emission Factor', required: true }],
      monthlyData: { '04': { qty: '100' } },
    });
    expect(result).toEqual({
      valid: false,
      message: 'Please fill in "Emission Factor" for April',
    });
  });

  it('requires a value when an override checkbox is ticked', () => {
    expect(
      step3({
        dynamicInputFields: [QTY_FIELD, CV_OVERRIDE],
        monthlyData: { '04': { qty: '100', override_cv: true } },
      }),
    ).toEqual({
      valid: false,
      message:
        'Please enter a value for "Calorific Value" in April or uncheck the Override Default checkbox',
    });
  });

  it('auto-unselects a cleared calorific-value override and explains why', () => {
    const updateMonthData = jest.fn();
    const result = step3({
      monthlyData: { '04': { qty: '100', overrideCalorificValue: true, calorificValue: '' } },
      updateMonthData,
    });
    expect(updateMonthData).toHaveBeenCalledWith('04', 'overrideCalorificValue', false);
    expect(result).toEqual({
      valid: false,
      message:
        'Calorific Value override in April was unselected because no value was entered. Please review and try again.',
    });
  });

  it('requires justification for a filled density override', () => {
    expect(
      step3({
        monthlyData: {
          '04': { qty: '100', quantity: '100', overrideDensity: true, density: '0.85' },
        },
      }),
    ).toEqual({
      valid: false,
      message: 'Please enter justification for density override in April',
    });
  });

  it('requires units for supplier_basis quantity and emission factor', () => {
    const fields = [
      { variable: 'activity_value_supplier_based', label: 'Quantity Used', required: true },
      { variable: 'emission_factor_supplier_based', label: 'Emission Factor', required: true },
    ];
    expect(
      step3({
        scope3Method: 'supplier_basis',
        dynamicInputFields: fields,
        monthlyData: {
          '04': {
            activity_value_supplier_based: '10',
            emission_factor_supplier_based: '2',
          },
        },
      }),
    ).toEqual({
      valid: false,
      message: 'Please enter unit for "Quantity Used" in April',
    });
  });
});

describe('validateStep3 — data gate (yearly)', () => {
  it('requires annual data', () => {
    expect(step3({ frequencyType: 'yearly', yearlyData: {} })).toEqual({
      valid: false,
      message: 'Please enter annual data values',
    });
  });

  it('names each missing required annual field', () => {
    expect(
      step3({
        frequencyType: 'yearly',
        yearlyData: { unit: 'kg' },
      }),
    ).toEqual({ valid: false, message: 'Please fill in "Quantity Used"' });
  });

  it('accepts a complete annual entry', () => {
    expect(step3({ frequencyType: 'yearly', yearlyData: { qty: '1200' } })).toEqual({
      valid: true,
    });
  });
});

describe('validateStep3 — C7 multi-employee gate', () => {
  it('requires at least one employee', () => {
    expect(step3({ isC7EmployeeCommuting: true, employees: [] })).toEqual({
      valid: false,
      message: 'Please add at least one employee',
    });
  });

  it('requires a calculated month for at least one employee', () => {
    expect(
      step3({
        isC7EmployeeCommuting: true,
        employees: [{ name: 'Ravi', monthly_data: { '04': { inputs: { distance: 10 } } } }],
      }),
    ).toEqual({
      valid: false,
      message: 'Please calculate emissions for at least one employee month',
    });
  });

  it('accepts an employee with a calculated month', () => {
    expect(
      step3({
        isC7EmployeeCommuting: true,
        employees: [{ name: 'Ravi', monthly_data: { '04': { emissions: { co2e: 0.12 } } } }],
      }),
    ).toEqual({ valid: true });
  });

  it('requires a unit for supplier_basis employee inputs', () => {
    expect(
      step3({
        isC7EmployeeCommuting: true,
        scope3Method: 'supplier_basis',
        dynamicInputFields: [{ variable: 'distance', label: 'Distance', required: true }],
        employees: [
          { name: 'Ravi', monthly_data: { '04': { inputs: { distance: 10 } } } },
        ],
      }),
    ).toEqual({
      valid: false,
      message: 'Please enter unit for "Distance" for Ravi in April',
    });
  });
});

describe('canProceedToStep — dispatcher', () => {
  it('routes step 2/3/4 to the matching validator and defaults to valid', () => {
    expect(canProceedToStep(2, { facilityId: '' })).toEqual({
      valid: false,
      message: 'Please select a facility',
    });
    expect(
      canProceedToStep(3, {
        isProcessEmissions: true,
        processNames: [],
        responsiblePerson: '',
      }),
    ).toEqual({ valid: true });
    expect(canProceedToStep(1, {})).toEqual({ valid: true });
    expect(canProceedToStep(99, {})).toEqual({ valid: true });
  });
});
