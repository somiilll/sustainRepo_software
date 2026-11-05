/**
 * Expanded panel for a BRSR/GRI section: Questions / Assignment and approvers / Activity.
 * Data: GET /api/tracking/{domain}/frameworks/{framework}/sections/{section}/detail
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ActivityTab, Empty, fmt, NotificationSettings } from './TrackerDetailPanel';

const API = process.env.REACT_APP_BACKEND_URL;

const Q_STATUS = {
  approved: ['Approved', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
  saved: ['Saved', 'bg-blue-50 text-blue-700 border-blue-200'],
  pending_approval: ['Awaiting approval', 'bg-amber-50 text-amber-700 border-amber-200'],
  rejected: ['Sent back', 'bg-red-50 text-red-700 border-red-200'],
  overdue: ['Overdue', 'bg-red-50 text-red-700 border-red-200'],
  pending: ['Pending', 'bg-stone-100 text-stone-600 border-stone-200'],
};

const person = (u) => (
  <li key={u.id} className="flex items-center gap-2 text-sm">
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">{(u.name || '?').slice(0, 1).toUpperCase()}</span>
    <span className="text-stone-900">{u.name}</span><span className="text-xs text-stone-500">{u.email !== u.name ? u.email : ''}</span>
  </li>
);

const QuestionsTab = ({ items }) => (
  <ul className="max-h-[26rem] divide-y divide-stone-100 overflow-y-auto pt-2" data-testid="section-panel-questions">
    {items.length === 0 && <Empty>No questions in this section</Empty>}
    {items.map((q) => {
      const [label, cls] = Q_STATUS[q.status] || Q_STATUS.pending;
      return (
        <li key={q.question_key} className="flex flex-wrap items-center gap-3 py-3 text-sm" data-testid={`section-panel-question-${q.question_key}`}>
          <span className="min-w-0 flex-1 text-stone-900 line-clamp-2" title={q.name}>{q.name}</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
          <span className="w-40 text-right text-xs text-stone-500">{q.assigned ? (q.updated_at ? `Updated ${fmt(q.updated_at)}` : (q.due_date ? `Due ${fmt(q.due_date)}` : 'Assigned')) : 'Not assigned'}</span>
        </li>
      );
    })}
  </ul>
);

const AssignmentTab = ({ a, saveUrl, saveParams }) => (
  <div data-testid="section-panel-assignment">
  <div className="grid gap-6 pt-4 md:grid-cols-3">
    <div>
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Data entry</h5>
      <ul className="space-y-2">{a.assignees.length ? a.assignees.map(person) : <Empty>No assignees</Empty>}</ul>
    </div>
    <div>
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Approvers</h5>
      {!a.requires_approval ? <Empty>Approval not required</Empty> : a.approver_levels.length === 0 ? <Empty>No approver set</Empty> : (
        <div className="space-y-3">
          {a.approver_levels.map((l) => (
            <div key={l.level} data-testid={`section-panel-approver-level-${l.level}`}>
              {a.approver_levels.length > 1 && <p className="mb-1 text-[11px] font-semibold uppercase text-stone-400">Level {l.level}</p>}
              <ul className="space-y-2">{l.users.map(person)}</ul>
            </div>
          ))}
        </div>
      )}
    </div>
    <div className="space-y-1 text-sm text-stone-700">
      <h5 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Coverage</h5>
      <p>{a.assigned_questions} of {a.total_questions} questions assigned</p>
      {a.due_date && <p>Due {fmt(a.due_date)}</p>}
    </div>
  </div>
  {a.assigned_questions > 0 && <NotificationSettings a={a} canEdit saveUrl={saveUrl} saveParams={saveParams} />}
  </div>
);

export default function FrameworkSectionPanel({ domain, frameworkId, sectionId, reportingPeriod, version }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('questions');

  useEffect(() => {
    setError(false);
    axios.get(`${API}/api/tracking/${domain}/frameworks/${frameworkId}/sections/${encodeURIComponent(sectionId)}/detail`, {
      headers: { Authorization: `Bearer ${token}` }, params: { reporting_period: reportingPeriod },
    }).then((r) => setData(r.data)).catch(() => setError(true));
  }, [token, domain, frameworkId, sectionId, reportingPeriod, version]);

  if (error) return <p className="p-4 text-sm text-red-600">Could not load details.</p>;
  if (!data) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" /></div>;
  const tabs = [
    { id: 'questions', label: 'Questions', count: data.questions.length },
    { id: 'assignment', label: 'Assignment and approvers' },
    { id: 'activity', label: 'Activity', count: data.activity.length },
  ];
  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-white p-4" data-testid={`section-panel-${sectionId}`}>
      <div className="flex gap-1 border-b border-stone-200">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} data-testid={`section-panel-tab-${t.id}`}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-stone-500 hover:text-stone-800'}`}>
            {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-stone-100 px-1.5 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>
      {tab === 'questions' && <QuestionsTab items={data.questions} />}
      {tab === 'assignment' && <AssignmentTab a={data.assignment} saveParams={{ reporting_period: reportingPeriod }}
        saveUrl={`${API}/api/tracking/${domain}/frameworks/${frameworkId}/sections/${encodeURIComponent(sectionId)}/notifications`} />}
      {tab === 'activity' && <ActivityTab items={data.activity} />}
    </div>
  );
}
