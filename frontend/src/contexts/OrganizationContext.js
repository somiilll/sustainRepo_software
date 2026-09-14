import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { getUserFriendlyError } from '../lib/userFriendlyError';

const OrganizationContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * OrganizationProvider - Provides organization configuration including timezone
 * 
 * This context provides:
 * - timezone: IANA timezone string (e.g., 'Asia/Kolkata')
 * - moduleConfig: has_ghg, has_esg, enabled_access, etc.
 * - organization: Full organization details
 * - refreshOrganization: Function to reload organization data
 */
export const OrganizationProvider = ({ children }) => {
  const { token, user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [moduleConfig, setModuleConfig] = useState({
    has_ghg: true,
    has_esg: true,
    enabled_access: null,
    esg_frameworks_enabled: null,
    approval_workflow_enabled: false,
    multi_level_approval_enabled: false,
    timezone: 'UTC',
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const fetchModuleConfig = useCallback(async () => {
    if (!token) {
      return;
    }
    const response = await axios.get(`${API}/organization/module-config`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setModuleConfig(response.data);
  }, [token]);

  const fetchOrganization = useCallback(async () => {
    if (!token || !user || user.role === 'super_admin') {
      return;
    }
    const response = await axios.get(`${API}/organizations/my`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setOrganization(response.data);
  }, [token, user?.role]);

  const refreshOrganization = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const results = await Promise.allSettled([fetchModuleConfig(), fetchOrganization()]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) {
      console.error('Failed to load organization context:', failure.reason);
      setLoadError(getUserFriendlyError(failure.reason, 'Unable to load organization settings. Please refresh the page and try again.', { preferFallback: true }));
    }
    setLoading(false);
  }, [fetchModuleConfig, fetchOrganization]);

  useEffect(() => {
    if (token) refreshOrganization();
    else setLoading(false);
  }, [token, refreshOrganization]);

  // Get timezone from moduleConfig (already includes org timezone) or organization
  const timezone = moduleConfig?.timezone || organization?.timezone || 'UTC';

  return (
    <OrganizationContext.Provider value={{
      organization,
      moduleConfig,
      timezone,
      loading,
      loadError,
      refreshOrganization,
    }}>
      {children}
    </OrganizationContext.Provider>
  );
};

/**
 * useOrganization hook - Access organization context
 * 
 * @returns {Object} { organization, moduleConfig, timezone, loading, refreshOrganization }
 */
export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    // Return safe defaults if used outside provider
    return {
      organization: null,
      moduleConfig: { timezone: 'UTC' },
      timezone: 'UTC',
      loading: false,
      loadError: '',
      refreshOrganization: () => {},
    };
  }
  return context;
};

export default OrganizationContext;
