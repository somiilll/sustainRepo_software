import { validateGhgOverrides } from './overrideSchema';

const EMPTY_ORGANIZATION_UI_CONFIG = Object.freeze({
  disabledScopes: [],
  disabledCategories: [],
  disabledSubcategories: [],
});

const hasOverrides = (overrides) =>
  overrides != null
  && typeof overrides === 'object'
  && Object.keys(overrides).some((key) => {
    const value = overrides[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === 'object' ? Object.keys(value).length : value);
  });

/**
 * Resolves the organization-level UI switches that are safe before a category
 * form config has loaded. It deliberately has no organization identity input.
 */
export const resolveGhgOrganizationUiConfig = ({ organizationOverrides } = {}) => {
  if (!hasOverrides(organizationOverrides)) return EMPTY_ORGANIZATION_UI_CONFIG;
  const { valid } = validateGhgOverrides(organizationOverrides);
  if (!valid) return EMPTY_ORGANIZATION_UI_CONFIG;
  return {
    disabledScopes: organizationOverrides.disabledScopes || [],
    disabledCategories: organizationOverrides.disabledCategories || [],
    disabledSubcategories: organizationOverrides.disabledSubcategories || [],
  };
};

const matchesCategory = (category, disabledCategories, categoryDefinitions) => {
  const definition = (categoryDefinitions || []).find((item) => item.name === category);
  return disabledCategories.includes(category) || Boolean(definition?.code && disabledCategories.includes(definition.code));
};

/**
 * Standard category options + resolved organization UI switches -> options for
 * Create and Edit. With no valid override, the exact standard array is kept.
 */
export const resolveGhgCategoryOptions = ({
  standardCategories = [],
  scopeCode,
  categoryDefinitions = [],
  organizationOverrides,
} = {}) => {
  const uiConfig = resolveGhgOrganizationUiConfig({ organizationOverrides });
  if (uiConfig === EMPTY_ORGANIZATION_UI_CONFIG) return standardCategories;
  if (uiConfig.disabledScopes.includes(scopeCode)) return [];
  if (!uiConfig.disabledCategories.length) return standardCategories;
  return standardCategories.filter((category) => (
    !matchesCategory(category, uiConfig.disabledCategories, categoryDefinitions)
  ));
};

export const resolveGhgSubcategoryOptions = ({ standardOptions = [], organizationOverrides } = {}) => {
  const uiConfig = resolveGhgOrganizationUiConfig({ organizationOverrides });
  if (uiConfig === EMPTY_ORGANIZATION_UI_CONFIG || !uiConfig.disabledSubcategories.length) {
    return standardOptions;
  }
  return standardOptions.filter((option) => !uiConfig.disabledSubcategories.includes(option.value));
};

export default resolveGhgCategoryOptions;