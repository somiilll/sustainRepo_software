/**
 * BulkUpload Payload Builders — construct the multipart/form-data payloads
 * sent to backend upload endpoints. Each scope can override this if it
 * needs additional fields (facility_id, override flags, etc.) but most
 * uploads are simple file-only requests.
 */

/**
 * Build a basic FormData containing just the user-selected file.
 * Used by Scope 3 (current behavior). Scope 1/Scope 2 may extend this.
 */
export function buildFileOnlyPayload(file) {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/**
 * Build a payload that includes extra metadata alongside the file.
 * Useful for future Scope 1 / Scope 2 endpoints if they require facility
 * scoping, override flags, etc.
 */
export function buildPayloadWithMeta(file, meta = {}) {
  const formData = new FormData();
  formData.append('file', file);
  Object.entries(meta).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') formData.append(k, String(v));
  });
  return formData;
}
