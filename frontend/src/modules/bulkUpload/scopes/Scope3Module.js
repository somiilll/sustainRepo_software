/**
 * Scope 3 Bulk Upload Module
 *
 * Status: AVAILABLE — fully wired to backend `/api/bulk-upload/scope3/*`.
 * Used by all organizations whose `enabled_access` includes 'scope1_2_3'.
 */
import bulkUploadRegistry from '../core/registry';
import { defaultTransformValidationResponse } from '../shared/responseTransformer';
import { buildFileOnlyPayload } from '../shared/payloadBuilders';
import { validateFile } from '../shared/normalizers';

const Scope3Module = {
  id: 'scope3',
  label: 'Scope 3',
  description: 'Value chain emissions (C1–C15) — supplier spend, employee commuting, capital goods, etc.',
  templateFilenamePrefix: 'Scope3_BulkUpload_Template',
  errorReportFilenamePrefix: 'Scope3_Error_Report',
  requiredAccess: ['scope1_2_3'],

  endpoints: {
    template: '/api/bulk-upload/scope3/template/download',
    upload: '/api/bulk-upload/scope3/upload',
    save: '/api/bulk-upload/scope3/jobs/{jobId}/save',
    errors: '/api/bulk-upload/scope3/jobs/{jobId}/errors/download',
    jobs: '/api/bulk-upload/scope3/jobs',
  },

  validateFile,
  buildUploadPayload: buildFileOnlyPayload,
  transformValidationResponse: (data) => defaultTransformValidationResponse(data, { templateType: 'scope3' }),
};

bulkUploadRegistry.register(Scope3Module);

export default Scope3Module;
