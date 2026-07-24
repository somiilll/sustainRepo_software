/**
 * useKPIAccess Hook
 * 
 * Provides KPI assignment-based access control information.
 * Used to filter UI elements based on user's assigned GHG scopes and facilities.
 * 
 * Features:
 * - Fetches user's GHG access (allowed scopes, facility restrictions)
 * - Fetches facility access for any KPI category
 * - Caches access info to avoid repeated API calls
 * - Provides helper functions to check specific access
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Hook for getting GHG emissions access control
 */
export function useGHGAccess(reportingPeriod = null) {
  const { token, user } = useAuth();
  const [accessInfo, setAccessInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccess = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = reportingPeriod ? { reporting_period: reportingPeriod } : {};
      const response = await axios.get(`${API}/api/esg-assignments/kpi-access/ghg`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      setAccessInfo(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch GHG access:', err);
      setError(err);
      // Default to full access on error (fail-open for better UX)
      setAccessInfo({
        has_full_access: true,
        allowed_scopes: ['scope1', 'scope2', 'scope3', 'biogenic'],
        allowed_subcategories: [],
        facility_restrictions: {},
        has_sinks_access: true,
      });
    } finally {
      setLoading(false);
    }
  }, [token, reportingPeriod]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  // Helper functions
  const canAccessScope = useCallback((scope) => {
    if (!accessInfo) return true;
    if (accessInfo.has_full_access) return true;
    return accessInfo.allowed_scopes.includes(scope.toLowerCase());
  }, [accessInfo]);

  const canAccessFacility = useCallback((scope, facilityId) => {
    if (!accessInfo) return true;
    if (accessInfo.has_full_access) return true;
    
    const restrictions = accessInfo.facility_restrictions[scope.toLowerCase()];
    if (restrictions === null || restrictions === undefined) return true;
    return restrictions.includes(facilityId);
  }, [accessInfo]);

  const canAccessSinks = useMemo(() => {
    if (!accessInfo) return true;
    return accessInfo.has_full_access || accessInfo.has_sinks_access;
  }, [accessInfo]);

  // Filter facilities based on scope restrictions
  const filterFacilitiesByScope = useCallback((facilities, scope) => {
    if (!accessInfo) return facilities;
    if (accessInfo.has_full_access) return facilities;
    
    const restrictions = accessInfo.facility_restrictions[scope.toLowerCase()];
    if (restrictions === null || restrictions === undefined) return facilities;
    
    return facilities.filter(f => restrictions.includes(f.id));
  }, [accessInfo]);

  return {
    accessInfo,
    loading,
    error,
    refetch: fetchAccess,
    // Helper functions
    canAccessScope,
    canAccessFacility,
    canAccessSinks,
    filterFacilitiesByScope,
    // Quick access
    hasFullAccess: accessInfo?.has_full_access ?? true,
    allowedScopes: accessInfo?.allowed_scopes ?? ['scope1', 'scope2', 'scope3', 'biogenic'],
  };
}

/**
 * Hook for getting facility access for any KPI category
 */
export function useFacilityAccess(category, subcategory = null, reportingPeriod = null) {
  const { token } = useAuth();
  const [accessInfo, setAccessInfo] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccess = useCallback(async () => {
    if (!token || !category) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const params = { category };
      if (subcategory) params.subcategory = subcategory;
      if (reportingPeriod) params.reporting_period = reportingPeriod;

      // Fetch access info and facility list in parallel
      const [accessRes, facilitiesRes] = await Promise.all([
        axios.get(`${API}/api/esg-assignments/kpi-access/facilities`, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }),
        axios.get(`${API}/api/esg-assignments/kpi-access/facilities/list`, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        }),
      ]);

      setAccessInfo(accessRes.data);
      setFacilities(facilitiesRes.data.facilities || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch facility access:', err);
      setError(err);
      // Default to full access on error
      setAccessInfo({
        has_full_access: true,
        allowed_facility_ids: null,
        assignment_level: null,
      });
    } finally {
      setLoading(false);
    }
  }, [token, category, subcategory, reportingPeriod]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  // Helper function to check facility access
  const canAccessFacility = useCallback((facilityId) => {
    if (!accessInfo) return true;
    if (accessInfo.has_full_access) return true;
    if (accessInfo.allowed_facility_ids === null) return true;
    return accessInfo.allowed_facility_ids.includes(facilityId);
  }, [accessInfo]);

  return {
    accessInfo,
    facilities,
    loading,
    error,
    refetch: fetchAccess,
    canAccessFacility,
    hasFullAccess: accessInfo?.has_full_access ?? true,
    assignmentLevel: accessInfo?.assignment_level,
  };
}

/**
 * Hook for getting assignment progress
 */
export function useAssignmentProgress(assignmentId) {
  const { token } = useAuth();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProgress = useCallback(async () => {
    if (!token || !assignmentId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(
        `${API}/api/esg-assignments/assignments/${assignmentId}/progress`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProgress(response.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch assignment progress:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [token, assignmentId]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return {
    progress,
    loading,
    error,
    refetch: fetchProgress,
    // Computed values
    isComplete: progress?.is_complete ?? false,
    totalFacilities: progress?.total_facilities ?? 0,
    facilitiesWithData: progress?.facilities_with_data ?? 0,
    completionPercentage: progress?.total_facilities 
      ? Math.round((progress.facilities_with_data / progress.total_facilities) * 100) 
      : 0,
  };
}

export default useGHGAccess;
