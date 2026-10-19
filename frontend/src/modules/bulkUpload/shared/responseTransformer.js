/**
 * BulkUpload Response Transformer — converts the raw backend `/upload`
 * response into the canonical UI shape consumed by ValidationResultsCard
 * and ValidationResultsTable.
 *
 *   Backend shape:
 *     {
 *       job_id, total_rows, success_count, error_count,
 *       categories_processed: [string],
 *       total_emissions_tco2e: number,
 *       results: [{ sheet, row, success, row_data, errors }]
 *     }
 *
 *   UI shape:
 *     {
 *       upload_id, template_type,
 *       summary: { total_rows, valid_rows, invalid_rows, categories: {} },
 *       rows: [{ sheet, row_number, status, row_data, errors }],
 *       total_emissions_tco2e, is_validated_only
 *     }
 *
 * If a scope module needs a different mapping (e.g., Scope 1 has no
 * `categories_processed`), it can override this function via its module
 * config (`module.transformValidationResponse`).
 */
import { normalizeRowResult, normalizeCategoriesProcessed } from './normalizers';

export function defaultTransformValidationResponse(rawData, { templateType = 'unknown' } = {}) {
  return {
    upload_id: rawData?.job_id,
    template_type: templateType,
    summary: {
      total_rows: rawData?.total_rows ?? 0,
      valid_rows: rawData?.success_count ?? 0,
      invalid_rows: rawData?.error_count ?? 0,
      categories: normalizeCategoriesProcessed(rawData?.categories_processed),
    },
    rows: Array.isArray(rawData?.results)
      ? rawData.results.map(normalizeRowResult)
      : [],
    total_emissions_tco2e: rawData?.total_emissions_tco2e,
    preview: rawData?.preview ?? null,
    is_validated_only: true,
  };
}
