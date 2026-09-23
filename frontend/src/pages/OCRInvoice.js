import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Eye, FileText, History, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { useAuth } from '../contexts/AuthContext';
import { ExtractionModeSelector } from '../modules/ocr/ExtractionModeSelector';
import { OcrEditDialog } from '../modules/ocr/OcrEditDialog';
import { OcrFacilityAssignmentDialog } from '../modules/ocr/OcrFacilityAssignmentDialog';
import { OcrHistoryDialog } from '../modules/ocr/OcrHistoryDialog';
import { OcrBatchQueue } from '../modules/ocr/OcrBatchQueue';
import { OcrReviewTable } from '../modules/ocr/OcrReviewTable';
import { UploadWorkspace } from '../modules/ocr/UploadWorkspace';
import { ModulePageHeader } from '../components/ModulePageHeader';
import {
  acceptOcrLineItem,
  assignOcrUploadFacilities,
  cancelOcrUploadFile,
  cancelOcrUpload,
  deleteOcrUploadFile,
  resumeOcrUpload,
  resumeOcrUploadFile,
  deleteOcrUpload,
  downloadOcrTemplate,
  getOcrConfiguration,
  getOcrUploadHistory,
  getOcrUpload,
  loadOcrPreview,
  rejectOcrLineItem,
  retryOcrUpload,
  saveOcrLineItemToGhg,
  updateOcrLineItem,
  uploadOcrFiles,
} from '../modules/ocr/ocrApi';

const FALLBACK_CONFIGURATION = {
  enabled_scopes: ['scope1', 'scope2'],
  modes: [
    { key: 'fast', label: 'Fast', vision_model: 'claude-sonnet-5', reasoning_model: 'claude-haiku-4-5' },
    { key: 'think', label: 'Think', vision_model: 'gpt-5.6-sol', reasoning_model: 'gpt-5.6-terra' },
  ],
  categories: [],
  facilities: [],
  save_rules: {},
};

const responseMessage = (error, fallback) => error?.response?.data?.detail || error?.response?.data?.message || fallback;
const stagedFileKey = (file) => `${file.name}-${file.size}`;
const fileErrorMap = (sourceFiles, errors = [], fallback = '') => Object.fromEntries(
  sourceFiles.flatMap((file) => {
    const message = errors.find((entry) => entry.filename === file.name)?.error || fallback;
    return message ? [[stagedFileKey(file), message]] : [];
  }),
);
const directGhgMissingFields = (values = {}) => {
  const missing = [];
  const hasValue = (value) => value !== undefined && value !== null && value !== '';
  const isStructuredScope3Activity = values.scope === 'scope3'
    && values.ef_method === 'activity'
    && /^c(?:4|6|9)\b/i.test(String(values.category || '').trim());
  if (!values.facility_id) missing.push('facility_id');
  if (!values.reporting_period) missing.push('reporting_period');
  if (!(values.factor_id || values.fuel_id || values.scope3_ef_id)) missing.push('factor_id');
  if (values.scope === 'scope3' && values.ef_method === 'spend') {
    if (!hasValue(values.cost)) missing.push('cost');
    if (!values.currency) missing.push('currency');
  } else if (!isStructuredScope3Activity) {
    if (!hasValue(values.quantity)) missing.push('quantity');
    if (!values.unit) missing.push('unit');
  }
  return missing;
};

