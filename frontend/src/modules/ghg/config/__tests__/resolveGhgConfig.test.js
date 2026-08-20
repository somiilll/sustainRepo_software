/**
 * Organization override extension point.
 *
 * The critical assertion is the first one: with no overrides the standard
 * configuration is returned **by reference**, so introducing this layer cannot
 * change existing behaviour for any organization.
 */
import { resolveGhgConfig } from '../resolveGhgConfig';
import { validateGhgOverrides } from '../overrideSchema';
import { deriveGhgFields } from '../deriveGhgFields';

const STANDARD = {
  has_decision_tree: true,
  decision_tree: { field_name: 'calculation_methodology', options: {} },
  formulas: [{ id: 'f1', name: 'Heat Basis', inputs: [{ variable: 'qty' }] }],
  decision_fields: [{ field_name: 'calculation_methodology' }],
  input_field_mappings: [
    {
      id: 'm1',
      field_key: 'qty',
      field_label: 'Quantity Used',
      maps_to_variable: 'qty',
      is_required: true,
      display_order: 1,
      allowed_units: ['kg', 'L'],
    },
    {
      id: 'm2',
      field_key: 'cv',
      field_label: 'Calorific Value',
      maps_to_variable: 'cv',
      is_required: false,
      is_override: true,
      display_order: 2,
    },
  ],
};

describe('resolveGhgConfig — identity without overrides', () => {
  it.each([[undefined], [null], [{}], [{ hiddenFields: [] }], [{ fieldOverrides: {} }]])(
    'returns the standard config by reference for %p',
    (overrides) => {
      expect(
        resolveGhgConfig({ standardConfig: STANDARD, organizationOverrides: overrides }),
      ).toBe(STANDARD);
    },
  );

  it('returns the standard config unchanged when the override document is invalid', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { formulas: [{ id: 'evil' }] },
    });
    expect(result).toBe(STANDARD);
  });

  it('never mutates the standard config', () => {
    const before = JSON.stringify(STANDARD);
    resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { hiddenFields: ['cv'], requiredFields: ['cv'] },
    });
    expect(JSON.stringify(STANDARD)).toBe(before);
  });
});

describe('resolveGhgConfig — applied overrides', () => {
  it('hides a field', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { hiddenFields: ['cv'] },
    });
    expect(result.input_field_mappings.map((m) => m.field_key)).toEqual(['qty']);
  });

  it('hides a field through fieldOverrides.hidden', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { fieldOverrides: { qty: { hidden: true } } },
    });
    expect(result.input_field_mappings.map((m) => m.field_key)).toEqual(['cv']);
  });

  it('makes an optional field required', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { requiredFields: ['cv'] },
    });
    expect(result.input_field_mappings.find((m) => m.field_key === 'cv').is_required).toBe(
      true,
    );
  });

  it('relabels a field', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { fieldLabels: { qty: 'Fuel Consumed' } },
    });
    expect(result.input_field_mappings[0].field_label).toBe('Fuel Consumed');
  });

  it('replaces field options', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { fieldOptions: { qty: ['A', 'B'] } },
    });
    expect(result.input_field_mappings[0].options).toEqual(['A', 'B']);
  });

  it('keeps a valid custom field presentation-only', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: {
        customFields: [
          { id: 'org1', field_key: 'cost_centre', field_label: 'Cost Centre', field_type: 'text', display_order: 9 },
        ],
      },
    });
    expect(result.input_field_mappings.map((m) => m.field_key)).toEqual(['qty', 'cv']);
    const derived = deriveGhgFields({
      formConfig: result,
      context: {
        scope: 'scope1',
        decisionFieldValues: { calculation_methodology: 'using_heat_basis_ncv' },
        selectedFuel: null,
      },
    });
    expect(derived.fields.find((field) => field.variable === 'cost_centre')).toMatchObject({
      label: 'Cost Centre',
      presentationOnly: true,
      unitSource: 'none',
    });
  });

  it('leaves decision trees, formulas and allowed units untouched', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: { fieldLabels: { qty: 'X' } },
    });
    expect(result.decision_tree).toBe(STANDARD.decision_tree);
    expect(result.formulas).toBe(STANDARD.formulas);
    expect(result.input_field_mappings[0].allowed_units).toEqual(['kg', 'L']);
    expect(result.input_field_mappings[0].maps_to_variable).toBe('qty');
  });

  it('surfaces reserved override keys without applying them', () => {
    const result = resolveGhgConfig({
      standardConfig: STANDARD,
      organizationOverrides: {
        hiddenFields: ['cv'],
        disabledCategories: ['C14'],
        validationRules: { qty: { max: 10 } },
      },
    });
    expect(result.organizationMeta).toEqual({
      disabledCategories: ['C14'],
      validationRules: { qty: { max: 10 } },
    });
  });
});

describe('validateGhgOverrides', () => {
  it('accepts an empty document', () => {
    expect(validateGhgOverrides(null)).toEqual({ valid: true, errors: [] });
  });

  it('accepts all safe override shapes', () => {
    expect(validateGhgOverrides({
      hiddenFields: [],
      requiredFields: [],
      fieldLabels: {},
      fieldOptions: {},
      fieldOverrides: {},
      customFields: [],
      disabledScopes: [],
      disabledCategories: [],
      disabledSubcategories: [],
      conditionalFields: {},
      validationRules: {},
    }).valid).toBe(true);
  });

  it('rejects keys that could change calculation behaviour', () => {
    ['formulas', 'decision_tree', 'emissionFactors', 'units', 'organizationId', 'formulaOverrides', 'decisionTreeOverrides', 'emissionFactorOverrides', 'unitOverrides'].forEach(
      (key) => {
        const { valid, errors } = validateGhgOverrides({ [key]: 'anything' });
        expect(valid).toBe(false);
        expect(errors.join()).toContain(key);
      },
    );
  });

  it('rejects a non-overridable field property', () => {
    const { valid, errors } = validateGhgOverrides({
      fieldOverrides: { qty: { maps_to_variable: 'something_else' } },
    });
    expect(valid).toBe(false);
    expect(errors.join()).toContain('maps_to_variable');
  });

  it('rejects wrong shapes', () => {
    expect(validateGhgOverrides({ hiddenFields: 'cv' }).valid).toBe(false);
    expect(validateGhgOverrides({ customFields: {} }).valid).toBe(false);
    expect(validateGhgOverrides([]).valid).toBe(false);
  });

  it('rejects a unit-like field option and a calculation-shaped custom field', () => {
    expect(validateGhgOverrides({ fieldOptions: { quantity_unit: ['kg'] } }).valid).toBe(false);
    expect(validateGhgOverrides({
      customFields: [{ field_key: 'unsafe', field_label: 'Unsafe', maps_to_variable: 'qty' }],
    }).valid).toBe(false);
  });
});
