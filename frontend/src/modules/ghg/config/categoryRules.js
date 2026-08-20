/**
 * Category identity and category-level rules for the GHG form.
 *
 * Canonical identity is `(code, scope_code)` — never the display name alone.
 * `Stationary Combustion` and `Mobile Combustion` each exist once under Scope 1
 * and once under Biogenic with different decision trees and different field
 * mappings, so name alone is not an identity.
 *
 * Behaviour note: the two `isProcessCategory` / `isStationaryMobileOrFlaring`
 * predicates below are name-based because that is exactly what the Create form
 * did before this extraction. They are isolated here so the future
 * configuration layer can replace them with real category capabilities without
 * touching the form.
 */

/** Scope code the category list and form-config lookups should use. */
export const resolveEffectiveScopeCode = (scope, biogenicScopeSelection) => {
  if (scope === 'biogenic') {
    return biogenicScopeSelection === 'scope3' ? 'scope3' : 'biogenic';
  }
  return scope;
};

/**
 * Resolve a category definition by canonical identity, falling back to the
 * display name for callers that only hold a name (today's Create form).
 */
export const findCategoryDefinition = (
  categories,
  { categoryCode, categoryName, scopeCode },
) => {
  const list = categories || [];
  if (categoryCode) {
    const byCode = list.find(
      (c) => c.code === categoryCode && c.scope_code === scopeCode,
    );
    if (byCode) return byCode;
  }
  return list.find((c) => c.name === categoryName && c.scope_code === scopeCode);
};

export const findScopeDefinition = (scopes, scopeCode) =>
  (scopes || []).find((s) => s.code === scopeCode);

/**
 * Process Emissions detection.
 * Preserved exactly: the legacy check used the raw selected category name with
 * no fallback to the resolved definition.
 */
export const isProcessCategory = (categoryName) =>
  (categoryName || '').toLowerCase().includes('process');

/**
 * Stationary / Mobile / Flaring detection, used to prefer the heat-basis
 * formula when the decision tree does not resolve one.
 * Preserved exactly: the legacy check fell back to the resolved definition name.
 */
export const isStationaryMobileOrFlaringCategory = (categoryName, resolvedName) => {
  const name = (categoryName || resolvedName || '').toLowerCase();
  return (
    name.includes('stationary') || name.includes('mobile') || name.includes('flaring')
  );
};
