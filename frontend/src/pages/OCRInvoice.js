import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, FileText, RefreshCw, Trash2 } from 'lucide-react';
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
import { DocumentPreview } from '../modules/ocr/DocumentPreview';
import { ExtractionModeSelector } from '../modules/ocr/ExtractionModeSelector';
import { OcrEditDialog } from '../modules/ocr/OcrEditDialog';
import { OcrFacilityAssignmentDialog } from '../modules/ocr/OcrFacilityAssignmentDialog';
import { OcrBatchQueue } from '../modules/ocr/OcrBatchQueue';
import { OcrReviewTable } from '../modules/ocr/OcrReviewTable';
import { UploadWorkspace } from '../modules/ocr/UploadWorkspace';
import { ModulePageHeader } from '../components/ModulePageHeader';
import {
  acceptOcrLineItem,
  assignOcrUploadFacilities,
  cancelOcrUpload,
  deleteOcrUpload,
  downloadOcrTemplate,
  getOcrConfiguration,
  getOcrUpload,
  loadOcrPreview,
  rejectOcrLineItem,
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
const directGhgMissingFields = (values = {}) => {
  const missing = [];
  const hasValue = (value) => value !== undefined && value !== null && value !== '';
  if (!values.facility_id) missing.push('facility_id');
  if (!values.reporting_period) missing.push('reporting_period');
  if (!(values.factor_id || values.fuel_id || values.scope3_ef_id)) missing.push('factor_id');
  if (values.scope === 'scope3' && values.ef_method === 'spend') {
    if (!hasValue(values.cost)) missing.push('cost');
    if (!values.currency) missing.push('currency');
  } else {
    if (!hasValue(values.quantity)) missing.push('quantity');
    if (!values.unit) missing.push('unit');
  }
  return missing;
};

export default function OCRInvoice() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [configuration, setConfiguration] = useState(FALLBACK_CONFIGURATION);
  const [mode, setMode] = useState(() => localStorage.getItem('ocr-extraction-mode') || 'fast');
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [upload, setUpload] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
  const facilityPreviewRequestRef = useRef(0);
  const [activeExtractionIds, setActiveExtractionIds] = useState([]);

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
    return () => { mounted = false; };
  }, [getAuthHeader]);

  useEffect(() => {
    localStorage.setItem('ocr-extraction-mode', mode);
  }, [mode]);

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
        setFileQueue(activeRecords.flatMap((record) => (record.upload.files || []).map((file) => ({
          id: `${record.upload.id}-${file.file_index}`,
          uploadId: record.upload.id,
          filename: file.filename,
          status: file.status || record.upload.status,
        }))));
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
          setSelectedFile((current) => current || completedFiles[0]);
          setSelectedItem((current) => current || completedItems[0] || null);
          const invoiceFiles = completedFiles.filter((file) => file.preview_supported && !file.facility_id);
          if (invoiceFiles.length) {
            setFacilityAssignmentFiles(invoiceFiles);
            setFacilityAssignmentOpen(true);
          }
          toast.success(`Extraction ready: ${completedItems.length} activity row${completedItems.length === 1 ? '' : 's'}`);
        }
        terminalRecords.filter((record) => record.upload.status === 'failed').forEach((record) => {
          toast.error(record.upload.errors?.[0]?.error || 'Invoice extraction could not be completed.');
        });
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => () => {
    if (facilityPreviewUrl) URL.revokeObjectURL(facilityPreviewUrl);
  }, [facilityPreviewUrl]);

  const selectedFileItems = useMemo(() => (
    selectedFile ? items.filter((item) => item.upload_id === selectedFile.upload_id && item.file_index === selectedFile.file_index) : items
  ), [items, selectedFile]);

  const processFiles = async () => {
    if (!files.length) return;
    setProcessing(true);
    setProgress(0);
    setError('');
    setFileQueue(files.map((file, index) => ({ id: `queued-${index}`, filename: file.name, status: 'queued' })));
    try {
      const { data } = await uploadOcrFiles(files, mode, getAuthHeader());
      if (!data.files?.length) throw new Error(data.errors?.[0]?.error || 'No invoice could be staged securely.');
      let existingIds = [];
      try { existingIds = JSON.parse(localStorage.getItem('ocr-active-upload-ids') || '[]'); } catch { existingIds = []; }
      const uploadIds = [...new Set([...existingIds, data.upload_id])];
      localStorage.setItem('ocr-active-upload-ids', JSON.stringify(uploadIds));
      localStorage.removeItem('ocr-active-upload-id');
      setActiveExtractionIds((current) => [...new Set([...current, data.upload_id])]);
      setFileQueue(data.files.map((file) => ({ id: `${data.upload_id}-${file.file_index}`, uploadId: data.upload_id, filename: file.filename, status: file.status })));
      toast.success(`${data.file_count} source document${data.file_count === 1 ? '' : 's'} queued for extraction.`);
    } catch (requestError) {
      setError(responseMessage(requestError, 'Files could not be queued for extraction.'));
      setFileQueue(files.map((file, index) => ({ id: `failed-${index}`, filename: file.name, status: 'failed' })));
    } finally {
      setFiles([]);
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

  const loadPreview = async () => {
    if (!selectedFile?.upload_id) return;
    setPreviewLoading(true);
    try {
      const response = await loadOcrPreview(selectedFile.upload_id, selectedFile.file_index, getAuthHeader());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(response.data));
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Secure preview could not be loaded.'));
    } finally {
      setPreviewLoading(false);
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
      await Promise.all(Object.entries(byUpload).map(([uploadId, uploadAssignments]) => (
        assignOcrUploadFacilities(uploadId, uploadAssignments, getAuthHeader())
      )));
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
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
          if (remainingUploadIds.length) localStorage.setItem('ocr-active-upload-ids', JSON.stringify(remainingUploadIds));
          else localStorage.removeItem('ocr-active-upload-ids');
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
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        const remainingFiles = (upload?.files || []).filter((file) => !(file.upload_id === rejectingItem.upload_id && file.file_index === rejectingItem.file_index));
        const remainingUploadIds = [...new Set(remainingFiles.map((file) => file.upload_id))];
        setUpload(remainingFiles.length ? { upload_ids: remainingUploadIds, files: remainingFiles } : null);
        setSelectedFile(remainingFiles[0] || null);
        if (remainingUploadIds.length) localStorage.setItem('ocr-active-upload-ids', JSON.stringify(remainingUploadIds));
        else localStorage.removeItem('ocr-active-upload-ids');
      }
      setRejectingItem(null);
      toast.success(data.upload_completed ? 'All extracted rows have been resolved' : 'Row rejected and removed');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'This row could not be rejected.'));
    } finally {
      setRejectingId(null);
    }
  };

  const exportCsv = async () => {
    if (!items.length) return;
    try {
      const fields = ['invoice_number', 'date', 'billing_period_text', 'vendor_name', 'location', 'item_description', 'scope', 'category', 'subcategory', 'quantity', 'unit', 'cost', 'currency', 'distance_km', 'origin', 'destination', 'ef_method', 'ef_database', 'accounting_rationale', 'confidence_score', 'needs_review', 'status'];
      const quote = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const csv = [fields.join(','), ...items.map((item) => fields.map((field) => quote(field in item ? item[field] : item.current_values?.[field])).join(','))].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ocr-extraction.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV export downloaded');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'CSV export could not be downloaded.'));
    }
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
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setUpload(null); setItems([]); setSelectedFile(null); setSelectedItem(null); setPreviewUrl(null); setError('');
      toast.success('Extraction workspace cleared');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Workspace could not be cleared.'));
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
          <ExtractionModeSelector modes={configuration.modes} value={mode} onChange={setMode} disabled={processing} compact />
          {upload && <>
            <Button type="button" variant="outline" onClick={exportCsv} data-testid="ocr-export-csv-button"><Download className="mr-2 h-4 w-4" />Export CSV</Button>
            <Button type="button" variant="outline" onClick={clearUpload} className="text-red-700 hover:bg-red-50" data-testid="ocr-clear-upload-button"><Trash2 className="mr-2 h-4 w-4" />Clear workspace</Button>
          </>}
        </div>}
      />

      {error && (
        <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert" data-testid="ocr-error-alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="font-semibold underline" data-testid="ocr-dismiss-error-button">Dismiss</button>
        </div>
      )}

      {!upload ? (
        <div className="w-full">
          <UploadWorkspace files={files} onFilesChange={setFiles} onProcess={processFiles} processing={processing} progress={progress} onDownloadTemplate={downloadTemplate} downloadingTemplate={downloadingTemplate} queue={fileQueue} onCancel={cancelProcessing} canCancelProcessing={Boolean(activeExtractionIds.length)} cancelling={cancellingQueue} />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-5" aria-labelledby="ocr-source-heading" data-testid="ocr-source-workspace">
            <aside className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 id="ocr-source-heading" className="text-sm font-semibold text-slate-900">Source documents</h2>
                <Button type="button" size="icon" variant="ghost" onClick={clearUpload} aria-label="Start another extraction" data-testid="ocr-start-new-button"><RefreshCw className="h-4 w-4" /></Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="ocr-source-file-list">
                {upload.files.map((file) => (
                  <button key={`${file.upload_id}-${file.file_index}-${file.filename}`} type="button" onClick={() => chooseFile(file)} className={`flex min-w-0 items-start gap-3 border px-3 py-3 text-left transition-colors ${selectedFile?.upload_id === file.upload_id && selectedFile?.file_index === file.file_index ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`} data-testid={`ocr-source-file-${file.upload_id}-${file.file_index}`}>
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{file.filename}</span><span className="mt-1 block text-xs text-slate-500">{file.line_item_count} rows · {file.status}</span></span>
                  </button>
                ))}
              </div>
            </aside>
            <DocumentPreview file={selectedFile} previewUrl={previewUrl} loading={previewLoading} onLoadPreview={loadPreview} />
          </section>

          {processing && <OcrBatchQueue queue={fileQueue} onCancel={cancelProcessing} canCancelProcessing={Boolean(activeExtractionIds.length)} cancelling={cancellingQueue} />}

      <OcrReviewTable items={selectedFileItems} enabledScopes={configuration.enabled_scopes} selectedId={selectedItem?.id} onSelect={setSelectedItem} onEdit={(item) => { setEditingRequiredFields([]); setEditingItem(item); }} onAccept={acceptItem} onReject={setRejectingItem} acceptingId={acceptingId} rejectingId={rejectingId} />

        </div>
      )}

      <OcrEditDialog item={editingItem} open={Boolean(editingItem)} onOpenChange={(open) => { if (!open) { setEditingItem(null); setEditingRequiredFields([]); } }} configuration={configuration} onSave={saveEdit} onAutoMatch={saveAutomaticFactorMatch} saving={saving} getAuthHeaders={getAuthHeader} requiredFields={editingRequiredFields} />

      <OcrFacilityAssignmentDialog files={facilityAssignmentFiles} facilities={configuration.facilities || []} open={facilityAssignmentOpen} saving={facilityAssignmentSaving} onSave={saveFacilityAssignments} onPreview={previewFacilityAssignmentFile} onHidePreview={hideFacilityAssignmentPreview} onManageFacilities={() => navigate('/facilities')} previewFile={facilityPreviewFile} previewUrl={facilityPreviewUrl} previewLoading={facilityPreviewLoading} />

      <AlertDialog open={Boolean(rejectingItem)} onOpenChange={(open) => { if (!open && !rejectingId) setRejectingItem(null); }}>
        <AlertDialogContent data-testid="ocr-reject-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this extracted row?</AlertDialogTitle>
            <AlertDialogDescription>
              The row will be removed from the OCR queue. Its shared source file stays temporary until every row from that file is either saved or rejected.
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
    </main>
  );
}