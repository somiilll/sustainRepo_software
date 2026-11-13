/**
 * GRI tracker: summary header + topic-grouped ledger of disclosures.
 */
import React, { useMemo, useState } from 'react';
import { Bell, ChevronDown, ChevronRight, UserPlus, ArrowRight, UserRound } from 'lucide-react';

const STATUS = {
  done: { label: 'Completed', dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  progress: { label: 'In progress', dot: 'bg-amber-500', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  overdue: { label: 'Overdue', dot: 'bg-red-500', cls: 'bg-red-50 text-red-700 border-red-200' },
  idle: { label: 'Not started', dot: 'bg-stone-400', cls: 'bg-stone-50 text-stone-600 border-stone-200' },
};

const sectionStatus = (s) => {
  if (s.total_disclosures > 0 && s.completed_disclosures >= s.total_disclosures) return STATUS.done;
  if (s.overdue_count > 0) return STATUS.overdue;
  if (s.completed_disclosures > 0) return STATUS.progress;
  return STATUS.idle;
};

const Ring = ({ pct }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0" data-testid="gri-completion-ring">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" className="stroke-stone-200" />
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-emerald-600 transition-[stroke-dashoffset] duration-700"
                strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(pct, 100) / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-stone-900">{pct}%</span>
        <span className="text-[10px] uppercase tracking-wider text-stone-500">complete</span>
      </div>
    </div>
  );
};

const Stat = ({ label, value, tone, testId, action }) => (
  <div className={`rounded-xl border px-4 py-3 ${tone}`} data-testid={testId}>
    <div className="text-[11px] font-medium uppercase tracking-wider opacity-70">{label}</div>
    <div className="mt-1 flex items-baseline justify-between gap-2">
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {action}
    </div>
  </div>
);

export function GRIHeader({ framework, sectionCount, filterByMateriality, onToggleMateriality, title = 'GRI Standards', showMateriality = true }) {
  const total = framework.total_disclosures || 0;
  const done = framework.completed_disclosures || 0;
  const pending = framework.pending_disclosures || 0;
  const owned = framework.assigned_disclosures || 0;
  const unassigned = Math.max(total - owned, 0);
  const pct = Math.round(framework.completion_percentage || 0);
  return (
    <div className="mb-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" data-testid="gri-tracker-header">
      <div className="flex flex-wrap items-center gap-6">
        <Ring pct={pct} />
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-stone-900">{title}</h2>
            {showMateriality && (
            <button type="button" onClick={onToggleMateriality} data-testid="gri-materiality-toggle"
                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100">
              <span className={`h-2 w-2 rounded-full ${filterByMateriality ? 'bg-emerald-500' : 'bg-stone-400'}`} />
              {filterByMateriality ? 'Material topics only' : 'All topics'}
            </button>
            )}
          </div>
          <p className="mt-1 text-sm text-stone-500" data-testid="gri-header-summary">
            {done} of {total} questions done across {sectionCount} sections
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 md:w-auto md:grid-cols-4">
          <Stat label="Total" value={total} tone="border-stone-200 bg-white text-stone-900" testId="gri-stat-total" />
          <Stat label="Done" value={done} tone="border-emerald-200 bg-emerald-50 text-emerald-800" testId="gri-stat-done" />
          <Stat label="Pending" value={pending} tone="border-amber-200 bg-amber-50 text-amber-800" testId="gri-stat-pending" />
          <Stat label="Unassigned" value={unassigned} tone="border-red-200 bg-red-50 text-red-800" testId="gri-stat-unassigned" />
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" />Done · {done}</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-stone-300" />Pending · {pending}</span>
        </span>
        <span data-testid="gri-owner-note">Only {owned} of {total} questions have an owner</span>
      </div>
    </div>
  );
}

const Segments = ({ total, done }) => {
  const count = Math.min(total, 12);
  const filled = total > 0 ? Math.round((done / total) * count) : 0;
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className={`h-1.5 w-4 rounded-sm ${i < filled ? 'bg-emerald-600' : 'bg-stone-200'}`} />
      ))}
    </div>
  );
};

