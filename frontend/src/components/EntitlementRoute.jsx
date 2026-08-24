import React from 'react';
import { Navigate } from 'react-router-dom';
import { useModuleAccess } from '../hooks/useModuleAccess';

export default function EntitlementRoute({ entitlement, children }) {
  const { hasAccess, loading, loadError } = useModuleAccess();

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center" data-testid="entitlement-route-loading">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />
      </div>
    );
  }

  if (loadError || !hasAccess(entitlement)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}