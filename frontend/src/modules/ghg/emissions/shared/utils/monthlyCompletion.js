const hasValue = (value) => value !== '' && value !== null && value !== undefined;

export const getRequiredMonthlyFields = (fields = []) =>
  fields.filter((field) => field.required && !field.isOverride);

export const isMonthlyEntryComplete = (data, fields = []) => {
  const requiredFields = getRequiredMonthlyFields(fields);
  if (!data || requiredFields.length === 0) return false;

  const hasRequiredFields = requiredFields.every((field) =>
    hasValue(data[field.variable] ?? data[field.fieldKey]),
  );
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