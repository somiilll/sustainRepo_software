import React from 'react';
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
  const theme = type === 'documents' ? 'border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white shadow-[0_8px_22px_rgba(124,58,237,0.08)]' : 'border-emerald-100 bg-gradient-to-br from-white via-emerald-50/60 to-white shadow-[0_8px_22px_rgba(5,150,105,0.08)]';
  if (!hasAssignments) return null;
  return <Card className={`overflow-hidden rounded-lg ${theme}`} data-testid={`supplier-${type}-progress-card`}><CardHeader className="border-b border-white/80 pb-4"><CardTitle className="text-base text-stone-900">{title}</CardTitle><p className="mt-1 text-xs text-stone-500">Completion across assigned requirements.</p></CardHeader><CardContent className="divide-y divide-stone-100/80 p-0">{rows.map((row) => { const summary = progressSummary(row[statusKey] || [], type); const tone = summary.percent === 100 ? 'bg-emerald-600' : summary.overdue ? 'bg-rose-500' : type === 'documents' ? 'bg-violet-600' : 'bg-sky-600'; const label = type === 'documents' ? 'submitted' : 'completed'; return <div key={row.supplier_id} className="grid grid-cols-[minmax(8rem,1fr)_minmax(8rem,1.4fr)_auto] items-center gap-3 px-5 py-3.5" data-testid={`supplier-${type}-progress-${row.supplier_id}`}><span className="truncate text-sm font-semibold text-stone-800">{row.company_name}</span><div className="min-w-0"><div className="h-2.5 overflow-hidden rounded-full bg-white/80" data-testid={`supplier-${type}-progress-bar-${row.supplier_id}`}><div className={`h-full rounded-full transition-[width] duration-300 ${tone}`} style={{ width: `${summary.percent}%` }} /></div><p className={`mt-1 text-xs ${summary.overdue ? 'text-rose-700' : 'text-stone-500'}`} data-testid={`supplier-${type}-progress-detail-${row.supplier_id}`}>{summary.complete} / {summary.total} {label}{summary.overdue ? ` · ${summary.overdue} overdue` : ''}</p></div><span className="text-sm font-semibold text-stone-900" data-testid={`supplier-${type}-progress-percent-${row.supplier_id}`}>{summary.percent}%</span></div>; })}</CardContent></Card>;
};