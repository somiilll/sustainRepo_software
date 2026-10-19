/**
 * V2 Approval Schema helpers.
 *
 * V2 stores all approval data flat on the pending_records document:
 *  - approval_status: 'pending_create' | 'pending_update' | 'pending_delete'
 *                   | 'rejected_create' | 'rejected_update' | 'rejected_delete'
 *  - original_record_id: ref to approved record (for update/delete)
 *  - submitted_by_*, submitted_at
 *  - edit_history: edits while pending
 *  - version_history: lifecycle events incl. approve/reject
 *  - original_snapshot: pre-edit values (for updates)
 *  - All emission fields (scope, category, facility_id, reporting_period,
 *    quantity, sub_category, etc.) live at the top level.
 */

/** Return 'create' | 'update' | 'delete' from approval_status. */
export function getRequestType(record) {
  if (!record) return 'create';
  const s = record.approval_status || '';
  if (s.includes('update')) return 'update';
  if (s.includes('delete')) return 'delete';
  return 'create';
}

/** Return true when this is a pending status (any kind). */
export function isPending(record) {
  const s = record?.approval_status || '';
  return s.startsWith('pending_');
}

/** Return true when this is a rejected status (any kind). */
export function isRejected(record) {
  const s = record?.approval_status || '';
  return s.startsWith('rejected_');
}

/** Return id of the underlying emission record (for navigation to edit). */
export function getEntityId(record) {
  if (!record) return null;
  return record.original_record_id || record.id;
}

/** Read scope from a V2 flat record. */
export function getScope(record) {
  return record?.scope || null;
}

/** Read category from a V2 flat record. */
export function getCategory(record) {
  return record?.category || null;
}

/** Read facility_id from a V2 flat record. */
export function getFacilityId(record) {
  return record?.facility_id || null;
}

/**
 * V2 stores the current emission values flat on the record.
 * Return the record itself so consumers can read snap.field directly.
 */
export function getSnapshot(record) {
  return record || {};
}

/** Return the original snapshot for update requests. */
export function getOriginalSnapshot(record) {
  return record?.original_snapshot || {};
}

/**
 * For rejected records, the reason lives inside the last
 * version_history entry with action === 'rejected'.
 */
export function getRejectionReason(record) {
  if (!record) return null;
  const history = Array.isArray(record.version_history) ? record.version_history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry?.action === 'rejected' && entry.rejection_reason) {
      return entry.rejection_reason;
    }
  }
  return null;
}

/** Edit history while the record was pending. */
export function getEditHistory(record) {
  return Array.isArray(record?.edit_history) ? record.edit_history : [];
}

/**
 * Compute pretty status badge meta for any approval_status.
 * Returns { text, cls } or null.
 * 
 * Status display rules:
 * - No approval workflow (undefined/null): "Completed"
 * - Approved: "Completed, Approved"
 * - Pending approval: "Completed, Awaiting approval"
 * - Rejected: "Completed, Rejected"
 * - Legacy pending_* statuses: Keep existing behavior
 */
export function getApprovalBadge(approvalStatus) {
  switch (approvalStatus) {
    case 'pending_create':
      return { text: 'Awaiting approval', cls: 'bg-amber-100 text-amber-700' };
    case 'pending_update':
      return { text: 'Awaiting approval', cls: 'bg-amber-100 text-amber-700' };
    case 'pending_delete':
      return { text: 'Pending delete', cls: 'bg-red-100 text-red-700' };
    case 'rejected_create':
      return { text: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'rejected_update':
      return { text: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'rejected_delete':
      return { text: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'pending_approval':
    case 'pending':
      return { text: 'Awaiting approval', cls: 'bg-amber-100 text-amber-700' };
    case 'rejected':
      return { text: 'Rejected', cls: 'bg-red-100 text-red-700' };
    case 'approved':
      return { text: 'Approved', cls: 'bg-green-100 text-green-700' };
    default:
      // No approval workflow - return null (will be handled by Status column)
      return null;
  }
}

/**
 * Get full status display for Status column
 * Includes "Completed" prefix and handles no-workflow case
 */
export function getStatusDisplay(approvalStatus) {
  switch (approvalStatus) {
    case 'pending_create':
    case 'pending_update':
    case 'pending_approval':
    case 'pending':
      return { text: 'Completed, Awaiting approval', cls: 'bg-amber-100 text-amber-700' };
    case 'pending_delete':
      return { text: 'Pending delete', cls: 'bg-red-100 text-red-700' };
    case 'rejected_create':
    case 'rejected_update':
    case 'rejected_delete':
    case 'rejected':
      return { text: 'Completed, Rejected', cls: 'bg-red-100 text-red-700' };
    case 'approved':
      return { text: 'Completed, Approved', cls: 'bg-green-100 text-green-700' };
    default:
      // No approval workflow - just "Completed" (green like Approved)
      return { text: 'Completed', cls: 'bg-green-100 text-green-700' };
  }
}
