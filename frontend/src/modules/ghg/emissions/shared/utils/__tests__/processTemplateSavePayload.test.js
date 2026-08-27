import { buildLegacyProcessTemplatePayload } from '../processTemplateSavePayload';

const template = {
  id: 'template-venting',
  name: 'Venting carbon composition',
  formula: 'quantity * carbon_content',
  input_fields: [{ key: 'quantity', unit: 'L' }],
  predefined_inputs: [{ key: 'carbon_content', value: 0.8 }],
};

const createPayload = (frequencyType) => buildLegacyProcessTemplatePayload({
  data: { quantity: '100', quantity_unit: 'L', density: '0.75', density_unit: 'kg/L' },
  reportingPeriod: frequencyType === 'yearly' ? 'CY2026' : '2026-01',
  frequencyType,
  facilityId: 'facility-1',
  category: 'Process Emissions',
  categoryCode: 'process_emissions',
  selectedSubIndustry: 'oil-and-gas',
  selectedTemplate: template,
  templateInputValues: {},
  evaluateFormula: (_, inputs) => inputs.quantity * inputs.carbon_content,
  recordSource: 'meter',
  notes: 'validated input',
  responsiblePerson: 'Owner',
  responsiblePersonDesignation: 'Manager',
  responsiblePersonContact: 'owner@example.com',
});

describe('legacy Process Emissions template save payload', () => {
  it('keeps monthly and yearly payload contracts aligned', () => {
    const monthly = createPayload('monthly');
    const yearly = createPayload('yearly');

    expect(monthly).toEqual(expect.objectContaining({
      frequency_type: 'monthly',
      category: 'Process Emissions',
      category_code: 'process_emissions',
      quantity: 100,
      quantity_unit: 'L',
      calculated_co2e: 80,
      template_id: 'template-venting',
      template_inputs: { quantity: 100, carbon_content: 0.8, density: 0.75 },
    }));
    expect(yearly).toEqual(expect.objectContaining({
      ...monthly,
      frequency_type: 'yearly',
      reporting_period: 'CY2026',
    }));
  });
});