import { resolveGhgCapabilities } from './resolveGhgCapabilities';
import { resolveGhgConfig, resolveGhgFieldOptions } from './resolveGhgConfig';
import { resolveStandardGhgFieldOptions } from './standardGhgFormConfig';

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
  const organizationOverridesApplied = resolvedFieldOptions !== standardFieldOptions;
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
  };
};

export default resolveGhgFormArchitecture;
