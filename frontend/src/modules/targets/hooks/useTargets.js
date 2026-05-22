/**
 * useTargets — fetch + cache organization targets.
 *
 * Exposes refetch + CRUD action wrappers. Errors surface via toast at the
 * call site (no implicit toast inside the hook).
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import {
  createTarget,
  deleteTarget,
  listTargets,
  updateTarget,
} from '../services/target-service';

export default function useTargets({ enabled = true } = {}) {
  const { getAuthHeader } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listTargets({ getAuthHeader });
      setItems(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [enabled, getAuthHeader]);

  useEffect(() => { refetch(); }, [refetch]);

  const create = useCallback(
    async (payload) => {
      const created = await createTarget({ getAuthHeader, payload });
      await refetch();
      return created;
    },
    [getAuthHeader, refetch]
  );

  const update = useCallback(
    async (id, payload) => {
      const updated = await updateTarget({ getAuthHeader, id, payload });
      await refetch();
      return updated;
    },
    [getAuthHeader, refetch]
  );

  const remove = useCallback(
    async (id) => {
      await deleteTarget({ getAuthHeader, id });
      await refetch();
    },
    [getAuthHeader, refetch]
  );

  return { items, loading, error, refetch, create, update, remove };
}
