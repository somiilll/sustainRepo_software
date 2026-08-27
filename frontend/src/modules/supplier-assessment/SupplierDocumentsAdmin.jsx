import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarDays, Eye, FileText, ListChecks, ShieldCheck, Trash2, Upload, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { SupplierAssignmentPicker } from './components/SupplierAssignmentPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const groupPublishedDocuments = (requirements) => Object.values((requirements || []).reduce((groups, requirement) => {
  const key = requirement.document_version_id || requirement.id;
  const existing = groups[key];
  if (!existing) {
    const assignedSupplierNames = [...new Set(requirement.assigned_supplier_names || [])];
    groups[key] = { ...requirement, supplier_relationship_ids: [...(requirement.supplier_relationship_ids || [])], assigned_supplier_names: assignedSupplierNames, assigned_supplier_count: assignedSupplierNames.length };
    return groups;
  }
  existing.supplier_relationship_ids = [...new Set([...(existing.supplier_relationship_ids || []), ...(requirement.supplier_relationship_ids || [])])];
  existing.assigned_supplier_names = [...new Set([...(existing.assigned_supplier_names || []), ...(requirement.assigned_supplier_names || [])])];
  existing.assigned_supplier_count = existing.assigned_supplier_names.length;
  return groups;
}, {}));

