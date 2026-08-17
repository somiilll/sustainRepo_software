/**
 * Standard GHG configuration + organization overrides -> resolved configuration.
 *
 *   Standard GHG Configuration (GET /api/calc-engine/form-config/{categoryId})
 *           +
 *   Organization GHG Overrides (none today)
 *           ↓
 *   Resolved GHG Configuration
 *           ↓
 *   Shared GHG form
 *
 * Guarantee: with no overrides the standard configuration object is returned
 * **by reference**, so nothing downstream can behave differently. That identity
 * is the reason this layer can be introduced without changing behaviour.
 *
 * Overrides never touch decision trees, formulas, emission factors, unit
 * conversions or property resolution — only presentation and field-level
 * metadata that the form itself owns.
 */
import {
  ALLOWED_FIELD_OVERRIDE_PROPS,
  RESERVED_OVERRIDE_KEYS,
  validateGhgOverrides,
} from './overrideSchema';

const hasAnyOverride = (overrides) =>
  overrides != null &&
  typeof overrides === 'object' &&
  Object.keys(overrides).some((key) => {
    const value = overrides[key];
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  });

const applyFieldOverride = (mapping, props) => {
  const next = { ...mapping };
  ALLOWED_FIELD_OVERRIDE_PROPS.forEach((prop) => {
    if (prop === 'hidden') return;
    if (props[prop] !== undefined) next[prop] = props[prop];
  });
  return next;
};

export const resolveGhgConfig = ({ standardConfig, organizationOverrides } = {}) => {
  if (!standardConfig) return standardConfig;
  if (!hasAnyOverride(organizationOverrides)) return standardConfig;

  const { valid } = validateGhgOverrides(organizationOverrides);
  if (!valid) return standardConfig;

  const {
    hiddenFields = [],
    requiredFields = [],
    fieldLabels = {},
    fieldOptions = {},
    fieldOverrides = {},
    customFields = [],
  } = organizationOverrides;

  const hidden = new Set([
    ...hiddenFields,
    ...Object.entries(fieldOverrides)
      .filter(([, props]) => props && props.hidden === true)
      .map(([fieldKey]) => fieldKey),
  ]);
  const required = new Set(requiredFields);

  const mappings = (standardConfig.input_field_mappings || [])
    .filter((m) => !hidden.has(m.field_key))
    .map((m) => {
      let next = m;
      if (fieldOverrides[m.field_key]) {
        next = applyFieldOverride(next, fieldOverrides[m.field_key]);
      }
      if (fieldLabels[m.field_key] !== undefined) {
        next = { ...next, field_label: fieldLabels[m.field_key] };
      }
      if (fieldOptions[m.field_key] !== undefined) {
        next = { ...next, options: fieldOptions[m.field_key] };
      }
      if (required.has(m.field_key)) {
        next = { ...next, is_required: true };
      }
      return next;
    })
    .concat(customFields.filter((f) => f && f.field_key && !hidden.has(f.field_key)));

  const organizationMeta = RESERVED_OVERRIDE_KEYS.reduce((acc, key) => {
    if (organizationOverrides[key] !== undefined) acc[key] = organizationOverrides[key];
    return acc;
  }, {});

  return {
    ...standardConfig,
    input_field_mappings: mappings,
    organizationMeta,
  };
};

/** Resolve presentation option overrides through the existing fieldOptions key. */
export const resolveGhgFieldOptions = ({ standardFieldOptions = {}, organizationOverrides } = {}) => {
  if (!hasAnyOverride(organizationOverrides)) return standardFieldOptions;
  const { valid } = validateGhgOverrides(organizationOverrides);
  if (!valid || !organizationOverrides.fieldOptions) return standardFieldOptions;
  return { ...standardFieldOptions, ...organizationOverrides.fieldOptions };
};

export default resolveGhgConfig;
