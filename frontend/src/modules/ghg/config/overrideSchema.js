/**
 * Whitelist for organization-level GHG configuration overrides.
 *
 * This is the extension point only. Today no organization has overrides, and
 * `resolveGhgConfig` returns the standard configuration untouched when none are
 * supplied — that identity is what guarantees existing behaviour is unchanged.
 *
 * A whitelist rather than a free-form deep merge is deliberate: an override
 * document must never be able to reach into decision trees, formulas, emission
 * factors or units, because those decide calculation results.
 */

/** Override keys consumed by the presentation-only GHG configuration layer. */
export const APPLIED_OVERRIDE_KEYS = Object.freeze([
  'hiddenFields',
  'requiredFields',
  'fieldLabels',
  'fieldOptions',
  'fieldOverrides',
  'customFields',
  'disabledScopes',
  'disabledCategories',
  'disabledSubcategories',
]);

/**
 * Override keys that are accepted and validated so the document shape is fixed,
 * but are not consumed yet. They are surfaced on `resolved.organizationMeta`
 * for the phases that will implement them.
 */
export const RESERVED_OVERRIDE_KEYS = Object.freeze([
  'conditionalFields',
  'validationRules',
]);

/** Explicitly rejected: these would cross the presentation/calculation boundary. */
export const BLOCKED_OVERRIDE_KEYS = Object.freeze([
  'calculationInputs',
  'formulaOverrides',
  'decisionTreeOverrides',
  'emissionFactorOverrides',
  'unitOverrides',
]);

export const ALLOWED_OVERRIDE_KEYS = Object.freeze([
  ...APPLIED_OVERRIDE_KEYS,
  ...RESERVED_OVERRIDE_KEYS,
]);

/** Per-field properties an override may change. Never units of measure logic. */
export const ALLOWED_FIELD_OVERRIDE_PROPS = Object.freeze([
  'field_label',
  'is_required',
  'placeholder',
  'help_text',
  'display_order',
  'options',
  'validation_rules',
  'hidden',
]);

const CUSTOM_FIELD_TYPES = Object.freeze(['text', 'select']);

const isCustomFieldSafe = (field) => {
  if (!field || typeof field !== 'object' || Array.isArray(field)) return false;
  if (!field.field_key || typeof field.field_key !== 'string') return false;
  if (!field.field_label || typeof field.field_label !== 'string') return false;
  if (!CUSTOM_FIELD_TYPES.includes(field.field_type || 'text')) return false;
  if (field.maps_to_variable || field.allowed_units || field.default_unit) return false;
  if (field.unit_source && field.unit_source !== 'none') return false;
  if (field.is_override === true) return false;
  if (field.field_type === 'select' && !Array.isArray(field.options)) return false;
  return true;
};

/**
 * Validate an override document. Returns `{ valid, errors }`.
 * Callers decide what to do with an invalid document; `resolveGhgConfig`
 * ignores it and keeps the standard configuration.
 */
export const validateGhgOverrides = (overrides) => {
  const errors = [];
  if (overrides == null) return { valid: true, errors };
  if (typeof overrides !== 'object' || Array.isArray(overrides)) {
    return { valid: false, errors: ['overrides must be an object'] };
  }

  Object.keys(overrides).forEach((key) => {
    if (BLOCKED_OVERRIDE_KEYS.includes(key)) {
      errors.push(`${key} is not safe to configure`);
      return;
    }
    if (!ALLOWED_OVERRIDE_KEYS.includes(key)) {
      errors.push(`unsupported override key: ${key}`);
    }
  });

  ['hiddenFields', 'requiredFields', 'disabledScopes', 'disabledCategories', 'disabledSubcategories'].forEach((key) => {
    if (overrides[key] != null && !Array.isArray(overrides[key])) {
      errors.push(`${key} must be an array of field keys`);
    }
  });

  if (overrides.customFields != null && !Array.isArray(overrides.customFields)) {
    errors.push('customFields must be an array of field mappings');
  }
  (Array.isArray(overrides.customFields) ? overrides.customFields : []).forEach((field, index) => {
    if (!isCustomFieldSafe(field)) {
      errors.push(`customFields.${index} must be a presentation-only text or select field`);
    }
  });

  ['fieldLabels', 'fieldOptions', 'fieldOverrides', 'conditionalFields', 'validationRules'].forEach((key) => {
    if (overrides[key] != null && (typeof overrides[key] !== 'object' || Array.isArray(overrides[key]))) {
      errors.push(`${key} must be an object`);
    }
  });

  Object.keys(overrides.fieldOptions || {}).forEach((fieldKey) => {
    if (fieldKey.toLowerCase().includes('unit')) {
      errors.push(`fieldOptions.${fieldKey} cannot override units`);
    }
  });

  Object.entries(overrides.fieldOverrides || {}).forEach(([fieldKey, props]) => {
    if (typeof props !== 'object' || props == null) {
      errors.push(`fieldOverrides.${fieldKey} must be an object`);
      return;
    }
    Object.keys(props).forEach((prop) => {
      if (!ALLOWED_FIELD_OVERRIDE_PROPS.includes(prop)) {
        errors.push(`fieldOverrides.${fieldKey}.${prop} is not overridable`);
      }
    });
  });

  return { valid: errors.length === 0, errors };
};