const Owner = ({ users }) => {
  if (!users?.length) {
    return (
      <span className="flex items-center gap-2 text-sm text-stone-400">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-stone-300"><UserRound className="h-3.5 w-3.5" /></span>
        Unassigned
      </span>
    );
  }
  const first = users[0];
  return (
    <span className="flex items-center gap-2 text-sm text-stone-700">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">
        {(first.name || first.full_name || '?').charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{first.name || first.full_name}{users.length > 1 ? ` +${users.length - 1}` : ''}</span>
    </span>
  );
};

export function GRILedger({ sections, renderPanel, onAssign, onRemind, remindingSection, onOpenSection }) {
  const [expanded, setExpanded] = useState({});
  const groups = useMemo(() => {
    const map = new Map();
    sections.forEach((s) => {
      const key = s.topic_id || s.section_id.split('-')[0];
      if (!map.has(key)) map.set(key, { id: key, name: s.topic_name || `GRI ${key}`, sections: [] });
      map.get(key).sections.push(s);
    });
    return [...map.values()].sort((a, b) => (Number.isNaN(Number(a.id)) || Number.isNaN(Number(b.id)) ? String(a.id).localeCompare(String(b.id)) : Number(a.id) - Number(b.id)));
  }, [sections]);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm" data-testid="gri-ledger">
      <div className="hidden grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_140px_150px] gap-8 border-b border-stone-200 bg-stone-50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500 md:grid">
        <span>Section</span><span>Progress</span><span>Owner</span><span>Status</span><span className="text-right">Actions</span>
      </div>
      {groups.map((group) => (
        <div key={group.id} data-testid={`gri-topic-group-${group.id}`}>
          <div className="flex items-center gap-3 border-b border-stone-200 bg-stone-100/70 px-5 py-2.5">
            <span className="rounded-md bg-stone-900 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">{group.id}</span>
            <span className="text-sm font-semibold text-stone-900">{group.name}</span>
          </div>
          {group.sections.map((s) => {
            const open = !!expanded[s.section_id];
            const status = sectionStatus(s);
            const pct = Math.round(s.completion_percentage || 0);
            return (
              <div key={s.section_id} className="border-b border-stone-100 last:border-b-0" data-testid={`gri-row-${s.section_id}`}>
                <div className="grid cursor-pointer grid-cols-1 items-center gap-3 px-5 py-3.5 transition-colors hover:bg-stone-50 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_140px_150px] md:gap-8"
                     onClick={() => setExpanded((e) => ({ ...e, [s.section_id]: !e[s.section_id] }))}>
                  <div className="flex min-w-0 items-center gap-3">
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />}
                    <span className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-sky-700">{s.display_id || s.section_id}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900">{s.title || s.section_name}</div>
                      <div className="text-xs text-stone-500">{s.total_disclosures} question{s.total_disclosures !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-baseline gap-2 text-xs text-stone-600">
                      <span><span className="font-semibold text-stone-900">{s.completed_disclosures}</span> of {s.total_disclosures} done</span>
                      <span className="tabular-nums text-stone-400">{pct}%</span>
                    </div>
                    <Segments total={s.total_disclosures} done={s.completed_disclosures} />
                  </div>
                  <Owner users={s.assigned_users} />
                  <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${status.cls}`} data-testid={`gri-status-${s.section_id}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />{status.label}
                  </span>
                  <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    {s.total_disclosures - s.unassigned_count > 0 && (
                      <button type="button" title="Send reminder" aria-label="Send reminder" onClick={() => onRemind(s)} disabled={remindingSection === s.section_id}
                              className="rounded-lg border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-stone-100 disabled:opacity-50" data-testid={`section-remind-${s.section_id}`}>
                        <Bell className="h-4 w-4" />
                      </button>
                    )}
                    {s.unassigned_count > 0 && (
                      <button type="button" onClick={() => onAssign(s)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-stone-700" data-testid={`section-assign-${s.section_id}`}>
                        <UserPlus className="h-3.5 w-3.5" />Assign
                      </button>
                    )}
                    <button type="button" title="Open questions" aria-label="Open questions" onClick={() => onOpenSection(s)}
                            className="rounded-lg border border-stone-200 p-1.5 text-stone-600 transition-colors hover:bg-stone-100" data-testid={`gri-open-${s.section_id}`}>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {open && <div className="border-t border-stone-100 bg-stone-50/60 px-5 pb-4">{renderPanel(s)}</div>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
