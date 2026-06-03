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
  label: 'Emissions',
  description: 'Bulk upload emissions data for Scope 1, 2, and 3 categories',
  templateFilenamePrefix: 'BulkUpload_Template',
  errorReportFilenamePrefix: 'Error_Report',
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
