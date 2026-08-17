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

/** Override keys that `resolveGhgConfig` applies today. */
export const APPLIED_OVERRIDE_KEYS = Object.freeze([
  'hiddenFields',
  'requiredFields',
  'fieldLabels',
  'fieldOptions',
  'fieldOverrides',
  'customFields',
]);

/**
 * Override keys that are accepted and validated so the document shape is fixed,
 * but are not consumed yet. They are surfaced on `resolved.organizationMeta`
 * for the phases that will implement them.
 */
export const RESERVED_OVERRIDE_KEYS = Object.freeze([
  'disabledScopes',
  'disabledCategories',
  'disabledSubcategories',
  'conditionalFields',
  'validationRules',
  'calculationInputs',
  'formulaOverrides',
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
    if (!ALLOWED_OVERRIDE_KEYS.includes(key)) {
      errors.push(`unsupported override key: ${key}`);
    }
  });

  ['hiddenFields', 'requiredFields'].forEach((key) => {
    if (overrides[key] != null && !Array.isArray(overrides[key])) {
      errors.push(`${key} must be an array of field keys`);
    }
  });

  if (overrides.customFields != null && !Array.isArray(overrides.customFields)) {
    errors.push('customFields must be an array of field mappings');
  }

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
