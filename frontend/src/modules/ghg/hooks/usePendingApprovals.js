/**
 * usePendingApprovals — admin-only pending approvals + lightweight count.
 *
 * Fetches once on mount and exposes a `refetch` for explicit refreshes
 * (no aggressive polling). Other components can subscribe to the returned
 * count for the dashboard bell badge.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { getPendingCount, listApprovals } from '../services/approval-service';

export default function usePendingApprovals({ enabled = true, status } = {}) {
  const { getAuthHeader } = useAuth();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refetchCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const c = await getPendingCount({ getAuthHeader });
      setCount(c);
    } catch (e) {
      setError(e);
    }
  }, [enabled, getAuthHeader]);

  const refetchList = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await listApprovals({ status, getAuthHeader });
      setItems(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [enabled, getAuthHeader, status]);

  useEffect(() => {
    refetchCount();
  }, [refetchCount]);

  useEffect(() => {
    if (status !== undefined) refetchList();
  }, [refetchList, status]);

  return {
    count,
    items,
    loading,
    error,
    refetchCount,
    refetchList,
    refetch: async () => {
      await Promise.all([refetchCount(), status !== undefined ? refetchList() : null]);
    },
  };
}
