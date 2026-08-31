import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { BookOpen, GraduationCap, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { TrainingViewer } from './TrainingViewer';
import { SupplierPageHeader } from './components/SupplierPageHeader';
import { SupplierStatusInfographics } from './components/SupplierStatusInfographics';

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

  useEffect(() => {
    load();
    const refreshAssignments = () => load();
    window.addEventListener('focus', refreshAssignments);
    const intervalId = window.setInterval(refreshAssignments, 30000);
    return () => { window.removeEventListener('focus', refreshAssignments); window.clearInterval(intervalId); };
  }, [load]);
  useEffect(() => {
    if (activeTraining && !items.some((item) => item.assignment_id === activeTraining.assignment_id)) {
      setActiveTraining(null);
      setViewer(null);
    }
  }, [activeTraining, items]);

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
  const statusCounts = items.reduce((counts, item) => {
    counts.total += 1;
    const dueDate = item.due_date ? new Date(item.due_date) : null;
    if (dueDate) dueDate.setHours(23, 59, 59, 999);
    if (item.status === 'completed') counts.completed += 1;
    else if (dueDate && dueDate < new Date()) counts.overdue += 1;
    else if (item.status === 'in_progress') counts.draft += 1;
    else counts.pending += 1;
    return counts;
  }, { total: 0, completed: 0, draft: 0, pending: 0, overdue: 0 });

  const isTrainingOverdue = (item) => Boolean(item.due_date && item.status !== 'completed' && new Date(`${item.due_date.slice(0, 10)}T23:59:59`) < new Date());
  return <div className="space-y-8" data-testid="supplier-training-page">
    <SupplierPageHeader title="Trainings" description="Complete trainings assigned by your customer." icon={GraduationCap} iconClassName="border-amber-200 bg-amber-50 text-amber-700" testId="supplier-training" />
    <SupplierStatusInfographics title="Training status" counts={statusCounts} testId="supplier-training" />
    {items.length === 0 ? <Card data-testid="supplier-training-empty"><CardContent className="py-10 text-center text-sm text-stone-500">No trainings are assigned.</CardContent></Card> : items.map((item) => { const status = trainingStatus(item.status); return <Card key={item.assignment_id} data-testid={`supplier-training-${item.assignment_id}`}><CardHeader><div className="flex justify-between gap-4"><div><CardTitle className="flex gap-2"><BookOpen className="h-5 w-5 text-emerald-700" />{item.title}</CardTitle><CardDescription>{item.description} · Version {item.version_number}</CardDescription>{item.due_date && <p className="mt-2 text-xs font-medium text-stone-600" data-testid={`supplier-training-due-date-${item.assignment_id}`}>Due {new Date(`${item.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString()}</p>}{item.page_count ? <p className="mt-2 text-xs text-stone-500" data-testid={`supplier-training-page-progress-${item.assignment_id}`}>Page {item.highest_page_index || 0} of {item.page_count} reached · {Math.round(item.progress_percent || 0)}% complete</p> : <p className="mt-2 text-xs text-stone-500" data-testid={`supplier-training-media-progress-${item.assignment_id}`}>{Math.round(item.progress_percent || 0)}% complete</p>}</div><div className="flex items-center gap-2">{isTrainingOverdue(item) && <Badge className="bg-rose-100 text-rose-800" data-testid={`supplier-training-overdue-${item.assignment_id}`}>Overdue</Badge>}<Badge className={status.className} data-testid={`supplier-training-status-${item.assignment_id}`}>{status.label}</Badge></div></div></CardHeader><CardContent><Button variant="outline" onClick={() => openViewer(item)} disabled={isOpening} data-testid={`open-training-viewer-${item.assignment_id}`}>{isOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}{item.highest_page_index ? 'Continue training' : 'Open training'}</Button></CardContent></Card>; })}
    <Dialog open={Boolean(activeTraining && viewer)} onOpenChange={closeViewer}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" data-testid="training-viewer-dialog"><DialogHeader><DialogTitle data-testid="training-viewer-title">{activeTraining?.title}</DialogTitle></DialogHeader>{viewer && activeTraining && <TrainingViewer assignmentId={activeTraining.assignment_id} viewer={viewer} getAuthHeader={getAuthHeader} onProgress={(progress) => updateProgress(activeTraining.assignment_id, progress)} />}</DialogContent></Dialog>
  </div>;
}