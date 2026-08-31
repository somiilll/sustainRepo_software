/**
 * useBulkUpload — module-aware orchestration hook.
 *
 * Owns:
 *   - file upload + validate, save valid rows, download error report,
 *     download template, list jobs.
 *   - validationResult state (transformed via the active module's transformer).
 *   - expandedRows local UI state.
 *
 * Decoupled from any specific scope — accepts the active scope module
 * and routes all API calls through `apiService.createBulkUploadApiService`.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../contexts/AuthContext';
import { createBulkUploadApiService } from '../shared/apiService';
import { shortUploadId } from '../shared/normalizers';

export function useBulkUpload(activeModule) {
  const { getAuthHeader } = useAuth();

  const [uploading, setUploading] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [downloadingErrors, setDownloadingErrors] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});

  // Reset everything when the active module changes (Scope tab switch).
  useEffect(() => {
    setValidationResult(null);
    setExpandedRows({});
    setSessions([]);
  }, [activeModule?.id]);

  const api = activeModule ? createBulkUploadApiService(activeModule, getAuthHeader()) : null;

  const loadSessions = useCallback(async () => {
    if (!api) return;
    try {
      const jobs = await api.listJobs();
      setSessions(jobs);
    } catch (error) {
      console.error('[useBulkUpload] listJobs failed:', error);
    }
  }, [api]);  

  useEffect(() => {
    if (activeModule && !activeModule.notImplemented) loadSessions();
     
  }, [activeModule?.id]);

  const handleDownloadTemplate = async () => {
    if (!api || activeModule.notImplemented) {
      toast.error(`${activeModule?.label || 'This scope'} bulk upload is coming soon`);
      return;
    }
    setDownloadingTemplate(true);
    try {
      const blob = await api.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${activeModule.templateFilenamePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully');
    } catch (error) {
      toast.error('Failed to download template');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !api) return;

    if (activeModule.notImplemented) {
      toast.error(`${activeModule.label} bulk upload is coming soon. Please use Scope 3 for now.`);
      event.target.value = '';
      return;
    }

    const fileError = activeModule.validateFile(file);
    if (fileError) {
      toast.error(fileError);
      event.target.value = '';
      return;
    }

    setUploading(true);
    setValidationResult(null);

    try {
      const formData = activeModule.buildUploadPayload(file);
      const rawData = await api.uploadForValidation(formData);
      const transformed = activeModule.transformValidationResponse(rawData);
      setValidationResult(transformed);

      const valid = transformed.summary.valid_rows;
      const invalid = transformed.summary.invalid_rows;
      if (invalid === 0) {
        toast.success(`Validation complete: All ${valid} rows are valid. Choose an action below.`);
      } else if (valid > 0) {
        toast.warning(`Validation complete: ${valid} valid, ${invalid} with errors. Choose an action below.`);
      } else {
        toast.error(`Validation complete: All ${invalid} rows have errors. Download error report or upload a corrected file.`);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to process file');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSaveValidRows = async () => {
    if (!api || !validationResult?.upload_id) return;
    if (validationResult.summary.valid_rows === 0) {
      toast.error('No valid rows to save');
      return;
    }
    setSavingRows(true);
    try {
      const data = await api.saveValidatedJob(validationResult.upload_id);
      if (data?.success) {
        toast.success(`${data.saved_count} emission records saved successfully!`);
        setValidationResult(null);
        loadSessions();
      } else {
        toast.error(data?.error || 'Failed to save records');
      }
    } catch (error) {
      const errorMsg = error.response?.data?.detail || error.response?.data?.error || 'Failed to save records';
      toast.error(errorMsg);
    } finally {
      setSavingRows(false);
    }
  };

  const handleDiscardAndUploadNew = () => {
    setValidationResult(null);
    toast.info('Validation discarded. You can upload a new file.');
  };

  const handleDownloadErrorReport = async () => {
    if (!api || !validationResult?.upload_id) return;
    setDownloadingErrors(true);
    try {
      const blob = await api.downloadErrorReport(validationResult.upload_id);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeModule.errorReportFilenamePrefix}_${shortUploadId(validationResult.upload_id).replace('…', '')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Error report downloaded');
    } catch (error) {
      toast.error('Failed to download error report');
    } finally {
      setDownloadingErrors(false);
    }
  };

  const toggleRowExpansion = (rowKey) => {
    setExpandedRows((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  return {
    // state
    uploading, validationResult, downloadingTemplate, downloadingErrors,
    savingRows, sessions, expandedRows,
    // actions
    handleDownloadTemplate, handleFileUpload, handleSaveValidRows,
    handleDiscardAndUploadNew, handleDownloadErrorReport, toggleRowExpansion,
    refreshSessions: loadSessions,
  };
}
