import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

const STATUS_LABELS = { submitted: 'Submitted', pending: 'Pending', overdue: 'Overdue', not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
const STATUS_TONES = { submitted: 'bg-emerald-50 text-emerald-800', completed: 'bg-emerald-50 text-emerald-800', pending: 'bg-stone-100 text-stone-700', not_started: 'bg-stone-100 text-stone-700', in_progress: 'bg-sky-50 text-sky-800', overdue: 'bg-rose-50 text-rose-800' };

export const SupplierRequirementStatusTable = ({ rows, type }) => {
  const statusKey = type === 'documents' ? 'document_statuses' : 'training_statuses';
  const title = type === 'documents' ? 'Document completion by supplier' : 'Training completion by supplier';
  const requirementLabel = type === 'documents' ? 'document' : 'topic';
  const requirements = useMemo(() => [...new Map(
    rows.flatMap((row) => (row[statusKey] || []).map((item) => [item.requirement_id, item])),
  ).values()], [rows, statusKey]);
  if (!requirements.length) return null;
  const columns = `minmax(11rem,1.5fr) repeat(${requirements.length}, minmax(9rem,1fr))`;

  return <Card className="rounded-lg border-stone-200 bg-white shadow-none" data-testid={`supplier-${type}-status-card`}>
    <CardHeader className="border-b border-stone-100 pb-4">
      <CardTitle className="text-base text-stone-900">{title}</CardTitle>
      <p className="mt-1 text-xs text-stone-500">Current status for each assigned {requirementLabel}.</p>
    </CardHeader>
    <CardContent className="p-0"><div className="overflow-x-auto"><div className="min-w-[720px] divide-y divide-stone-100">
      <div className="grid gap-3 bg-stone-50 px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500" style={{ gridTemplateColumns: columns }}>
        <span>Supplier</span>
        {requirements.map((item) => <span key={item.requirement_id} data-testid={`supplier-${type}-status-heading-${item.requirement_id}`}>{item.title}</span>)}
      </div>
      {rows.map((row) => {
        const statuses = new Map((row[statusKey] || []).map((item) => [item.requirement_id, item.status]));
        return <div key={row.supplier_id} className="grid items-center gap-3 px-5 py-3.5 text-center" style={{ gridTemplateColumns: columns }} data-testid={`supplier-${type}-status-row-${row.supplier_id}`}>
          <span className="truncate text-sm font-semibold text-stone-800">{row.company_name}</span>
          {requirements.map((item) => {
            const status = statuses.get(item.requirement_id);
            return <span key={item.requirement_id} className={`justify-self-center rounded-full px-2.5 py-1 text-xs font-medium ${status ? STATUS_TONES[status] : 'text-stone-400'}`} data-testid={`supplier-${type}-status-${row.supplier_id}-${item.requirement_id}`}>{status ? STATUS_LABELS[status] : '—'}</span>;
          })}
        </div>;
      })}
    </div></div></CardContent>
  </Card>;
};