import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BarChart3, Download, FileSpreadsheet, FileText, Mail, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ALL_SCOPES = ['scope1', 'scope2', 'scope3', 'biogenic'];
const month = new Date().toISOString().slice(0, 7);

const formatValue = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function MISReportsWorkspace() {
  const { getAuthHeader } = useAuth();
  const [schema, setSchema] = useState(null);
  const [summary, setSummary] = useState(null);
  const [executive, setExecutive] = useState(null);
  const [history, setHistory] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [filters, setFilters] = useState({ reporting_period_start: `${month.slice(0, 4)}-01`, reporting_period_end: month, facility_ids: [], scopes: ALL_SCOPES, categories: [] });
  const [scheduleForm, setScheduleForm] = useState({ name: 'Monthly Emissions Summary', frequency: 'monthly', recipient_emails: '', is_enabled: true });

  const requestConfig = useMemo(() => ({ headers: getAuthHeader() }), [getAuthHeader]);
  const refreshActivity = async () => {
    const [historyResponse, schedulesResponse, deliveriesResponse] = await Promise.all([
      axios.get(`${API}/mis-reports/history`, requestConfig), axios.get(`${API}/mis-reports/schedules`, requestConfig), axios.get(`${API}/mis-reports/deliveries`, requestConfig),
    ]);
    setHistory(historyResponse.data.items || []); setSchedules(schedulesResponse.data || []); setDeliveries(deliveriesResponse.data || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const schemaResponse = await axios.get(`${API}/mis-reports/filter-schema`, requestConfig);
        if (cancelled) return;
        setSchema(schemaResponse.data);
        await refreshActivity();
      } catch (error) { if (!cancelled) toast.error(error.response?.data?.detail || 'MIS Reports could not be loaded.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [requestConfig]);

  const payload = () => ({ ...filters, facility_ids: filters.facility_ids.length ? filters.facility_ids : schema?.facilities.map((facility) => facility.id) || [] });
  const toggleListValue = (key, value) => setFilters((current) => {
    if (key === 'facility_ids' && !current.facility_ids.length) {
      return { ...current, facility_ids: (schema?.facilities || []).map((facility) => facility.id).filter((facilityId) => facilityId !== value) };
    }
    return { ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] };
  });

  const generateSummary = async () => {
    if (filters.reporting_period_start > filters.reporting_period_end) return toast.error('Start period must be before end period.');
    setGenerating(true);
    try {
      const [response, executiveResponse] = await Promise.all([
        axios.post(`${API}/mis-reports/emissions-summary`, payload(), requestConfig),
        axios.post(`${API}/mis-reports/executive-report`, payload(), requestConfig),
      ]);
      setSummary(response.data); setExecutive(executiveResponse.data); await refreshActivity(); toast.success('ESG MIS Report generated.');
    } catch (error) { toast.error(error.response?.data?.detail || 'Unable to generate the report.'); }
    finally { setGenerating(false); }
  };

  const downloadExport = async (format) => {
    try {
      const response = await axios.post(`${API}/mis-reports/emissions-summary/export/${format}`, payload(), { ...requestConfig, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data])); const link = document.createElement('a'); link.href = url; link.download = `MIS_Emissions_Summary.${format}`; link.click(); window.URL.revokeObjectURL(url);
    } catch (error) { toast.error(`Unable to export ${format.toUpperCase()}.`); }
  };

  const saveSchedule = async () => {
    const recipient_emails = scheduleForm.recipient_emails.split(',').map((email) => email.trim()).filter(Boolean);
    if (!scheduleForm.name || !recipient_emails.length) return toast.error('Enter a schedule name and at least one recipient.');
    try {
      await axios.post(`${API}/mis-reports/schedules`, { ...scheduleForm, recipient_emails, filters: payload() }, requestConfig);
      setScheduleOpen(false); setScheduleForm({ name: 'Monthly Emissions Summary', frequency: 'monthly', recipient_emails: '', is_enabled: true }); await refreshActivity(); toast.success('Schedule saved.');
    } catch (error) { toast.error(error.response?.data?.detail || 'Unable to save schedule.'); }
  };

  const scheduleAction = async (schedule, action) => {
    try {
      if (action === 'send') await axios.post(`${API}/mis-reports/schedules/${schedule.id}/send-now`, {}, requestConfig);
      if (action === 'delete') await axios.delete(`${API}/mis-reports/schedules/${schedule.id}`, requestConfig);
      await refreshActivity(); toast.success(action === 'send' ? 'Report delivery requested.' : 'Schedule deleted.');
    } catch (error) { toast.error(error.response?.data?.detail || 'Schedule action failed.'); }
  };

  if (loading) return <div className="flex h-64 items-center justify-center" data-testid="mis-reports-loading"><RefreshCw className="h-6 w-6 animate-spin text-emerald-800" /></div>;

  return <div className="space-y-8" data-testid="mis-reports-workspace">
    <header className="flex flex-col justify-between gap-5 border-b border-stone-200 pb-6 lg:flex-row lg:items-end" data-testid="mis-reports-header">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-800" data-testid="mis-reports-label">MIS Reports</p><h1 className="mt-2 text-4xl font-heading font-bold text-stone-950" data-testid="mis-reports-title">Emissions Summary</h1><p className="mt-2 text-sm text-stone-600" data-testid="mis-reports-description">Configured management reporting across Scope 1, 2, 3, and Biogenic emissions.</p></div>
      <Button onClick={() => setScheduleOpen(true)} className="bg-emerald-900 text-white hover:bg-emerald-800" data-testid="mis-schedule-report-button"><Mail className="h-4 w-4" />Schedule report</Button>
    </header>
    <Tabs defaultValue="summary" data-testid="mis-reports-tabs">
      <TabsList className="h-auto bg-stone-100" data-testid="mis-reports-tabs-list"><TabsTrigger value="summary" data-testid="mis-tab-summary">Summary</TabsTrigger><TabsTrigger value="history" data-testid="mis-tab-history">Report History</TabsTrigger><TabsTrigger value="schedules" data-testid="mis-tab-schedules">Schedules & Delivery</TabsTrigger></TabsList>
      <TabsContent value="summary" className="mt-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4" data-testid="mis-summary-layout">
          <aside className="space-y-5 border-b border-stone-200 pb-6 lg:border-b-0 lg:border-r lg:pr-6" data-testid="mis-summary-filters">
            <div><Label htmlFor="mis-period-start">Reporting period</Label><div className="mt-2 grid grid-cols-2 gap-2"><Input id="mis-period-start" type="month" value={filters.reporting_period_start} onChange={(event) => setFilters({ ...filters, reporting_period_start: event.target.value })} data-testid="mis-filter-period-start" /><Input type="month" value={filters.reporting_period_end} onChange={(event) => setFilters({ ...filters, reporting_period_end: event.target.value })} data-testid="mis-filter-period-end" /></div></div>
            <div><Label>Facilities</Label><div className="mt-2 max-h-36 space-y-2 overflow-y-auto border border-stone-200 p-2" data-testid="mis-filter-facilities">{schema?.facilities.map((facility) => <label key={facility.id} className="flex gap-2 text-sm text-stone-700"><input type="checkbox" checked={!filters.facility_ids.length || filters.facility_ids.includes(facility.id)} onChange={() => toggleListValue('facility_ids', facility.id)} data-testid={`mis-filter-facility-${facility.id}`} />{facility.name}</label>)}</div></div>
            <div><Label>Scopes</Label><div className="mt-2 grid grid-cols-2 gap-2">{ALL_SCOPES.map((scope) => <label key={scope} className="flex gap-2 text-sm capitalize text-stone-700"><input type="checkbox" checked={filters.scopes.includes(scope)} onChange={() => toggleListValue('scopes', scope)} data-testid={`mis-filter-scope-${scope}`} />{scope.replace('scope', 'Scope ')}</label>)}</div></div>
            <div><Label htmlFor="mis-category-select">Category</Label><Select value={filters.categories[0] || 'all'} onValueChange={(value) => setFilters({ ...filters, categories: value === 'all' ? [] : [value] })}><SelectTrigger id="mis-category-select" className="mt-2" data-testid="mis-filter-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{schema?.categories.map((category) => <SelectItem value={category} key={category}>{category}</SelectItem>)}</SelectContent></Select></div>
            <Button onClick={generateSummary} disabled={generating} className="w-full bg-emerald-900 text-white hover:bg-emerald-800" data-testid="mis-generate-summary-button"><BarChart3 className="h-4 w-4" />{generating ? 'Generating…' : 'Generate report'}</Button>
          </aside>
          <section className="space-y-6 lg:col-span-3" data-testid="mis-summary-results">
            {!summary ? <div className="border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500" data-testid="mis-summary-empty-state">Set the reporting parameters, then generate your first Emissions Summary.</div> : <><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-stone-600" data-testid="mis-summary-period">{summary.filters.reporting_period_start} to {summary.filters.reporting_period_end} · {summary.record_count} source records</p><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => downloadExport('xlsx')} data-testid="mis-export-excel-button"><FileSpreadsheet className="h-4 w-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => downloadExport('pdf')} data-testid="mis-export-pdf-button"><FileText className="h-4 w-4" />PDF</Button></div></div><div className="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="mis-summary-metrics"><Card className="rounded-md border-stone-200 shadow-sm"><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-stone-500">Total emissions</p><p className="mt-2 font-mono text-2xl font-bold text-stone-950" data-testid="mis-total-emissions">{formatValue(summary.total_emissions)}</p><p className="text-xs text-stone-500">{summary.unit}</p></CardContent></Card>{summary.scope_breakdown.map((row) => <Card key={row.scope} className="rounded-md border-stone-200 shadow-sm" data-testid={`mis-scope-metric-${row.scope}`}><CardContent className="p-4"><p className="text-xs uppercase tracking-[0.14em] text-stone-500">{row.scope}</p><p className="mt-2 font-mono text-xl font-bold text-stone-900">{formatValue(row.emissions)}</p><p className="text-xs text-stone-500">kg CO2e</p></CardContent></Card>)}</div><ExecutiveReportSections report={executive} /><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><BreakdownTable title="By category" rows={summary.category_breakdown} field="category" testId="mis-category-breakdown" /><BreakdownTable title="By facility" rows={summary.facility_breakdown} field="facility" testId="mis-facility-breakdown" /></div></>}
          </section>
        </div>
      </TabsContent>
      <TabsContent value="history" className="mt-6"><HistoryTable history={history} /></TabsContent>
      <TabsContent value="schedules" className="mt-6"><ScheduleTables schedules={schedules} deliveries={deliveries} onAction={scheduleAction} /></TabsContent>
    </Tabs>
    <Sheet open={scheduleOpen} onOpenChange={setScheduleOpen}><SheetContent className="overflow-y-auto bg-white" data-testid="mis-schedule-sheet"><SheetHeader><SheetTitle>Schedule Emissions Summary</SheetTitle></SheetHeader><div className="mt-6 space-y-5"><div><Label htmlFor="schedule-name">Schedule name</Label><Input id="schedule-name" value={scheduleForm.name} onChange={(event) => setScheduleForm({ ...scheduleForm, name: event.target.value })} data-testid="mis-schedule-name-input" /></div><div><Label>Frequency</Label><Select value={scheduleForm.frequency} onValueChange={(frequency) => setScheduleForm({ ...scheduleForm, frequency })}><SelectTrigger className="mt-2" data-testid="mis-schedule-frequency-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem></SelectContent></Select></div><div><Label htmlFor="schedule-recipients">Recipients</Label><Input id="schedule-recipients" placeholder="name@company.com, team@company.com" value={scheduleForm.recipient_emails} onChange={(event) => setScheduleForm({ ...scheduleForm, recipient_emails: event.target.value })} data-testid="mis-schedule-recipients-input" /></div><Button onClick={saveSchedule} className="w-full bg-emerald-900 text-white hover:bg-emerald-800" data-testid="mis-save-schedule-button">Save schedule</Button></div></SheetContent></Sheet>
  </div>;
}

