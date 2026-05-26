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
 *
 * These helpers normalize V2 records into the shape the table/dialog
 * historically expected, with V1 fallbacks so legacy records keep working.
 */

/** Return 'create' | 'update' | 'delete' from approval_status. */
export function getRequestType(record) {
  if (!record) return 'create';
  if (record.request_type) return record.request_type; // legacy V1
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
  return record.original_record_id || record.entity_id || record.id;
}

/** Read scope from V2 flat record or fall back to legacy metadata. */
export function getScope(record) {
  return record?.scope || record?.metadata?.scope || null;
}

/** Read category from V2 flat record or fall back to legacy metadata. */
export function getCategory(record) {
  return record?.category || record?.metadata?.category || null;
}

/** Read facility_id from V2 flat record or fall back to legacy metadata. */
export function getFacilityId(record) {
  return record?.facility_id || record?.metadata?.facility_id || null;
}

/**
 * V2 snapshots the current emission values flat on the record.
 * V1 nested them under entity_snapshot. Return the merged object.
 */
export function getSnapshot(record) {
  if (!record) return {};
  if (record.entity_snapshot) return record.entity_snapshot;
  return record; // V2: flat
}

/** Return the original snapshot for update requests (V1 + V2 both set it). */
export function getOriginalSnapshot(record) {
  return record?.original_snapshot || {};
}

/**
 * For rejected records, V2 stores the reason inside the last
 * version_history entry with action === 'rejected'.
 * V1 stored it as `final_comment`.
 */
export function getRejectionReason(record) {
  if (!record) return null;
  if (record.final_comment) return record.final_comment;
  const history = Array.isArray(record.version_history) ? record.version_history : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const entry = history[i];
    if (entry?.action === 'rejected' && entry.rejection_reason) {
      return entry.rejection_reason;
    }
  }
  return null;
}

/** Edit history while the record was pending (V2 only; V1 returns []). */
export function getEditHistory(record) {
  return Array.isArray(record?.edit_history) ? record.edit_history : [];
}

/**
 * Compute pretty status badge meta for any approval_status.
 * Returns { text, cls } or null.
 */
export function getApprovalBadge(approvalStatus) {
  switch (approvalStatus) {
    case 'pending_create':
      return { text: 'Pending for approval', cls: 'bg-amber-100 text-amber-700' };
    case 'pending_update':
      return { text: 'Pending update', cls: 'bg-amber-100 text-amber-700' };
    case 'pending_delete':
      return { text: 'Pending delete', cls: 'bg-red-100 text-red-700' };
    case 'rejected_create':
      return { text: 'Rejected (create)', cls: 'bg-red-100 text-red-700' };
    case 'rejected_update':
      return { text: 'Rejected (update)', cls: 'bg-red-100 text-red-700' };
    case 'rejected_delete':
      return { text: 'Rejected (delete)', cls: 'bg-red-100 text-red-700' };
    default:
      return null;
  }
}
