/**
 * Scope 1 Bulk Upload Module
 *
 * Status: NOT_IMPLEMENTED — backend endpoints not yet built.
 * The module is registered so the UI can show a "Coming soon" tab/card
 * for Scope 1+2 organizations. Once backend ships endpoints, flip the
 * `notImplemented` flag to `false` and the UI will activate it
 * automatically — no further code changes required in the hook or page.
 */
import bulkUploadRegistry from '../core/registry';
import { defaultTransformValidationResponse } from '../shared/responseTransformer';
import { buildFileOnlyPayload } from '../shared/payloadBuilders';
import { validateFile } from '../shared/normalizers';

const Scope1Module = {
  id: 'scope1',
  label: 'Scope 1',
  description: 'Direct emissions — stationary, mobile, fugitive, process emissions.',
  templateFilenamePrefix: 'Scope1_BulkUpload_Template',
  errorReportFilenamePrefix: 'Scope1_Error_Report',
  requiredAccess: ['scope1_2', 'scope1_2_3'],
  notImplemented: true, // ← flip to false when backend ships

  endpoints: {
    template: '/api/bulk-upload/scope1/template/download',
    upload: '/api/bulk-upload/scope1/upload',
    save: '/api/bulk-upload/scope1/jobs/{jobId}/save',
    errors: '/api/bulk-upload/scope1/jobs/{jobId}/errors/download',
    jobs: '/api/bulk-upload/scope1/jobs',
  },

  validateFile,
  buildUploadPayload: buildFileOnlyPayload,
  transformValidationResponse: (data) => defaultTransformValidationResponse(data, { templateType: 'scope1' }),
};

bulkUploadRegistry.register(Scope1Module);

export default Scope1Module;
