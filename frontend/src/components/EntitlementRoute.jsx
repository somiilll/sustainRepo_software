import React from 'react';
import { useModuleAccess } from '../hooks/useModuleAccess';
import { ModuleUnavailableState } from './ModuleUnavailableState';

export default function EntitlementRoute({ entitlement, anyOf, moduleName, children }) {
  const { hasAccess, loading, loadError } = useModuleAccess();

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center" data-testid="entitlement-route-loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
      </div>
    );
  }

  const permitted = anyOf ? anyOf.some((accessKey) => hasAccess(accessKey)) : hasAccess(entitlement);
  if (loadError || !permitted) {
    return <ModuleUnavailableState moduleName={moduleName || entitlement.split('.').pop().replace(/_/g, ' ')} />;
  }

  return children;
}