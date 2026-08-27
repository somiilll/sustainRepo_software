import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Archive, CalendarDays, CircleCheck, Eye, GraduationCap, Loader2, MoreHorizontal, RotateCcw, Trash2, Upload, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { SupplierAssignmentPicker } from './components/SupplierAssignmentPicker';
import { ReadOnlyTrainingViewer } from './components/ReadOnlyTrainingViewer';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const trainingProgress = (training) => {
  const status = training.status || [];
  const completed = status.filter((item) => item.status === 'completed').length;
  const percentage = status.length ? Math.round((completed / status.length) * 1000) / 10 : 0;
  return { completed, total: status.length, percentage };
};
const formattedDueDate = (value) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB') : 'Not set';

export default function SupplierTrainingAdmin() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod, periods, setReportingPeriod } = useSupplierAssessmentPeriod();
  const [trainings, setTrainings] = useState([]);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [selected, setSelected] = useState([]);
  const [trainingLabel, setTrainingLabel] = useState('Training');
  const [isCreating, setIsCreating] = useState(false);
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [isUpdating, setIsUpdating] = useState('');
  const [dueDates, setDueDates] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);
  const [previewTraining, setPreviewTraining] = useState(null);
  const [previewViewer, setPreviewViewer] = useState(null);
  const [openingPreviewId, setOpeningPreviewId] = useState('');
  const [supplierDialog, setSupplierDialog] = useState(null);

  const load = useCallback(async () => {
    try {
      const [trainingResponse, configResponse] = await Promise.all([
        axios.get(`${API}/supplier-assessment/trainings?reporting_period=${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() }),
        axios.get(`${API}/sustainability-config/resolved`, { headers: getAuthHeader() }),
      ]);
      const trainingItems = trainingResponse.data;
      const statusResults = await Promise.allSettled(trainingItems.map((training) => (
        axios.get(`${API}/supplier-assessment/trainings/${training.id}/status?reporting_period=${encodeURIComponent(reportingPeriod)}`, { headers: getAuthHeader() })
      )));
      setTrainings(trainingItems.map((training, index) => ({
        ...training,
        status: statusResults[index].status === 'fulfilled' ? statusResults[index].value.data : [],
      })));
      setTrainingLabel(configResponse.data?.supplier_assessment?.modules?.training?.display_name || 'Training');
    } catch (error) {
      toast.error('Could not load training management');
    }
  }, [getAuthHeader, reportingPeriod]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!file || !title || !selected.length) {
      toast.error('Add a title, file, and supplier');
      return;
    }
    setIsCreating(true);
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('title', title);
      data.append('description', description);
      data.append('due_date', dueDate);
      data.append('completion_threshold', '100');
      data.append('supplier_relationship_ids', JSON.stringify(selected));
      await axios.post(`${API}/supplier-assessment/trainings`, data, { headers: getAuthHeader() });
      toast.success(`${trainingLabel} assigned`);
      setTitle(''); setDescription(''); setDueDate(''); setFile(null); setSelected([]); setShowTrainingForm(false);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || `Could not create ${trainingLabel.toLowerCase()}`);
    } finally {
      setIsCreating(false);
    }
  };

  const updateTraining = async (trainingId, updates, successMessage) => {
    setIsUpdating(trainingId);
    try {
      await axios.patch(`${API}/supplier-assessment/trainings/${trainingId}`, updates, { headers: getAuthHeader() });
      toast.success(successMessage);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not update training');
    } finally {
      setIsUpdating('');
    }
  };

  const deleteTraining = async () => {
    if (!pendingDelete) return;
    setIsUpdating(pendingDelete.id);
    try {
      await axios.delete(`${API}/supplier-assessment/trainings/${pendingDelete.id}`, { headers: getAuthHeader() });
      toast.success(`${trainingLabel} deleted`);
      setPendingDelete(null);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not delete training');
    } finally {
      setIsUpdating('');
    }
  };

  const openPreview = async (training) => {
    setPreviewTraining(training); setPreviewViewer(null); setOpeningPreviewId(training.id);
    try { const { data } = await axios.get(`${API}/supplier-assessment/trainings/${training.id}/viewer`, { headers: getAuthHeader() }); setPreviewViewer(data); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not preview training'); setPreviewTraining(null); }
    finally { setOpeningPreviewId(''); }
  };

  const trainingSummary = {
    total: trainings.length,
    assigned: trainings.reduce((total, training) => total + (training.status || []).length, 0),
    completed: trainings.reduce((total, training) => total + (training.status || []).filter((item) => item.status === 'completed').length, 0),
  };

  return <div className={`space-y-7 ${showTrainingForm ? '' : '[&_[data-testid=create-training-card]]:hidden'}`} data-testid="training-admin-page">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5" data-testid="training-admin-header"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 shadow-sm" data-testid="training-admin-heading-icon"><GraduationCap className="h-6 w-6" aria-hidden="true" /></div><h1 className="text-3xl font-bold text-emerald-950" data-testid="training-admin-heading">Supplier {trainingLabel}</h1></div><div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-2 shadow-[0_4px_18px_rgba(28,55,43,0.06)]" data-testid="training-admin-controls"><div className="min-w-40" data-testid="training-admin-period-control"><Label htmlFor="training-admin-reporting-period" className="mb-1 flex items-center gap-1.5 text-xs font-medium text-stone-600" data-testid="training-admin-period-label"><CalendarDays className="h-3.5 w-3.5 text-stone-500" aria-hidden="true" />Reporting period</Label><Select value={reportingPeriod} onValueChange={setReportingPeriod}><SelectTrigger id="training-admin-reporting-period" className="h-9 bg-white" data-testid="training-admin-period-selector"><SelectValue /></SelectTrigger><SelectContent data-testid="training-admin-period-menu">{periods.map((period) => <SelectItem key={period} value={period} data-testid={`training-admin-period-option-${period}`}>{period}</SelectItem>)}</SelectContent></Select></div><Button className="h-9 bg-emerald-800 text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-emerald-900 hover:shadow-md" onClick={() => setShowTrainingForm(true)} data-testid="open-add-training-button"><Upload className="h-4 w-4" />Add {trainingLabel}</Button></div></div>
    <div className="grid gap-4 sm:grid-cols-3" data-testid="training-admin-summary-cards"><Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="training-admin-total-card"><CardContent className="flex items-center gap-3 p-5"><GraduationCap className="h-5 w-5 text-amber-600" aria-hidden="true" /><div><p className="text-xs font-medium text-stone-500">{trainingLabel} published</p><p className="mt-1 text-2xl font-bold text-stone-950" data-testid="training-admin-total-value">{trainingSummary.total}</p></div></CardContent></Card><Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="training-admin-assigned-card"><CardContent className="flex items-center gap-3 p-5"><Users className="h-5 w-5 text-stone-600" aria-hidden="true" /><div><p className="text-xs font-medium text-stone-500">Supplier assignments</p><p className="mt-1 text-2xl font-bold text-stone-950" data-testid="training-admin-assigned-value">{trainingSummary.assigned}</p></div></CardContent></Card><Card className="rounded-xl border-stone-200 bg-white shadow-sm" data-testid="training-admin-completed-card"><CardContent className="flex items-center gap-3 p-5"><CircleCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" /><div><p className="text-xs font-medium text-stone-500">Completed</p><p className="mt-1 text-2xl font-bold text-stone-950" data-testid="training-admin-completed-value">{trainingSummary.completed}</p></div></CardContent></Card></div>
    <Card data-testid="create-training-card">
      <CardHeader><CardTitle className="flex gap-2" data-testid="create-training-heading"><Upload className="h-5 w-5 text-emerald-700" />Create {trainingLabel}</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="training-title">Title</Label><Input id="training-title" value={title} onChange={(event) => setTitle(event.target.value)} data-testid="training-title-input" /></div>
        <div className="space-y-2"><Label htmlFor="training-description">Description</Label><Input id="training-description" value={description} onChange={(event) => setDescription(event.target.value)} data-testid="training-description-input" /></div>
        <div className="space-y-2"><Label htmlFor="training-due-date">Due date</Label><Input id="training-due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} data-testid="training-due-date-input" /></div>
        <div className="space-y-2"><Label htmlFor="training-file">Content file</Label><Input id="training-file" type="file" accept=".pdf,.ppt,.pptx,audio/*,video/*" onChange={(event) => setFile(event.target.files?.[0])} data-testid="training-file-input" /></div>
        <div className="md:col-span-2"><SupplierAssignmentPicker selectedIds={selected} onChange={setSelected} getAuthHeader={getAuthHeader} testIdPrefix="training" reportingPeriod={reportingPeriod} /></div>
        <div className="flex items-end"><Button onClick={create} disabled={isCreating} data-testid="create-training-button">{isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isCreating ? 'Creating…' : 'Create and assign'}</Button></div>
      </CardContent>
    </Card>
    <div className="space-y-4" data-testid="training-admin-list">
      {trainings.map((training) => {
        const progress = trainingProgress(training);
        return <Card key={training.id} className="rounded-xl border-stone-200 bg-white shadow-[0_4px_18px_rgba(28,55,43,0.05)]" data-testid={`training-admin-${training.id}`}><CardContent className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1fr)_minmax(15rem,0.55fr)_auto] xl:items-center"><div className="min-w-0"><p className="text-base font-semibold text-stone-950" data-testid={`training-title-${training.id}`}>{training.title}</p><div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-stone-500"><span data-testid={`training-threshold-${training.id}`}>{training.completion_threshold}% completion required</span><span className="text-stone-300" aria-hidden="true">·</span><span data-testid={`training-completion-count-${training.id}`}>{progress.completed} / {progress.total} completed</span>{!training.is_active && <span className="font-medium text-stone-600" data-testid={`training-disabled-status-${training.id}`}>Disabled</span>}</div></div><div className="min-w-0 space-y-3"><div><div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs"><span className="font-medium text-stone-600">Completion</span><span className="font-semibold text-stone-800" data-testid={`training-completion-percentage-${training.id}`}>{progress.percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-stone-100" data-testid={`training-completion-progress-track-${training.id}`}><div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${progress.percentage}%` }} data-testid={`training-completion-progress-bar-${training.id}`} /></div></div><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-stone-500" aria-hidden="true" /><div><p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Due date</p><p className="mt-0.5 text-sm font-semibold text-stone-800" data-testid={`training-due-date-display-${training.id}`}>{formattedDueDate(training.due_date)}</p></div></div></div><div className="flex flex-wrap items-center gap-2 xl:justify-end"><Button variant="outline" size="sm" className="h-8 border-stone-200 bg-white text-stone-700 shadow-none transition-[background-color,border-color,color] hover:border-stone-300 hover:!bg-stone-50 hover:!text-stone-900" onClick={() => setSupplierDialog(training)} data-testid={`view-training-suppliers-${training.id}`}><Users className="h-3.5 w-3.5" />View suppliers</Button><Button variant="outline" size="sm" className="h-8 border-stone-200 bg-white text-stone-700 shadow-none transition-[background-color,border-color,color] hover:border-stone-300 hover:!bg-stone-50 hover:!text-stone-900" disabled={openingPreviewId === training.id} onClick={() => openPreview(training)} data-testid={`preview-training-${training.id}`}>{openingPreviewId === training.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}Preview</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8 border-stone-200 bg-white text-stone-600 shadow-none transition-[background-color,border-color,color] hover:border-stone-300 hover:!bg-stone-50 hover:!text-stone-900" aria-label={`More actions for ${training.title}`} data-testid={`training-overflow-menu-${training.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56 border-stone-200 !bg-white opacity-100 shadow-lg" data-testid={`training-overflow-menu-content-${training.id}`}><DropdownMenuLabel className="text-xs font-medium text-stone-500">Administrative</DropdownMenuLabel><div className="bg-white px-2 py-2"><Label htmlFor={`training-due-date-${training.id}`} className="mb-1.5 block text-xs text-stone-600" data-testid={`training-due-date-label-${training.id}`}>Due date</Label><Input id={`training-due-date-${training.id}`} type="date" value={dueDates[training.id] ?? training.due_date?.slice(0, 10) ?? ''} onChange={(event) => setDueDates((current) => ({ ...current, [training.id]: event.target.value }))} data-testid={`training-due-date-${training.id}`} /></div><DropdownMenuItem disabled={isUpdating === training.id} onSelect={() => updateTraining(training.id, { due_date: dueDates[training.id] ?? training.due_date?.slice(0, 10) ?? null }, 'Due date saved')} data-testid={`save-training-due-date-${training.id}`}><CalendarDays />Save due date</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem disabled={isUpdating === training.id} onSelect={() => updateTraining(training.id, { is_active: !training.is_active }, training.is_active ? 'Training disabled' : 'Training enabled')} data-testid={`toggle-training-${training.id}`}>{training.is_active ? <Archive /> : <RotateCcw />}{training.is_active ? 'Disable' : 'Enable'}</DropdownMenuItem><DropdownMenuItem className="text-rose-600 focus:bg-rose-50 focus:text-rose-700" disabled={isUpdating === training.id} onSelect={() => setPendingDelete(training)} data-testid={`delete-training-${training.id}`}><Trash2 />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></CardContent></Card>;
      })}
    </div>
    <Dialog open={Boolean(supplierDialog)} onOpenChange={(open) => !open && setSupplierDialog(null)}><DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto" data-testid="training-suppliers-dialog"><DialogHeader><DialogTitle data-testid="training-suppliers-dialog-title">Assigned suppliers — {supplierDialog?.title}</DialogTitle></DialogHeader>{(supplierDialog?.status || []).length ? <div className="divide-y divide-stone-100" data-testid="training-suppliers-list"><div className="grid grid-cols-[minmax(12rem,1fr)_7rem_8rem] gap-3 pb-2 text-xs font-semibold uppercase text-stone-500"><span>Supplier</span><span>Progress</span><span>Status</span></div>{supplierDialog.status.map((item) => { const label = item.status === 'completed' ? 'Completed' : item.status === 'in_progress' ? 'In progress' : 'Not started'; return <div key={item.supplier_relationship_id} className="grid grid-cols-[minmax(12rem,1fr)_7rem_8rem] items-center gap-3 py-3" data-testid={`training-supplier-row-${item.supplier_relationship_id}`}><span className="truncate text-sm font-medium text-stone-900">{item.supplier_name}</span><span className="text-sm text-stone-700" data-testid={`training-supplier-progress-${item.supplier_relationship_id}`}>{Math.round(item.progress_percent || 0)}%</span><Badge variant="outline" className={item.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : item.status === 'in_progress' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-amber-200 bg-amber-50 text-amber-800'} data-testid={`training-supplier-status-${item.supplier_relationship_id}`}>{label}</Badge></div>; })}</div> : <p className="py-10 text-center text-sm text-stone-500" data-testid="training-suppliers-empty">No suppliers are currently assigned.</p>}</DialogContent></Dialog>
    <Dialog open={Boolean(previewTraining)} onOpenChange={(open) => { if (!open) { setPreviewTraining(null); setPreviewViewer(null); } }}><DialogContent className="max-h-[calc(100dvh-2rem)] max-w-6xl overflow-y-auto" data-testid="admin-training-preview-dialog"><DialogHeader><DialogTitle data-testid="admin-training-preview-dialog-title">Training preview — {previewTraining?.title}</DialogTitle></DialogHeader>{!previewViewer ? <p className="py-16 text-center text-sm text-stone-500" data-testid="admin-training-preview-loading">Preparing preview…</p> : <ReadOnlyTrainingViewer viewer={previewViewer} />}</DialogContent></Dialog>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
      <AlertDialogContent data-testid="delete-training-dialog"><AlertDialogHeader><AlertDialogTitle>Delete {pendingDelete?.title}?</AlertDialogTitle><AlertDialogDescription>This removes it from supplier access and assignment lists. Historical completion records are retained for audit purposes.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="cancel-delete-training-button">Cancel</AlertDialogCancel><AlertDialogAction onClick={deleteTraining} data-testid="confirm-delete-training-button">Delete training</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}