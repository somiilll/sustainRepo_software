import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Archive, CalendarDays, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSupplierAssessmentPeriod } from '../../contexts/SupplierAssessmentPeriodContext';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { SupplierAssignmentPicker } from './components/SupplierAssignmentPicker';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function SupplierTrainingAdmin() {
  const { getAuthHeader } = useAuth();
  const { reportingPeriod } = useSupplierAssessmentPeriod();
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


  return <div className={`space-y-6 ${showTrainingForm ? '' : '[&_[data-testid=create-training-card]]:hidden'}`} data-testid="training-admin-page">
    <div className="flex flex-wrap items-end justify-between gap-4 sm:pr-52">
      <div><h1 className="text-2xl font-semibold" data-testid="training-admin-heading">Supplier {trainingLabel}</h1>
      <p className="mt-2 text-sm text-stone-600">Publish private content and assign it to suppliers.</p>
      </div><Button onClick={() => setShowTrainingForm(true)} data-testid="open-add-training-button"><Upload className="mr-2 h-4 w-4" />Add {trainingLabel}</Button></div>
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
    <div className="space-y-3" data-testid="training-admin-list">
      {trainings.map((training) => <Card key={training.id} data-testid={`training-admin-${training.id}`}>
        <CardContent className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1"><b data-testid={`training-title-${training.id}`}>{training.title}</b><div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-500"><span data-testid={`training-threshold-${training.id}`}>{training.completion_threshold}% completion required</span><span data-testid={`training-completion-count-${training.id}`}>{(training.status || []).filter((item) => item.status === 'completed').length} of {(training.status || []).length} suppliers complete</span>{!training.is_active && <span className="font-medium text-amber-700" data-testid={`training-disabled-status-${training.id}`}>Disabled</span>}</div></div>
          <div className="flex flex-wrap items-end gap-2"><div className="space-y-1"><Label htmlFor={`training-due-date-${training.id}`} className="text-xs">Due date</Label><Input id={`training-due-date-${training.id}`} type="date" value={dueDates[training.id] ?? training.due_date?.slice(0, 10) ?? ''} onChange={(event) => setDueDates((current) => ({ ...current, [training.id]: event.target.value }))} data-testid={`training-due-date-${training.id}`} /></div><Button variant="outline" size="sm" disabled={isUpdating === training.id} onClick={() => updateTraining(training.id, { due_date: dueDates[training.id] ?? training.due_date?.slice(0, 10) ?? null }, 'Due date saved')} data-testid={`save-training-due-date-${training.id}`}><CalendarDays className="mr-1 h-4 w-4" />Save</Button><Button variant="outline" size="sm" disabled={isUpdating === training.id} onClick={() => updateTraining(training.id, { is_active: !training.is_active }, training.is_active ? 'Training disabled' : 'Training enabled')} data-testid={`toggle-training-${training.id}`}>{training.is_active ? <Archive className="mr-1 h-4 w-4" /> : <RotateCcw className="mr-1 h-4 w-4" />}{training.is_active ? 'Disable' : 'Enable'}</Button><Button variant="outline" size="sm" disabled={isUpdating === training.id} onClick={() => setPendingDelete(training)} data-testid={`delete-training-${training.id}`}><Trash2 className="mr-1 h-4 w-4" />Delete</Button></div>
          </div>
          <div className="border-t border-stone-100 pt-3" data-testid={`training-supplier-progress-${training.id}`}><p className="mb-2 text-xs font-medium uppercase text-stone-500">Supplier progress</p>{(training.status || []).length === 0 ? <p className="text-sm text-stone-500" data-testid={`training-supplier-progress-empty-${training.id}`}>No suppliers are currently assigned.</p> : <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{training.status.map((item) => <div key={item.supplier_relationship_id} className="flex items-center justify-between gap-3 border border-stone-200 px-3 py-2" data-testid={`training-supplier-progress-${training.id}-${item.supplier_relationship_id}`}><span className="truncate text-sm font-medium text-stone-800">{item.supplier_name}</span><span className="shrink-0 text-sm text-stone-600">{item.progress_percent}% · {item.status.replace('_', ' ')}</span></div>)}</div>}</div>
        </CardContent>
      </Card>)}
    </div>
    <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
      <AlertDialogContent data-testid="delete-training-dialog"><AlertDialogHeader><AlertDialogTitle>Delete {pendingDelete?.title}?</AlertDialogTitle><AlertDialogDescription>This removes it from supplier access and assignment lists. Historical completion records are retained for audit purposes.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel data-testid="cancel-delete-training-button">Cancel</AlertDialogCancel><AlertDialogAction onClick={deleteTraining} data-testid="confirm-delete-training-button">Delete training</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}