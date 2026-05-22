/**
 * ViewApprovalDialog — read-only view of an approval request, plus inline
 * approve/reject controls when caller passes `canDecide`.
 *
 * Pure presentational; all decisions are dispatched up to the parent's
 * useApprovalActions handlers.
 */
import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { CheckCircle2, XCircle, Calendar, User, Factory } from 'lucide-react';

export default function ViewApprovalDialog({
  request,
  facilities = [],
  onClose,
  onApprove,
  onReject,
  busy,
  canDecide,
  defaultMode = 'view',
}) {
  const [mode, setMode] = useState(defaultMode);
  const [comment, setComment] = useState('');

  useEffect(() => {
    setMode(defaultMode);
    setComment('');
  }, [defaultMode, request?.id]);

  if (!request) return null;
  const meta = request.metadata || {};
  const snap = request.entity_snapshot || {};
  const facility = facilities.find((f) => f.id === meta.facility_id);
  const total = snap.total_emissions ?? snap.co2e_emissions ?? 0;

  const renderField = (label, value) => (
    <div className="grid grid-cols-3 gap-2 text-sm py-1.5 border-b border-stone-100 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="col-span-2 font-medium text-text-primary break-words">{value || '—'}</span>
    </div>
  );

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="approval-view-dialog">
        <DialogHeader>
          <DialogTitle>Approval request — {request.request_type}</DialogTitle>
        </DialogHeader>

        {/* Meta header */}
        <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-stone-50 text-xs">
          <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-text-muted" />{request.submitted_by_name || request.submitted_by_email}</div>
          <div className="flex items-center gap-2"><Factory className="w-3.5 h-3.5 text-text-muted" />{facility?.name || '—'}</div>
          <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-text-muted" />{request.submitted_at ? new Date(request.submitted_at).toLocaleString() : '—'}</div>
        </div>

        {/* Snapshot fields */}
        <div className="mt-3">
          {renderField('Scope', meta.scope)}
          {renderField('Category', meta.category)}
          {renderField('Sub-category', snap.sub_category)}
          {renderField('Reporting Period', snap.reporting_period)}
          {renderField('Quantity', snap.quantity != null ? `${snap.quantity} ${snap.quantity_unit || ''}`.trim() : null)}
          {renderField('Total Emissions (tCO₂e)', Number(total).toFixed(6))}
          {snap.notes && renderField('Notes', snap.notes)}
          {request.final_comment && renderField('Final comment', request.final_comment)}
        </div>

        {/* Decide controls */}
        {canDecide && (
          <div className="mt-4 pt-4 border-t border-stone-200">
            {mode === 'reject' ? (
              <div className="space-y-2">
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  rows={3}
                  data-testid="approval-reject-comment"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setMode('view')} disabled={busy}>Cancel</Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => onReject?.(request.id, comment.trim() || null)}
                    disabled={busy}
                    data-testid="approval-reject-confirm"
                  >
                    <XCircle className="w-4 h-4 mr-1" />Confirm reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Close</Button>
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => setMode('reject')}
                  disabled={busy}
                  data-testid="approval-reject-toggle"
                >
                  <XCircle className="w-4 h-4 mr-1" />Reject
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => onApprove?.(request.id)}
                  disabled={busy}
                  data-testid="approval-approve-confirm"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />Approve
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
