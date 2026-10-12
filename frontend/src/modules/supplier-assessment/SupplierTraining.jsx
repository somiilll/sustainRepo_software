import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowRight, BookOpen, CalendarDays, Check, GraduationCap, Loader2, Play } from 'lucide-react';
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
    <section className="mt-8 grid gap-4" data-testid="supplier-training-list">
      {items.length === 0 ? <Card data-testid="supplier-training-empty"><CardContent className="py-10 text-center text-sm text-stone-500">No trainings are assigned.</CardContent></Card> : items.map((item) => { const progress = Math.round(item.progress_percent || 0); const isCompleted = item.status === 'completed' || progress >= 100; const actionLabel = isCompleted ? 'View Training' : item.highest_page_index ? 'Continue Training' : 'Open Training'; return <Card key={item.assignment_id} className="overflow-hidden rounded-2xl border-stone-200 bg-white shadow-[0_4px_18px_rgba(28,55,43,0.06)]" data-testid={`supplier-training-${item.assignment_id}`}><CardHeader className="p-0"><div className="grid gap-5 p-5 lg:grid-cols-[minmax(17rem,1.55fr)_minmax(10rem,0.7fr)_minmax(10rem,0.7fr)_minmax(12rem,0.75fr)] lg:items-center lg:gap-0"><div className="flex min-w-0 items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><BookOpen className="h-7 w-7" /></div><div className="min-w-0"><CardTitle className="truncate !text-lg font-semibold text-slate-900" data-testid={`supplier-training-title-${item.assignment_id}`}>{item.title}</CardTitle>{item.description && <CardDescription className="mt-1 !text-sm text-slate-500">{item.description}</CardDescription>}</div></div><div className="flex items-center gap-3 lg:border-l lg:border-stone-200 lg:pl-8"><div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `conic-gradient(#15803d ${progress * 3.6}deg, #e7e5e4 0deg)` }} data-testid={`supplier-training-progress-ring-${item.assignment_id}`}>{isCompleted ? <Check className="h-5 w-5 text-white" aria-label="Training complete" /> : <div className="h-8 w-8 rounded-full bg-white" />}</div><div><p className="text-xs text-slate-500">Progress</p><p className="mt-0.5 whitespace-nowrap text-base font-semibold text-slate-900" data-testid={item.page_count ? `supplier-training-page-progress-${item.assignment_id}` : `supplier-training-media-progress-${item.assignment_id}`}>{progress}% complete</p></div></div><div className="flex items-center gap-3 lg:border-l lg:border-stone-200 lg:pl-8"><CalendarDays className="h-5 w-5 shrink-0 text-slate-500" /><div><p className="text-xs text-slate-500">Due Date</p><p className="mt-0.5 whitespace-nowrap text-base font-semibold text-slate-900" data-testid={`supplier-training-due-date-${item.assignment_id}`}>{item.due_date ? new Date(`${item.due_date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB') : 'Not set'}</p></div></div><div className="flex items-center gap-3 lg:border-l lg:border-stone-200 lg:pl-8">{isTrainingOverdue(item) && <Badge className="rounded-full bg-rose-100 px-3 py-1.5 text-xs text-rose-800" data-testid={`supplier-training-overdue-${item.assignment_id}`}>Overdue</Badge>}<Button variant="outline" className="h-10 rounded-full border-stone-300 bg-white px-4 text-sm font-medium text-slate-900 shadow-sm transition-[background-color,border-color,color] hover:border-orange-600 hover:bg-orange-500 hover:text-white" onClick={() => openViewer(item)} disabled={isOpening} data-testid={`open-training-viewer-${item.assignment_id}`}>{isOpening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4 fill-current" />}{actionLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button></div></div></CardHeader></Card>; })}
    </section>
    <Dialog open={Boolean(activeTraining && viewer)} onOpenChange={closeViewer}><DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" data-testid="training-viewer-dialog"><DialogHeader><DialogTitle data-testid="training-viewer-title">{activeTraining?.title}</DialogTitle></DialogHeader>{viewer && activeTraining && <TrainingViewer assignmentId={activeTraining.assignment_id} viewer={viewer} getAuthHeader={getAuthHeader} onProgress={(progress) => updateProgress(activeTraining.assignment_id, progress)} />}</DialogContent></Dialog>
  </div>;
}