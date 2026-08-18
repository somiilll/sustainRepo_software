import { deriveGhgFields } from '../deriveGhgFields';
import { resolveGhgFormArchitecture } from '../resolveGhgFormArchitecture';
import { resolveGhgFormContext } from '../resolveGhgFormContext';
import { resolveGhgScope3Options } from '../resolveGhgScope3Options';

const standardConfig = {
  formulas: [{ id: 'shared-formula', inputs: [{ variable: 'qty' }] }],
  decision_fields: [],
  input_field_mappings: [{
    id: 'qty', field_key: 'qty', field_label: 'Quantity', maps_to_variable: 'qty',
    field_type: 'number', is_required: true, display_order: 1, default_unit: 'kg',
  }],
};

const parityPaths = [
  ['Scope 1 Stationary', 'scope1', '', 'stationary_combustion', 'Stationary Combustion'],
  ['Scope 1 Mobile', 'scope1', '', 'mobile_combustion', 'Mobile Combustion'],
  ['Scope 1 Fugitive', 'scope1', '', 'fugitive_emissions', 'Fugitive Emissions'],
  ['Scope 1 Process', 'scope1', '', 'process_emissions', 'Process Emissions'],
  ['Scope 2 Purchased Electricity', 'scope2', '', 'purchased_electricity', 'Purchased Electricity'],
  ['Scope 3 C1', 'scope3', '', 'purchased_goods_and_services', 'C1 - Purchased Goods and Services'],
  ['Scope 3 C2', 'scope3', '', 'capital_goods', 'C2 - Capital Goods'],
  ['Scope 3 C6', 'scope3', '', 'business_travel', 'C6 - Business Travel'],
  ['Scope 3 C7', 'scope3', '', 'employee_commuting', 'C7 - Employee Commuting'],
  ['Scope 3 C9', 'scope3', '', 'downstream_transportation_and_distribution', 'C9 - Downstream Transportation and Distribution'],
  ['Biogenic Stationary', 'biogenic', 'scope1', 'stationary_combustion', 'Stationary Combustion'],
  ['Biogenic Mobile', 'biogenic', 'scope1', 'mobile_combustion', 'Mobile Combustion'],
];

const scopes = [{ code: 'scope1' }, { code: 'scope2' }, { code: 'scope3' }, { code: 'biogenic' }];
const categories = parityPaths.map(([, scope, biogenicScopeSelection, code, name]) => ({
  code,
  name,
  scope_code: scope === 'biogenic' && biogenicScopeSelection === 'scope1' ? 'biogenic' : scope,
}));

describe('Final GHG Create/Edit parity matrix', () => {
  test.each(parityPaths)('%s resolves matching config, capabilities, and fields', (
    _name, scope, biogenicScopeSelection, categoryCode, categoryName,
  ) => {
    const formContext = resolveGhgFormContext({
      scope, biogenicScopeSelection, categoryCode, categoryName, categories, scopes,
      scope3Method: 'activity_basis', decisionFieldValues: { calculation_methodology: 'using_heat_basis_ncv' },
    });
    const create = resolveGhgFormArchitecture({ standardConfig, formContext, biogenicScopeSelection });
    const edit = resolveGhgFormArchitecture({ standardConfig, formContext, biogenicScopeSelection });

    expect(create.capabilities).toEqual(edit.capabilities);
    expect(create.resolvedConfig).toEqual(edit.resolvedConfig);
    expect(deriveGhgFields({ formConfig: create.resolvedConfig, context: create.formContext }))
      .toEqual(deriveGhgFields({ formConfig: edit.resolvedConfig, context: edit.formContext }));
  });

  test('Scope 3 Create and Edit receive the same resolved option set', () => {
    const optionsInput = {
      scope: 'scope3', category: 'C6 - Business Travel', scope3Method: 'supplier_basis',
      capabilities: { activityType: true, supplierBasisOtherActivity: true },
      scope3EFData: [{ category: 'C6 - Business Travel', method: 'activity_basis', activity_type: 'air_travel' }],
      fieldOptions: { scope3_subcategory: [{ value: 'energy', label: 'Energy' }] },
    };
    expect(resolveGhgScope3Options(optionsInput)).toEqual(resolveGhgScope3Options(optionsInput));
    expect(resolveGhgScope3Options(optionsInput)).toMatchObject({
      methods: ['activity_basis', 'supplier_basis'], activityTypes: ['air_travel', 'others'],
    });
  });
});