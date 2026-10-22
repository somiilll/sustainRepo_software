export const mergeBRSRAutofill = (baseValue, liveValue) => {
  if (!liveValue || typeof liveValue !== 'object') return baseValue;
  const base = baseValue && typeof baseValue === 'object' ? baseValue : {};
  const merged = Array.isArray(base) ? [...base] : { ...base };
  Object.entries(liveValue).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = mergeBRSRAutofill(merged[key], value);
    } else {
      merged[key] = value;
    }
  });
  return merged;
};