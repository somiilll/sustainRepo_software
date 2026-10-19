import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowRight, CalendarDays, Cloud, Factory, Lock, Send, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Checkbox } from '../../components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { SupplierDataVerificationAcknowledgement } from './components/SupplierDataVerificationAcknowledgement';
import { SupplierPageHeader } from './components/SupplierPageHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const periodTone = (period) => period.status === 'submitted'
  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
  : period.status === 'unlocked' ? 'border-amber-200 bg-amber-50 text-amber-800'
    : period.status === 'overdue' ? 'border-red-200 bg-red-50 text-red-800'
      : period.status === 'upcoming' ? 'border-stone-200 bg-stone-50 text-stone-500'
        : period.status === 'in_progress' ? 'border-blue-200 bg-blue-50 text-blue-800'
        : 'border-stone-200 bg-stone-50 text-stone-600';

const periodStatusLabel = (period) => {
  if (period.status === 'submitted') return <><Lock className="mr-1 h-3 w-3" />Submitted · Locked</>;
  if (period.status === 'unlocked') return 'Unlocked for resubmission';
  if (period.status === 'overdue') return 'Overdue';
  if (period.status === 'upcoming') return '-';
  return period.status === 'in_progress' ? 'In progress' : 'Pending';
};

const canSubmitPeriod = (period) => !['submitted', 'upcoming'].includes(period.status) && Boolean(period.has_unsubmitted_entries);

const submittedScopeTotal = (period, scope) => (
  period.submitted_at ? `${(period.submitted_scope_totals?.[scope] || 0).toFixed(4)} tCO₂e` : '—'
);