export default function OCRInvoice() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [configuration, setConfiguration] = useState(FALLBACK_CONFIGURATION);
  const [mode, setMode] = useState('think');
  const [files, setFiles] = useState([]);
  const [stagedFileErrors, setStagedFileErrors] = useState({});
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upload, setUpload] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [openingSourceFileIds, setOpeningSourceFileIds] = useState([]);
  const [restartingSourceFileIds, setRestartingSourceFileIds] = useState([]);
  const [deletingSourceFileIds, setDeletingSourceFileIds] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [editingRequiredFields, setEditingRequiredFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [fileQueue, setFileQueue] = useState([]);
  const [error, setError] = useState('');
  const [facilityAssignmentFiles, setFacilityAssignmentFiles] = useState([]);
  const [facilityAssignmentOpen, setFacilityAssignmentOpen] = useState(false);
  const [facilityAssignmentSaving, setFacilityAssignmentSaving] = useState(false);
  const [facilityPreviewFile, setFacilityPreviewFile] = useState(null);
  const [facilityPreviewUrl, setFacilityPreviewUrl] = useState(null);
  const [facilityPreviewLoading, setFacilityPreviewLoading] = useState(false);
  const [cancellingQueue, setCancellingQueue] = useState(false);
  const [resumingQueue, setResumingQueue] = useState(false);
  const [cancellingFileIds, setCancellingFileIds] = useState([]);
  const facilityPreviewRequestRef = useRef(0);
  const sessionUploadIdsRef = useRef(new Set());
  const [activeExtractionIds, setActiveExtractionIds] = useState([]);
  const [failedExtractionIds, setFailedExtractionIds] = useState([]);
  const [retryingQueue, setRetryingQueue] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkRejectRows, setBulkRejectRows] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    let mounted = true;
    const headers = getAuthHeader();
    getOcrConfiguration(headers)
      .then(({ data }) => { if (mounted) setConfiguration(data); })
      .catch(() => { if (mounted) setError('Organization OCR settings could not be loaded. Default options are shown.'); });
    const legacyUploadId = localStorage.getItem('ocr-active-upload-id');
    let activeUploadIds = [];
    try { activeUploadIds = JSON.parse(localStorage.getItem('ocr-active-upload-ids') || '[]'); } catch { activeUploadIds = []; }
    if (!activeUploadIds.length && legacyUploadId) activeUploadIds = [legacyUploadId];
    if (activeUploadIds.length) setActiveExtractionIds(activeUploadIds);
    // Failed batches from earlier browser sessions must not surface as a
    // current workspace error. Failures are now kept only for this session.
    localStorage.removeItem('ocr-failed-upload-ids');
    return () => { mounted = false; };
  }, [getAuthHeader]);

  useEffect(() => {
    if (!activeExtractionIds.length) return undefined;
    let cancelled = false;
    let timer;
    const pollUploads = async () => {
      const records = await Promise.all(activeExtractionIds.map((uploadId) => (
        getOcrUpload(uploadId, getAuthHeader()).then(({ data }) => data).catch(() => null)
      )));
      if (cancelled) return;
      const activeRecords = records.filter((record) => record?.upload);
      if (activeRecords.length === records.length) {
        setFileQueue((current) => [
          ...activeRecords.flatMap((record) => (record.upload.files || []).map((file) => ({
            id: `${record.upload.id}-${file.file_index}`,
            uploadId: record.upload.id,
            fileIndex: file.file_index,
            filename: file.filename,
            status: file.status || record.upload.status,
            error: file.error,
            uploadStatus: record.upload.status,
          }))),
          ...current.filter((file) => file.clientError),
        ]);
      }
      const awaitingAssignmentRecords = activeRecords.filter((record) => record.upload.status === 'awaiting_facility_assignment');
      if (awaitingAssignmentRecords.length) {
        const stagedFiles = awaitingAssignmentRecords.flatMap((record) => (record.upload.files || []).map((file) => ({ ...file, upload_id: record.upload.id })));
        setUpload((current) => {
          const filesByKey = new Map((current?.files || []).map((file) => [`${file.upload_id}-${file.file_index}`, file]));
          stagedFiles.forEach((file) => filesByKey.set(`${file.upload_id}-${file.file_index}`, file));
          return { upload_ids: [...new Set([...(current?.upload_ids || []), ...awaitingAssignmentRecords.map((record) => record.upload.id)])], files: Array.from(filesByKey.values()) };
        });
        const invoiceFiles = stagedFiles.filter((file) => (
          file.preview_supported
          && !file.facility_id
          && !['cancelled', 'cancel_requested'].includes(file.status)
        ));
        if (invoiceFiles.length) {
          setFacilityAssignmentFiles((current) => {
            const currentKeys = current.map((file) => `${file.upload_id}-${file.file_index}`).join('|');
            const incomingKeys = invoiceFiles.map((file) => `${file.upload_id}-${file.file_index}`).join('|');
            return currentKeys === incomingKeys ? current : invoiceFiles;
          });
          setFacilityAssignmentOpen(true);
        }
      }
      const terminalRecords = activeRecords.filter((record) => ['completed', 'failed', 'cancelled'].includes(record.upload.status));
      const pendingIds = records.flatMap((record, index) => {
        if (!record?.upload) return [activeExtractionIds[index]];
        return ['completed', 'failed', 'cancelled', 'resolved'].includes(record.upload.status) ? [] : [record.upload.id];
      });
      if (terminalRecords.length) {
        const completedRecords = terminalRecords.filter((record) => record.upload.status === 'completed');
        const completedFiles = completedRecords.flatMap((record) => (record.upload.files || [])
          .filter((file) => file.status === 'completed')
          .map((file) => ({ ...file, upload_id: record.upload.id })));
        const completedItems = completedRecords.flatMap((record) => record.line_items || []);
        if (completedFiles.length) {
          setUpload((current) => {
            const filesByKey = new Map((current?.files || []).map((file) => [`${file.upload_id}-${file.file_index}`, file]));
            completedFiles.forEach((file) => filesByKey.set(`${file.upload_id}-${file.file_index}`, file));
            return { upload_ids: [...new Set([...(current?.upload_ids || []), ...completedRecords.map((record) => record.upload.id)])], files: Array.from(filesByKey.values()) };
          });
          setItems((current) => {
            const itemsById = new Map(current.map((item) => [item.id, item]));
            completedItems.forEach((item) => itemsById.set(item.id, item));
            return Array.from(itemsById.values());
          });
          setSelectedFile((current) => current);
          setSelectedItem((current) => current || completedItems[0] || null);
          toast.success(`Extraction ready: ${completedItems.length} activity row${completedItems.length === 1 ? '' : 's'}`);
        }
        const newlyFailedIds = terminalRecords
          .filter((record) => record.upload.status === 'failed')
          .map((record) => record.upload.id)
          .filter((uploadId) => sessionUploadIdsRef.current.has(uploadId));
        if (newlyFailedIds.length) {
          toast.error('An error occurred. Try again.');
          setFailedExtractionIds((current) => {
            return [...new Set([...current, ...newlyFailedIds])];
          });
          setError('An error occurred. Try again.');
        }
      }
      const retainedIds = records.flatMap((record, index) => {
        if (!record?.upload) return [activeExtractionIds[index]];
        return ['failed', 'cancelled', 'resolved'].includes(record.upload.status) ? [] : [record.upload.id];
      });
      if (retainedIds.length) localStorage.setItem('ocr-active-upload-ids', JSON.stringify(retainedIds));
      else localStorage.removeItem('ocr-active-upload-ids');
      setActiveExtractionIds(pendingIds);
      if (pendingIds.length) timer = setTimeout(pollUploads, 2000);
    };
    pollUploads();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [activeExtractionIds, getAuthHeader]);

  useEffect(() => () => {
    if (facilityPreviewUrl) URL.revokeObjectURL(facilityPreviewUrl);
  }, [facilityPreviewUrl]);

  const selectedFileItems = useMemo(() => (
    selectedFile ? items.filter((item) => item.upload_id === selectedFile.upload_id && item.file_index === selectedFile.file_index) : items
  ), [items, selectedFile]);
  const sourceFiles = useMemo(() => upload?.files || [], [upload]);

  const processFiles = async () => {
    if (!files.length) return;
    setProcessing(true);
    setProgress(0);
    setError('');
    setStagedFileErrors({});
    setFailedExtractionIds([]);
    localStorage.removeItem('ocr-failed-upload-ids');
    setFileQueue(files.map((file, index) => ({ id: `queued-${index}`, filename: file.name, status: 'queued' })));
    let staged = false;
    try {
      const { data } = await uploadOcrFiles(files, mode, getAuthHeader());
      if (!data.files?.length) {
        const message = data.errors?.[0]?.error || 'No invoice could be staged securely.';
        setStagedFileErrors(fileErrorMap(files, data.errors, message));
        setFileQueue(files.map((file, index) => ({ id: `failed-${index}`, filename: file.name, status: 'failed', error: data.errors?.find((entry) => entry.filename === file.name)?.error || message })));
        setError(message);
        return;
      }
      staged = true;
      sessionUploadIdsRef.current.add(data.upload_id);
      let existingIds = [];
      try { existingIds = JSON.parse(localStorage.getItem('ocr-active-upload-ids') || '[]'); } catch { existingIds = []; }
      const uploadIds = [...new Set([...existingIds, data.upload_id])];
      localStorage.setItem('ocr-active-upload-ids', JSON.stringify(uploadIds));
      localStorage.removeItem('ocr-active-upload-id');
      setActiveExtractionIds((current) => [...new Set([...current, data.upload_id])]);
      const stagedFiles = data.files.map((file) => ({ ...file, upload_id: data.upload_id }));
      setFileQueue([
        ...data.files.map((file) => ({ id: `${data.upload_id}-${file.file_index}`, uploadId: data.upload_id, fileIndex: file.file_index, filename: file.filename, status: file.status, uploadStatus: data.status, error: file.error })),
        ...(data.errors || []).map((entry, index) => ({ id: `${data.upload_id}-rejected-${index}`, filename: entry.filename, status: 'failed', error: entry.error, clientError: true })),
      ]);
      setUpload({ upload_ids: [data.upload_id], files: stagedFiles });
      setSelectedFile(null);
      const invoiceFiles = stagedFiles.filter((file) => (
        file.preview_supported
        && !file.facility_id
        && !['cancelled', 'cancel_requested'].includes(file.status)
      ));
      if (invoiceFiles.length) {
        setFacilityAssignmentFiles(invoiceFiles);
        setFacilityAssignmentOpen(true);
      }
      toast.success(data.status === 'awaiting_facility_assignment'
        ? `${data.file_count} source document${data.file_count === 1 ? '' : 's'} uploaded. Assign invoice facilities to begin extraction.`
        : `${data.file_count} source document${data.file_count === 1 ? '' : 's'} queued for extraction.`);
    } catch (requestError) {
      const message = responseMessage(requestError, 'Files could not be queued for extraction.');
      setError(message);
      setStagedFileErrors(fileErrorMap(files, [], message));
      setFileQueue(files.map((file, index) => ({ id: `failed-${index}`, filename: file.name, status: 'failed', error: message })));
    } finally {
      if (staged) setFiles([]);
      setProcessing(false);
      setProgress(0);
    }
  };

  const cancelProcessing = async () => {
    if (!activeExtractionIds.length) return;
    setCancellingQueue(true);
    try {
      const results = await Promise.allSettled(activeExtractionIds.map((uploadId) => cancelOcrUpload(uploadId, getAuthHeader())));
      const cancelledIds = new Set(results.flatMap((result, index) => result.status === 'fulfilled' ? [activeExtractionIds[index]] : []));
      if (!cancelledIds.size) throw new Error('The queued uploads finished before they could be cancelled.');
      const remainingIds = activeExtractionIds.filter((uploadId) => !cancelledIds.has(uploadId));
      if (remainingIds.length) localStorage.setItem('ocr-active-upload-ids', JSON.stringify(remainingIds));
      else localStorage.removeItem('ocr-active-upload-ids');
      setActiveExtractionIds(remainingIds);
      setFileQueue((current) => current.map((file) => (
        cancelledIds.has(file.uploadId) && ['queued', 'processing'].includes(file.status) ? { ...file, status: 'cancelled' } : file
      )));
      toast.success(`${cancelledIds.size} OCR batch${cancelledIds.size === 1 ? '' : 'es'} cancelled.`);
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'OCR processing could not be cancelled.'));
    } finally {
      setCancellingQueue(false);
    }
  };

  const resumeQueuedExtraction = async (uploadId) => {
    setResumingQueue(true);
    try {
      await resumeOcrUpload(uploadId, getAuthHeader());
      sessionUploadIdsRef.current.add(uploadId);
      setFileQueue((current) => current.map((file) => (
        file.uploadId === uploadId ? { ...file, uploadStatus: 'processing' } : file
      )));
      toast.success('Queued OCR extraction resumed.');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'This queued extraction could not be resumed.'));
    } finally {
      setResumingQueue(false);
    }
  };

  const cancelInvoiceProcessing = async (file) => {
    const uploadId = file?.uploadId || file?.upload_id;
    const fileIndex = file?.fileIndex ?? file?.file_index;
    const queueId = file?.id || `${uploadId}-${fileIndex}`;
    if (!uploadId || fileIndex === undefined) return;
    setCancellingFileIds((current) => [...new Set([...current, queueId])]);
    try {
      const { data } = await cancelOcrUploadFile(uploadId, fileIndex, getAuthHeader());
      setFileQueue((current) => current.map((entry) => (
        entry.id === queueId ? { ...entry, status: data.status } : entry
      )));
      setUpload((current) => current ? {
        ...current,
        files: current.files.map((entry) => (
          entry.upload_id === uploadId && entry.file_index === fileIndex ? { ...entry, status: data.status } : entry
        )),
      } : current);
      setFacilityAssignmentFiles((current) => current.filter((entry) => !(
        entry.upload_id === uploadId && entry.file_index === fileIndex
      )));
      if (data.processing_started || data.upload_status === 'cancelled') {
        setFacilityAssignmentOpen(false);
        setFacilityAssignmentFiles([]);
      }
      toast.success(data.status === 'cancel_requested' ? 'Invoice cancellation requested.' : 'Invoice cancelled.');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'This invoice could not be cancelled.'));
    } finally {
      setCancellingFileIds((current) => current.filter((id) => id !== queueId));
    }
  };

  const resumeCancelledSourceFile = async (file) => {
    const fileId = `${file.upload_id}-${file.file_index}`;
    setRestartingSourceFileIds((current) => [...new Set([...current, fileId])]);
    try {
      const { data } = await resumeOcrUploadFile(file.upload_id, file.file_index, getAuthHeader());
      sessionUploadIdsRef.current.add(file.upload_id);
      const resumedFile = { ...file, status: 'queued' };
      setUpload((current) => current ? {
        ...current,
        files: current.files.map((entry) => (
          entry.upload_id === file.upload_id && entry.file_index === file.file_index ? resumedFile : entry
        )),
      } : current);
      setFileQueue((current) => {
        const next = current.map((entry) => (
          entry.uploadId === file.upload_id && entry.fileIndex === file.file_index ? { ...entry, status: 'queued', uploadStatus: data.awaiting_facility_assignment ? 'awaiting_facility_assignment' : 'queued' } : entry
        ));
        return next.some((entry) => entry.id === fileId) ? next : [...next, { id: fileId, uploadId: file.upload_id, fileIndex: file.file_index, filename: file.filename, status: 'queued', uploadStatus: data.awaiting_facility_assignment ? 'awaiting_facility_assignment' : 'queued' }];
      });
      let storedIds = [];
      try { storedIds = JSON.parse(localStorage.getItem('ocr-active-upload-ids') || '[]'); } catch { storedIds = []; }
      localStorage.setItem('ocr-active-upload-ids', JSON.stringify([...new Set([...storedIds, file.upload_id])]));
      setActiveExtractionIds((current) => [...new Set([...current, file.upload_id])]);
      if (data.awaiting_facility_assignment) {
        setFacilityAssignmentFiles([resumedFile]);
        setFacilityAssignmentOpen(true);
      }
      toast.success(data.awaiting_facility_assignment ? 'Invoice restored. Assign its facility to begin extraction.' : 'Invoice queued for extraction.');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'This cancelled invoice could not be processed.'));
    } finally {
      setRestartingSourceFileIds((current) => current.filter((id) => id !== fileId));
    }
  };

  const deleteCancelledSourceFile = async (file) => {
    const fileId = `${file.upload_id}-${file.file_index}`;
    setDeletingSourceFileIds((current) => [...new Set([...current, fileId])]);
    try {
      const { data } = await deleteOcrUploadFile(file.upload_id, file.file_index, getAuthHeader());
      const remainingFiles = (upload?.files || []).filter((entry) => !(entry.upload_id === file.upload_id && entry.file_index === file.file_index));
      setUpload(remainingFiles.length ? { upload_ids: [...new Set(remainingFiles.map((entry) => entry.upload_id))], files: remainingFiles } : null);
      setFileQueue((current) => current.filter((entry) => entry.id !== fileId));
      setSelectedFile((current) => current?.upload_id === file.upload_id && current?.file_index === file.file_index ? remainingFiles[0] || null : current);
      if (data.upload_deleted) {
        setActiveExtractionIds((current) => current.filter((uploadId) => uploadId !== file.upload_id));
      }
      toast.success('Cancelled invoice removed.');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'This cancelled invoice could not be deleted.'));
    } finally {
      setDeletingSourceFileIds((current) => current.filter((id) => id !== fileId));
    }
  };

  const retryFailedProcessing = async () => {
    if (!failedExtractionIds.length) return;
    setRetryingQueue(true);
    try {
      const results = await Promise.allSettled(failedExtractionIds.map((uploadId) => retryOcrUpload(uploadId, getAuthHeader())));
      const retriedIds = results.flatMap((result, index) => result.status === 'fulfilled' ? [failedExtractionIds[index]] : []);
      if (!retriedIds.length) throw new Error('OCR extraction could not be restarted.');
      const remainingFailedIds = failedExtractionIds.filter((uploadId) => !retriedIds.includes(uploadId));
      setFailedExtractionIds(remainingFailedIds);
      retriedIds.forEach((uploadId) => sessionUploadIdsRef.current.add(uploadId));
      localStorage.setItem('ocr-active-upload-ids', JSON.stringify(retriedIds));
      setActiveExtractionIds((current) => [...new Set([...current, ...retriedIds])]);
      setFileQueue((current) => current.map((file) => (
        retriedIds.includes(file.uploadId) ? { ...file, status: 'queued' } : file
      )));
      setError('');
      toast.success('OCR extraction restarted.');
    } catch (requestError) {
      setError(responseMessage(requestError, 'An error occurred. Try again.'));
      toast.error('An error occurred. Try again.');
    } finally {
      setRetryingQueue(false);
    }
  };

  const openSourceDocument = async (file) => {
    if (!file.preview_supported) return;
    const fileId = `${file.upload_id}-${file.file_index}`;
    const previewWindow = window.open('', '_blank');
    if (!previewWindow) {
      toast.error('Allow pop-ups to view this source document.');
      return;
    }
    previewWindow.opener = null;
    setOpeningSourceFileIds((current) => [...new Set([...current, fileId])]);
    try {
      const response = await loadOcrPreview(file.upload_id, file.file_index, getAuthHeader());
      const sourceUrl = URL.createObjectURL(response.data);
      previewWindow.location.href = sourceUrl;
      window.setTimeout(() => URL.revokeObjectURL(sourceUrl), 60000);
    } catch (requestError) {
      previewWindow.close();
      toast.error(responseMessage(requestError, 'Source document could not be opened.'));
    } finally {
      setOpeningSourceFileIds((current) => current.filter((id) => id !== fileId));
    }
  };

  const previewFacilityAssignmentFile = async (file) => {
    const requestId = facilityPreviewRequestRef.current + 1;
    facilityPreviewRequestRef.current = requestId;
    setFacilityPreviewFile(file);
    setFacilityPreviewLoading(true);
    try {
      const response = await loadOcrPreview(file.upload_id, file.file_index, getAuthHeader());
      if (facilityPreviewRequestRef.current !== requestId) return;
      if (facilityPreviewUrl) URL.revokeObjectURL(facilityPreviewUrl);
      setFacilityPreviewUrl(URL.createObjectURL(response.data));
    } catch (requestError) {
      if (facilityPreviewRequestRef.current === requestId) toast.error(responseMessage(requestError, 'Secure preview could not be loaded.'));
    } finally {
      if (facilityPreviewRequestRef.current === requestId) setFacilityPreviewLoading(false);
    }
  };

  const hideFacilityAssignmentPreview = () => {
    facilityPreviewRequestRef.current += 1;
    if (facilityPreviewUrl) URL.revokeObjectURL(facilityPreviewUrl);
    setFacilityPreviewUrl(null);
    setFacilityPreviewFile(null);
    setFacilityPreviewLoading(false);
  };

  const saveFacilityAssignments = async (assignments) => {
    const byUpload = assignments.reduce((groups, assignment) => {
      groups[assignment.upload_id] = groups[assignment.upload_id] || [];
      groups[assignment.upload_id].push({ file_index: assignment.file_index, facility_id: assignment.facility_id });
      return groups;
    }, {});
    setFacilityAssignmentSaving(true);
    try {
      const assignmentRequests = Object.entries(byUpload);
      const assignmentResponses = await Promise.all(assignmentRequests.map(([uploadId, uploadAssignments]) => (
        assignOcrUploadFacilities(uploadId, uploadAssignments, getAuthHeader())
      )));
      const startedUploadIds = assignmentResponses
        .map((response, index) => response.data?.processing_started ? assignmentRequests[index][0] : null)
        .filter(Boolean);
      if (startedUploadIds.length) {
        setFileQueue((current) => current.map((file) => (
          startedUploadIds.includes(file.uploadId) && file.status === 'queued' ? { ...file, status: 'processing' } : file
        )));
      }
      const assignmentByFile = new Map(assignments.map((assignment) => [`${assignment.upload_id}-${assignment.file_index}`, assignment]));
      const applyAssignment = (item) => {
        const assignment = assignmentByFile.get(`${item.upload_id}-${item.file_index}`);
        return assignment ? { ...item, current_values: { ...item.current_values, facility_id: assignment.facility_id, location: assignment.facility_name } } : item;
      };
      setItems((current) => current.map(applyAssignment));
      setSelectedItem((current) => current ? applyAssignment(current) : current);
      setUpload((current) => current ? {
        ...current,
        files: current.files.map((file) => {
          const assignment = assignmentByFile.get(`${file.upload_id}-${file.file_index}`);
          return assignment ? { ...file, facility_id: assignment.facility_id, facility_name: assignment.facility_name } : file;
        }),
      } : current);
      setFacilityAssignmentOpen(false);
      setFacilityAssignmentFiles([]);
      setFacilityPreviewFile(null);
      if (facilityPreviewUrl) URL.revokeObjectURL(facilityPreviewUrl);
      setFacilityPreviewUrl(null);
      toast.success('Invoice facilities assigned');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Invoice facilities could not be assigned.'));
    } finally {
      setFacilityAssignmentSaving(false);
    }
  };

  const chooseFile = (file) => {
    setSelectedFile(file);
    setSelectedItem(items.find((item) => item.upload_id === file.upload_id && item.file_index === file.file_index) || null);
  };

  const saveEdit = async (values) => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const { data } = await updateOcrLineItem(editingItem.id, values, getAuthHeader());
      setItems((current) => current.map((item) => item.id === editingItem.id ? data.line_item : item));
      setSelectedItem(data.line_item);
      setEditingItem(null);
      setEditingRequiredFields([]);
      toast.success(values.remember_override ? 'Changes saved and vendor mapping remembered' : 'Changes saved');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Changes could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const saveAutomaticFactorMatch = useCallback(async (values) => {
    if (!editingItem) return;
    const { data } = await updateOcrLineItem(editingItem.id, values, getAuthHeader());
    setItems((current) => current.map((item) => item.id === editingItem.id ? data.line_item : item));
    setSelectedItem(data.line_item);
    setEditingItem(data.line_item);
    setEditingRequiredFields((current) => current.filter((field) => field !== 'factor_id'));
  }, [editingItem, getAuthHeader]);

  const acceptItem = async (item) => {
    setAcceptingId(item.id);
    try {
      if (item.current_values?.scope === 'water') {
        const { data } = await acceptOcrLineItem(item.id, getAuthHeader());
        setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: 'accepted' } : row));
        toast.success('Water activity accepted. Opening the Water metric form.');
        navigate('/environment/water?tab=add-metric', { state: { openWaterForm: true, ocrWaterPrefill: data.prefill_data } });
      } else {
        const { data: savedData } = await saveOcrLineItemToGhg(item.id, getAuthHeader());
        const remainingItems = items.filter((row) => row.id !== item.id);
        setItems(remainingItems);
        setSelectedItem(remainingItems.find((row) => row.upload_id === item.upload_id && row.file_index === item.file_index) || remainingItems[0] || null);
        if (savedData.file_completed) {
          const remainingFiles = (upload?.files || []).filter((file) => !(file.upload_id === item.upload_id && file.file_index === item.file_index));
          const remainingUploadIds = [...new Set(remainingFiles.map((file) => file.upload_id))];
          setUpload(remainingFiles.length ? { upload_ids: remainingUploadIds, files: remainingFiles } : null);
          setSelectedFile(remainingFiles[0] || null);
          setFileQueue((current) => remainingFiles.length
            ? current.filter((file) => !(file.uploadId === item.upload_id && file.fileIndex === item.file_index))
            : []);
          if (remainingUploadIds.length) localStorage.setItem('ocr-active-upload-ids', JSON.stringify(remainingUploadIds));
          else {
            localStorage.removeItem('ocr-active-upload-ids');
            setActiveExtractionIds([]);
            setFailedExtractionIds([]);
            setSelectedItem(null);
            setError('');
          }
        }
        toast.success(
          savedData.evidence_not_required
            ? 'GHG entry saved.'
            : savedData.evidence_attached
              ? 'GHG entry calculated and saved'
              : 'GHG entry saved; evidence transfer is pending retry'
        );
      }
    } catch (requestError) {
      if (requestError?.response?.status === 400) {
        setEditingRequiredFields(directGhgMissingFields(item.current_values));
        setEditingItem(item);
      }
      toast.error(responseMessage(requestError, 'This GHG entry could not be calculated and saved.'));
    } finally {
      setAcceptingId(null);
    }
  };

  const rejectItem = async () => {
    if (!rejectingItem) return;
    setRejectingId(rejectingItem.id);
    try {
      const { data } = await rejectOcrLineItem(rejectingItem.id, getAuthHeader());
      const remainingItems = items.filter((item) => item.id !== rejectingItem.id);
      setItems(remainingItems);
      setSelectedItem(remainingItems.find((item) => item.upload_id === rejectingItem.upload_id && item.file_index === rejectingItem.file_index) || remainingItems[0] || null);
      if (data.file_completed) {
        const remainingFiles = (upload?.files || []).filter((file) => !(file.upload_id === rejectingItem.upload_id && file.file_index === rejectingItem.file_index));
        const remainingUploadIds = [...new Set(remainingFiles.map((file) => file.upload_id))];
        setUpload(remainingFiles.length ? { upload_ids: remainingUploadIds, files: remainingFiles } : null);
        setSelectedFile(remainingFiles[0] || null);
        setFileQueue((current) => remainingFiles.length
          ? current.filter((file) => !(file.uploadId === rejectingItem.upload_id && file.fileIndex === rejectingItem.file_index))
          : []);
        if (remainingUploadIds.length) localStorage.setItem('ocr-active-upload-ids', JSON.stringify(remainingUploadIds));
        else {
          localStorage.removeItem('ocr-active-upload-ids');
          setActiveExtractionIds([]);
          setFailedExtractionIds([]);
          setSelectedItem(null);
          setError('');
        }
      }
      setRejectingItem(null);
      toast.success(data.upload_completed ? 'All extracted rows have been resolved' : 'Row rejected and removed');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'This row could not be rejected.'));
    } finally {
      setRejectingId(null);
    }
  };

  const removeResolvedRows = (resolvedRows) => {
    if (!resolvedRows.length) return;
    const resolvedIds = new Set(resolvedRows.map(({ item }) => item.id));
    const completedFileKeys = new Set(resolvedRows
      .filter(({ data }) => data.file_completed)
      .map(({ item }) => `${item.upload_id}-${item.file_index}`));
    const remainingFiles = (upload?.files || []).filter((file) => !completedFileKeys.has(`${file.upload_id}-${file.file_index}`));
    const remainingUploadIds = [...new Set(remainingFiles.map((file) => file.upload_id))];
    setItems((current) => current.filter((item) => !resolvedIds.has(item.id)));
    setSelectedItem((current) => resolvedIds.has(current?.id) ? null : current);
    setUpload(remainingFiles.length ? { upload_ids: remainingUploadIds, files: remainingFiles } : null);
    setFileQueue((current) => remainingFiles.length
      ? current.filter((file) => !completedFileKeys.has(`${file.uploadId}-${file.fileIndex}`))
      : []);
    if (remainingUploadIds.length) {
      localStorage.setItem('ocr-active-upload-ids', JSON.stringify(remainingUploadIds));
    } else {
      localStorage.removeItem('ocr-active-upload-ids');
      setActiveExtractionIds([]);
      setFailedExtractionIds([]);
      setSelectedFile(null);
      setSelectedItem(null);
      setError('');
    }
  };

  const saveRowsToGhg = async (rows) => {
    const pendingRows = rows.filter((item) => item.status !== 'imported' && item.current_values?.scope !== 'water');
    if (!pendingRows.length) return;
    setBulkSaving(true);
    const resolvedRows = [];
    const failedRows = [];
    for (const item of pendingRows) {
      try {
        const { data } = await saveOcrLineItemToGhg(item.id, getAuthHeader());
        resolvedRows.push({ item, data });
      } catch (requestError) {
        failedRows.push(item);
      }
    }
    removeResolvedRows(resolvedRows);
    if (resolvedRows.length) toast.success(`${resolvedRows.length} row${resolvedRows.length === 1 ? '' : 's'} saved to GHG.`);
    if (failedRows.length) toast.error(`${failedRows.length} row${failedRows.length === 1 ? '' : 's'} could not be saved. Review them individually.`);
    setBulkSaving(false);
  };

  const requestBulkReject = (rows) => {
    const pendingRows = rows.filter((item) => item.status !== 'imported');
    if (pendingRows.length) setBulkRejectRows(pendingRows);
  };

  const rejectRows = async () => {
    if (!bulkRejectRows.length) return;
    setBulkRejecting(true);
    const resolvedRows = [];
    const failedRows = [];
    for (const item of bulkRejectRows) {
      try {
        const { data } = await rejectOcrLineItem(item.id, getAuthHeader());
        resolvedRows.push({ item, data });
      } catch (requestError) {
        failedRows.push(item);
      }
    }
    removeResolvedRows(resolvedRows);
    setBulkRejectRows([]);
    if (resolvedRows.length) toast.success(`${resolvedRows.length} row${resolvedRows.length === 1 ? '' : 's'} rejected.`);
    if (failedRows.length) toast.error(`${failedRows.length} row${failedRows.length === 1 ? '' : 's'} could not be rejected.`);
    setBulkRejecting(false);
  };

  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await downloadOcrTemplate(getAuthHeader());
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ocr_activity_template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('OCR spreadsheet template downloaded');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'The OCR spreadsheet template could not be downloaded.'));
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const clearUpload = async () => {
    if (!upload?.upload_ids?.length) return;
    try {
      await Promise.all(upload.upload_ids.map((uploadId) => deleteOcrUpload(uploadId, getAuthHeader())));
      localStorage.removeItem('ocr-active-upload-id');
      localStorage.removeItem('ocr-active-upload-ids');
      setUpload(null); setItems([]); setSelectedFile(null); setSelectedItem(null); setFileQueue([]); setActiveExtractionIds([]); setFailedExtractionIds([]); setFacilityAssignmentOpen(false); setFacilityAssignmentFiles([]); setError('');
      toast.success('Extraction workspace cleared');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Workspace could not be cleared.'));
    }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const { data } = await getOcrUploadHistory(getAuthHeader());
      setHistory(data.history || []);
    } catch (requestError) {
      setHistoryError(responseMessage(requestError, 'OCR history could not be loaded.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1700px] space-y-6 pb-12" data-testid="ocr-invoice-page">
      <ModulePageHeader
        title="OCR Extraction"
        icon={FileText}
        iconClassName="border-teal-200 bg-teal-50 text-teal-700"
        testId="ocr-invoice"
        aside={<div className="flex flex-wrap items-center gap-2" data-testid="ocr-header-actions">
          <Button type="button" variant="outline" onClick={openHistory} disabled={historyLoading} className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" data-testid="ocr-history-button"><History className="mr-2 h-4 w-4" />History</Button>
          <ExtractionModeSelector modes={configuration.modes} value={mode} onChange={setMode} disabled={processing} compact />
          {upload && <>
            <Button type="button" variant="outline" onClick={clearUpload} className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" data-testid="ocr-clear-upload-button"><Trash2 className="mr-2 h-4 w-4" />Clear workspace</Button>
          </>}
        </div>}
      />

      {error && (
        <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert" data-testid="ocr-error-alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{error}</span>
          {failedExtractionIds.length ? (
            <Button type="button" size="sm" variant="outline" onClick={retryFailedProcessing} disabled={retryingQueue} data-testid="ocr-retry-failed-button">
              <RefreshCw className={`mr-2 h-4 w-4 ${retryingQueue ? 'animate-spin' : ''}`} />{retryingQueue ? 'Retrying' : 'Try again'}
            </Button>
          ) : <button type="button" onClick={() => setError('')} className="font-semibold underline" data-testid="ocr-dismiss-error-button">Dismiss</button>}
        </div>
      )}

      {!upload ? (
        <div className="w-full">
          <UploadWorkspace files={files} fileErrors={stagedFileErrors} onFilesChange={(nextFiles) => { setFiles(nextFiles); setStagedFileErrors({}); }} onProcess={processFiles} processing={processing} progress={progress} onDownloadTemplate={downloadTemplate} downloadingTemplate={downloadingTemplate} queue={Object.keys(stagedFileErrors).length ? [] : fileQueue} onCancel={cancelProcessing} canCancelProcessing={Boolean(activeExtractionIds.length)} cancelling={cancellingQueue} />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-5" aria-labelledby="ocr-source-heading" data-testid="ocr-source-workspace">
            <aside className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="ocr-source-heading" className="text-sm font-semibold text-slate-900">Source documents</h2>
              </div>
              <div className="flex flex-wrap gap-3" data-testid="ocr-source-file-list">
                <button type="button" onClick={() => { setSelectedFile(null); setSelectedItem(null); }} aria-pressed={!selectedFile} className={`flex w-full min-w-0 items-center gap-3 border px-3 py-3 text-left transition-colors sm:w-[12rem] ${!selectedFile ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`} data-testid="ocr-source-file-select-all">
                  <FileText className="h-4 w-4 shrink-0 text-emerald-700" /><span><span className="block text-sm font-medium text-slate-900">All</span><span className="mt-1 block text-xs text-slate-500">{items.length} rows</span></span>
                </button>
                {sourceFiles.map((file) => {
                  const fileId = `${file.upload_id}-${file.file_index}`;
                  const isCancelled = file.status === 'cancelled';
                  const isOpening = openingSourceFileIds.includes(fileId);
                  const isRestarting = restartingSourceFileIds.includes(fileId);
                  const isDeleting = deletingSourceFileIds.includes(fileId);
                  const isSelected = selectedFile?.upload_id === file.upload_id && selectedFile?.file_index === file.file_index;
                  return (
                    <article key={`${fileId}-${file.filename}`} className={`flex w-full min-w-0 items-center gap-3 border px-3 py-3 sm:w-[19rem] ${isSelected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'}`} data-testid={`ocr-source-file-${fileId}`}>
                      <button type="button" onClick={() => chooseFile(file)} className="flex min-w-0 flex-1 items-start gap-3 text-left" aria-pressed={isSelected} data-testid={`ocr-source-file-select-${fileId}`}>
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{file.filename}</span><span className={`mt-1 block text-xs ${isCancelled ? 'text-red-700' : 'text-slate-500'}`}>{file.line_item_count || 0} rows · {file.status}</span></span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {file.preview_supported && <Button type="button" size="icon" variant="ghost" onClick={() => openSourceDocument(file)} disabled={isOpening} aria-label={`View ${file.filename}`} data-testid={`ocr-source-file-view-${fileId}`}>{isOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</Button>}
                        {isCancelled && <Button type="button" size="sm" variant="ghost" onClick={() => resumeCancelledSourceFile(file)} disabled={isRestarting || isDeleting} className="h-8 px-2 text-xs text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" data-testid={`ocr-source-file-process-${fileId}`}>{isRestarting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}Process</Button>}
                        {isCancelled && <Button type="button" size="icon" variant="ghost" onClick={() => deleteCancelledSourceFile(file)} disabled={isRestarting || isDeleting} aria-label={`Delete ${file.filename}`} className="text-red-700 hover:bg-red-50 hover:text-red-800" data-testid={`ocr-source-file-delete-${fileId}`}>{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</Button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </aside>
          </section>

          {fileQueue.some((file) => ['queued', 'processing', 'cancel_requested', 'failed'].includes(file.status)) && <OcrBatchQueue queue={fileQueue} onCancel={cancelProcessing} onCancelFile={cancelInvoiceProcessing} onResume={resumeQueuedExtraction} canCancelProcessing={Boolean(activeExtractionIds.length) && !facilityAssignmentOpen} cancelling={cancellingQueue} resuming={resumingQueue} cancellingFileIds={cancellingFileIds} />}

      <OcrReviewTable items={selectedFileItems} enabledScopes={configuration.enabled_scopes} selectedId={selectedItem?.id} onSelect={setSelectedItem} onEdit={(item) => { setEditingRequiredFields([]); setEditingItem(item); }} onAccept={acceptItem} onReject={setRejectingItem} onBulkSave={saveRowsToGhg} onBulkReject={requestBulkReject} acceptingId={acceptingId} rejectingId={rejectingId} bulkSaving={bulkSaving} bulkRejecting={bulkRejecting} hideInvoiceTabs={Boolean(!selectedFile || !selectedFile.preview_supported)} />

        </div>
      )}

      <OcrEditDialog item={editingItem} open={Boolean(editingItem)} onOpenChange={(open) => { if (!open) { setEditingItem(null); setEditingRequiredFields([]); } }} configuration={configuration} onSave={saveEdit} onAutoMatch={saveAutomaticFactorMatch} saving={saving} getAuthHeaders={getAuthHeader} requiredFields={editingRequiredFields} />

      <OcrFacilityAssignmentDialog files={facilityAssignmentFiles} facilities={configuration.facilities || []} open={facilityAssignmentOpen} saving={facilityAssignmentSaving} onSave={saveFacilityAssignments} onPreview={previewFacilityAssignmentFile} onHidePreview={hideFacilityAssignmentPreview} onCancelFile={cancelInvoiceProcessing} cancellingFileIds={cancellingFileIds} onManageFacilities={() => navigate('/facilities')} previewFile={facilityPreviewFile} previewUrl={facilityPreviewUrl} previewLoading={facilityPreviewLoading} />
      <OcrHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} history={history} loading={historyLoading} error={historyError} />

      <AlertDialog open={Boolean(rejectingItem)} onOpenChange={(open) => { if (!open && !rejectingId) setRejectingItem(null); }}>
        <AlertDialogContent data-testid="ocr-reject-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this extracted row?</AlertDialogTitle>
            <AlertDialogDescription>
              The row will be removed from the OCR queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(rejectingId)} data-testid="ocr-reject-cancel-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rejectItem} disabled={Boolean(rejectingId)} className="bg-red-700 hover:bg-red-800" data-testid="ocr-reject-confirm-button">
              {rejectingId ? 'Rejecting…' : 'Reject row'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={bulkRejectRows.length > 0} onOpenChange={(open) => { if (!open && !bulkRejecting) setBulkRejectRows([]); }}>
        <AlertDialogContent data-testid="ocr-bulk-reject-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="ocr-bulk-reject-confirmation-title">Reject {bulkRejectRows.length} selected row{bulkRejectRows.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription data-testid="ocr-bulk-reject-confirmation-description">Rejected rows are removed from this OCR review queue.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkRejecting} data-testid="ocr-bulk-reject-cancel-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={rejectRows} disabled={bulkRejecting} className="bg-red-700 hover:bg-red-800" data-testid="ocr-bulk-reject-confirm-button">{bulkRejecting ? 'Rejecting…' : 'Reject rows'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}