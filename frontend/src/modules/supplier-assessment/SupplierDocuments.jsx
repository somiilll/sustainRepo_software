import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, ExternalLink, FileText } from 'lucide-react';
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierDocuments() {
  const { getAuthHeader } = useAuth(); const [documents, setDocuments] = useState([]); const [loading, setLoading] = useState(true); const [submittingId, setSubmittingId] = useState(null); const [selectedStatus, setSelectedStatus] = useState({}); const [pendingSubmission, setPendingSubmission] = useState(null);
  const loadDocuments = useCallback(async () => { try { setDocuments((await axios.get(`${API}/supplier-assessment/my-assessment/documents`, { headers: getAuthHeader() })).data || []); } catch (error) { if (error.response?.status !== 404) toast.error('Could not load documents'); } finally { setLoading(false); } }, [getAuthHeader]);
  useEffect(() => {
    loadDocuments();
    const refreshAssignments = () => loadDocuments();
    window.addEventListener('focus', refreshAssignments);
    const intervalId = window.setInterval(refreshAssignments, 30000);
    return () => { window.removeEventListener('focus', refreshAssignments); window.clearInterval(intervalId); };
  }, [loadDocuments]);
  const viewDocument = async (document) => { try { const response = await axios.get(`${API}/supplier-assessment/my-assessment/documents/${document.id}/view`, { headers: getAuthHeader() }); window.open(response.data.url, '_blank', 'noopener,noreferrer'); } catch (error) { toast.error(error.response?.data?.detail || 'Could not open document'); } };
  const acceptDocument = async (document) => { setSubmittingId(document.id); try { await axios.post(`${API}/supplier-assessment/my-assessment/documents/${document.id}/accept`, {}, { headers: getAuthHeader() }); toast.success('Document accepted'); await loadDocuments(); } catch (error) { toast.error(error.response?.data?.detail || 'Could not record acceptance'); } finally { setSubmittingId(null); } };
  const selectStatus = async (document, responseValue) => { setSubmittingId(document.id); try { await axios.post(`${API}/supplier-assessment/my-assessment/documents/${document.id}/respond`, { response_value: responseValue }, { headers: getAuthHeader() }); toast.success('Response submitted'); await loadDocuments(); } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit response'); } finally { setSubmittingId(null); } };
  const requestStatusSubmission = (document) => { const responseValue = selectedStatus[document.id]; if (!responseValue) { toast.error('Choose a response first'); return; } setPendingSubmission({ document, responseValue, type: 'status' }); };
  const confirmSubmission = async () => { const submission = pendingSubmission; if (!submission) return; setPendingSubmission(null); if (submission.type === 'acceptance') await acceptDocument(submission.document); else await selectStatus(submission.document, submission.responseValue); };
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
    <SupplierStatusInfographics title="Document status" counts={statusCounts} testId="supplier-documents" />
    {loading ? <p className="py-10 text-center text-sm text-stone-500" data-testid="supplier-documents-loading">Loading documents…</p> : documents.length === 0 ? <Card data-testid="supplier-documents-empty-state"><CardContent className="py-12 text-center text-sm text-stone-500">No documents are required for this assessment.</CardContent></Card> : documents.map((document) => <Card key={document.id} data-testid={`supplier-document-card-${document.id}`}><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-700" />{document.title}</CardTitle><CardDescription className="mt-2">{document.original_filename} · Version {document.version_number}</CardDescription>{document.due_date && <p className="mt-2 text-xs font-medium text-stone-600" data-testid={`supplier-document-due-date-${document.id}`}>Due {new Date(`${document.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString()}</p>}</div>{isDocumentOverdue(document) && <Badge className="bg-rose-100 text-rose-800" data-testid={`supplier-document-overdue-${document.id}`}>Overdue</Badge>}{document.selected_response || document.accepted ? <Badge className="bg-emerald-100 text-emerald-800" data-testid={`supplier-document-response-${document.id}`}><CheckCircle2 className="mr-1 h-3 w-3" />{document.selected_response || 'Accepted'}</Badge> : document.submission_status === 'reopened' ? <Badge className="bg-amber-100 text-amber-800" data-testid={`supplier-document-reopened-${document.id}`}>Unlocked for resubmission</Badge> : <Badge variant="outline" data-testid={`supplier-document-pending-${document.id}`}>Response required</Badge>}</div></CardHeader><CardContent className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => viewDocument(document)} data-testid={`view-supplier-document-${document.id}`}>View document<ExternalLink className="ml-2 h-4 w-4" /></Button>{document.response_mode === 'STATUS' && !document.selected_response ? <><div className="flex flex-wrap gap-2">{document.response_options.map((option) => <Button key={option} variant={selectedStatus[document.id] === option ? 'default' : 'outline'} disabled={submittingId === document.id} onClick={() => setSelectedStatus((current) => ({ ...current, [document.id]: option }))} data-testid={`document-status-option-${document.id}-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{option}</Button>)}</div><Button disabled={submittingId === document.id || !selectedStatus[document.id]} onClick={() => requestStatusSubmission(document)} data-testid={`submit-document-status-${document.id}`}>{submittingId === document.id ? 'Submitting…' : 'Submit response'}</Button></> : document.response_mode === 'ACCEPTANCE' && !document.accepted && <Button onClick={() => setPendingSubmission({ document, type: 'acceptance' })} disabled={submittingId === document.id} data-testid={`accept-supplier-document-${document.id}`}>{submittingId === document.id ? 'Recording…' : 'Submit acceptance'}</Button>}</CardContent></Card>)}
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