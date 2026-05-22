/**
 * Centralized GHG permission resolver.
 *
 * Exposes a single object describing what the current user can do — built
 * from the user's role and their organization's `enabled_access` list.
 *
 * Removes scattered `if (user.role === ...)` checks across the GHG module.
 */
import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function useGHGPermissions() {
  const { user, getAuthHeader } = useAuth();
  const [enabledAccess, setEnabledAccess] = useState(null);
  const [approvalEnabled, setApprovalEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || user.role === 'super_admin' || !user.organization_id) {
        setEnabledAccess([]);
        setApprovalEnabled(false);
        setLoading(false);
        return;
      }
      try {
        const { data } = await axios.get(`${API}/organizations/my`, {
          headers: getAuthHeader(),
        });
        if (cancelled) return;
        setEnabledAccess(data?.enabled_access || []);
        setApprovalEnabled(!!data?.approval_workflow_enabled);
      } catch {
        if (!cancelled) {
          setEnabledAccess([]);
          setApprovalEnabled(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, user?.organization_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const role = user?.role;
  const isSuperAdmin = role === 'super_admin';
  const isAdmin = role === 'admin' || isSuperAdmin;

  const has = (key) => Array.isArray(enabledAccess) && enabledAccess.includes(key);
  const hasScope12 = isSuperAdmin || has('scope1_2') || has('scope1_2_3');
  const hasScope123 = isSuperAdmin || has('scope1_2_3');

  return {
    loading,
    role,
    isAdmin,
    isSuperAdmin,
    enabledAccess: enabledAccess || [],
    approvalEnabled,

    canViewScope1: hasScope12,
    canViewScope2: hasScope12,
    canViewScope3: hasScope123,
    canViewBiogenic: hasScope12 || hasScope123,
    canViewApprovals: isAdmin && approvalEnabled,

    canApprove: isAdmin,
    canReject: isAdmin,
    canBulkApprove: isAdmin,
    canBulkReject: isAdmin,
    canEditApproval: isAdmin,
  };
}
