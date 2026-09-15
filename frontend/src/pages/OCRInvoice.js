import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Download, FileText, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
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
import { useOCR } from '../contexts/OCRContext';
import { DocumentPreview } from '../modules/ocr/DocumentPreview';
import { ExtractionModeSelector } from '../modules/ocr/ExtractionModeSelector';
import { OcrEditDialog } from '../modules/ocr/OcrEditDialog';
import { OcrReviewTable } from '../modules/ocr/OcrReviewTable';
import { UploadWorkspace } from '../modules/ocr/UploadWorkspace';
import {
  acceptOcrLineItem,
  deleteOcrUpload,
  downloadOcrCsv,
  downloadOcrTemplate,
  getOcrConfiguration,
  getOcrUpload,
  loadOcrPreview,
  rejectOcrLineItem,
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
};

const responseMessage = (error, fallback) => error?.response?.data?.detail || error?.response?.data?.message || fallback;

export default function OCRInvoice() {
  const { getAuthHeader } = useAuth();
  const { setOcrAcceptedData } = useOCR();
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
  const [saving, setSaving] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    const headers = getAuthHeader();
    getOcrConfiguration(headers)
      .then(({ data }) => { if (mounted) setConfiguration(data); })
      .catch(() => { if (mounted) setError('Organization OCR settings could not be loaded. Default options are shown.'); });
    const activeUploadId = localStorage.getItem('ocr-active-upload-id');
    if (activeUploadId) {
      getOcrUpload(activeUploadId, headers)
        .then(({ data }) => {
          if (!mounted) return;
          const unresolvedItems = data.line_items || [];
          if (!unresolvedItems.length) {
            localStorage.removeItem('ocr-active-upload-id');
            return;
          }
          const unresolvedFileIndexes = new Set(unresolvedItems.map((item) => item.file_index));
          const unresolvedFiles = (data.upload?.files || []).filter((file) => unresolvedFileIndexes.has(file.file_index));
          setUpload({ ...data.upload, upload_id: data.upload.id, files: unresolvedFiles });
          setItems(unresolvedItems);
          setSelectedFile(unresolvedFiles[0] || null);
          setSelectedItem(unresolvedItems[0] || null);
        })
        .catch(() => localStorage.removeItem('ocr-active-upload-id'));
    }
    return () => { mounted = false; };
  }, [getAuthHeader]);

  useEffect(() => {
    localStorage.setItem('ocr-extraction-mode', mode);
  }, [mode]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectedFileItems = useMemo(() => (
    selectedFile ? items.filter((item) => item.file_index === selectedFile.file_index) : items
  ), [items, selectedFile]);

  const processFiles = async () => {
    if (!files.length) return;
    setProcessing(true);
    setProgress(8);
    setError('');
    try {
      const { data } = await uploadOcrFiles(files, mode, getAuthHeader(), (event) => {
        if (event.total) setProgress(Math.min(60, Math.round((event.loaded / event.total) * 55) + 5));
      });
      setProgress(100);
      setUpload(data);
      localStorage.setItem('ocr-active-upload-id', data.upload_id);
      setItems(data.line_items || []);
      setSelectedFile(data.files?.[0] || null);
      setSelectedItem(data.line_items?.[0] || null);
      setFiles([]);
      if (data.errors?.length) {
        setError(`${data.errors.length} file${data.errors.length === 1 ? '' : 's'} could not be processed. Successful files remain available.`);
      }
      toast.success(`Extracted ${data.total_line_items} activity row${data.total_line_items === 1 ? '' : 's'}`);
    } catch (requestError) {
      const message = responseMessage(requestError, 'Invoice extraction failed. Please try again.');
      setError(message);
      toast.error(message);
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 500);
    }
  };

  const loadPreview = async () => {
    if (!upload?.upload_id || !selectedFile) return;
    setPreviewLoading(true);
    try {
      const response = await loadOcrPreview(upload.upload_id, selectedFile.file_index, getAuthHeader());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(response.data));
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Secure preview could not be loaded.'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const chooseFile = (file) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(file);
    setSelectedItem(items.find((item) => item.file_index === file.file_index) || null);
  };

  const saveEdit = async (values) => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const { data } = await updateOcrLineItem(editingItem.id, values, getAuthHeader());
      setItems((current) => current.map((item) => item.id === editingItem.id ? data.line_item : item));
      setSelectedItem(data.line_item);
      setEditingItem(null);
      toast.success(values.remember_override ? 'Changes saved and vendor mapping remembered' : 'Changes saved');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Changes could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const acceptItem = async (item) => {
    setAcceptingId(item.id);
    try {
      const { data } = await acceptOcrLineItem(item.id, getAuthHeader());
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: 'accepted' } : row));
      setOcrAcceptedData(data.prefill_data);
      toast.success('Activity accepted. Opening the emissions form.');
      navigate(`/ghg/${data.prefill_data.scope || 'scope1'}`, { state: { openAddForm: true, ocrPrefill: data.prefill_data } });
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'This activity could not be accepted.'));
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
      const remainingFileIndexes = new Set(remainingItems.map((item) => item.file_index));
      const remainingFiles = (upload?.files || []).filter((file) => remainingFileIndexes.has(file.file_index));
      setItems(remainingItems);
      setSelectedItem(remainingItems.find((item) => item.file_index === rejectingItem.file_index) || remainingItems[0] || null);
      if (data.file_completed) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setUpload((current) => current ? { ...current, files: remainingFiles } : current);
        setSelectedFile(remainingFiles[0] || null);
      }
      if (data.upload_completed) {
        localStorage.removeItem('ocr-active-upload-id');
        setUpload(null);
        setSelectedFile(null);
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
    if (!upload?.upload_id) return;
    try {
      const response = await downloadOcrCsv(upload.upload_id, getAuthHeader());
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ocr-extraction-${upload.upload_id}.csv`;
      link.click();
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
    if (!upload?.upload_id) return;
    try {
      await deleteOcrUpload(upload.upload_id, getAuthHeader());
      localStorage.removeItem('ocr-active-upload-id');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setUpload(null); setItems([]); setSelectedFile(null); setSelectedItem(null); setPreviewUrl(null); setError('');
      toast.success('Extraction workspace cleared');
    } catch (requestError) {
      toast.error(responseMessage(requestError, 'Workspace could not be cleared.'));
    }
  };

  return (
    <main className="mx-auto max-w-[1600px] space-y-8 pb-12" data-testid="ocr-invoice-page">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Secure organization workspace
            </div>
            <h1 className="mt-3 text-4xl font-heading font-bold text-slate-950 sm:text-5xl lg:text-6xl">Activity extraction</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
              Convert invoices and ledgers into reviewable Scope 1, 2 and 3 activity data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={downloadTemplate} disabled={downloadingTemplate} data-testid="ocr-download-template-button">
                {downloadingTemplate ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}Download template
              </Button>
            {upload && <>
              <Button type="button" variant="outline" onClick={exportCsv} data-testid="ocr-export-csv-button"><Download className="mr-2 h-4 w-4" />Export CSV</Button>
              <Button type="button" variant="outline" onClick={clearUpload} className="text-red-700 hover:bg-red-50" data-testid="ocr-clear-upload-button"><Trash2 className="mr-2 h-4 w-4" />Clear workspace</Button>
            </>}
          </div>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert" data-testid="ocr-error-alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} className="font-semibold underline" data-testid="ocr-dismiss-error-button">Dismiss</button>
        </div>
      )}

      {!upload ? (
        <div className="grid gap-8 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <ExtractionModeSelector modes={configuration.modes} value={mode} onChange={setMode} disabled={processing} />
          <UploadWorkspace files={files} onFilesChange={setFiles} onProcess={processFiles} processing={processing} progress={progress} onDownloadTemplate={downloadTemplate} downloadingTemplate={downloadingTemplate} />
        </div>
      ) : (
        <div className="space-y-8">
          <section className="grid gap-5 xl:grid-cols-[17rem_minmax(0,1fr)]" aria-labelledby="ocr-source-heading" data-testid="ocr-source-workspace">
            <aside className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 id="ocr-source-heading" className="text-sm font-semibold text-slate-900">Source documents</h2>
                <Button type="button" size="icon" variant="ghost" onClick={clearUpload} aria-label="Start another extraction" data-testid="ocr-start-new-button"><RefreshCw className="h-4 w-4" /></Button>
              </div>
              {upload.files.map((file) => (
                <button key={`${file.file_index}-${file.filename}`} type="button" onClick={() => chooseFile(file)} className={`flex w-full items-start gap-3 border px-3 py-3 text-left transition-colors ${selectedFile?.file_index === file.file_index ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`} data-testid={`ocr-source-file-${file.file_index}`}>
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-900">{file.filename}</span><span className="mt-1 block text-xs text-slate-500">{file.line_item_count} rows · {file.status}</span></span>
                </button>
              ))}
            </aside>
            <DocumentPreview file={selectedFile} previewUrl={previewUrl} loading={previewLoading} onLoadPreview={loadPreview} />
          </section>

          <OcrReviewTable items={selectedFileItems} enabledScopes={configuration.enabled_scopes} selectedId={selectedItem?.id} onSelect={setSelectedItem} onEdit={setEditingItem} onAccept={acceptItem} onReject={setRejectingItem} acceptingId={acceptingId} rejectingId={rejectingId} />

          {selectedItem && (
            <section className="border-l-4 border-emerald-600 bg-slate-50 p-4 lg:hidden" data-testid="ocr-selected-item-actions">
              <p className="text-sm font-semibold text-slate-900">{selectedItem.current_values?.category}</p>
              <p className="mt-1 text-xs text-slate-600">{selectedItem.current_values?.accounting_rationale}</p>
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="outline" onClick={() => setEditingItem(selectedItem)} data-testid="ocr-mobile-edit-button">Edit</Button>
                <Button type="button" variant="outline" className="text-red-700 hover:bg-red-50" onClick={() => setRejectingItem(selectedItem)} data-testid="ocr-mobile-reject-button">Reject</Button>
                <Button type="button" onClick={() => acceptItem(selectedItem)} disabled={acceptingId === selectedItem.id} data-testid="ocr-mobile-accept-button">Accept activity</Button>
              </div>
            </section>
          )}
        </div>
      )}

      <OcrEditDialog item={editingItem} open={Boolean(editingItem)} onOpenChange={(open) => { if (!open) setEditingItem(null); }} configuration={configuration} onSave={saveEdit} saving={saving} />

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