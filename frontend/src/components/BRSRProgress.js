import React from 'react';
import { BarChart3, Building2, ClipboardList } from 'lucide-react';

const SECTION_META = [
  { key: 'section_a', label: 'Section A', subtitle: 'General disclosures', icon: Building2, testId: 'brsr-section-a-tab' },
  { key: 'section_b', label: 'Section B', subtitle: 'Management and process disclosures', icon: ClipboardList, testId: 'brsr-section-b-tab' },
  { key: 'section_c', label: 'Section C', subtitle: 'Principle-wise performance disclosures', icon: BarChart3, testId: 'brsr-section-c-tab' },
];

const STATUS_META = [
  { key: 'pending', label: 'Pending', color: '#c4c8cc' },
  { key: 'draft', label: 'Draft', color: '#c98a1a' },
  { key: 'in_progress', label: 'In progress', color: '#d9b44a' },
  { key: 'saved', label: 'Saved', color: '#3b6aa0' },
  { key: 'approved', label: 'Approved', color: '#1f7a4d' },
  { key: 'rejected', label: 'Rejected', color: '#b03a3a' },
];
const SEGMENT_ORDER = ['approved', 'saved', 'in_progress', 'draft', 'rejected', 'pending'];
const colorOf = (key) => STATUS_META.find((s) => s.key === key).color;

export function BRSRSectionCards({ progress, activeTab, onSelect, sections = SECTION_META, prefix = 'brsr' }) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${sections.length > 3 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`} data-testid={`${prefix}-section-cards`}>
      {sections.map(({ key, label, subtitle, icon: Icon, testId }) => {
        const active = activeTab === key;
        const percent = progress?.sections?.[key]?.percent ?? 0;
        const hasQuestions = (progress?.sections?.[key]?.total ?? 1) > 0;
        return (
          <button key={key} type="button" onClick={() => onSelect(key)} data-testid={testId}
                  className={`text-left rounded-xl border bg-white px-5 py-4 transition-colors duration-200 ${
                    active ? 'border-stone-900 shadow-sm' : 'border-stone-200 hover:border-stone-300 bg-white/70'}`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                active ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-stone-900">{label}</span>
                  {hasQuestions && <span className={`text-sm font-semibold tabular-nums ${active ? 'text-[#1f7a4d]' : 'text-stone-500'}`}
                        data-testid={`${testId}-percent`}>{percent}%</span>}
                </div>
                <p className="text-sm text-stone-500 truncate">{subtitle}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-stone-100 overflow-hidden">
              <div className="h-full rounded-full bg-[#1f7a4d] transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProgressRing({ percent }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="5" />
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#1f7a4d" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-stone-900">{percent}%</span>
    </div>
  );
}

export function BRSRProgressPanel({ progress, activeTab, statusFilter, onFilter, sections = SECTION_META, prefix = 'brsr', trailing = null }) {
  const meta = sections.find((s) => s.key === activeTab);
  const section = progress?.sections?.[activeTab];
  if (!section || !section.total) return null;
  const { counts, total } = section;
  const approvalEnabled = progress.approval_enabled;
  const visibleStatuses = STATUS_META.filter((s) => approvalEnabled || !['approved', 'rejected'].includes(s.key));
  const chips = [{ key: 'all', label: 'All', count: total }, ...visibleStatuses.map((s) => ({ ...s, count: counts[s.key] }))];
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 flex flex-col gap-4 lg:flex-row lg:items-center"
         data-testid={`${prefix}-progress-panel`}>
      <div className="flex items-center gap-4 lg:w-72 shrink-0">
        <ProgressRing percent={section.percent} />
        <div>
          <p className="font-semibold text-stone-900" data-testid={`${prefix}-progress-title`}>{meta.label} progress</p>
          <p className="text-sm text-stone-500" data-testid={`${prefix}-progress-summary`}>
            {section.answered} of {total} answered{approvalEnabled ? ` · ${counts.approved} approved` : ''}
          </p>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-stone-100" data-testid={`${prefix}-progress-bar`}>
          {SEGMENT_ORDER.filter((key) => approvalEnabled || !['approved', 'rejected'].includes(key)).map((key) => (
            <div key={key} style={{ width: `${total ? (counts[key] / total) * 100 : 0}%`, backgroundColor: colorOf(key) }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.map(({ key, label, count, color }) => {
            const active = statusFilter === key;
            return (
              <button key={key} type="button" onClick={() => onFilter(key)} data-testid={`${prefix}-filter-${key}`}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                        active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'}`}>
                {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
                {label}
                <span className={`rounded-full px-2 text-xs tabular-nums ${active ? 'bg-white/20' : 'bg-stone-100'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      {trailing && <div className="shrink-0 lg:self-start">{trailing}</div>}
    </div>
  );
}

export function BRSRPageNav({ progress, activeTab, prefix = 'brsr' }) {
  const groups = progress?.sections?.[activeTab]?.groups || [];
  if (groups.length < 1) return null;
  const goTo = (id) => document.getElementById(`brsr-group-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <aside className="hidden lg:block" data-testid={`${prefix}-page-nav`}>
      <div className="sticky top-24 rounded-xl border border-stone-200 bg-white p-4 max-h-[calc(100vh-7rem)] overflow-y-auto">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-stone-500">On this page</p>
        <ul className="space-y-1">
          {groups.map((g, index) => {
            const percent = g.total ? Math.round((g.answered / g.total) * 100) : 0;
            return (
              <li key={g.id}>
                <button type="button" onClick={() => goTo(g.id)} data-testid={`${prefix}-nav-${g.id}`}
                        className="w-full rounded-lg px-2 py-2 text-left transition-colors duration-200 hover:bg-stone-50">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-stone-100 px-1 text-xs font-semibold text-stone-700">
                      {g.numeral || (activeTab === 'section_c' ? g.id : index + 1)}
                    </span>
                    <span className="flex-1 text-sm text-stone-800 leading-snug">{g.label}</span>
                    <span className="text-xs tabular-nums text-stone-500">{g.answered}/{g.total}</span>
                  </div>
                  <div className="mt-1.5 ml-8 h-1 rounded-full bg-stone-100 overflow-hidden">
                    <div className="h-full rounded-full bg-[#1f7a4d] transition-[width] duration-500" style={{ width: `${percent}%` }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
