/**
 * ApprovalActions — bulk action toolbar with shared comment dialog for reject.
 *
 * Used inside the ApprovalSection's Pending tab. All approve/reject calls are
 * routed through the centralized `useApprovalActions` hook so audit trail and
 * loading states stay consistent.
 */
import React, { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
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
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function ApprovalActions({
  selectedIds,
  busy,
  onApproveSelected,
  onRejectSelected,
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');

  const count = selectedIds?.length || 0;
  const disabled = busy || count === 0;

  const handleConfirmReject = async () => {
    await onRejectSelected(rejectComment.trim() || null);
    setRejectComment('');
    setRejectOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-muted mr-1" data-testid="approval-selection-count">
          {count} selected
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onApproveSelected(null)}
          data-testid="bulk-approve-button"
          className="gap-1"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          Approve {count > 0 ? `(${count})` : 'All'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => setRejectOpen(true)}
          data-testid="bulk-reject-button"
          className="gap-1"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 text-red-600" />}
          Reject {count > 0 ? `(${count})` : 'All'}
        </Button>
      </div>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {count} request{count === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              The same comment will be applied to every selected request. This
              action cannot be undone — the records will be moved to the
              Rejected tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for rejection (optional)"
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            rows={3}
            data-testid="bulk-reject-comment"
            className="bg-stone-50"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="bulk-reject-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              className="bg-red-600 hover:bg-red-700"
              data-testid="bulk-reject-confirm"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
