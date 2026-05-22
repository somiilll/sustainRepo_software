/**
 * BulkUpload API Service — thin HTTP layer over a scope module's endpoints.
 *
 * The service is constructed per call by passing the active module + auth
 * header getter. This keeps the hook (`useBulkUpload`) decoupled from the
 * specific scope being uploaded — the same hook works for Scope 1, 2, and 3.
 */
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}`;

function url(endpoint, params = {}) {
  let resolved = endpoint;
  Object.entries(params).forEach(([k, v]) => {
    resolved = resolved.replace(`{${k}}`, encodeURIComponent(v));
  });
  return `${API}${resolved}`;
}

export function createBulkUploadApiService(module, authHeader) {
  if (!module) throw new Error('BulkUpload api service requires an active module');
  const headers = authHeader || {};

  return {
    async downloadTemplate() {
      const response = await axios.get(url(module.endpoints.template), {
        headers, responseType: 'blob',
      });
      return response.data;
    },

    async uploadForValidation(formData) {
      // validate_only=true keeps the upload in a staging state until user confirms save
      const target = url(module.endpoints.upload) + '?validate_only=true';
      const response = await axios.post(target, formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    },

    async saveValidatedJob(jobId) {
      const response = await axios.post(
        url(module.endpoints.save, { jobId }),
        {},
        { headers }
      );
      return response.data;
    },

    async downloadErrorReport(jobId) {
      const response = await axios.get(url(module.endpoints.errors, { jobId }), {
        headers, responseType: 'blob',
      });
      return response.data;
    },

    async listJobs() {
      const response = await axios.get(url(module.endpoints.jobs), { headers });
      return response.data?.jobs || [];
    },
  };
}
