/**
 * BulkUpload Constants — shared error codes, statuses, and labels.
 */

// Module statuses (returned from registry queries)
export const MODULE_STATUS = {
  AVAILABLE: 'available',     // Backend supports + org has access
  RESTRICTED: 'restricted',   // Backend supports but org lacks access
  NOT_IMPLEMENTED: 'not_implemented', // Module exists but backend endpoint not ready
};

// Row validation statuses (mirrors backend response)
export const ROW_STATUS = {
  VALID: 'valid',
  INVALID: 'invalid',
};

// File validation
export const ACCEPTED_FILE_EXTENSION = '.xlsx';
export const ACCEPTED_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
