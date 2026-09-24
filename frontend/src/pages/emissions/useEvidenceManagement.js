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
import { useRef } from 'react';
import { toast } from 'sonner';

import { validateFileSize } from '../../lib/uploadUtils';

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
  const pendingDeletionIds = useRef(new Set());

  const handleFileUpload = async (file) => {
    const sizeErr = validateFileSize(file);
    if (sizeErr) {
      throw new Error(sizeErr);
    }
    setExistingEvidences(prev => [...prev, {
      filename: file.name,
      file,
      size: file.size,
      content_type: file.type,
      is_draft: true,
    }]);
    toast.success('File uploaded');
  };

  const handleDeleteExistingEvidence = async (index) => {
    const evidenceToDelete = existingEvidences[index];

    const fileId = getUploadedFileId(evidenceToDelete);
    if (!evidenceToDelete?.is_draft && fileId) {
      pendingDeletionIds.current.add(fileId);
    }

    // Remove from existingEvidences state
    const newEvidences = existingEvidences.filter((_, i) => i !== index);
    setExistingEvidences(newEvidences);

    // Update evidence_url in formData
    setFormData(prev => ({
      ...prev,
      evidence_url: newEvidences.map(e => e.url).filter(Boolean).join(','),
    }));

    toast.success('Evidence removed');
  };

  const handleDeleteAllEvidences = async () => {
    for (const evidence of existingEvidences) {
      const fileId = getUploadedFileId(evidence);
      if (!evidence.is_draft && fileId) pendingDeletionIds.current.add(fileId);
    }

    setExistingEvidences([]);
    setFormData(prev => ({ ...prev, evidence_url: '' }));
    toast.success('All evidences removed');
  };

  const handleRemoveEvidence = async () => {
    const fileId = getUploadedFileId(uploadedEvidence);
    if (!uploadedEvidence?.is_draft && fileId) pendingDeletionIds.current.add(fileId);
    setUploadedEvidence(null);
    setFormData(prev => ({ ...prev, evidence_url: '' }));
  };

  const commitEvidenceChanges = async (emissionId) => {
    const drafts = existingEvidences.filter((evidence) => evidence?.is_draft && evidence?.file);
    const uploadResults = await Promise.allSettled(drafts.map((evidence) => {
      const formDataUpload = new FormData();
      formDataUpload.append('file', evidence.file);
      return axios.post(`${API}/emissions/${emissionId}/evidence`, formDataUpload, {
        headers: { ...getAuthHeader(), 'Content-Type': 'multipart/form-data' },
      });
    }));
    const deletionResults = await Promise.allSettled([...pendingDeletionIds.current].map((fileId) => (
      axios.delete(`${API}/files/${fileId}`, { headers: getAuthHeader() })
    )));
    pendingDeletionIds.current.clear();
    const failures = [...uploadResults, ...deletionResults].filter((result) => result.status === 'rejected').length;
    if (failures) {
      toast.error(`The record was saved, but ${failures} evidence change(s) could not be completed.`);
    }
  };

  const discardEvidenceChanges = () => {
    pendingDeletionIds.current.clear();
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
    commitEvidenceChanges,
    discardEvidenceChanges,
    handleViewEvidence,
    handleDownloadEvidence,
  };
}

export default useEvidenceManagement;
