import { isQuantityField } from './unitHelpers';

const normalizeUnitKey = (unit) => String(unit || '').trim().toLowerCase();

/** Resolve the exact unit that a monthly selector displays and persists. */
export const resolveMonthlySelectableUnit = ({
  storedUnit = '',
  configuredUnit = '',
  allowedUnits = [],
}) => {
  const findAllowedUnit = (candidateUnit) => allowedUnits.find(
    (unit) => normalizeUnitKey(unit) === normalizeUnitKey(candidateUnit),
  );
  const configuredMatch = findAllowedUnit(configuredUnit);
  const storedMatch = findAllowedUnit(storedUnit);
  return storedMatch || configuredMatch || allowedUnits[0] || storedUnit || configuredUnit;
};

/**
 * Materialize fuel-backed units into row state so rendered selectors,
 * calculations, and create payloads all consume the same canonical value.
 */
export const normalizeFuelBackedFieldUnits = ({
  data = {},
  fields = [],
  allowedUnits = [],
  isProcessEmissions = false,
}) => {
  if (allowedUnits.length === 0) return data;

  let normalized = data;
  fields.forEach((field) => {
    if (field.unitSource !== 'fuel') return;

    const valueKey = field.valueKey || field.variable || field.fieldKey;
    const unitKey = field.unitKey || `${valueKey}_unit`;
    const storedUnit = data[unitKey]
      || data[`${field.fieldKey}_unit`]
      || (!isProcessEmissions && isQuantityField(field) ? data.unit : '')
      || '';
    const configuredUnit = field.defaultUnit || field.default_unit || field.expectedUnit || '';
    const resolvedUnit = resolveMonthlySelectableUnit({
      storedUnit,
      configuredUnit,
      allowedUnits,
    });
    if (!resolvedUnit) return;

    const needsCanonicalUnit = data[unitKey] !== resolvedUnit;
    const needsLegacyQuantityUnit = !isProcessEmissions
      && isQuantityField(field)
      && data.unit !== resolvedUnit;
    if (!needsCanonicalUnit && !needsLegacyQuantityUnit) return;

    if (normalized === data) normalized = { ...data };
    normalized[unitKey] = resolvedUnit;
    if (needsLegacyQuantityUnit) normalized.unit = resolvedUnit;
  });

  return normalized;
};

export default resolveMonthlySelectableUnit;