export default function SupplierDocumentsAdmin() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  const [documents, setDocuments] = useState([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [responseMode, setResponseMode] = useState('ACCEPTANCE');
  const [statusOptions, setStatusOptions] = useState('I have done it\nI will do it\nIt is in progress');
  const [uploading, setUploading] = useState(false);
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState('');
  const [responseDialog, setResponseDialog] = useState(null);
  const [responseData, setResponseData] = useState(null);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [unlockingSupplierId, setUnlockingSupplierId] = useState('');
  const [previewDocument, setPreviewDocument] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const documentResponse = await axios.get(`${API}/supplier-assessment/documents?reporting_period=${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() });
      setDocuments(groupPublishedDocuments(documentResponse.data));
    } catch {
      toast.error('Could not load documents');
    }
  }, [getAuthHeader, reportingPeriod]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const uploadAgreement = async () => {
    if (!file) { toast.error('Choose a document file first'); return; }
    if (!selectedSuppliers.length) { toast.error('Select at least one supplier'); return; }
    const options = statusOptions.split('\n').map((option) => option.trim()).filter(Boolean);
    if (responseMode === 'STATUS' && !options.length) { toast.error('Add at least one status option'); return; }
    const data = new FormData();
    data.append('file', file); data.append('title', title); data.append('due_date', dueDate); data.append('response_mode', responseMode); data.append('response_options_json', JSON.stringify(options)); data.append('supplier_relationship_ids', JSON.stringify(selectedSuppliers));
    setUploading(true);
    try {
      await axios.post(`${API}/supplier-assessment/documents`, data, { headers: getAuthHeader() });
      toast.success('Document published to selected suppliers');
      setTitle(''); setDueDate(''); setFile(null); setSelectedSuppliers([]); setShowAgreementForm(false);
      document.getElementById('supplier-agreement-file-input').value = '';
      await loadDocuments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not publish document');
    } finally {
      setUploading(false);
    }
  };

  const viewResponses = async (document) => {
    setResponseDialog(document); setResponseData(null); setLoadingResponses(true);
    try { setResponseData((await axios.get(`${API}/supplier-assessment/documents/${document.id}/responses`, { headers: getAuthHeader() })).data); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not load supplier responses'); }
    finally { setLoadingResponses(false); }
  };
  const viewDocument = async (document) => {
    setPreviewDocument(document); setPreviewUrl(''); setPreviewLoading(true);
    try { const response = await axios.get(`${API}/supplier-assessment/documents/${document.id}/preview`, { headers: getAuthHeader(), responseType: 'blob' }); setPreviewUrl(URL.createObjectURL(response.data)); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not preview document'); setPreviewDocument(null); }
    finally { setPreviewLoading(false); }
  };
  const unlockResponse = async (response) => {
    if (!responseDialog || !window.confirm(`Unlock ${response.supplier_name}'s response for resubmission?`)) return;
    setUnlockingSupplierId(response.supplier_relationship_id);
    try { await axios.post(`${API}/supplier-assessment/suppliers/${response.supplier_relationship_id}/documents/${responseDialog.id}/reopen`, {}, { headers: getAuthHeader() }); toast.success('Document response unlocked'); await viewResponses(responseDialog); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not unlock document response'); }
    finally { setUnlockingSupplierId(''); }
  };
  const deleteAgreement = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try { await axios.delete(`${API}/supplier-assessment/documents/${pendingDelete.id}`, { headers: getAuthHeader() }); toast.success('Document removed from supplier access'); setPendingDelete(null); await loadDocuments(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not delete document'); }
    finally { setDeletingId(''); }
  };
  const documentSummary = {
    total: documents.length,
    acceptance: documents.filter((document) => document.response_mode === 'ACCEPTANCE').length,
    assigned: documents.reduce((total, document) => total + (document.assigned_supplier_count || 0), 0),
  };

  return <div className={`space-y-7 ${showAgreementForm ? '' : '[&_[data-testid=supplier-agreement-upload-card]]:hidden'}`} data-testid="supplier-documents-admin-page">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5" data-testid="supplier-documents-header">
      <div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-700 shadow-sm" data-testid="supplier-documents-heading-icon"><FileText className="h-6 w-6" aria-hidden="true" /></div><h1 className="text-3xl font-bold text-emerald-950" data-testid="supplier-documents-heading">Supplier Documents</h1></div>
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-2 shadow-[0_4px_18px_rgba(28,55,43,0.06)]" data-testid="supplier-documents-controls">
        <div className="min-w-40" data-testid="supplier-documents-period-control"><Label htmlFor="supplier-documents-reporting-period" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-stone-600" data-testid="supplier-documents-period-label"><CalendarDays className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />Reporting period</Label><Select value={reportingPeriod} onValueChange={setReportingPeriod}><SelectTrigger id="supplier-documents-reporting-period" className="h-9 bg-white" data-testid="supplier-documents-period-selector"><SelectValue /></SelectTrigger><SelectContent data-testid="supplier-documents-period-menu">{periods.map((period) => <SelectItem key={period} value={period} data-testid={`supplier-documents-period-option-${period}`}>{period}</SelectItem>)}</SelectContent></Select></div>
        <Button className="h-9 bg-emerald-800 text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-emerald-900 hover:shadow-md" onClick={() => setShowAgreementForm(true)} data-testid="open-add-supplier-agreement-button"><Upload className="h-4 w-4" />Add document</Button>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-3" data-testid="supplier-documents-summary-cards"><Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="supplier-documents-total-card"><CardContent className="flex items-center gap-3 p-5"><FileText className="h-5 w-5 text-teal-600" aria-hidden="true" /><div><p className="text-xs font-medium text-stone-500">Documents published</p><p className="mt-1 text-2xl font-bold text-stone-950" data-testid="supplier-documents-total-value">{documentSummary.total}</p></div></CardContent></Card><Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="supplier-documents-acceptance-card"><CardContent className="flex items-center gap-3 p-5"><ShieldCheck className="h-5 w-5 text-sky-600" aria-hidden="true" /><div><p className="text-xs font-medium text-stone-500">Acceptance required</p><p className="mt-1 text-2xl font-bold text-stone-950" data-testid="supplier-documents-acceptance-value">{documentSummary.acceptance}</p></div></CardContent></Card><Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="supplier-documents-assigned-card"><CardContent className="flex items-center gap-3 p-5"><Users className="h-5 w-5 text-stone-600" aria-hidden="true" /><div><p className="text-xs font-medium text-stone-500">Supplier assignments</p><p className="mt-1 text-2xl font-bold text-stone-950" data-testid="supplier-documents-assigned-value">{documentSummary.assigned}</p></div></CardContent></Card></div>

    <Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="supplier-agreement-upload-card"><CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-stone-600" />Publish document</CardTitle><CardDescription>PDF, DOC, or DOCX up to 10MB.</CardDescription></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><div className="space-y-2"><Label htmlFor="supplier-agreement-title">Document title</Label><Input id="supplier-agreement-title" value={title} onChange={(event) => setTitle(event.target.value)} data-testid="supplier-agreement-title-input" /></div><div className="space-y-2"><Label htmlFor="supplier-agreement-file-input">Document file</Label><Input id="supplier-agreement-file-input" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} data-testid="supplier-agreement-file-input" /></div><div className="space-y-2"><Label htmlFor="supplier-agreement-due-date">Due date</Label><Input id="supplier-agreement-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} data-testid="supplier-agreement-due-date-input" /></div><div className="space-y-2"><Label htmlFor="supplier-document-response-mode">Response type</Label><select id="supplier-document-response-mode" value={responseMode} onChange={(event) => setResponseMode(event.target.value)} className="h-10 w-full border border-stone-300 bg-white px-3 text-sm" data-testid="supplier-document-response-mode-select"><option value="ACCEPTANCE">Acceptance</option><option value="STATUS">Status</option></select></div>{responseMode === 'STATUS' && <div className="space-y-2"><Label htmlFor="supplier-document-status-options">Status options</Label><textarea id="supplier-document-status-options" value={statusOptions} onChange={(event) => setStatusOptions(event.target.value)} className="min-h-24 w-full border border-stone-300 p-3 text-sm" data-testid="supplier-document-status-options-input" /></div>}<div className="md:col-span-2"><SupplierAssignmentPicker selectedIds={selectedSuppliers} onChange={setSelectedSuppliers} getAuthHeader={getAuthHeader} testIdPrefix="document" reportingPeriod={reportingPeriod} /></div><div className="md:col-span-2"><Button onClick={uploadAgreement} disabled={uploading} data-testid="publish-supplier-agreement-button">{uploading ? 'Publishing…' : 'Publish document'}</Button></div></CardContent></Card>

    <div className="space-y-4" data-testid="published-supplier-agreements-list">{documents.length === 0 ? <p className="py-8 text-center text-sm text-stone-500" data-testid="supplier-agreements-empty-state">No documents have been published.</p> : documents.map((document) => <Card key={document.id} className="rounded-xl border-stone-200 bg-white shadow-[0_4px_18px_rgba(28,55,43,0.05)]" data-testid={`published-supplier-agreement-${document.id}`}><CardContent className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center"><div className="flex min-w-0 flex-1 items-start gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden="true" /><div className="min-w-0"><p className="text-base font-semibold text-stone-950" data-testid={`supplier-document-title-${document.id}`}>{document.title}</p><p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-stone-500" data-testid={`supplier-document-response-options-${document.id}`}><span className="shrink-0 font-medium text-stone-600">{document.response_mode === 'STATUS' ? 'Response options' : 'Response'}</span><span>{document.response_mode === 'STATUS' ? (document.response_options || []).join(' · ') : 'Acceptance required'}</span></p><p className="mt-3 flex items-center gap-1.5 text-xs text-stone-600" data-testid={`agreement-assigned-suppliers-${document.id}`}><Users className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" /><span className="font-semibold text-stone-700">{document.assigned_supplier_count || 0}</span> supplier{document.assigned_supplier_count === 1 ? '' : 's'} assigned</p></div></div><div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end"><Button variant="outline" size="sm" className="h-8 border-stone-200 bg-white text-stone-700 shadow-none transition-[background-color,border-color,color] hover:border-stone-300 hover:bg-stone-50" onClick={() => viewDocument(document)} data-testid={`preview-supplier-agreement-${document.id}`}><Eye className="h-3.5 w-3.5" />Preview</Button><Button variant="outline" size="sm" className="h-8 border-stone-200 bg-white text-stone-700 shadow-none transition-[background-color,border-color,color] hover:border-stone-300 hover:bg-stone-50" onClick={() => viewResponses(document)} data-testid={`view-document-responses-${document.id}`}><ListChecks className="h-3.5 w-3.5" />View suppliers</Button><Button variant="outline" size="sm" className="h-8 border-rose-200 bg-white text-rose-600 shadow-none transition-[background-color,border-color,color] hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700" disabled={deletingId === document.id} onClick={() => setPendingDelete(document)} data-testid={`delete-supplier-agreement-${document.id}`}><Trash2 className="h-3.5 w-3.5" />Delete</Button></div></CardContent></Card>)}</div>

    <Dialog open={Boolean(responseDialog)} onOpenChange={(open) => !open && setResponseDialog(null)}><DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto" data-testid="document-responses-dialog"><DialogHeader><DialogTitle data-testid="document-responses-dialog-title">Assigned suppliers — {responseDialog?.title}</DialogTitle></DialogHeader>{loadingResponses ? <p data-testid="document-responses-loading">Loading suppliers…</p> : (responseData?.responses || []).length ? <div className="divide-y divide-stone-100" data-testid="document-responses-list">{responseData.responses.map((response) => { const submitted = response.submission_status === 'submitted' && Boolean(response.selected_response); return <div key={response.supplier_relationship_id} className="flex flex-wrap items-center justify-between gap-4 py-3" data-testid={`document-response-${response.supplier_relationship_id}`}><div><span className="font-medium text-stone-900">{response.supplier_name}</span>{response.selected_response && <p className="mt-1 text-xs text-stone-500" data-testid={`document-response-value-${response.supplier_relationship_id}`}>{response.selected_response}</p>}</div><div className="flex items-center gap-3"><Badge variant="outline" className={submitted ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'} data-testid={`document-response-status-${response.supplier_relationship_id}`}>{submitted ? 'Submitted' : 'Pending'}</Badge>{response.can_unlock && response.submission_status !== 'reopened' && <Button variant="outline" size="sm" disabled={unlockingSupplierId === response.supplier_relationship_id} onClick={() => unlockResponse(response)} data-testid={`unlock-document-response-${response.supplier_relationship_id}`}>{unlockingSupplierId === response.supplier_relationship_id ? 'Unlocking…' : 'Unlock'}</Button>}</div></div>; })}</div> : <p className="py-10 text-center text-sm text-stone-500" data-testid="document-responses-empty">No active suppliers are assigned.</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(previewDocument)} onOpenChange={(open) => { if (!open) { setPreviewDocument(null); setPreviewUrl(''); } }}><DialogContent className="max-h-[calc(100dvh-2rem)] max-w-6xl" data-testid="document-preview-dialog"><DialogHeader><DialogTitle data-testid="document-preview-dialog-title">Document preview — {previewDocument?.title}</DialogTitle></DialogHeader>{previewLoading ? <p className="py-16 text-center text-sm text-stone-500" data-testid="document-preview-loading">Preparing preview…</p> : previewUrl && <iframe src={previewUrl} title={previewDocument?.title || 'Document preview'} className="h-[72dvh] w-full border border-stone-200 bg-stone-50" data-testid="document-preview-frame" />}</DialogContent></Dialog>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}><AlertDialogContent data-testid="delete-supplier-agreement-dialog"><AlertDialogHeader><AlertDialogTitle>Delete {pendingDelete?.title}?</AlertDialogTitle><AlertDialogDescription>This removes the document from all active supplier assignments. Its historical response record and stored file are retained for audit purposes.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="cancel-delete-supplier-agreement-button">Cancel</AlertDialogCancel><AlertDialogAction onClick={deleteAgreement} data-testid="confirm-delete-supplier-agreement-button">Delete document</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}