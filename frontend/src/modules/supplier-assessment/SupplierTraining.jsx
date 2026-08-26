import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { BookOpen, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { TrainingViewer } from './TrainingViewer';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const trainingStatus = (status) => ({
  not_started: { label: 'Not started', className: 'bg-amber-100 text-amber-800' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800' },
}[status] || { label: 'Not started', className: 'bg-amber-100 text-amber-800' });

export default function SupplierTraining() {
  const { getAuthHeader } = useAuth();
  const [items, setItems] = useState([]);
  const [activeTraining, setActiveTraining] = useState(null);
  const [viewer, setViewer] = useState(null);
  const [isOpening, setIsOpening] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await axios.get(`${API}/supplier-assessment/my-assessment/trainings`, { headers: getAuthHeader() })).data); }
    catch { toast.error('Could not load training'); }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  const openViewer = async (training) => {
    setIsOpening(true);
    try {
      const response = await axios.get(`${API}/supplier-assessment/my-assessment/trainings/${training.assignment_id}/viewer`, { headers: getAuthHeader() });
      setActiveTraining(training); setViewer(response.data);
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not open the in-app viewer'); }
    finally { setIsOpening(false); }
  };

  const updateProgress = (assignmentId, progress) => setItems((current) => current.map((item) => item.assignment_id === assignmentId ? { ...item, ...progress } : item));
  const closeViewer = (open) => { if (!open) { setActiveTraining(null); setViewer(null); load(); } };

  return <div className="space-y-6" data-testid="supplier-training-page">
    <div><h1 className="text-3xl font-semibold">Trainings</h1><p className="mt-2 text-sm text-stone-600">Complete trainings assigned by your customer.</p></div>
    {items.length === 0 ? <Card data-testid="supplier-training-empty"><CardContent className="py-10 text-center text-sm text-stone-500">No trainings are assigned.</CardContent></Card> : items.map((item) => { const status = trainingStatus(item.status); return <Card key={item.assignment_id} data-testid={`supplier-training-${item.assignment_id}`}><CardHeader><div className="flex justify-between gap-4"><div><CardTitle className="flex gap-2"><BookOpen className="h-5 w-5 text-emerald-700" />{item.title}</CardTitle><CardDescription>{item.description} · Version {item.version_number}</CardDescription></div><Badge className={status.className} data-testid={`supplier-training-status-${item.assignment_id}`}>{status.label}</Badge></div></CardHeader><CardContent><Button variant="outline" onClick={() => openViewer(item)} disabled={isOpening} data-testid={`open-training-viewer-${item.assignment_id}`}>{isOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Open training</Button></CardContent></Card>; })}
    <Dialog open={Boolean(activeTraining && viewer)} onOpenChange={closeViewer}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" data-testid="training-viewer-dialog"><DialogHeader><DialogTitle data-testid="training-viewer-title">{activeTraining?.title}</DialogTitle></DialogHeader>{viewer && activeTraining && <TrainingViewer assignmentId={activeTraining.assignment_id} viewer={viewer} getAuthHeader={getAuthHeader} onProgress={(progress) => updateProgress(activeTraining.assignment_id, progress)} />}</DialogContent></Dialog>
  </div>;
}