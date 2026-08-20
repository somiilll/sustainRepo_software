const hasValue = (value) => value !== '' && value !== null && value !== undefined;

export const getRequiredMonthlyFields = (fields = []) =>
  fields.filter((field) => field.required && !field.isOverride);

export const isMonthlyEntryComplete = (data, fields = []) => {
  const requiredFields = getRequiredMonthlyFields(fields);
  if (!data || requiredFields.length === 0) return false;

  return requiredFields.every((field) =>
    hasValue(data[field.variable] ?? data[field.fieldKey]),
  );
};

export default isMonthlyEntryComplete;