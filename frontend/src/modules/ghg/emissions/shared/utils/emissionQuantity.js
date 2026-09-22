const hasValue = (field) => (
  field && typeof field === 'object' && field.value !== null && field.value !== undefined
);

export const resolveEmissionQuantity = (record = {}, allowLegacy = true) => {
  const dynamicValues = record.dynamic_field_values || {};
  const preferredKeys = record.scope === 'scope2'
    ? ['qty_energy', 'qty', 'quantity']
    : ['qty', 'qty_energy', 'quantity'];
  let key = preferredKeys.find((candidate) => hasValue(dynamicValues[candidate]));

  if (!key && record.scope !== 'scope3') {
    key = Object.keys(dynamicValues).find((candidate) => (
      /^(qty|quantity)(_|$)/i.test(candidate)
      && !candidate.endsWith('_unit')
      && hasValue(dynamicValues[candidate])
    ));
  }

  if (key) {
    return {
      value: dynamicValues[key].value,
      unit: dynamicValues[key].unit || '',
      key,
      source: 'dynamic_field_values',
    };
  }

  if (allowLegacy && record.quantity !== null && record.quantity !== undefined) {
    return {
      value: record.quantity,
      unit: record.quantity_unit || record.unit || '',
      key: 'legacy_quantity',
      source: 'legacy_fallback',
    };
  }

  return { value: null, unit: '', key: null, source: 'unavailable' };
};

export const formatEmissionQuantity = (record, fallback = '—') => {
  const quantity = resolveEmissionQuantity(record);
  if (quantity.value === null || quantity.value === undefined) return fallback;
  return `${quantity.value}${quantity.unit ? ` ${quantity.unit}` : ''}`;
};