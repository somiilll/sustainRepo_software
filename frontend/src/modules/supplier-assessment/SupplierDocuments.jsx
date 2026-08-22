import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierDocuments() {
  const { getAuthHeader } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const loadDocuments = useCallback(async () => {
    try { const response = await axios.get(`${API}/supplier-assessment/my-assessment/documents`, { headers: getAuthHeader() }); setDocuments(response.data || []); }
    catch (error) { if (error.response?.status !== 404) toast.error('Could not load agreements'); }
    finally { setLoading(false); }
  }, [getAuthHeader]);
  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  const viewDocument = async (document) => {
    try { const response = await axios.get(`${API}/supplier-assessment/my-assessment/documents/${document.id}/view`, { headers: getAuthHeader() }); window.open(response.data.url, '_blank', 'noopener,noreferrer'); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not open agreement'); }
  };
  const acceptDocument = async (document) => {
    setAcceptingId(document.id);
    try { await axios.post(`${API}/supplier-assessment/my-assessment/documents/${document.id}/accept`, {}, { headers: getAuthHeader() }); toast.success('Agreement accepted'); loadDocuments(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not record acceptance'); }
    finally { setAcceptingId(null); }
  };
  return <div className="space-y-8" data-testid="supplier-documents-page">
    <div><h1 className="text-3xl font-semibold text-stone-900">Agreements</h1><p className="mt-2 text-sm text-stone-600">Review and accept the current agreements from your customer.</p></div>
    {loading ? <p className="py-10 text-center text-sm text-stone-500" data-testid="supplier-documents-loading">Loading agreements…</p> : documents.length === 0 ? <Card data-testid="supplier-documents-empty-state"><CardContent className="py-12 text-center text-sm text-stone-500">No agreements are required for this assessment.</CardContent></Card> : documents.map((document) => <Card key={document.id} data-testid={`supplier-document-card-${document.id}`}><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-700" />{document.title}</CardTitle><CardDescription className="mt-2">{document.original_filename} · Version {document.version_number}</CardDescription></div>{document.accepted ? <Badge className="bg-emerald-100 text-emerald-800" data-testid={`supplier-document-accepted-${document.id}`}><CheckCircle2 className="mr-1 h-3 w-3" />Accepted</Badge> : <Badge variant="outline" data-testid={`supplier-document-pending-${document.id}`}>Review required</Badge>}</div></CardHeader><CardContent className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => viewDocument(document)} data-testid={`view-supplier-document-${document.id}`}>View agreement<ExternalLink className="ml-2 h-4 w-4" /></Button>{!document.accepted && <Button onClick={() => acceptDocument(document)} disabled={acceptingId === document.id} data-testid={`accept-supplier-document-${document.id}`}>{acceptingId === document.id ? 'Recording…' : 'Accept agreement'}</Button>}</CardContent></Card>)}
  </div>;
}