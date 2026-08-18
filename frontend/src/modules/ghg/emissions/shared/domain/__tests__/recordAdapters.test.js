import { hydrateEmissionForm } from '../../../../../../pages/emissions/utils/hydrateEmissionForm';
import {
  emissionDraftToRecordValues,
  emissionRecordToDraft,
} from '../recordAdapters';

const record = {
  id: 'emission-1',
  facility_id: 'facility-1',
  reporting_period: '2025-02',
  frequency_type: 'monthly',
  scope: 'scope3',
  category: 'C11 - Use of Sold Products',
  fuel_type: 'Widgets',
  calculation_method_scope3: 'activity_basis',
  scope3_ef_id: 'ef-11',
  scope3_activity_type: 'continuous_usage',
  type_of_product: 'continuous_usage',
  notes: 'Adapter fixture',
  evidence_url: 'https://example.test/api/files/file-1',
  dynamic_field_values: {
    qty: { value: 12, unit: 'kg' },
    type_of_product: { value: 'continuous_usage', unit: '' },
  },
};

describe('EmissionDraft record adapters', () => {
  it('preserves existing hydration values while grouping them into a draft', () => {
    const hydrated = hydrateEmissionForm(record);
    const draft = emissionRecordToDraft(record);

    expect(draft.values).toEqual(hydrated.formData);
    expect(draft.frequencyType).toBe(hydrated.frequencyType);
    expect(draft.scope3ActivityId).toBe(hydrated.scope3ActivityId);
    expect(draft.typeOfProduct).toBe('continuous_usage');
    expect(record).toEqual(expect.objectContaining({
      dynamic_field_values: { qty: { value: 12, unit: 'kg' }, type_of_product: { value: 'continuous_usage', unit: '' } },
    }));
  });

  it('maps draft values back to the established record names without serialization changes', () => {
    const draft = emissionRecordToDraft(record);
    draft.dynamicFieldValues = record.dynamic_field_values;
    const values = emissionDraftToRecordValues(draft);

    expect(values).toMatchObject({
      facility_id: 'facility-1',
      scope: 'scope3',
      category: 'C11 - Use of Sold Products',
      reporting_period_start: '2025-02',
      reporting_period_end: '2025-02',
      frequency_type: 'monthly',
      calculation_method_scope3: 'activity_basis',
      scope3_ef_id: 'ef-11',
      type_of_product: 'continuous_usage',
      dynamic_field_values: record.dynamic_field_values,
    });
  });
});