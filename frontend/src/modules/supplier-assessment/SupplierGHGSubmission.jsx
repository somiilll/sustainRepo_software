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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { SupplierDataVerificationAcknowledgement } from './components/SupplierDataVerificationAcknowledgement';
import { SupplierPageHeader } from './components/SupplierPageHeader';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const periodTone = (period) => period.status === 'submitted'
  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
  : period.status === 'unlocked' ? 'border-amber-200 bg-amber-50 text-amber-800'
    : period.status === 'overdue' ? 'border-red-200 bg-red-50 text-red-800'
      : period.status === 'in_progress' ? 'border-blue-200 bg-blue-50 text-blue-800'
        : 'border-stone-200 bg-stone-50 text-stone-600';

const periodStatusLabel = (period) => {
  if (period.status === 'submitted') return <><Lock className="mr-1 h-3 w-3" />Submitted · Locked</>;
  if (period.status === 'unlocked') return 'Unlocked for resubmission';
  if (period.status === 'overdue') return 'Overdue';
  return period.status === 'in_progress' ? 'In progress' : 'Not started';
};

const canSubmitPeriod = (period) => period.status !== 'submitted' && Boolean(period.has_unsubmitted_entries);

const submittedScopeTotal = (period, scope) => (
  period.submitted_at ? `${(period.submitted_scope_totals?.[scope] || 0).toFixed(4)} tCO₂e` : '—'
);

