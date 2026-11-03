/**
 * Tracker expanded panel: Periods / Assignment and approvers / Activity / Linked entries.
 * Data: GET /api/esg-records/tracker-detail (period status is the synced task status).
 */
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, X } from 'lucide-react';
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
  if (!withTime) return date;
  const ist = { timeZone: 'Asia/Kolkata' };
  const istDate = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...ist });
  return `${istDate}, ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...ist })} IST`;
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
  } else if (period.status === 'overdue') {
    context = <p className="text-xs text-red-700" data-testid={`period-context-${period.period_key}`}>Due date passed on {fmt(period.due_at)} with no data submitted</p>;
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
      {period.facilities?.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-stone-100 pt-2" data-testid={`period-facilities-${period.period_key}`}>
          {period.facilities.map((f) => {
            const fc = STATUS[f.status] || STATUS.pending;
            return (
              <li key={f.name} className="flex items-center justify-between gap-2 text-xs" data-testid="period-facility-row">
                <span className="truncate text-stone-700">{f.name}</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-stone-600"><span className={`h-1.5 w-1.5 rounded-full ${fc.dot}`} />{fc.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const Empty = ({ children }) => <p className="py-6 text-sm text-stone-500">{children}</p>;

const REMINDERS = [
  { id: 'before_7d', label: '7 days before the deadline' },
  { id: 'on_deadline', label: 'On the deadline day' },
  { id: 'overdue_every_3d', label: 'Every 3 days while overdue' },
];
const ESCALATIONS = [
  { id: 'overdue_5d', label: 'Notify the admin when 5 days overdue' },
  { id: 'overdue_10d', label: 'Notify the admin when 10 days overdue' },
  { id: 'none', label: "Don't notify" },
];

function NotificationSettings({ a, ctx, canEdit }) {
  const { token } = useAuth();
  const [rules, setRules] = useState(a.reminder_rules);
  const [esc, setEsc] = useState(a.escalation);
  const [saving, setSaving] = useState(false);
  const dirty = esc !== a.escalation || REMINDERS.some((r) => rules.includes(r.id) !== a.reminder_rules.includes(r.id));
  const toggle = (id) => setRules((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/esg-records/tracker-detail/notifications`, { ...ctx, reminder_rules: rules, escalation: esc }, { headers: { Authorization: `Bearer ${token}` } });
      a.reminder_rules = rules; a.escalation = esc;
      toast.success('Reminder settings saved');
    } catch (e) { toast.error(e.response?.data?.detail || 'Could not save settings'); }
    setSaving(false);
  };
  const box = 'h-4 w-4 accent-emerald-600';
  return (
    <div className="mt-6 grid gap-6 border-t border-stone-100 pt-5 md:grid-cols-2" data-testid="tracker-notification-settings">
      <div>
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Reminders</h5>
        <div className="space-y-2">{REMINDERS.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm text-stone-800">
            <input type="checkbox" className={box} disabled={!canEdit} checked={rules.includes(r.id)} onChange={() => toggle(r.id)} data-testid={`reminder-${r.id}`} />{r.label}
          </label>))}
        </div>
      </div>
      <div>
        <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Escalation</h5>
        <div className="space-y-2">{ESCALATIONS.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm text-stone-800">
            <input type="radio" name="tracker-escalation" className={box} disabled={!canEdit} checked={esc === r.id} onChange={() => setEsc(r.id)} data-testid={`escalation-${r.id}`} />{r.label}
          </label>))}
        </div>
      </div>
      {canEdit && (
        <div className="md:col-span-2">
          <button onClick={save} disabled={!dirty || saving} className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40" data-testid="save-notification-settings">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}
    </div>
  );
}

function AssignmentTab({ a, ctx, canEdit, onEditAssignment }) {
  const person = (u) => (
    <li key={u.id} className="flex items-center gap-2 text-sm">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">{(u.name || '?').slice(0, 1).toUpperCase()}</span>
      <span className="text-stone-900">{u.name}</span><span className="text-xs text-stone-500">{u.email !== u.name ? u.email : ''}</span>
    </li>
  );
  return (
    <div className="pt-4" data-testid="tracker-tab-assignment">
      <div className="grid gap-6 md:grid-cols-3">
        <div><h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Data entry</h5><ul className="space-y-2">{a.assignees.length ? a.assignees.map(person) : <Empty>No assignees</Empty>}</ul></div>
        <div><h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Approvers</h5><ul className="space-y-2">{a.requires_approval ? (a.approvers.length ? a.approvers.map(person) : <Empty>No approver set</Empty>) : <Empty>Approval not required</Empty>}</ul></div>
        <div className="relative space-y-1 text-sm text-stone-700">
          <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Schedule</h5>
          {onEditAssignment && (
            <button onClick={onEditAssignment} className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1 text-sm font-medium text-stone-800 hover:bg-stone-50" data-testid="edit-assignment-btn">
              <Pencil className="h-3.5 w-3.5" />Edit assignment
            </button>
          )}
          <p>Starts {fmt(a.start_date)}</p><p>Ends {fmt(a.end_date)}</p>
          {a.facilities.length > 0 && <p>Facilities: {a.facilities.map((f) => f.name).join(', ')}</p>}
        </div>
      </div>
      <NotificationSettings a={a} ctx={ctx} canEdit={canEdit} />
    </div>
  );
}

const ACTOR_STYLE = { submit: 'bg-blue-100 text-blue-700', approve: 'bg-emerald-100 text-emerald-700', reject: 'bg-red-100 text-red-700', assign: 'bg-emerald-100 text-emerald-700', update: 'bg-stone-100 text-stone-600' };

const ActivityTab = ({ items }) => (
  <ol className="max-h-[26rem] overflow-y-auto pr-2 pt-4" data-testid="tracker-tab-activity">
    {items.length === 0 && <Empty>No activity yet</Empty>}
    {items.map((e, i) => (
      <li key={`${e.at}-${i}`} className="relative flex gap-4 pb-5 last:pb-0" data-testid="activity-item">
        {i < items.length - 1 && <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-stone-200" />}
        <span className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${ACTOR_STYLE[e.kind] || ACTOR_STYLE.update}`}>{(e.actor || '?').slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0"><p className="text-base text-stone-900">{e.title}</p><p className="text-sm text-stone-500">{fmt(e.at, true)}</p></div>
      </li>
    ))}
  </ol>
);

const ENTRY_STATUS = { completed: 'Completed', approved: 'Approved', pending: 'Awaiting approval', pending_approval: 'Awaiting approval', rejected: 'Sent back' };

const LinkedTab = ({ items, section }) => (
  <ul className="max-h-[26rem] divide-y divide-stone-100 overflow-y-auto pt-2" data-testid="tracker-tab-linked">
    {items.length === 0 && <Empty>No records have been submitted for this assignment yet</Empty>}
    {items.map((r) => (
      <li key={r.record_id} className="flex flex-wrap items-center gap-3 py-3 text-sm" data-testid="linked-entry">
        <span className="font-medium text-stone-900">{r.period_label || 'Record'}</span>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">{ENTRY_STATUS[r.status] || r.status}</span>
        <span className="text-xs text-stone-500">{r.submitted_by_name ? `by ${r.submitted_by_name} · ` : ''}{fmt(r.submitted_at, true)}</span>
        <Link to={`/${section}`} className="ml-auto text-xs font-medium text-emerald-700 hover:underline" data-testid="linked-entry-open">View entry</Link>
      </li>
    ))}
  </ul>
);

export default function TrackerDetailPanel({ section, category, subcategory, version, onEditAssignment, onClose }) {
  const { token, user } = useAuth();
  const canEdit = ['admin', 'super_admin', 'superadmin'].includes(String(user?.role || '').toLowerCase());
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('periods');
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    axios.get(`${API}/api/esg-records/tracker-detail`, { headers: { Authorization: `Bearer ${token}` }, params: { section, category, subcategory } })
      .then((r) => live && setData(r.data)).catch(() => live && setError(true));
    return () => { live = false; };
  }, [token, section, category, subcategory, version]);

  if (error) return <p className="p-4 text-sm text-red-600">Could not load details.</p>;
  if (!data) return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>;
  if (!data.has_assignment) return <p className="p-4 text-sm text-stone-500">No assignment for this subcategory yet.</p>;

  const tabs = [
    { id: 'periods', label: 'Periods', count: data.periods.length },
    { id: 'assignment', label: 'Assignment and approvers' },
    { id: 'activity', label: 'Activity', count: data.activity.length },
    { id: 'linked', label: 'Linked entries', count: data.linked_entries.length },
  ];
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm" data-testid="tracker-detail-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg text-stone-900"><span className="text-stone-500">{data.category} / </span><span className="font-semibold">{data.subcategory}</span></h3>
          <p className="text-xs text-stone-500" data-testid="tracker-detail-subtitle">{data.level} · {data.frequency.replace('_', '-').replace(/^./, (c) => c.toUpperCase())} · {data.due_rule}</p>
        </div>
        <div className="flex items-center gap-2">
                    {onClose && <button onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100" aria-label="Close details" data-testid="tracker-detail-close"><X className="h-4 w-4" /></button>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 border-b border-stone-200" role="tablist">
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
      {tab === 'assignment' && <AssignmentTab a={data.assignment} ctx={{ section, category, subcategory }} canEdit={canEdit} onEditAssignment={onEditAssignment} />}
      {tab === 'activity' && <ActivityTab items={data.activity} />}
      {tab === 'linked' && <LinkedTab items={data.linked_entries} section={section} />}
    </div>
  );
}
