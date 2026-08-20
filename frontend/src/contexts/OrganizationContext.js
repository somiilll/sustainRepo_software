import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

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

  const fetchModuleConfig = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API}/organization/module-config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setModuleConfig(response.data);
    } catch (error) {
      console.error('Failed to fetch module config:', error);
      // Keep defaults on error
    }
  }, [token]);

  const fetchOrganization = useCallback(async () => {
    if (!token || !user || user.role === 'super_admin') {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API}/organizations/my`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setOrganization(response.data);
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    }
  }, [token, user?.role]);

  const refreshOrganization = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchModuleConfig(), fetchOrganization()]);
    setLoading(false);
  }, [fetchModuleConfig, fetchOrganization]);

  useEffect(() => {
    const init = async () => {
      if (token) {
        setLoading(true);
        await Promise.all([fetchModuleConfig(), fetchOrganization()]);
        setLoading(false);
      } else {
        setLoading(false);
      }
    };
    init();
  }, [token, fetchModuleConfig, fetchOrganization]);

  // Get timezone from moduleConfig (already includes org timezone) or organization
  const timezone = moduleConfig?.timezone || organization?.timezone || 'UTC';

  return (
    <OrganizationContext.Provider value={{
      organization,
      moduleConfig,
      timezone,
      loading,
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
      refreshOrganization: () => {},
    };
  }
  return context;
};

export default OrganizationContext;
