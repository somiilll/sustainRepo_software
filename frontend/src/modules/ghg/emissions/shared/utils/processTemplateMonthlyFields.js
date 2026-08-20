import { isQuantityField } from './unitHelpers';

const PROCESS_EMISSIONS_QUANTITY_UNITS = ['kg', 'g', 't', 'L', 'kL', 'ml', 'm3', 'cm3'];

const isCvTemplateField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /(^|_)(cv|calorific)(_|$)/i.test(identity)
    || /calorific|\bcv\b/i.test(field.label || '');
};

const isEfTemplateField = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''}`;
  return /(^|_)(ef|emission_factor)(_|$)/i.test(identity)
    || /emission factor|\bef\b/i.test(field.label || '');
};

/**
 * Process templates predate the dynamic-field model. Normalize their fields at
 * the rendering boundary so the displayed selector and density resolver share
 * the same value/unit keys and unit defaults.
 */
export const normalizeProcessTemplateMonthlyField = (field = {}) => {
  const valueKey = field.key || field.variable || field.fieldKey || '';
  const identityField = { ...field, variable: valueKey, fieldKey: valueKey };
  const defaultUnit = field.default_unit || field.defaultUnit || field.unit || field.expectedUnit || '';
  const configuredUnits = field.allowedUnits || field.allowed_units || [];
  const role = isQuantityField(identityField)
    ? 'quantity'
    : isCvTemplateField(identityField)
      ? 'cv'
      : isEfTemplateField(identityField)
        ? 'ef'
        : 'input';
  const allowedUnits = configuredUnits.length > 0
    ? configuredUnits
    : role === 'quantity'
      ? PROCESS_EMISSIONS_QUANTITY_UNITS
      : [defaultUnit].filter(Boolean);

  return {
    ...field,
    source: 'process_template',
    role,
    valueKey,
    unitKey: `${valueKey}_unit`,
    variable: valueKey,
    fieldKey: valueKey,
    defaultUnit,
    expectedUnit: defaultUnit,
    allowedUnits,
    unitSource: 'static',
  };
};