import { deriveGhgFields } from '../deriveGhgFields';
import { resolveGhgFormContext } from '../resolveGhgFormContext';

const categoryId = 'stationary-category';
const scopeId = 'scope1-id';
const formConfig = {
  decision_tree: {
    field_name: 'calculation_methodology',
    options: {
      using_heat_basis_ncv: {
        next: {
          field_name: 'cv_quantity_basis',
          options: {
            mass: { formula_id: 'heat-mass' },
            volume: { formula_id: 'heat-volume' },
          },
        },
      },
      using_qty_basis_ef: {
        next: {
          field_name: 'ef_quantity_basis',
          options: {
            mass: { formula_id: 'quantity-mass' },
            volume: { formula_id: 'quantity-volume' },
          },
        },
      },
    },
  },
  decision_fields: [
    { field_name: 'calculation_methodology' },
    { field_name: 'cv_quantity_basis' },
    { field_name: 'ef_quantity_basis' },
  ],
  formulas: [
    { id: 'heat-mass', name: 'Stationary Heat Basis Mass', inputs: [{ variable: 'qty' }], properties: [{ variable: 'cv' }] },
    { id: 'heat-volume', name: 'Custom Fuel Heat Basis Volume', inputs: [{ variable: 'qty' }], properties: [{ variable: 'cv' }] },
    { id: 'quantity-mass', name: 'Quantity Based', inputs: [{ variable: 'qty' }, { variable: 'ef_quantity' }], properties: [] },
    { id: 'quantity-volume', name: 'Custom Fuel Quantity Basis Volume', inputs: [{ variable: 'qty' }, { variable: 'ef_quantity' }], properties: [] },
  ],
  input_field_mappings: [
    { id: 'qty', field_key: 'qty', field_label: 'Quantity Used', maps_to_variable: 'qty', is_required: true, unit_source: 'fuel', applies_to_categories: [categoryId], applies_to_scopes: [scopeId] },
    { id: 'ef', field_key: 'ef_quantity', field_label: 'Emission Factor', maps_to_variable: 'ef_quantity', is_required: true, unit_source: 'static', applies_to_categories: [categoryId], applies_to_scopes: [scopeId] },
    { id: 'cv', field_key: 'cv', field_label: 'Calorific Value', maps_to_variable: 'cv', is_required: false, is_override: true, unit_source: 'static', applies_to_categories: [categoryId], applies_to_scopes: [scopeId] },
  ],
};

const buildContext = (calculationMethodology) => resolveGhgFormContext({
  scope: 'scope1',
  categoryName: 'Stationary Combustion',
  categories: [{ id: categoryId, code: 'stationary_combustion', name: 'Stationary Combustion', scope_code: 'scope1' }],
  scopes: [{ id: scopeId, code: 'scope1' }],
  decisionFieldValues: { calculation_methodology: calculationMethodology },
  useCustomFuel: false,
  selectedFuel: { fuel_name: 'Diesel', allowed_units: ['L', 'ml', 'kl'] },
});

describe('standard Stationary/Mobile mass routing', () => {
  it('renders Emission Factor from the mass Quantity Basis branch', () => {
    const result = deriveGhgFields({
      formConfig,
      context: buildContext('using_qty_basis_ef'),
    });

    expect(result.formulaId).toBe('quantity-mass');
    expect(result.fields.map((field) => field.variable)).toEqual(['qty', 'ef_quantity']);
  });

  it('keeps Heat Basis on its mass branch', () => {
    const result = deriveGhgFields({
      formConfig,
      context: buildContext('using_heat_basis_ncv'),
    });

    expect(result.formulaId).toBe('heat-mass');
    expect(result.fields.map((field) => field.variable)).toEqual(['qty', 'cv']);
  });
});