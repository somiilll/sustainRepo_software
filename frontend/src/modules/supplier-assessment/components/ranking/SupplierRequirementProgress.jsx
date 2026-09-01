import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

const progressSummary = (statuses, type) => {
  const completeStatus = type === 'documents' ? 'submitted' : 'completed';
  const complete = statuses.filter((item) => item.status === completeStatus).length;
  const overdue = statuses.filter((item) => item.status === 'overdue').length;
  const total = statuses.length;
  return { total, complete, overdue, percent: total ? Math.round((complete / total) * 100) : 0 };
};

export const SupplierRequirementProgress = ({ rows, type }) => {
  const statusKey = type === 'documents' ? 'document_statuses' : 'training_statuses';
  const title = type === 'documents' ? 'Document completion by supplier' : 'Training completion by supplier';
  const hasAssignments = rows.some((row) => (row[statusKey] || []).length);
  if (!hasAssignments) return null;
  return <Card className="overflow-hidden rounded-lg border-stone-100 bg-white shadow-[0_6px_18px_rgba(28,25,23,0.05)]" data-testid={`supplier-${type}-progress-card`}><CardHeader className="flex-row items-start justify-between border-b-0 pb-2"><div><CardTitle className="text-base text-stone-900">{title}</CardTitle><p className="mt-0.5 text-xs text-stone-500">Completion across assigned requirements.</p></div><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-100 bg-white text-stone-600 shadow-sm" data-testid={`supplier-${type}-progress-more-indicator`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></span></CardHeader><CardContent className="p-0">{rows.map((row) => { const summary = progressSummary(row[statusKey] || [], type); const tone = summary.percent === 100 ? 'bg-emerald-500' : type === 'documents' ? 'bg-violet-600' : 'bg-sky-600'; const label = type === 'documents' ? 'submitted' : 'completed'; return <div key={row.supplier_id} className="grid grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.45fr)_2.5rem] items-center gap-3 px-5 py-2" data-testid={`supplier-${type}-progress-${row.supplier_id}`}><span className="truncate text-sm font-semibold text-stone-800">{row.company_name}</span><div className="grid min-w-0 grid-cols-[minmax(4.8rem,auto)_minmax(3rem,1fr)] items-center gap-3"><p className={`truncate text-xs ${summary.overdue ? 'text-rose-600' : 'text-stone-400'}`} data-testid={`supplier-${type}-progress-detail-${row.supplier_id}`}>{summary.complete} / {summary.total} {label}{summary.overdue ? ` · ${summary.overdue} overdue` : ''}</p><div className="h-2 overflow-hidden rounded-full bg-stone-100" data-testid={`supplier-${type}-progress-bar-${row.supplier_id}`}><div className={`h-full rounded-full transition-[width] duration-300 ${tone}`} style={{ width: `${summary.percent}%` }} /></div></div><span className="text-right text-sm font-semibold text-stone-700" data-testid={`supplier-${type}-progress-percent-${row.supplier_id}`}>{summary.percent}%</span></div>; })}</CardContent></Card>;
};