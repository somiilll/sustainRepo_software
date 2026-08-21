const hasValue = (value) => value !== '' && value !== null && value !== undefined;

const isCoreMonthlyInput = (field = {}) => {
  const identity = `${field.variable || ''} ${field.fieldKey || ''} ${field.label || ''}`;
  return /quantity|\bqty\b|activity|consum|energy|volume|mass|distance|travelled|production|output/i.test(identity);
};

export const getRequiredMonthlyFields = (fields = []) =>
  fields.filter((field) => field.required && !field.isOverride);

// Unit initialization and displayed factor defaults can create a month-data
// object before a user has entered any activity. Only a core activity input
// starts a monthly record; defaults such as Density or Oxidation Factor do not.
export const isMonthlyEntryStarted = (data, fields = []) => {
  if (!data) return false;

  const requiredFields = getRequiredMonthlyFields(fields);
  const coreFields = requiredFields.filter(isCoreMonthlyInput);
  const starterFields = coreFields.length > 0
    ? coreFields
    : requiredFields.filter((field) => !hasValue(field.defaultValue));

  return starterFields.some((field) => (
    hasValue(data[field.variable] ?? data[field.fieldKey])
  ));
};

export const isMonthlyEntryComplete = (data, fields = []) => {
  const requiredFields = getRequiredMonthlyFields(fields);
  if (!data || requiredFields.length === 0) return false;
  if (!isMonthlyEntryStarted(data, fields)) return false;

  const hasRequiredFields = requiredFields.every((field) => {
    const storedValue = data[field.variable] ?? data[field.fieldKey];
    return hasValue(storedValue) || hasValue(field.defaultValue);
  });
  if (!hasRequiredFields) return false;

  // Process Emissions can add Density as a runtime-only required field when
  // the selected quantity and factor units cross mass/volume dimensions.
  if (data.runtime_density_required === true) {
    const density = Number.parseFloat(data.density);
    return Number.isFinite(density) && density > 0;
  }

  return true;
};

export default isMonthlyEntryComplete;