export default function SupplierGHGSubmission() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [periodsToSubmit, setPeriodsToSubmit] = useState([]);
  const [selectedPeriodKeys, setSelectedPeriodKeys] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [verificationAccepted, setVerificationAccepted] = useState(false);

  const load = useCallback(async () => {
    try {
      const [submission, periodResponse] = await Promise.all([
        axios.get(`${API}/supplier-assessment/my-assessment/emissions/submission`, { headers: getAuthHeader() }),
        axios.get(`${API}/supplier-assessment/my-assessment/emissions/submission-periods`, { headers: getAuthHeader() }),
      ]);
      setState(submission.data);
      setPeriods(periodResponse.data.periods || []);
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not load GHG submissions'); }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);
  const totals = useMemo(() => (state?.draft_aggregation || []).reduce((all, row) => ({ ...all, [row.scope]: (all[row.scope] || 0) + row.total_emissions }), {}), [state]);
  const enabledScopes = state?.enabled_scopes || [];
  const hasGhgTask = enabledScopes.length > 0;
  const submittablePeriods = useMemo(() => periods.filter(canSubmitPeriod), [periods]);
  const canBulkSubmit = submittablePeriods.length > 1;
  const selectedPeriods = useMemo(() => periods.filter((period) => periodsToSubmit.includes(period.period_key)), [periods, periodsToSubmit]);
  const allPendingSelected = canBulkSubmit && submittablePeriods.every((period) => selectedPeriodKeys.includes(period.period_key));
  const togglePeriodSelection = (periodKey, checked) => setSelectedPeriodKeys((current) => checked ? [...new Set([...current, periodKey])] : current.filter((key) => key !== periodKey));
  const toggleAllPending = (checked) => setSelectedPeriodKeys(checked ? submittablePeriods.map((period) => period.period_key) : []);
  const submit = async () => {
    if (!verificationAccepted || selectedPeriods.length === 0) return;
    setSubmitting(true);
    try {
      if (selectedPeriods.length === 1) {
        await axios.post(`${API}/supplier-assessment/my-assessment/emissions/submission-periods/${encodeURIComponent(selectedPeriods[0].period_key)}/submit`, { data_verified: true }, { headers: getAuthHeader() });
        toast.success(`${selectedPeriods[0].label} GHG data submitted and locked`);
      } else {
        await axios.post(`${API}/supplier-assessment/my-assessment/emissions/submission-periods/submit-bulk`, { period_keys: selectedPeriods.map((period) => period.period_key), data_verified: true }, { headers: getAuthHeader() });
        toast.success(`${selectedPeriods.length} reporting periods submitted and locked`);
      }
      setPeriodsToSubmit([]); setSelectedPeriodKeys([]); setVerificationAccepted(false); await load();
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit GHG data'); }
    finally { setSubmitting(false); }
  };

  if (state && !hasGhgTask) return <div className="space-y-6" data-testid="supplier-ghg-submission-page"><SupplierPageHeader title="Supplier Assessment GHG" description="Review and lock each reporting period when its data is complete." icon={Cloud} iconClassName="border-sky-200 bg-sky-50 text-sky-700" testId="supplier-ghg-submission" /><Card className="border-stone-200" data-testid="supplier-ghg-no-task-card"><CardContent className="py-16 text-center"><p className="text-lg font-semibold text-stone-900" data-testid="supplier-ghg-no-task-message">No GHG task assigned</p></CardContent></Card></div>;

  return <div className="flex flex-col gap-6" data-testid="supplier-ghg-submission-page">
    <SupplierPageHeader title="Supplier Assessment GHG" description="Review and lock each reporting period when its data is complete." icon={Cloud} iconClassName="border-sky-200 bg-sky-50 text-sky-700" testId="supplier-ghg-submission" aside={<Button variant="outline" className="border-emerald-700 bg-white text-emerald-900 shadow-sm transition-[background-color,border-color,color] hover:border-emerald-800 hover:bg-emerald-800 hover:text-white" onClick={() => navigate('/ghg')} data-testid="supplier-ghg-open-logs-button">GHG logs<ArrowRight className="ml-2 h-4 w-4" /></Button>} />
    <Card className="order-2 overflow-hidden border-stone-200" data-testid="supplier-ghg-period-ledger">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-stone-100"><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-4 w-4 text-sky-700" />Submission periods</CardTitle>{canBulkSubmit && <div className="flex items-center gap-2" data-testid="supplier-ghg-bulk-actions"><Button type="button" size="sm" variant="outline" onClick={() => toggleAllPending(!allPendingSelected)} disabled={submitting} data-testid="supplier-ghg-select-all-pending-button">{allPendingSelected ? 'Clear selection' : 'Select all pending'}</Button><Button type="button" size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => { setPeriodsToSubmit(selectedPeriodKeys); setVerificationAccepted(false); }} disabled={submitting || selectedPeriodKeys.length === 0} data-testid="supplier-ghg-submit-selected-button"><Send className="mr-1.5 h-3.5 w-3.5" />Submit selected ({selectedPeriodKeys.length})</Button></div>}</CardHeader>
      <CardContent className="p-0">
        {!state ? <p className="p-6 text-sm text-stone-500" data-testid="supplier-ghg-periods-loading">Loading submission periods…</p> : <Table data-testid="supplier-ghg-periods-table"><TableHeader><TableRow>{canBulkSubmit && <TableHead className="w-11"><Checkbox checked={allPendingSelected} onCheckedChange={toggleAllPending} aria-label="Select all pending reporting periods" data-testid="supplier-ghg-select-all-pending-checkbox" /></TableHead>}<TableHead className="text-center">Period</TableHead><TableHead>Deadline</TableHead>{enabledScopes.includes('scope1') && <TableHead data-testid="supplier-ghg-period-scope1-header">Scope1</TableHead>}{enabledScopes.includes('scope2') && <TableHead data-testid="supplier-ghg-period-scope2-header">Scope2</TableHead>}<TableHead>Status</TableHead><TableHead>Submitted</TableHead></TableRow></TableHeader><TableBody>{periods.map((period) => <TableRow key={period.period_key} className="h-20" data-testid={`supplier-ghg-period-${period.period_key}`}>{canBulkSubmit && <TableCell>{canSubmitPeriod(period) && <Checkbox checked={selectedPeriodKeys.includes(period.period_key)} onCheckedChange={(checked) => togglePeriodSelection(period.period_key, checked === true)} aria-label={`Select ${period.label}`} data-testid={`supplier-ghg-select-period-${period.period_key}`} />}</TableCell>}<TableCell className="py-4 text-center font-medium text-stone-900" data-testid={`supplier-ghg-period-label-${period.period_key}`}>{period.label}</TableCell><TableCell className="py-4" data-testid={`supplier-ghg-period-deadline-${period.period_key}`}>{new Date(`${period.due_date}T00:00:00Z`).toLocaleDateString('en-GB')}</TableCell>{enabledScopes.includes('scope1') && <TableCell className="py-4 font-medium tabular-nums text-stone-800" data-testid={`supplier-ghg-period-scope1-total-${period.period_key}`}>{submittedScopeTotal(period, 'scope1')}</TableCell>}{enabledScopes.includes('scope2') && <TableCell className="py-4 font-medium tabular-nums text-stone-800" data-testid={`supplier-ghg-period-scope2-total-${period.period_key}`}>{submittedScopeTotal(period, 'scope2')}</TableCell>}<TableCell className="py-4"><div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={periodTone(period)} data-testid={`supplier-ghg-period-status-${period.period_key}`}>{periodStatusLabel(period)}</Badge>{canSubmitPeriod(period) && <Button size="sm" className="h-7 px-2.5 text-xs" disabled={submitting} onClick={() => { setPeriodsToSubmit([period.period_key]); setVerificationAccepted(false); }} data-testid={`submit-supplier-ghg-period-${period.period_key}`}><Send className="mr-1 h-3.5 w-3.5" />{period.status === 'unlocked' ? 'Resubmit' : 'Submit'}</Button>}</div>{period.status === 'unlocked' && period.supplier_instructions && <p className="max-w-sm text-xs text-amber-800" data-testid={`supplier-ghg-period-instructions-${period.period_key}`}>{period.supplier_instructions}</p>}</div></TableCell><TableCell className="py-4" data-testid={`supplier-ghg-period-submitted-at-${period.period_key}`}>{period.submitted_at ? new Date(period.submitted_at).toLocaleDateString('en-GB') : '—'}</TableCell></TableRow>)}</TableBody></Table>}</CardContent>
    </Card>
    <div className="order-1 grid gap-5 md:grid-cols-2" data-testid="supplier-ghg-draft-totals">
      {enabledScopes.includes('scope1') && <Card className="border-blue-200 bg-white shadow-[0_5px_16px_rgba(59,130,246,0.10)]" data-testid="supplier-ghg-scope1-total"><CardContent className="pt-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700" data-testid="supplier-ghg-scope1-icon"><Factory className="h-5 w-5" /></span><p className="text-sm font-medium text-blue-800">Scope 1 emissions yet to be submitted</p></div><p className="mt-4 text-2xl font-semibold text-slate-900" data-testid="supplier-ghg-draft-scope1">{(totals.scope1 || 0).toFixed(2)} tCO₂e</p></CardContent></Card>}
      {enabledScopes.includes('scope2') && <Card className="border-purple-200 bg-white shadow-[0_5px_16px_rgba(147,51,234,0.10)]" data-testid="supplier-ghg-scope2-total"><CardContent className="pt-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-700" data-testid="supplier-ghg-scope2-icon"><Zap className="h-5 w-5" /></span><p className="text-sm font-medium text-purple-800">Scope 2 emissions yet to be submitted</p></div><p className="mt-4 text-2xl font-semibold text-slate-900" data-testid="supplier-ghg-draft-scope2">{(totals.scope2 || 0).toFixed(2)} tCO₂e</p></CardContent></Card>}
    </div>
    <AlertDialog open={selectedPeriods.length > 0} onOpenChange={(open) => { if (!open) { setPeriodsToSubmit([]); setVerificationAccepted(false); } }}><AlertDialogContent data-testid="confirm-supplier-ghg-period-submit-dialog"><AlertDialogHeader><AlertDialogTitle data-testid="confirm-supplier-ghg-period-submit-title">Submit {selectedPeriods.length === 1 ? `${selectedPeriods[0]?.label}?` : `${selectedPeriods.length} reporting periods?`}</AlertDialogTitle><AlertDialogDescription data-testid="confirm-supplier-ghg-period-submit-description">{selectedPeriods.length === 1 ? 'Only data in this period will be sent to your customer and locked.' : 'Data in every selected period will be sent to your customer and each selected period will be locked until your customer unlocks it.'}</AlertDialogDescription></AlertDialogHeader><SupplierDataVerificationAcknowledgement checked={verificationAccepted} onCheckedChange={setVerificationAccepted} testIdPrefix="supplier-ghg-period-data-verification" /><AlertDialogFooter><AlertDialogCancel data-testid="cancel-supplier-ghg-period-submit-button">Cancel</AlertDialogCancel><AlertDialogAction disabled={submitting || !verificationAccepted} onClick={submit} data-testid="confirm-supplier-ghg-period-submit-button">{submitting ? 'Submitting…' : selectedPeriods.length === 1 ? 'Submit period' : `Submit ${selectedPeriods.length} periods`}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}