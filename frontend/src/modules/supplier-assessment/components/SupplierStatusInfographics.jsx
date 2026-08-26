import React from 'react';
import { AlertTriangle, CheckCircle2, Clock3, FileClock, ListChecks } from 'lucide-react';

const STATUS_ITEMS = [
  { key: 'total', label: 'Total', Icon: ListChecks, className: 'border-slate-200 bg-white text-slate-700' },
  { key: 'completed', label: 'Completed', Icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50/60 text-emerald-700' },
  { key: 'draft', label: 'Draft', Icon: FileClock, className: 'border-blue-200 bg-blue-50/60 text-blue-700' },
  { key: 'pending', label: 'Pending', Icon: Clock3, className: 'border-amber-200 bg-amber-50/60 text-amber-700' },
  { key: 'overdue', label: 'Overdue', Icon: AlertTriangle, className: 'border-rose-200 bg-rose-50/60 text-rose-700' },
];

export const SupplierStatusInfographics = ({ title, counts, testId }) => (
  <section className="space-y-3" data-testid={`${testId}-infographics`}>
    <h2 className="text-lg font-semibold text-stone-900" data-testid={`${testId}-infographics-title`}>{title}</h2>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {STATUS_ITEMS.map(({ key, label, Icon, className }) => (
        <div key={key} className={`min-w-0 rounded-lg border p-4 ${className}`} data-testid={`${testId}-${key}-stat`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{label}</span>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-stone-900" data-testid={`${testId}-${key}-count`}>{counts[key] || 0}</p>
        </div>
      ))}
    </div>
  </section>
);