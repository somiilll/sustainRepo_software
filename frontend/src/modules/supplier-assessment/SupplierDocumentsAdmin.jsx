import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { FileText, Upload, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierDocumentsAdmin() {
  const { getAuthHeader } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/supplier-assessment/documents`, { headers: getAuthHeader() });
      setDocuments(response.data || []);
    } catch {
      toast.error('Could not load agreement requirements');
    }
  }, [getAuthHeader]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const uploadAgreement = async () => {
    if (!file) { toast.error('Choose an agreement file first'); return; }
    const data = new FormData();
    data.append('file', file);
    data.append('title', title);
    setUploading(true);
    try {
      await axios.post(`${API}/supplier-assessment/documents`, data, { headers: getAuthHeader() });
      toast.success('Agreement published to active suppliers');
      setTitle('');
      setFile(null);
      document.getElementById('supplier-agreement-file-input').value = '';
      loadDocuments();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not publish agreement');
    } finally { setUploading(false); }
  };

  return <div className="space-y-8" data-testid="supplier-documents-admin-page">
    <div>
      <h1 className="text-3xl font-semibold text-stone-900">Supplier agreements</h1>
      <p className="mt-2 text-sm text-stone-600">Publish the NDA or agreement suppliers must review and accept.</p>
    </div>
    <Card data-testid="supplier-agreement-upload-card">
      <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-emerald-700" />Publish agreement</CardTitle><CardDescription>PDF, DOC, or DOCX up to 10MB.</CardDescription></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[1fr_1.3fr_auto] md:items-end">
        <div className="space-y-2"><Label htmlFor="supplier-agreement-title">Agreement title</Label><Input id="supplier-agreement-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Supplier NDA" data-testid="supplier-agreement-title-input" /></div>
        <div className="space-y-2"><Label htmlFor="supplier-agreement-file-input">Agreement file</Label><Input id="supplier-agreement-file-input" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} data-testid="supplier-agreement-file-input" /></div>
        <Button onClick={uploadAgreement} disabled={uploading} data-testid="publish-supplier-agreement-button">{uploading ? 'Publishing…' : 'Publish agreement'}</Button>
      </CardContent>
    </Card>
    <div className="space-y-3" data-testid="published-supplier-agreements-list">
      {documents.length === 0 ? <p className="py-8 text-center text-sm text-stone-500" data-testid="supplier-agreements-empty-state">No agreements have been published.</p> : documents.map((document) => <Card key={document.id} data-testid={`published-supplier-agreement-${document.id}`}><CardContent className="flex items-center gap-4 py-4"><ShieldCheck className="h-5 w-5 text-emerald-700" /><div><p className="font-medium text-stone-900">{document.title}</p><p className="text-xs text-stone-500">Program revision {document.assessment_program_version}</p></div></CardContent></Card>)}
    </div>
  </div>;
}