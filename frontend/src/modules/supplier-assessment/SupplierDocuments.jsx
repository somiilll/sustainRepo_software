import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Download, ExternalLink, Eye, FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { SupplierPageHeader } from './components/SupplierPageHeader';
import { SupplierStatusInfographics } from './components/SupplierStatusInfographics';
import { LoadErrorState } from '../../components/LoadErrorState';
import { getUserFriendlyError } from '../../lib/userFriendlyError';
import { Input } from '../../components/ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierDocuments() {
  const { getAuthHeader } = useAuth(); const [documents, setDocuments] = useState([]); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [submittingId, setSubmittingId] = useState(null); const [selectedStatus, setSelectedStatus] = useState({}); const [pendingSubmission, setPendingSubmission] = useState(null);
  const loadDocuments = useCallback(async () => { setLoading(true); setLoadError(''); try { setDocuments((await axios.get(`${API}/supplier-assessment/my-assessment/documents`, { headers: getAuthHeader() })).data || []); } catch (error) { setDocuments([]); setLoadError(getUserFriendlyError(error, 'Unable to load documents. Please try again.', { preferFallback: true })); } finally { setLoading(false); } }, [getAuthHeader]);
  useEffect(() => {
    loadDocuments();
    const refreshAssignments = () => loadDocuments();
    window.addEventListener('focus', refreshAssignments);
    const intervalId = window.setInterval(refreshAssignments, 30000);
    return () => { window.removeEventListener('focus', refreshAssignments); window.clearInterval(intervalId); };
  }, [loadDocuments]);
  const viewDocument = async (document, download = false) => { try { const response = await axios.get(`${API}/supplier-assessment/my-assessment/documents/${document.id}/view${download ? '?download=true' : ''}`, { headers: getAuthHeader() }); window.open(response.data.url, '_blank', 'noopener,noreferrer'); setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, has_been_viewed: true } : item)); } catch (error) { toast.error(error.response?.data?.detail || 'Could not open document'); } };
  const uploadResponseFiles = async (document, files) => { if (!files?.length) return; setSubmittingId(document.id); try { const data = new FormData(); [...files].forEach((file) => data.append('files', file)); await axios.post(`${API}/supplier-assessment/my-assessment/documents/${document.id}/response-files`, data, { headers: getAuthHeader() }); toast.success('Response files uploaded'); await loadDocuments(); } catch (error) { toast.error(error.response?.data?.detail || 'Could not upload response files'); } finally { setSubmittingId(null); } };
  const deleteResponseFile = async (document, file) => { setSubmittingId(document.id); try { await axios.delete(`${API}/supplier-assessment/my-assessment/documents/${document.id}/response-files/${file.id}`, { headers: getAuthHeader() }); toast.success('Response file removed'); await loadDocuments(); } catch (error) { toast.error(error.response?.data?.detail || 'Could not remove response file'); } finally { setSubmittingId(null); } };
  const openResponseFile = async (document, file, download = false) => { try { const response = await axios.get(`${API}/supplier-assessment/my-assessment/documents/${document.id}/response-files/${file.id}${download ? '?download=true' : ''}`, { headers: getAuthHeader(), responseType: 'blob' }); const url = URL.createObjectURL(response.data); window.open(url, '_blank', 'noopener,noreferrer'); window.setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (error) { toast.error(error.response?.data?.detail || 'Could not open response file'); } };
  const submitDocumentUpload = async (document) => { setSubmittingId(document.id); try { await axios.post(`${API}/supplier-assessment/my-assessment/documents/${document.id}/submit-upload`, {}, { headers: getAuthHeader() }); toast.success('Document response submitted and locked'); await loadDocuments(); } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit document response'); } finally { setSubmittingId(null); } };
  const acceptDocument = async (document) => { setSubmittingId(document.id); try { await axios.post(`${API}/supplier-assessment/my-assessment/documents/${document.id}/accept`, {}, { headers: getAuthHeader() }); toast.success('Document accepted'); await loadDocuments(); } catch (error) { toast.error(error.response?.data?.detail || 'Could not record acceptance'); } finally { setSubmittingId(null); } };
  const selectStatus = async (document, responseValue) => { setSubmittingId(document.id); try { await axios.post(`${API}/supplier-assessment/my-assessment/documents/${document.id}/respond`, { response_value: responseValue }, { headers: getAuthHeader() }); toast.success('Response submitted'); await loadDocuments(); } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit response'); } finally { setSubmittingId(null); } };
  const requestStatusSubmission = (document) => { const responseValue = selectedStatus[document.id]; if (!responseValue) { toast.error('Choose a response first'); return; } setPendingSubmission({ document, responseValue, type: 'status' }); };
  const confirmSubmission = async () => { const submission = pendingSubmission; if (!submission) return; setPendingSubmission(null); if (submission.type === 'acceptance') await acceptDocument(submission.document); else if (submission.type === 'upload') await submitDocumentUpload(submission.document); else await selectStatus(submission.document, submission.responseValue); };
  const statusCounts = documents.reduce((counts, document) => {
    counts.total += 1;
    const completed = document.accepted || Boolean(document.selected_response) || document.submission_status === 'submitted';
    const dueDate = document.due_date ? new Date(document.due_date) : null;
    if (dueDate) dueDate.setHours(23, 59, 59, 999);
    if (completed) counts.completed += 1;
    else if (dueDate && dueDate < new Date()) counts.overdue += 1;
    else if (document.submission_status === 'reopened' || selectedStatus[document.id]) counts.draft += 1;
    else counts.pending += 1;
    return counts;
  }, { total: 0, completed: 0, draft: 0, pending: 0, overdue: 0 });
  const isDocumentOverdue = (document) => Boolean(document.due_date && !(document.accepted || document.selected_response || document.submission_status === 'submitted') && new Date(`${document.due_date.slice(0, 10)}T23:59:59`) < new Date());
  return <div className="space-y-8" data-testid="supplier-documents-page">
    <SupplierPageHeader title="Documents" description="Review the current documents from your customer and provide the requested response." icon={FileText} iconClassName="border-teal-200 bg-teal-50 text-teal-700" testId="supplier-documents" />
    {!loadError && <SupplierStatusInfographics title="Document status" counts={statusCounts} testId="supplier-documents" />}
    <section className="mt-8 grid gap-4" data-testid="supplier-documents-list">
      {loadError ? <LoadErrorState title="Unable to load documents" message={loadError} onRetry={loadDocuments} testId="supplier-documents-load-error" /> : loading ? <p className="py-10 text-center text-sm text-stone-500" data-testid="supplier-documents-loading">Loading documents…</p> : documents.length === 0 ? <Card data-testid="supplier-documents-empty-state"><CardContent className="py-12 text-center text-sm text-stone-500">No documents are required for this assessment.</CardContent></Card> : documents.map((document) => { const uploadMode = document.response_mode === 'DOCUMENT_UPLOAD'; const locked = document.submission_status === 'submitted'; return <Card key={document.id} data-testid={`supplier-document-card-${document.id}`}><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-700" />{document.title}</CardTitle><CardDescription className="mt-2">{document.original_filename}</CardDescription>{document.due_date && <p className="mt-2 text-xs font-medium text-stone-600" data-testid={`supplier-document-due-date-${document.id}`}>Due {new Date(`${document.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString()}</p>}</div>{isDocumentOverdue(document) && <Badge className="bg-rose-100 text-rose-800" data-testid={`supplier-document-overdue-${document.id}`}>Overdue</Badge>}{locked && <Badge className="bg-emerald-100 text-emerald-800" data-testid={`supplier-document-response-${document.id}`}><CheckCircle2 className="mr-1 h-3 w-3" />{uploadMode ? 'Submitted' : document.selected_response || 'Accepted'}</Badge>}{!locked && document.submission_status === 'reopened' ? <Badge className="bg-amber-100 text-amber-800" data-testid={`supplier-document-reopened-${document.id}`}>Unlocked for resubmission</Badge> : !locked && <Badge variant="outline" data-testid={`supplier-document-pending-${document.id}`}>Response required</Badge>}</div></CardHeader><CardContent className="space-y-3"><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => viewDocument(document)} data-testid={`view-supplier-document-${document.id}`}>View document<ExternalLink className="ml-2 h-4 w-4" /></Button><Button variant="outline" onClick={() => viewDocument(document, true)} data-testid={`download-supplier-document-${document.id}`}><Download className="mr-2 h-4 w-4" />Download document</Button></div>{uploadMode && <div className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4" data-testid={`supplier-document-upload-response-${document.id}`}><p className="text-sm font-semibold text-stone-900">Your document response</p>{(document.response_files || []).map((file) => <div key={file.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid={`supplier-document-response-file-${file.id}`}><FileText className="h-4 w-4 text-stone-500" /><span className="max-w-xs truncate text-stone-800">{file.original_filename}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Preview ${file.original_filename}`} onClick={() => openResponseFile(document, file)} data-testid={`preview-supplier-response-file-${file.id}`}><Eye className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Download ${file.original_filename}`} onClick={() => openResponseFile(document, file, true)} data-testid={`download-supplier-response-file-${file.id}`}><Download className="h-4 w-4" /></Button>{!locked && <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-rose-600" aria-label={`Delete ${file.original_filename}`} onClick={() => deleteResponseFile(document, file)} data-testid={`delete-supplier-response-file-${file.id}`}><Trash2 className="h-4 w-4" /></Button>}</div>)}{!locked && <><Input type="file" multiple accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={submittingId === document.id} onChange={(event) => { uploadResponseFiles(document, event.target.files); event.target.value = ''; }} data-testid={`supplier-document-response-upload-input-${document.id}`} />{document.has_been_viewed && <Button disabled={submittingId === document.id || !(document.response_files || []).length} onClick={() => setPendingSubmission({ document, type: 'upload' })} data-testid={`submit-document-upload-${document.id}`}>{submittingId === document.id ? 'Submitting…' : 'Submit and lock response'}</Button>}</>}</div>}{document.response_mode === 'STATUS' && !document.selected_response ? <><div className="flex flex-wrap gap-2">{document.response_options.map((option) => <Button key={option} variant={selectedStatus[document.id] === option ? 'default' : 'outline'} disabled={submittingId === document.id} onClick={() => setSelectedStatus((current) => ({ ...current, [document.id]: option }))} data-testid={`document-status-option-${document.id}-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{option}</Button>)}</div>{document.has_been_viewed && <Button disabled={submittingId === document.id || !selectedStatus[document.id]} onClick={() => requestStatusSubmission(document)} data-testid={`submit-document-status-${document.id}`}>{submittingId === document.id ? 'Submitting…' : 'Submit response'}</Button>}</> : document.response_mode === 'ACCEPTANCE' && !document.accepted && document.has_been_viewed && <Button onClick={() => setPendingSubmission({ document, type: 'acceptance' })} disabled={submittingId === document.id} data-testid={`accept-supplier-document-${document.id}`}>{submittingId === document.id ? 'Recording…' : 'Submit acceptance'}</Button>}</CardContent></Card>; })}
    </section>
    <AlertDialog open={Boolean(pendingSubmission)} onOpenChange={(open) => { if (!open) setPendingSubmission(null); }}>
      <AlertDialogContent data-testid="supplier-document-submit-confirmation-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="supplier-document-submit-confirmation-title">Submit and lock this document response?</AlertDialogTitle>
          <AlertDialogDescription data-testid="supplier-document-submit-confirmation-description">Once submitted, your response for {pendingSubmission?.document.title || 'this document'} will be locked and cannot be edited.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="cancel-supplier-document-submit-button">Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={confirmSubmission} data-testid="confirm-supplier-document-submit-button">Submit and lock</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}