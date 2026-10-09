import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';

export const SupplierAssignmentManagerDialog = ({ open, onOpenChange, title, rows, loading, updatingId, unlockingId, onToggle, onUnlock, testIdPrefix }) => {
  const [pendingAssignments, setPendingAssignments] = useState({});
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (open) setPendingAssignments(Object.fromEntries(rows.map((row) => [row.supplier_relationship_id, row.is_assigned]))); }, [open, rows]);
  const changes = useMemo(() => rows.filter((row) => pendingAssignments[row.supplier_relationship_id] !== undefined && pendingAssignments[row.supplier_relationship_id] !== row.is_assigned), [pendingAssignments, rows]);
  const confirmChanges = async () => {
    setConfirming(true);
    try { for (const row of changes) await onToggle(row, pendingAssignments[row.supplier_relationship_id]); onOpenChange(false); }
    finally { setConfirming(false); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto" data-testid={`${testIdPrefix}-assignment-dialog`}>
      <DialogHeader>
        <DialogTitle data-testid={`${testIdPrefix}-assignment-dialog-title`}>Manage suppliers — {title}</DialogTitle>
        <DialogDescription data-testid={`${testIdPrefix}-assignment-dialog-description`}>Submitted or completed supplier work remains assigned for audit continuity.</DialogDescription>
      </DialogHeader>
      {loading ? <p className="py-8 text-sm text-stone-500" data-testid={`${testIdPrefix}-assignment-loading`}>Loading suppliers…</p> : (
        <div className="divide-y divide-stone-100" data-testid={`${testIdPrefix}-assignment-list`}>
          {rows.map((row) => {
            const locked = row.is_assigned && !row.can_unassign;
            const status = row.status === 'submitted' ? 'Submitted' : row.status === 'completed' ? 'Completed' : row.status === 'in_progress' ? 'In progress' : row.is_assigned ? 'Assigned' : 'Not assigned';
            const isUnlocking = unlockingId === row.supplier_relationship_id;
            const checked = pendingAssignments[row.supplier_relationship_id] ?? row.is_assigned;
            return <div key={row.supplier_relationship_id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`${testIdPrefix}-assignment-${row.supplier_relationship_id}`}>
              <Checkbox checked={checked} disabled={locked || confirming || updatingId === row.supplier_relationship_id} onCheckedChange={(nextChecked) => setPendingAssignments((current) => ({ ...current, [row.supplier_relationship_id]: Boolean(nextChecked) }))} data-testid={`${testIdPrefix}-assignment-toggle-${row.supplier_relationship_id}`} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900" data-testid={`${testIdPrefix}-assignment-supplier-${row.supplier_relationship_id}`}>{row.supplier_name}</span>
              <Badge variant="outline" className={locked ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : row.is_assigned ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-stone-200 bg-stone-50 text-stone-600'} data-testid={`${testIdPrefix}-assignment-status-${row.supplier_relationship_id}`}>{status}{locked ? ' · locked' : ''}</Badge>
              {row.can_unlock && onUnlock && <Button variant="outline" size="sm" disabled={isUnlocking} onClick={() => onUnlock(row)} data-testid={`${testIdPrefix}-assignment-unlock-${row.supplier_relationship_id}`}>{isUnlocking ? 'Unlocking…' : 'Unlock'}</Button>}
            </div>;
          })}
        </div>
      )}
      {!loading && <DialogFooter className="border-t border-stone-200 pt-4"><Button variant="outline" onClick={() => onOpenChange(false)} data-testid={`${testIdPrefix}-assignment-cancel-button`}>Cancel</Button><Button disabled={confirming || changes.length === 0} onClick={confirmChanges} data-testid={`${testIdPrefix}-assignment-confirm-button`}>{confirming ? 'Confirming…' : `Confirm ${changes.length} change${changes.length === 1 ? '' : 's'}`}</Button></DialogFooter>}
    </DialogContent>
  </Dialog>
  };