export default function SupplierGHGSubmission() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [verificationAccepted, setVerificationAccepted] = useState(false);
  const [requestingKey, setRequestingKey] = useState('');

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
  const submit = async () => {
    if (!verificationAccepted || !selectedPeriod) return;
    setSubmitting(true);
    try {
      await axios.post(`${API}/supplier-assessment/my-assessment/emissions/submission-periods/${encodeURIComponent(selectedPeriod.period_key)}/submit`, { data_verified: true }, { headers: getAuthHeader() });
      toast.success(`${selectedPeriod.label} GHG data submitted`);
      setSelectedPeriod(null); setVerificationAccepted(false); await load();
    } catch (error) { toast.error(error.response?.data?.detail || 'Could not submit GHG data'); }
    finally { setSubmitting(false); }
  };
  const requestUnlock = async (period) => {
    setRequestingKey(period.period_key);
    try { await axios.post(`${API}/supplier-assessment/my-assessment/emissions/submission-periods/${encodeURIComponent(period.period_key)}/request-unlock`, {}, { headers: getAuthHeader() }); toast.success(`Unlock request sent for ${period.label}`); await load(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Could not request an unlock'); }
    finally { setRequestingKey(''); }
  };

  return <div className="space-y-6" data-testid="supplier-ghg-submission-page">
    <SupplierPageHeader title="Supplier Assessment GHG" description="Review and lock each reporting period when its data is complete." icon={Cloud} iconClassName="border-sky-200 bg-sky-50 text-sky-700" testId="supplier-ghg-submission" />
    <Card className="overflow-hidden border-stone-200" data-testid="supplier-ghg-period-ledger">
      <CardHeader className="border-b border-stone-100"><CardTitle className="flex items-center gap-2 text-lg"><CalendarDays className="h-4 w-4 text-sky-700" />Submission periods</CardTitle></CardHeader>
      <CardContent className="p-0">
        {!state ? <p className="p-6 text-sm text-stone-500" data-testid="supplier-ghg-periods-loading">Loading submission periods…</p> : <Table data-testid="supplier-ghg-periods-table"><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Deadline</TableHead>{enabledScopes.includes('scope1') && <TableHead data-testid="supplier-ghg-period-scope1-header">Scope 1 last submitted</TableHead>}{enabledScopes.includes('scope2') && <TableHead data-testid="supplier-ghg-period-scope2-header">Scope 2 last submitted</TableHead>}<TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{periods.map((period) => <TableRow key={period.period_key} data-testid={`supplier-ghg-period-${period.period_key}`}><TableCell className="font-medium text-stone-900" data-testid={`supplier-ghg-period-label-${period.period_key}`}>{period.label}</TableCell><TableCell data-testid={`supplier-ghg-period-deadline-${period.period_key}`}>{new Date(`${period.due_date}T00:00:00Z`).toLocaleDateString('en-GB')}</TableCell>{enabledScopes.includes('scope1') && <TableCell className="font-medium tabular-nums text-stone-800" data-testid={`supplier-ghg-period-scope1-total-${period.period_key}`}>{submittedScopeTotal(period, 'scope1')}</TableCell>}{enabledScopes.includes('scope2') && <TableCell className="font-medium tabular-nums text-stone-800" data-testid={`supplier-ghg-period-scope2-total-${period.period_key}`}>{submittedScopeTotal(period, 'scope2')}</TableCell>}<TableCell><Badge variant="outline" className={periodTone(period)} data-testid={`supplier-ghg-period-status-${period.period_key}`}>{periodStatusLabel(period)}</Badge>{period.unlock_requested_at && period.status === 'submitted' && <p className="mt-1 text-xs text-stone-500" data-testid={`supplier-ghg-period-unlock-requested-${period.period_key}`}>Unlock requested</p>}{period.status === 'unlocked' && period.supplier_instructions && <p className="mt-1 max-w-sm text-xs text-amber-800" data-testid={`supplier-ghg-period-instructions-${period.period_key}`}>{period.supplier_instructions}</p>}</TableCell><TableCell data-testid={`supplier-ghg-period-submitted-at-${period.period_key}`}>{period.submitted_at ? new Date(period.submitted_at).toLocaleDateString('en-GB') : '—'}</TableCell><TableCell className="text-right">{period.status === 'submitted' ? <Button variant="outline" size="sm" disabled={requestingKey === period.period_key} onClick={() => requestUnlock(period)} data-testid={`request-unlock-supplier-ghg-period-${period.period_key}`}>{requestingKey === period.period_key ? 'Requesting…' : 'Request unlock'}</Button> : canSubmitPeriod(period) ? <Button size="sm" disabled={submitting} onClick={() => { setSelectedPeriod(period); setVerificationAccepted(false); }} data-testid={`submit-supplier-ghg-period-${period.period_key}`}><Send className="mr-1.5 h-3.5 w-3.5" />{period.status === 'unlocked' ? 'Resubmit' : 'Submit'}</Button> : <span className="text-sm text-stone-400" data-testid={`supplier-ghg-period-no-submission-${period.period_key}`}>—</span>}</TableCell></TableRow>)}</TableBody></Table>}</CardContent>
    </Card>
    <div className="grid gap-5 md:grid-cols-2" data-testid="supplier-ghg-draft-totals">
      {enabledScopes.includes('scope1') && <Card className="border-blue-200 bg-white shadow-[0_5px_16px_rgba(59,130,246,0.10)]" data-testid="supplier-ghg-scope1-total"><CardContent className="pt-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700" data-testid="supplier-ghg-scope1-icon"><Factory className="h-5 w-5" /></span><p className="text-sm font-medium text-blue-800">Scope 1 draft total</p></div><p className="mt-4 text-2xl font-semibold text-slate-900" data-testid="supplier-ghg-draft-scope1">{(totals.scope1 || 0).toFixed(2)} tCO₂e</p></CardContent></Card>}
      {enabledScopes.includes('scope2') && <Card className="border-purple-200 bg-white shadow-[0_5px_16px_rgba(147,51,234,0.10)]" data-testid="supplier-ghg-scope2-total"><CardContent className="pt-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-700" data-testid="supplier-ghg-scope2-icon"><Zap className="h-5 w-5" /></span><p className="text-sm font-medium text-purple-800">Scope 2 draft total</p></div><p className="mt-4 text-2xl font-semibold text-slate-900" data-testid="supplier-ghg-draft-scope2">{(totals.scope2 || 0).toFixed(2)} tCO₂e</p></CardContent></Card>}
    </div>
    <Card data-testid="supplier-ghg-submission-aggregation"><CardHeader><CardTitle>Current draft summary</CardTitle></CardHeader><CardContent>{(state?.draft_aggregation || []).length === 0 ? <div className="flex flex-wrap items-center justify-between gap-3" data-testid="supplier-ghg-submission-empty"><p className="text-sm text-stone-500">No editable GHG entries are available.</p><Button variant="outline" onClick={() => navigate('/ghg')} data-testid="supplier-ghg-add-data-button">Add GHG data<ArrowRight className="ml-2 h-4 w-4" /></Button></div> : <p className="text-sm text-stone-600" data-testid="supplier-ghg-draft-summary-count">{state.draft_aggregation.reduce((count, row) => count + row.entry_count, 0)} editable {state.draft_aggregation.reduce((count, row) => count + row.entry_count, 0) === 1 ? 'entry' : 'entries'} ready for submission.</p>}</CardContent></Card>
    <AlertDialog open={Boolean(selectedPeriod)} onOpenChange={(open) => { if (!open) { setSelectedPeriod(null); setVerificationAccepted(false); } }}><AlertDialogContent data-testid="confirm-supplier-ghg-period-submit-dialog"><AlertDialogHeader><AlertDialogTitle data-testid="confirm-supplier-ghg-period-submit-title">Submit {selectedPeriod?.label}?</AlertDialogTitle><AlertDialogDescription data-testid="confirm-supplier-ghg-period-submit-description">Only data in this period will be sent to your customer and locked until they unlock it.</AlertDialogDescription></AlertDialogHeader><SupplierDataVerificationAcknowledgement checked={verificationAccepted} onCheckedChange={setVerificationAccepted} testIdPrefix="supplier-ghg-period-data-verification" /><AlertDialogFooter><AlertDialogCancel data-testid="cancel-supplier-ghg-period-submit-button">Cancel</AlertDialogCancel><AlertDialogAction disabled={submitting || !verificationAccepted} onClick={submit} data-testid="confirm-supplier-ghg-period-submit-button">{submitting ? 'Submitting…' : 'Submit period'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}