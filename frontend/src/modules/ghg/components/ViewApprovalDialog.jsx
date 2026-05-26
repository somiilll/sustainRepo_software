/**
 * ViewApprovalDialog — read-only view of a V2 approval request, with
 * inline approve/reject controls when caller passes `canDecide`.
 *
 * Supports the V2 schema (flat fields on the pending_records doc):
 * - approval_status: 'pending_create' | 'pending_update' | 'pending_delete'
 *                  | 'rejected_create' | 'rejected_update' | 'rejected_delete'
 * - All emission fields (scope, category, quantity, etc.) live at the top
 *   level of the record.
 * - `original_snapshot` carries pre-edit values for update requests.
 * - `edit_history` carries edits made while pending.
 *
 * Legacy V1 records (metadata + entity_snapshot) keep working via
 * `approvalSchema` helpers.
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
import {
  CheckCircle2,
  XCircle,
  Calendar,
  User,
  Factory,
  Trash2,
  Edit,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  getRequestType,
  getScope,
  getCategory,
  getFacilityId,
  getSnapshot,
  getOriginalSnapshot,
  getEditHistory,
  getApprovalBadge,
} from '../utils/approvalSchema';

const FIELDS_TO_COMPARE = [
  'quantity',
  'quantity_unit',
  'category',
  'sub_category',
  'fuel_type',
  'fuel_name',
  'reporting_period',
  'responsible_person',
  'notes',
  'total_emissions',
  'co2e_emissions',
  'calculation_method_scope3',
  'supplier_name',
  'customer_name',
];

const FIELD_LABELS = {
  quantity: 'Quantity',
  quantity_unit: 'Unit',
  category: 'Category',
  sub_category: 'Activity',
  fuel_type: 'Fuel Type',
  fuel_name: 'Fuel Name',
  reporting_period: 'Reporting Period',
  responsible_person: 'Responsible Person',
  notes: 'Notes',
  total_emissions: 'Total Emissions (tCO₂e)',
  co2e_emissions: 'CO₂e Emissions',
  calculation_method_scope3: 'Calculation Method',
  supplier_name: 'Supplier',
  customer_name: 'Customer',
};

function formatValue(val) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') return val.toFixed(4);
  if (typeof val === 'object') {
    if (val.value !== undefined) return `${val.value} ${val.unit || ''}`.trim();
    return JSON.stringify(val);
  }
  return String(val);
}

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
  const [showEditHistory, setShowEditHistory] = useState(false);

  useEffect(() => {
    setMode(defaultMode);
    setComment('');
    setShowEditHistory(false);
  }, [defaultMode, request?.id]);

  if (!request) return null;

  const requestType = getRequestType(request);
  const isDeleteRequest = requestType === 'delete';
  const isUpdateRequest = requestType === 'update';
  const isCreateRequest = requestType === 'create';

  const snap = getSnapshot(request);
  const originalSnap = getOriginalSnapshot(request);
  const scope = getScope(request);
  const category = getCategory(request);
  const facilityId = getFacilityId(request);
  const facility = facilities.find((f) => f.id === facilityId);
  const total = snap.total_emissions ?? snap.co2e_emissions ?? 0;
  const editHistory = getEditHistory(request);
  const badge = getApprovalBadge(request.approval_status);

  const renderField = (label, value) => (
    <div className="grid grid-cols-3 gap-2 text-sm py-1.5 border-b border-stone-100 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="col-span-2 font-medium text-text-primary break-words">{value || '—'}</span>
    </div>
  );

  // Compute field changes for update requests.
  const fieldChanges = (() => {
    if (!isUpdateRequest || !originalSnap || Object.keys(originalSnap).length === 0) return [];
    const changes = [];
    FIELDS_TO_COMPARE.forEach((field) => {
      const oldVal = originalSnap[field];
      const newVal = snap[field];
      if (formatValue(oldVal) !== formatValue(newVal)) {
        changes.push({
          field,
          label: FIELD_LABELS[field] || field,
          oldValue: oldVal,
          newValue: newVal,
        });
      }
    });
    return changes;
  })();

  const titleText = isDeleteRequest
    ? 'Deletion Request'
    : isUpdateRequest
    ? 'Update Request'
    : 'Create Request';

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        data-testid="approval-view-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDeleteRequest && <Trash2 className="w-5 h-5 text-red-500" />}
            {isUpdateRequest && <Edit className="w-5 h-5 text-blue-500" />}
            {isCreateRequest && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            <span>{titleText}</span>
            {badge && (
              <span
                className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded ${badge.cls}`}
                data-testid="approval-status-badge"
              >
                {badge.text}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Request type banner */}
        {isDeleteRequest && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <strong>This is a deletion request.</strong> The user is requesting to permanently delete
            this emission record.
          </div>
        )}

        {/* Meta header */}
        <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-stone-50 text-xs">
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-text-muted" />
            {request.submitted_by_name || request.submitted_by_email || '—'}
          </div>
          <div className="flex items-center gap-2">
            <Factory className="w-3.5 h-3.5 text-text-muted" />
            {facility?.name || '—'}
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-text-muted" />
            {request.submitted_at ? new Date(request.submitted_at).toLocaleString() : '—'}
          </div>
        </div>

        {/* Field changes for update requests */}
        {isUpdateRequest && fieldChanges.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-text-muted uppercase mb-2">Changes Made</p>
            <div className="space-y-2">
              {fieldChanges.map((change, idx) => (
                <div key={idx} className="bg-stone-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-text-primary mb-2">{change.label}</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-red-50 p-2 rounded border border-red-100">
                      <span className="text-xs text-red-600 font-medium block mb-1">Old Value</span>
                      <span className="text-red-800">{formatValue(change.oldValue)}</span>
                    </div>
                    <div className="bg-green-50 p-2 rounded border border-green-100">
                      <span className="text-xs text-green-600 font-medium block mb-1">New Value</span>
                      <span className="text-green-800">{formatValue(change.newValue)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit history while pending */}
        {editHistory.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowEditHistory(!showEditHistory)}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              data-testid="approval-edit-history-toggle"
            >
              <History className="w-4 h-4" />
              <span>
                Edit History ({editHistory.length} edit{editHistory.length > 1 ? 's' : ''} while
                pending)
              </span>
              {showEditHistory ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showEditHistory && (
              <div className="mt-2 space-y-2 border-l-2 border-blue-200 pl-3">
                {editHistory.map((edit, idx) => (
                  <div key={idx} className="text-xs bg-blue-50 p-2 rounded">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {edit.edited_by_name || edit.edited_by_email || '—'}
                      </span>
                      <span className="text-text-muted">·</span>
                      <span className="text-text-muted">
                        {edit.edited_at ? new Date(edit.edited_at).toLocaleString() : '—'}
                      </span>
                    </div>
                    <span className="text-blue-700">
                      {edit.changes_summary ||
                        `${edit.field_changes?.length || 0} field(s) changed`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Record details — always shown */}
        <div className="mt-3">
          <p className="text-xs font-semibold text-text-muted uppercase mb-2">
            {isDeleteRequest
              ? 'Record to be Deleted'
              : isUpdateRequest
              ? 'Updated Values'
              : 'Record Details'}
          </p>
          {renderField('Scope', scope)}
          {renderField('Category', category)}
          {renderField('Sub-category', snap.sub_category)}
          {renderField('Reporting Period', snap.reporting_period)}
          {renderField(
            'Total Emissions (tCO₂e)',
            total != null ? Number(total).toFixed(4) : null,
          )}
          {snap.fuel_name && renderField('Fuel', snap.fuel_name)}
          {snap.quantity != null &&
            renderField('Quantity', `${snap.quantity} ${snap.quantity_unit || ''}`)}
          {snap.calculation_method_scope3 &&
            renderField('Calculation Method', snap.calculation_method_scope3)}
          {snap.supplier_name && renderField('Supplier', snap.supplier_name)}
          {snap.customer_name && renderField('Customer', snap.customer_name)}
          {snap.responsible_person && renderField('Responsible Person', snap.responsible_person)}
          {snap.notes && renderField('Notes', snap.notes)}

          {/* Dynamic input values */}
          {snap.input_values && Object.keys(snap.input_values).length > 0 && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <p className="text-xs font-semibold text-text-muted mb-2">Input Values</p>
              {Object.entries(snap.input_values).map(
                ([key, val]) =>
                  val?.value !== undefined &&
                  val?.value !== null && (
                    <div key={key} className="text-sm py-1">
                      <span className="text-text-muted capitalize">
                        {key.replace(/_/g, ' ')}:{' '}
                      </span>
                      <span className="font-medium">
                        {val.value} {val.unit || ''}
                      </span>
                    </div>
                  ),
              )}
            </div>
          )}

          {/* Monthly data */}
          {Array.isArray(snap.monthly_totals) && snap.monthly_totals.length > 0 && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <p className="text-xs font-semibold text-text-muted mb-2">Monthly Data</p>
              <div className="grid grid-cols-4 gap-1 text-xs">
                {snap.monthly_totals.map((m, idx) => (
                  <div key={idx} className="bg-stone-50 p-1 rounded text-center">
                    <span className="text-text-muted">
                      {m.month?.substring(5) || `M${idx + 1}`}
                    </span>
                    <span className="block font-medium">{m.quantity || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                  <Button variant="outline" onClick={() => setMode('view')} disabled={busy}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700"
                    onClick={() => onReject?.(request.id, comment.trim() || null)}
                    disabled={busy}
                    data-testid="approval-reject-confirm"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Confirm reject
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} data-testid="approval-close-btn">
                  Close
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => setMode('reject')}
                  disabled={busy}
                  data-testid="approval-reject-toggle"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Reject
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => onApprove?.(request.id)}
                  disabled={busy}
                  data-testid="approval-approve-confirm"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  {isDeleteRequest ? 'Approve Deletion' : 'Approve'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
