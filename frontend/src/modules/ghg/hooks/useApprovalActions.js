/**
 * useApprovalActions — single-source orchestration for approve/reject flows.
 *
 * Components never call the approval API directly. They call this hook so
 * that toast feedback, loading state, and refetch invalidation stay
 * consistent.
 *
 * Exposes:
 *   - approveOne(id)
 *   - rejectOne(id, comment)
 *   - approveMany(ids)
 *   - rejectMany(ids, comment)
 *   - busy            — boolean while any action is in flight
 *   - lastAction      — { kind, ids, ok } summary of the most recent run
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { decideApproval } from '../services/approval-service';

export default function useApprovalActions({ onSettled } = {}) {
  const { getAuthHeader } = useAuth();
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState(null);

  const _decide = (action) => async (id, comment) => {
    setBusy(true);
    try {
      await decideApproval({ requestId: id, action, comment, getAuthHeader });
      setLastAction({ kind: action, ids: [id], ok: true });
      toast.success(action === 'approve' ? 'Request approved' : 'Request rejected');
      if (onSettled) await onSettled({ action, ids: [id] });
      return true;
    } catch (e) {
      const detail = e?.response?.data?.detail || e.message || 'Action failed';
      toast.error(detail);
      setLastAction({ kind: action, ids: [id], ok: false });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const _decideMany = (action) => async (ids, comment) => {
    if (!ids?.length) return;
    setBusy(true);
    let okCount = 0;
    let failCount = 0;
    for (const id of ids) {
      try {
        await decideApproval({ requestId: id, action, comment, getAuthHeader });
        okCount += 1;
      } catch {
        failCount += 1;
      }
    }
    if (okCount && !failCount) {
      toast.success(`${okCount} request(s) ${action === 'approve' ? 'approved' : 'rejected'}`);
    } else if (okCount && failCount) {
      toast.warning(`${okCount} succeeded, ${failCount} failed`);
    } else {
      toast.error(`Failed to ${action} all requests`);
    }
    setLastAction({ kind: `${action}-many`, ids, ok: failCount === 0 });
    if (onSettled) await onSettled({ action, ids });
    setBusy(false);
  };

  return {
    busy,
    lastAction,
    approveOne: _decide('approve'),
    rejectOne: _decide('reject'),
    approveMany: _decideMany('approve'),
    rejectMany: _decideMany('reject'),
  };
}
