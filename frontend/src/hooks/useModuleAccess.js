import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Hook to fetch and check module access flags for the current org.
 * Returns { hasAccess(key), moduleAccess, loading }.
 *
 * Access flags are stored as a flat object on the organization:
 *   module_access: { "dashboard": true, "environment.ghg": true, "targets.sbti": false }
 *
 * hasAccess("environment.ghg") checks:
 *   1. If module_access is empty/null → all modules visible (backwards compatible)
 *   2. If key exists → use its boolean value
 *   3. If key doesn't exist → check parent key (e.g. "environment") → default true
 */
export function useModuleAccess() {
  const { user, getAuthHeader } = useAuth();
  const [moduleAccess, setModuleAccess] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || user.role === 'super_admin') {
      setModuleAccess(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/organizations/my`, { headers: getAuthHeader() });
        if (!cancelled) {
          setModuleAccess(data?.module_access || null);
        }
      } catch {
        // If fetch fails, allow all modules
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, getAuthHeader]);

  const hasAccess = useCallback((key) => {
    // Super admins see everything
    if (user?.role === 'super_admin') return true;
    // If no access config → all visible (backwards compatible)
    if (!moduleAccess || Object.keys(moduleAccess).length === 0) return true;
    // MIS Reports succeeds the legacy Reports sidebar module key.
    if (key === 'mis_reports' && 'reports' in moduleAccess && !('mis_reports' in moduleAccess)) {
      return moduleAccess.reports;
    }
    // Exact key match
    if (key in moduleAccess) return moduleAccess[key];
    // Check parent key: "environment.ghg" → "environment"
    const parts = key.split('.');
    for (let i = parts.length - 1; i >= 1; i--) {
      const parent = parts.slice(0, i).join('.');
      if (parent in moduleAccess) return moduleAccess[parent];
    }
    // Default: visible
    return true;
  }, [user, moduleAccess]);

  return { hasAccess, moduleAccess, loading };
}
