/**
 * TargetSettingsPage — orchestrator for the Target Setting tab.
 *
 * Owns top-level state (modal open, editing record), uses `useTargets`
 * for CRUD, and gates write actions on user role.
 */
import React, { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Plus, Target as TargetIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import useTargets from '../hooks/useTargets';
import useReportingYearFormat from '../hooks/useReportingYearFormat';
import TargetTable from '../components/TargetTable';
import TargetFormModal from '../components/TargetFormModal';

export default function TargetSettingsPage({ organization, currentUser }) {
  const role = currentUser?.role;
  const canManage = role === 'admin' || role === 'super_admin';

  const { items, loading, create, update, remove } = useTargets({ enabled: true });
  const { sampleYears } = useReportingYearFormat(organization);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const hasScope3 = (organization?.enabled_access || []).some(
    (a) => a === 'scope1_2_3' || a === 'scope3'
  );

  const openAdd = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (t) => {
    setEditing(t);
    setModalOpen(true);
  };
  const closeModal = () => {
    if (busy) return;
    setModalOpen(false);
    setEditing(null);
  };

  const handleSubmit = async (payload) => {
    setBusy(true);
    try {
      if (editing?.id) {
        await update(editing.id, payload);
        toast.success('Target updated');
      } else {
        await create(payload);
        toast.success('Target created');
      }
      closeModal();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await remove(confirmDelete.id);
      toast.success('Target deleted');
      setConfirmDelete(null);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="target-settings-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TargetIcon className="w-5 h-5 text-emerald-600" />
          <h2 className="text-xl font-heading font-bold text-text-primary">Target Setting</h2>
        </div>
        {canManage && (
          <Button
            onClick={openAdd}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="target-add-btn"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Target
          </Button>
        )}
      </div>

      {!canManage && (
        <p className="text-xs text-text-muted">
          You have read-only access. Contact your admin to configure targets.
        </p>
      )}

      <TargetTable
        rows={items}
        onEdit={openEdit}
        onDelete={(t) => setConfirmDelete(t)}
        canManage={canManage}
        loading={loading}
      />

      <TargetFormModal
        open={modalOpen}
        onClose={closeModal}
        initial={editing}
        yearOptions={sampleYears}
        hasScope3={hasScope3}
        onSubmit={handleSubmit}
        busy={busy}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent data-testid="target-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this target?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-text-primary">{confirmDelete?.name}</span> will be permanently
              removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={busy}
              data-testid="target-delete-confirm-btn"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
