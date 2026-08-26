import React from 'react';
import { Progress } from '../../../components/ui/progress';

export const SupplierProgressStrip = ({ items }) => {
  const overall = items.length
    ? Math.round(items.reduce((total, item) => total + Number(item.progress || 0), 0) / items.length)
    : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_28px_rgba(15,23,42,0.07)] sm:p-6" data-testid="supplier-overall-progress">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">Overall Progress</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Your assessment at a glance</h2>
        </div>
        <span className="text-2xl font-semibold text-slate-900" data-testid="supplier-overall-progress-percentage">{overall}%</span>
      </div>
      <Progress value={overall} className="mt-4 h-2" data-testid="supplier-overall-progress-bar" />
      <div className="mt-5 overflow-x-auto pb-1">
        <div
          className="grid min-w-max gap-5 md:min-w-0"
          style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(165px, 1fr))` }}
          data-testid="supplier-module-progress-row"
        >
          {items.map(({ id, label, progress, Icon, iconClassName, shadowClassName }) => (
            <div className={`flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 ${shadowClassName || 'shadow-[0_3px_12px_rgba(15,23,42,0.04)]'}`} key={id} data-testid={`supplier-progress-${id}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{label}</span>
              <span className="shrink-0 text-base font-semibold text-slate-900" data-testid={`supplier-progress-${id}-percentage`}>{Math.round(progress || 0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};