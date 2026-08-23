import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { BookOpen, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Progress } from '../../components/ui/progress';
import { TrainingViewer } from './TrainingViewer';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

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
    <div><h1 className="text-3xl font-semibold">Training</h1><p className="mt-2 text-sm text-stone-600">Complete training assigned by your customer.</p></div>
    {items.length === 0 ? <Card data-testid="supplier-training-empty"><CardContent className="py-10 text-center text-sm text-stone-500">No training is assigned.</CardContent></Card> : items.map((item) => <Card key={item.assignment_id} data-testid={`supplier-training-${item.assignment_id}`}><CardHeader><div className="flex justify-between gap-4"><div><CardTitle className="flex gap-2"><BookOpen className="h-5 w-5 text-emerald-700" />{item.title}</CardTitle><CardDescription>{item.description} · Version {item.version_number}</CardDescription></div><Badge data-testid={`supplier-training-status-${item.assignment_id}`}>{item.status.replace('_', ' ')}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="text-sm" data-testid={`supplier-training-progress-${item.assignment_id}`}>{item.progress_percent}% complete · {item.completion_threshold}% required</div><Progress value={item.progress_percent} /><Button variant="outline" onClick={() => openViewer(item)} disabled={isOpening} data-testid={`open-training-viewer-${item.assignment_id}`}>{isOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Open training</Button></CardContent></Card>)}
    <Dialog open={Boolean(activeTraining && viewer)} onOpenChange={closeViewer}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" data-testid="training-viewer-dialog"><DialogHeader><DialogTitle data-testid="training-viewer-title">{activeTraining?.title}</DialogTitle></DialogHeader>{viewer && activeTraining && <TrainingViewer assignmentId={activeTraining.assignment_id} viewer={viewer} getAuthHeader={getAuthHeader} onProgress={(progress) => updateProgress(activeTraining.assignment_id, progress)} />}</DialogContent></Dialog>
  </div>;
}