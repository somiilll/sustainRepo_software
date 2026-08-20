/**
 * Build the explicit context the GHG field derivation needs.
 *
 * The derivation used to read a dozen unrelated pieces of React state directly
 * from the Create form component. It now receives this object instead, so the
 * same derivation can serve Edit (Phase 2) and can be tested in isolation.
 *
 * Pure: no React, no network, no module state.
 */
import {
  findCategoryDefinition,
  findScopeDefinition,
  isProcessCategory,
  isStationaryMobileOrFlaringCategory,
  resolveEffectiveScopeCode,
} from './categoryRules';

export const resolveGhgFormContext = ({
  scope,
  biogenicScopeSelection,
  categoryName,
  categoryCode,
  categories,
  scopes,
  scope3Method = '',
  scope3ActivityType = '',
  scope3Subcategory = '',
  typeOfProduct = '',
  decisionFieldValues = {},
  useCustomFuel = false,
  selectedFuel = null,
  savedFormulaId = null,
} = {}) => {
  const isBiogenicScope1 = scope === 'biogenic' && biogenicScopeSelection === 'scope1';
  const isBiogenicScope3 = scope === 'biogenic' && biogenicScopeSelection === 'scope3';
  const effectiveScope = isBiogenicScope3 ? 'scope3' : scope;

  // Category lists are keyed on the biogenic scope, form-config lookups on the
  // effective scope. Both are exposed so no caller has to re-derive either.
  const categoryListScope = resolveEffectiveScopeCode(scope, biogenicScopeSelection);

  const categoryDefinition = findCategoryDefinition(categories, {
    categoryCode,
    categoryName,
    scopeCode: effectiveScope,
  });
  const scopeDefinition = findScopeDefinition(scopes, effectiveScope);

  return {
    scope,
    biogenicScopeSelection,
    effectiveScope,
    categoryListScope,
    isBiogenicScope1,
    isBiogenicScope3,
    isScope3Like: effectiveScope === 'scope3',

    categoryName,
    categoryCode: categoryCode || categoryDefinition?.code || null,
    categoryId: categoryDefinition?.id,
    categoryDefinition,
    scopeId: scopeDefinition?.id,
    scopeDefinition,

    scope3Method,
    scope3ActivityType,
    scope3Subcategory,
    typeOfProduct,
    decisionFieldValues,

    useCustomFuel,
    selectedFuel,
    // Existing-record hydration may supply the saved formula as a compatibility
    // fallback. Create leaves this null, so its empty-state behaviour is unchanged.
    savedFormulaId,

    isProcessCategory: isProcessCategory(categoryCode || categoryDefinition?.code),
    isStationaryMobileOrFlaringCategory: isStationaryMobileOrFlaringCategory(
      categoryName,
      categoryDefinition?.name,
    ),
  };
};

export default resolveGhgFormContext;
