/**
 * useEvidenceManagement — E2 modularization phase.
 *
 * Encapsulates the upload / delete / view / download lifecycle for emission
 * evidence files. Returns six callbacks the parent page wires into the form:
 *   - handleFileUpload(file)        : POST /upload/evidence?bucket_type=emission_evidence
 *   - handleDeleteExistingEvidence  : DELETE one /api/files/{id} from the list
 *   - handleDeleteAllEvidences      : DELETE every uploaded /api/files/{id}
 *   - handleRemoveEvidence          : Single-evidence reset path
 *   - handleViewEvidence            : window.open the file's /view endpoint
 *   - handleDownloadEvidence        : fetch+blob download via /download endpoint
 *
 * Behaviour byte-identical to the legacy inline versions in src/pages/Emissions.js.
 *
 * The hook accepts the parent's state setters + helpers as `deps` so it stays
 * pure relative to its own scope — no external state ownership.
 */
import axios from 'axios';
import { toast } from 'sonner';

import { validateFileSize, getUploadErrorMessage } from '../../lib/uploadUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const getUploadedFileId = (evidence) => (
  evidence?.file_id || evidence?.url?.match(/\/api\/files\/([a-f0-9-]+)/i)?.[1]
);

const downloadFileHelper = async (url, filename) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export function useEvidenceManagement({
  // State (reads)
  existingEvidences,
  uploadedEvidence,
  // State setters (writes)
  setFormData,
  setExistingEvidences,
  setUploadedEvidence,
  // Helpers
  getAuthHeader,
}) {
  const handleFileUpload = async (file) => {
    const sizeErr = validateFileSize(file);
    if (sizeErr) {
      throw new Error(sizeErr);
    }
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const response = await axios.post(`${API}/upload/evidence?bucket_type=emission_evidence`, formDataUpload, {
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'multipart/form-data',
        },
      });

      // Don't set uploadedEvidence for multi-file uploads - it blocks the upload zone
      // Instead, we track files in existingEvidences which are displayed separately

      // Append new evidence URL to existing ones (don't replace)
      setFormData(prev => {
        const existingUrls = prev.evidence_url ? prev.evidence_url.split(',').filter(u => u.trim()) : [];
        const newUrls = [...existingUrls, response.data.url];
        return {
          ...prev,
          evidence_url: newUrls.join(','),
        };
      });

      // Add to existingEvidences for immediate display - use original filename from server response
      setExistingEvidences(prev => [...prev, {
        url: response.data.url,
        filename: response.data.filename || file.name,  // Use original filename
        file_id: response.data.file_id,
        is_new: true,
      }]);

      toast.success('File uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error(getUploadErrorMessage(error, file));
    }
  };

  const handleDeleteExistingEvidence = async (index) => {
    const evidenceToDelete = existingEvidences[index];

    // New uploads are not yet linked to a saved emission, so remove them now.
    // Persisted evidence is deleted by the server only after a successful save.
    const fileId = getUploadedFileId(evidenceToDelete);
    if (evidenceToDelete.is_new && fileId) {
        try {
          await axios.delete(`${API}/files/${fileId}`, {
            headers: getAuthHeader(),
          });
        } catch (error) {
          console.error('Failed to delete file from server:', error);
          toast.error(error.response?.data?.detail || 'Could not remove evidence from storage');
          return;
        }
    }

    // Remove from existingEvidences state
    const newEvidences = existingEvidences.filter((_, i) => i !== index);
    setExistingEvidences(newEvidences);

    // Update evidence_url in formData
    setFormData(prev => ({
      ...prev,
      evidence_url: newEvidences.map(e => e.url).join(','),
    }));

    toast.success('Evidence removed');
  };

  const handleDeleteAllEvidences = async () => {
    // Only delete uncommitted uploads here. Saved evidence is removed after the
    // update itself succeeds, so canceling an edit preserves the original file.
    for (const evidence of existingEvidences) {
      const fileId = getUploadedFileId(evidence);
      if (evidence.is_new && fileId) {
          try {
            await axios.delete(`${API}/files/${fileId}`, {
              headers: getAuthHeader(),
            });
          } catch (error) {
            console.error('Failed to delete file from server:', error);
            toast.error(error.response?.data?.detail || 'Could not remove all evidence from storage');
            return;
          }
      }
    }

    setExistingEvidences([]);
    setFormData(prev => ({ ...prev, evidence_url: '' }));
    toast.success('All evidences removed');
  };

  const handleRemoveEvidence = async () => {
    const fileId = getUploadedFileId(uploadedEvidence);
    if (fileId) {
      try {
        await axios.delete(`${API}/files/${fileId}`, {
          headers: getAuthHeader(),
        });
      } catch (error) {
        console.error('Failed to delete file:', error);
      }
    }
    setUploadedEvidence(null);
    setFormData(prev => ({ ...prev, evidence_url: '' }));
  };

  const handleViewEvidence = (evidenceUrl, e) => {
    e.preventDefault();
    if (!evidenceUrl) {
      toast.error('No evidence file available');
      return;
    }

    // Extract file ID and open view URL
    const fileIdMatch = evidenceUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      window.open(`${BACKEND_URL}/api/files/${fileId}/view`, '_blank');
      return;
    }

    // For external or other URLs
    if (evidenceUrl.startsWith('http')) {
      window.open(evidenceUrl, '_blank');
    } else if (evidenceUrl.startsWith('/api')) {
      window.open(`${BACKEND_URL}${evidenceUrl}`, '_blank');
    } else {
      window.open(`${API}${evidenceUrl}`, '_blank');
    }
  };

  const handleDownloadEvidence = async (evidenceUrl, e, filename) => {
    e.preventDefault();
    if (!evidenceUrl) {
      toast.error('No evidence file available');
      return;
    }

    // Extract file ID and use fetch + blob for download
    const fileIdMatch = evidenceUrl.match(/\/api\/files\/([a-f0-9-]+)/i);
    if (fileIdMatch) {
      const fileId = fileIdMatch[1];
      const downloadUrl = `${BACKEND_URL}/api/files/${fileId}/download`;
      await downloadFileHelper(downloadUrl, filename || 'evidence-file');
      return;
    }

    // For external URLs, open in new tab (can't use fetch due to CORS)
    if (evidenceUrl.startsWith('http')) {
      window.open(evidenceUrl, '_blank');
    } else if (evidenceUrl.startsWith('/api')) {
      await downloadFileHelper(`${BACKEND_URL}${evidenceUrl}`, filename || 'file');
    } else {
      await downloadFileHelper(`${API}${evidenceUrl}`, filename || 'file');
    }
  };

  return {
    handleFileUpload,
    handleDeleteExistingEvidence,
    handleDeleteAllEvidences,
    handleRemoveEvidence,
    handleViewEvidence,
    handleDownloadEvidence,
  };
}

export default useEvidenceManagement;
