import { getProcessTemplateFieldUnit } from './processTemplateMonthlyFields';

const getProvidedDensity = (data = {}) => {
  const value = Number.parseFloat(data.density);
  return Number.isFinite(value) ? { value, unit: data.density_unit || 'kg/L' } : null;
};

export const buildLegacyProcessTemplatePayload = ({
  data,
  reportingPeriod,
  frequencyType,
  facilityId,
  category,
  categoryCode,
  selectedSubIndustry,
  selectedTemplate,
  templateInputValues,
  evaluateFormula,
  recordSource,
  notes,
  responsiblePerson,
  responsiblePersonDesignation,
  responsiblePersonContact,
}) => {
  const formulaValues = {};
  selectedTemplate.input_fields?.forEach((field) => {
    const key = field.key || field.variable || field.fieldKey;
    formulaValues[key] = Number.parseFloat(data[key]) || 0;
  });
  selectedTemplate.predefined_inputs?.forEach((field) => {
    formulaValues[field.key] = Number.parseFloat(templateInputValues[field.key])
      || Number.parseFloat(field.value)
      || 0;
  });
  const density = getProvidedDensity(data);
  if (density) formulaValues.density = density.value;

  const calculatedEmission = evaluateFormula(selectedTemplate.formula, formulaValues);
  const primaryInputField = selectedTemplate.input_fields?.[0];
  const primaryInputKey = primaryInputField?.key || primaryInputField?.variable || primaryInputField?.fieldKey;
  const quantity = primaryInputKey ? (Number.parseFloat(data[primaryInputKey]) || 0) : 0;
  const unit = primaryInputField ? getProcessTemplateFieldUnit(data, primaryInputField) : 'unit';

  return {
    facility_id: facilityId,
    reporting_period: reportingPeriod,
    frequency_type: frequencyType,
    scope: 'scope1',
    category,
    category_code: categoryCode || null,
    sub_category: selectedSubIndustry,
    fuel_type: selectedTemplate.name,
    quantity,
    quantity_unit: unit,
    unit,
    emission_factor: 1,
    emission_factor_ch4: null,
    emission_factor_n2o: null,
    is_custom_factor: false,
    source_of_information: `Template: ${selectedTemplate.name}`,
    record_source: recordSource ? String(recordSource).trim() : '',
    notes,
    responsible_person: responsiblePerson,
    responsible_person_designation: responsiblePersonDesignation,
    responsible_person_contact: responsiblePersonContact,
    process_names: [selectedSubIndustry, selectedTemplate.name].filter(Boolean),
    evidence_url: data.evidences?.map((evidence) => evidence.url).join(',') || '',
    calculated_co2: calculatedEmission,
    calculated_ch4: 0,
    calculated_n2o: 0,
    calculated_co2e: calculatedEmission,
    outputs: {
      co2: { value: calculatedEmission, unit: 'tCO2' },
      ch4: { value: 0, unit: 'tCH4' },
      n2o: { value: 0, unit: 'tN2O' },
      co2e: { value: calculatedEmission, unit: 'tCO2e' },
    },
    co2_unit: 'tCO2',
    ch4_unit: 'tCH4',
    n2o_unit: 'tN2O',
    co2e_unit: 'tCO2e',
    template_id: selectedTemplate.id,
    template_inputs: formulaValues,
    ...(density && {
      dynamic_field_values: {
        density: { ...density, is_override: true },
      },
    }),
  };
};

export default buildLegacyProcessTemplatePayload;