function BreakdownTable({ title, rows, field, testId }) { return <Card className="rounded-md border-stone-200 shadow-sm" data-testid={testId}><CardContent className="p-5"><h2 className="font-semibold text-stone-900">{title}</h2><Table className="mt-3"><TableHeader><TableRow><TableHead>{field}</TableHead><TableHead className="text-right">kg CO2e</TableHead></TableRow></TableHeader><TableBody>{rows.slice(0, 8).map((row) => <TableRow key={row[field]} data-testid={`${testId}-${row[field]}`}><TableCell>{row[field]}</TableCell><TableCell className="text-right font-mono">{formatValue(row.emissions)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>; }
function ExecutiveReportSections({ report }) { if (!report) return null; return <section className="space-y-6" data-testid="mis-executive-report"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Executive summary</p><div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">{report.kpis.map((kpi) => <Card key={kpi.label} className="rounded-md border-stone-200 shadow-sm" data-testid={`mis-executive-kpi-${kpi.label.replaceAll(' ', '-').toLowerCase()}`}><CardContent className="p-4"><p className="text-xs text-stone-500">{kpi.label}</p><p className="mt-1 font-mono text-lg font-bold">{formatValue(kpi.value)}</p><p className="text-xs text-stone-500">Previous {formatValue(kpi.previous)} · {kpi.change_pct === null ? 'No prior data' : `${kpi.change_pct > 0 ? '▲' : '▼'} ${Math.abs(kpi.change_pct)}%`}</p></CardContent></Card>)}</div></div><div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><MetricSection title="Energy performance" metrics={[['Total energy', report.energy.total, 'MWh'], ['Renewable', report.energy.renewable_total, 'MWh'], ['Renewable share', report.energy.renewable_pct, '%']]} testId="mis-energy-performance" /><MetricSection title="Water performance" metrics={[['Fresh water', report.water.consumption, 'KL'], ['Recycled water', report.water.recycled, 'KL'], ['Withdrawal', report.water.withdrawal, 'KL']]} testId="mis-water-performance" /><MetricSection title="Waste performance" metrics={[['Total waste', report.waste.total, ''], ['Hazardous', report.waste.hazardous_generated, ''], ['Recovery', report.waste.recovery_pct, '%']]} testId="mis-waste-performance" /></div><div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><Card className="rounded-md border-stone-200 shadow-sm" data-testid="mis-factual-insights"><CardContent className="p-5"><h2 className="font-semibold">Carbon insights</h2><ul className="mt-3 space-y-2 text-sm text-stone-700">{report.insights.length ? report.insights.map((insight) => <li key={insight}>• {insight}</li>) : <li>No material change was identified in the selected period.</li>}</ul></CardContent></Card><Card className="rounded-md border-stone-200 shadow-sm" data-testid="mis-open-actions"><CardContent className="p-5"><h2 className="font-semibold">Open action items</h2><ul className="mt-3 space-y-2 text-sm text-stone-700">{report.actions.length ? report.actions.map((action) => <li key={action.type}>• {action.type}: {action.count}</li>) : <li>No open data-quality action items.</li>}</ul></CardContent></Card></div><div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><MetricSection title="Data collection" metrics={[['Source records', report.data_quality.source_records, ''], ['Facilities reporting', report.data_quality.facilities_reporting, ''], ['Pending approval', report.data_collection.pending_approval, '']]} testId="mis-data-collection" /><MetricSection title="Data quality" metrics={[['Evidence attached', report.data_quality.evidence_attached, ''], ['Rejected entries', report.data_collection.rejected, '']]} testId="mis-data-quality" /><MetricSection title="Supplier assessment" metrics={[['Suppliers assessed', report.supplier_assessment.suppliers_assessed, ''], ['High risk', report.supplier_assessment.high_risk_suppliers, ''], ['Pending', report.supplier_assessment.pending_assessments, '']]} testId="mis-supplier-assessment" /></div></section>; }
function MetricSection({ title, metrics, testId }) { return <Card className="rounded-md border-stone-200 shadow-sm" data-testid={testId}><CardContent className="p-5"><h2 className="font-semibold">{title}</h2><dl className="mt-3 space-y-2">{metrics.map(([label, value, unit]) => <div key={label} className="flex justify-between text-sm"><dt className="text-stone-600">{label}</dt><dd className="font-mono font-semibold">{formatValue(value)} {unit}</dd></div>)}</dl></CardContent></Card>; }
function HistoryTable({ history }) { return <Card className="rounded-md border-stone-200 shadow-sm" data-testid="mis-report-history-table"><CardContent className="p-5"><h2 className="font-semibold text-stone-900">Generated reports</h2><Table className="mt-3"><TableHeader><TableRow><TableHead>Report</TableHead><TableHead>Period</TableHead><TableHead>Generated</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{history.length ? history.map((item) => <TableRow key={item.id} data-testid={`mis-history-row-${item.id}`}><TableCell>{item.template_name}</TableCell><TableCell>{item.filters?.reporting_period_start} — {item.filters?.reporting_period_end}</TableCell><TableCell>{new Date(item.generated_at).toLocaleString()}</TableCell><TableCell><Badge variant="outline">{item.status}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan="4" className="py-8 text-center text-stone-500" data-testid="mis-history-empty">No saved report runs yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>; }
function ScheduleTables({ schedules, deliveries, onAction }) { return <div className="space-y-8" data-testid="mis-schedules-delivery"><Card className="rounded-md border-stone-200 shadow-sm"><CardContent className="p-5"><h2 className="font-semibold text-stone-900">Schedules</h2><Table className="mt-3"><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Frequency</TableHead><TableHead>Next run</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{schedules.length ? schedules.map((schedule) => <TableRow key={schedule.id} data-testid={`mis-schedule-row-${schedule.id}`}><TableCell><p>{schedule.name}</p><p className="text-xs text-stone-500">{schedule.recipient_emails.join(', ')}</p></TableCell><TableCell className="capitalize">{schedule.frequency}</TableCell><TableCell>{schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleDateString() : 'Disabled'}</TableCell><TableCell><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => onAction(schedule, 'send')} data-testid={`mis-schedule-send-${schedule.id}`} title="Send now"><Send className="h-4 w-4" /></Button><Button variant="outline" size="icon" onClick={() => onAction(schedule, 'delete')} data-testid={`mis-schedule-delete-${schedule.id}`} title="Delete schedule"><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>) : <TableRow><TableCell colSpan="4" className="py-8 text-center text-stone-500" data-testid="mis-schedules-empty">No schedules created yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card><Card className="rounded-md border-stone-200 shadow-sm"><CardContent className="p-5"><h2 className="font-semibold text-stone-900">Delivery history</h2><Table className="mt-3"><TableHeader><TableRow><TableHead>Recipient</TableHead><TableHead>Sent</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{deliveries.length ? deliveries.map((delivery) => <TableRow key={delivery.id} data-testid={`mis-delivery-row-${delivery.id}`}><TableCell>{delivery.recipient_email}</TableCell><TableCell>{new Date(delivery.sent_at).toLocaleString()}</TableCell><TableCell><Badge variant="outline">{delivery.status}</Badge></TableCell></TableRow>) : <TableRow><TableCell colSpan="3" className="py-8 text-center text-stone-500" data-testid="mis-deliveries-empty">No deliveries recorded yet.</TableCell></TableRow>}</TableBody></Table></CardContent></Card></div>; }