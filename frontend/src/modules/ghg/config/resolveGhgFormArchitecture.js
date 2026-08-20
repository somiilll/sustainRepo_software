import { resolveGhgCapabilities } from './resolveGhgCapabilities';
import { resolveGhgConfig, resolveGhgFieldOptions } from './resolveGhgConfig';
import { resolveStandardGhgFieldOptions } from './standardGhgFormConfig';
import { resolveGhgOrganizationUiConfig } from './resolveGhgCategoryOptions';

/**
 * Live Create/Edit architecture seam.
 * Resolved backend config and organization field options are computed before
 * capabilities so both forms receive one coherent presentation model.
 */
export const resolveGhgFormArchitecture = ({
  standardConfig,
  organizationOverrides,
  formContext,
  biogenicScopeSelection,
} = {}) => {
  const resolvedConfig = resolveGhgConfig({ standardConfig, organizationOverrides });
  const standardFieldOptions = resolveStandardGhgFieldOptions({
    scopeCode: formContext?.effectiveScope,
  });
  const resolvedFieldOptions = resolveGhgFieldOptions({
    standardFieldOptions,
    organizationOverrides,
  });
  const organizationUiConfig = resolveGhgOrganizationUiConfig({ organizationOverrides });
  const organizationOverridesApplied = resolvedConfig !== standardConfig
    || resolvedFieldOptions !== standardFieldOptions
    || organizationUiConfig.disabledScopes.length > 0
    || organizationUiConfig.disabledCategories.length > 0
    || organizationUiConfig.disabledSubcategories.length > 0;
  const capabilityResolution = resolveGhgCapabilities({
    categoryCode: formContext?.categoryDefinition?.code,
    scopeCode: formContext?.effectiveScope,
    biogenicScopeSelection,
    fieldOptions: resolvedFieldOptions,
    organizationOverridesApplied,
  });

  return {
    formContext,
    resolvedConfig,
    resolvedFieldOptions,
    capabilityResolution,
    capabilities: capabilityResolution.capabilities,
    organizationUiConfig,
  };
};

export default resolveGhgFormArchitecture;
