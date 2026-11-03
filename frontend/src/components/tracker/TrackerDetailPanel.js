/**
 * Tracker expanded panel: Periods / Assignment and approvers / Activity / Linked disclosures.
 * Data: GET /api/esg-records/tracker-detail (period status is the synced task status).
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS = {
  completed: { label: 'Completed', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', card: 'border-stone-200' },
  pending_approval: { label: 'Awaiting approval', dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700 border-blue-200', card: 'border-blue-400 ring-1 ring-blue-200' },
  pending: { label: 'Pending', dot: 'bg-stone-400', pill: 'bg-stone-100 text-stone-600 border-stone-200', card: 'border-stone-200' },
  overdue: { label: 'Overdue', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700 border-red-200', card: 'border-red-300' },
  rejected: { label: 'Sent back', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700 border-red-200', card: 'border-red-300' },
};

const fmt = (iso, withTime = false) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return withTime ? `${date}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}` : date;
};

const range = (a, b) => {
  const s = a && new Date(a);
  const e = b && new Date(b);
  if (!s || !e) return '';
  const sm = s.toLocaleDateString('en-GB', { month: 'short' });
  const em = e.toLocaleDateString('en-GB', { month: 'short' });
  return `${sm} – ${em} ${e.getFullYear()}`;
};

function PeriodCard({ period, section }) {
  const cfg = STATUS[period.status] || STATUS.pending;
  let context = null;
  if (period.status === 'completed') {
    context = (
      <>
        <p className="text-xs text-stone-600" data-testid={`period-context-${period.period_key}`}>
          {period.approved_by_name
            ? `Approved by ${period.approved_by_name} on ${fmt(period.approved_at)}`
            : `Submitted by ${period.submitted_by_name || 'user'} on ${fmt(period.submitted_at)}`}
        </p>
        <Link to={`/${section}`} className="mt-1 inline-block text-xs font-medium text-emerald-700 hover:underline">View submitted data</Link>
      </>
    );
  } else if (period.status === 'pending_approval') {
    context = <p className="text-xs text-stone-600" data-testid={`period-context-${period.period_key}`}>Submitted by {period.submitted_by_name || 'user'} on {fmt(period.submitted_at, true)}</p>;
  } else if (period.status === 'rejected') {
    context = <p className="text-xs text-red-700">Sent back to {period.submitted_by_name || 'the submitter'} for changes</p>;
  } else {
    context = <p className="text-xs text-stone-500">Collection opens {fmt(period.opens_at)}</p>;
  }
  return (
    <div className={`flex min-w-0 flex-col rounded-xl border bg-white p-4 ${cfg.card}`} data-testid={`period-card-${period.period_key}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-heading text-lg font-semibold text-stone-900">{period.label}</h4>
        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cfg.pill}`} data-testid={`period-status-${period.period_key}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />{cfg.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-stone-500">{range(period.period_start, period.period_end)}</p>
      <p className="mt-2 text-sm font-semibold text-stone-900">Due {fmt(period.due_at)}</p>
      <div className="my-3 border-t border-stone-100" />
      {context}
    </div>
  );
}

const Empty = ({ children }) => <p className="py-6 text-sm text-stone-500">{children}</p>;

function AssignmentTab({ a }) {
  const person = (u) => (
    <li key={u.id} className="flex items-center gap-2 text-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">{(u.name || '?').slice(0, 1).toUpperCase()}</span>
      <span className="text-stone-900">{u.name}</span><span className="text-xs text-stone-500">{u.email !== u.name ? u.email : ''}</span>
    </li>
  );
  return (
    <div className="grid gap-6 pt-4 md:grid-cols-3" data-testid="tracker-tab-assignment">
      <div><h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Data entry</h5><ul className="space-y-2">{a.assignees.length ? a.assignees.map(person) : <Empty>No assignees</Empty>}</ul></div>
      <div><h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Approvers</h5><ul className="space-y-2">{a.requires_approval ? (a.approvers.length ? a.approvers.map(person) : <Empty>No approver set</Empty>) : <Empty>Approval not required</Empty>}</ul></div>
      <div className="space-y-1 text-sm text-stone-700">
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Schedule</h5>
        <p>Starts {fmt(a.start_date)}</p><p>Ends {fmt(a.end_date)}</p>
        <p>Reminders {a.reminder_enabled ? 'on' : 'off'}</p>
        {a.facilities.length > 0 && <p>Facilities: {a.facilities.map((f) => f.name).join(', ')}</p>}
      </div>
    </div>
  );
}

const ActivityTab = ({ items }) => (
  <ol className="space-y-3 pt-4" data-testid="tracker-tab-activity">
    {items.length === 0 && <Empty>No activity yet</Empty>}
    {items.map((e, i) => (
      <li key={`${e.at}-${i}`} className="flex gap-3 text-sm">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <div><p className="text-stone-900">{e.title}{e.actor ? <span className="text-stone-500"> · {e.actor}</span> : null}</p><p className="text-xs text-stone-500">{fmt(e.at, true)}</p></div>
      </li>
    ))}
  </ol>
);

const LinkedTab = ({ items }) => (
  <ul className="divide-y divide-stone-100 pt-2" data-testid="tracker-tab-linked">
    {items.length === 0 && <Empty>No BRSR or GRI disclosures are mapped to this category yet</Empty>}
    {items.map((d) => (
      <li key={`${d.framework}-${d.question_key}`} className="flex items-start gap-3 py-3 text-sm">
        <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">{d.framework}</span>
        <div className="min-w-0"><p className="font-medium text-stone-900">{d.reference || d.question_key}</p><p className="truncate text-xs text-stone-500">{d.title}</p></div>
        <span className="ml-auto whitespace-nowrap text-xs text-stone-500">{d.kpi_count} KPI{d.kpi_count === 1 ? '' : 's'}</span>
      </li>
    ))}
  </ul>
);

export default function TrackerDetailPanel({ section, category, subcategory, onClose }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('periods');
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    axios.get(`${API}/api/esg-records/tracker-detail`, { headers: { Authorization: `Bearer ${token}` }, params: { section, category, subcategory } })
      .then((r) => live && setData(r.data)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [token, section, category, subcategory]);

  if (error) return <p className="p-4 text-sm text-red-600">Could not load details.</p>;
  if (!data) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>;
  if (!data.has_assignment) return <p className="p-4 text-sm text-stone-500">No assignment for this subcategory yet.</p>;

  const tabs = [
    { id: 'periods', label: 'Periods', count: data.periods.length },
    { id: 'assignment', label: 'Assignment and approvers' },
    { id: 'activity', label: 'Activity', count: data.activity.length },
    { id: 'linked', label: 'Linked disclosures', count: data.linked_disclosures.length },
  ];
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="tracker-detail-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg text-stone-900"><span className="text-stone-500">{data.category} / </span><span className="font-semibold">{data.subcategory}</span></h3>
          <p className="text-xs text-stone-500" data-testid="tracker-detail-subtitle">{data.level} · {data.frequency.replace('_', '-').replace(/^./, (c) => c.toUpperCase())} · {data.due_rule}</p>
        </div>
        <div className="flex items-center gap-2">
          {data.fy_label && <span className="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-700" data-testid="tracker-detail-fy">{data.fy_label}</span>}
          {onClose && <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Close details" data-testid="tracker-detail-close"><X className="h-4 w-4" /></button>}
        </div>
      </div>
      <div className="mt-4 flex gap-5 overflow-x-auto border-b border-stone-200" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`tracker-tab-${t.id}`}
            className={`-mb-px whitespace-nowrap border-b-2 pb-2 text-sm font-medium ${tab === t.id ? 'border-emerald-600 text-stone-900' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-[11px] text-stone-600">{t.count}</span>}
          </button>
        ))}
      </div>
      {tab === 'periods' && (
        <>
          <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="tracker-tab-periods">
            {data.periods.map((p) => <PeriodCard key={p.period_key} period={p} section={section} />)}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-600" data-testid="tracker-legend">
            {['completed', 'pending_approval', 'pending'].map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${STATUS[k].dot}`} />{STATUS[k].label}</span>)}
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Overdue or sent back</span>
          </div>
        </>
      )}
      {tab === 'assignment' && <AssignmentTab a={data.assignment} />}
      {tab === 'activity' && <ActivityTab items={data.activity} />}
      {tab === 'linked' && <LinkedTab items={data.linked_disclosures} />}
    </div>
  );
}
