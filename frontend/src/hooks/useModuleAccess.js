import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { isCoreNavigationKey } from '../config/moduleNavigationAccess';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Hook to fetch and check module access flags for the current org.
 * Returns { hasAccess(key), moduleAccess, loading }.
 *
 * Access flags are resolved from the organization configuration entitlement catalog.
 *
 * hasAccess("environment.ghg") checks the canonical permission map.
 */
export function useModuleAccess() {
  const { user, getAuthHeader } = useAuth();
  const [moduleAccess, setModuleAccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!user || user.role === 'super_admin') {
      setModuleAccess(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const isSupplier = user?.user_type === 'supplier' || user?.org_type === 'supplier';
        const [organizationConfigResult, supplierAssessmentResult] = await Promise.allSettled([
          axios.get(`${API}/organization/module-config`, { headers: getAuthHeader() }),
          isSupplier ? axios.get(`${API}/supplier-assessment/my-assessment`, { headers: getAuthHeader() }) : Promise.resolve(null),
        ]);
        const organizationConfig = organizationConfigResult.status === 'fulfilled' ? organizationConfigResult.value.data : {};
        const supplierAssessment = supplierAssessmentResult.status === 'fulfilled' ? supplierAssessmentResult.value?.data : null;
        const supplierGhgAssigned = Boolean(supplierAssessment?.assessment_modules?.some((module) => module.code === 'ghg'));
        const access = {
          ...(organizationConfig?.permissions || organizationConfig?.entitlements || {}),
          ...(isSupplier ? {
            'environment.ghg': supplierGhgAssigned,
            'environment.ghg.scope_1_2': supplierGhgAssigned,
          } : {}),
        };
        const hasUsableAccessSource = organizationConfigResult.status === 'fulfilled' || (isSupplier && supplierAssessmentResult.status === 'fulfilled');
        if (!cancelled) {
          setModuleAccess(access);
          setLoadError(!hasUsableAccessSource);
        }
      } catch {
        if (!cancelled) {
          setModuleAccess({});
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, getAuthHeader]);

  const hasAccess = useCallback((key) => {
    // Super admins see everything
    if (user?.role === 'super_admin') return true;
    // Core navigation is role-controlled by the sidebar and route/API guards,
    // not sold or toggled as an organization entitlement.
    if (isCoreNavigationKey(key)) return true;
    if (loadError) return false;
    if (!moduleAccess || Object.keys(moduleAccess).length === 0) return false;
    // Exact key match
    if (key in moduleAccess) return moduleAccess[key];
    // Check parent key: "environment.ghg" → "environment"
    const parts = key.split('.');
    for (let i = parts.length - 1; i >= 1; i--) {
      const parent = parts.slice(0, i).join('.');
      if (parent in moduleAccess) return moduleAccess[parent];
    }
    return false;
  }, [user, moduleAccess, loadError]);

  return { hasAccess, moduleAccess, loading, loadError };
}
