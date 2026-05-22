/**
 * BulkUpload Normalizers — pure functions that turn raw cell values
 * (or backend-returned fragments) into canonical UI-friendly shapes.
 *
 * Note: Server is the authoritative source for row-level validation.
 * These client-side normalizers only:
 *   - Validate that the file is a `.xlsx`.
 *   - Normalize per-row backend response items into the UI table shape.
 *   - Format reporting periods, numbers, and emission columns for display.
 *
 * NO business validation logic should live here — that belongs to the
 * backend's bulk-upload validators.
 */
import { ACCEPTED_FILE_EXTENSION, ROW_STATUS } from '../core/bulkUploadConstants';

/**
 * File-level pre-flight check before kicking off the upload.
 * @returns {string | null} Error message or null if valid.
 */
export function validateFile(file) {
  if (!file) return 'No file selected';
  if (!file.name.toLowerCase().endsWith(ACCEPTED_FILE_EXTENSION)) {
    return `Please upload an Excel file (${ACCEPTED_FILE_EXTENSION})`;
  }
  return null;
}

/**
 * Normalize a single backend row result → UI row shape.
 * Backend shape: { sheet, row, success, row_data, errors: [{column,message,suggestion}] }
 * UI shape:      { sheet, row_number, status, row_data, errors }
 */
export function normalizeRowResult(rawRow) {
  return {
    sheet: rawRow?.sheet ?? null,
    row_number: rawRow?.row ?? null,
    status: rawRow?.success ? ROW_STATUS.VALID : ROW_STATUS.INVALID,
    row_data: rawRow?.row_data || {},
    errors: Array.isArray(rawRow?.errors)
      ? rawRow.errors.map((e) => ({
          column: e?.column ?? '',
          message: e?.message ?? '',
          suggestion: e?.suggestion ?? '',
        }))
      : [],
  };
}

/**
 * Normalize a categories_processed array into a summary dict
 * keyed by category name. Used by the UI to display per-category breakdowns.
 */
export function normalizeCategoriesProcessed(categoriesArray) {
  if (!Array.isArray(categoriesArray)) return {};
  return categoriesArray.reduce((acc, cat) => {
    acc[cat] = { category_name: cat, valid_rows: 0, invalid_rows: 0 };
    return acc;
  }, {});
}

/**
 * Format an emissions number for display (always 2 decimals, default 0).
 */
export function formatEmissions(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '0.00';
  return Number(value).toFixed(2);
}

/**
 * Truncate a long upload_id for display (first 8 chars + …).
 */
export function shortUploadId(id) {
  if (!id) return '';
  return `${String(id).slice(0, 8)}…`;
}
