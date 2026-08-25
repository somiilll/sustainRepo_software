const SUPPLIER_GHG_SCOPES = ['scope1', 'scope2'];

export const filterSupplierVisibleScopes = (dynamicScopes, enabledScopes) => (
  dynamicScopes.filter((scope) => (
    SUPPLIER_GHG_SCOPES.includes(scope.code) && enabledScopes.includes(scope.code)
  ))
);