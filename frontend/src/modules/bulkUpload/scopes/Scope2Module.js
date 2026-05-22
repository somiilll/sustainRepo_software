/**
 * Scope 2 Bulk Upload Module
 *
 * Status: NOT_IMPLEMENTED — backend endpoints not yet built.
 * Mirrors Scope1Module — flip `notImplemented` to false once endpoints ship.
 */
import bulkUploadRegistry from '../core/registry';
import { defaultTransformValidationResponse } from '../shared/responseTransformer';
import { buildFileOnlyPayload } from '../shared/payloadBuilders';
import { validateFile } from '../shared/normalizers';

const Scope2Module = {
  id: 'scope2',
  label: 'Scope 2',
  description: 'Indirect energy emissions — purchased electricity, heat, steam.',
  templateFilenamePrefix: 'Scope2_BulkUpload_Template',
  errorReportFilenamePrefix: 'Scope2_Error_Report',
  requiredAccess: ['scope1_2', 'scope1_2_3'],
  notImplemented: true, // ← flip to false when backend ships

  endpoints: {
    template: '/api/bulk-upload/scope2/template/download',
    upload: '/api/bulk-upload/scope2/upload',
    save: '/api/bulk-upload/scope2/jobs/{jobId}/save',
    errors: '/api/bulk-upload/scope2/jobs/{jobId}/errors/download',
    jobs: '/api/bulk-upload/scope2/jobs',
  },

  validateFile,
  buildUploadPayload: buildFileOnlyPayload,
  transformValidationResponse: (data) => defaultTransformValidationResponse(data, { templateType: 'scope2' }),
};

bulkUploadRegistry.register(Scope2Module);

export default Scope2Module;
