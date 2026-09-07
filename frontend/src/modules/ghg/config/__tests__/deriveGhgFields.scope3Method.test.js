import { deriveGhgFields } from '../deriveGhgFields';

const supplierQuantityMapping = {
  id: 'supplier-quantity',
  field_key: 'activity_value_supplier_based',
  field_label: 'Quantity of Activity Used',
  field_type: 'number',
  maps_to_variable: 'activity_value_supplier_based',
  unit_source: 'all_units',
  default_unit: '',
  is_active: true,
};

describe('Scope 3 method-gated field derivation', () => {
  it('does not expose supplier fields or global-unit fallbacks before method selection', () => {
    const result = deriveGhgFields({
      formConfig: { input_field_mappings: [supplierQuantityMapping] },
      context: { isScope3Like: true, scope3Method: '', decisionFieldValues: {} },
    });

    expect(result.fields).toEqual([]);
  });

  it('exposes configured fields after a method is selected', () => {
    const result = deriveGhgFields({
      formConfig: { input_field_mappings: [supplierQuantityMapping] },
      context: { isScope3Like: true, scope3Method: 'supplier_basis', decisionFieldValues: {} },
    });

    expect(result.fields).toEqual([
      expect.objectContaining({ variable: 'activity_value_supplier_based' }),
    ]);
  });
});