const SUPPLIER_GHG_SCOPES = ['scope1', 'scope2'];

export const filterSupplierVisibleScopes = (dynamicScopes, enabledScopes) => (
  dynamicScopes.filter((scope) => (
    SUPPLIER_GHG_SCOPES.includes(scope.code) && enabledScopes.includes(scope.code)
  ))
);

const normalizeCategory = (value) => String(value || '').trim().toLowerCase();
const isSupplierRestrictedCategory = (value) => /process|flaring/.test(normalizeCategory(value));

/** Keep parent-program special-category permissions consistent across supplier GHG forms. */
export const filterSupplierVisibleCategories = (categories, scope, supplierConfig) => {
  const allowedCategories = supplierConfig?.categories?.[scope] || [];
  const allowedValues = new Set(allowedCategories.flatMap((item) => [
    normalizeCategory(item?.value),
    normalizeCategory(item?.label),
  ]));
  return categories.filter((category) => (
    !isSupplierRestrictedCategory(category) || allowedValues.has(normalizeCategory(category))
  ));
};

/** A supplier program can only reduce, never expand, the organization's custom-fuel capability. */
export const resolveSupplierGhgOverrides = (organizationOverrides, supplierConfig) => {
  if (supplierConfig?.permissions?.allow_custom_fuels === true
    && organizationOverrides?.capabilityOverrides?.customFuel !== false) {
    return organizationOverrides;
  }
  return {
    ...(organizationOverrides || {}),
    capabilityOverrides: {
      ...(organizationOverrides?.capabilityOverrides || {}),
      customFuel: false,
    },
  };
};