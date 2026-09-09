import React from 'react';
import { AlertCircle, CheckCircle2, DatabaseZap, SlidersHorizontal } from 'lucide-react';

const STATE_CONTENT = {
  'confirmed-zero': {
    icon: CheckCircle2,
    iconClass: 'text-emerald-700',
    panelClass: 'border-emerald-200 bg-emerald-50/70',
    title: 'Confirmed zero emissions',
  },
  'no-data': {
    icon: DatabaseZap,
    iconClass: 'text-stone-600',
    panelClass: 'border-stone-200 bg-stone-50',
    title: 'No emissions data reported',
  },
  'filtered-empty': {
    icon: SlidersHorizontal,
    iconClass: 'text-amber-700',
    panelClass: 'border-amber-200 bg-amber-50/70',
    title: 'No data matches these filters',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-rose-700',
    panelClass: 'border-rose-200 bg-rose-50/70',
    title: 'Dashboard data could not be loaded',
  },
};

export default function DashboardDataState({ state, recordCount = 0, windowLabel, onReset, onRetry }) {
  if (!state || state === 'data' || state === 'loading') return null;
  const content = STATE_CONTENT[state];
  const Icon = content.icon;
  const message = {
    'confirmed-zero': `${recordCount} submitted ${recordCount === 1 ? 'record is' : 'records are'} included in ${windowLabel}; their combined emissions are 0 tCO₂e.`,
    'no-data': `No submitted emissions records are available for ${windowLabel}.`,
    'filtered-empty': `Submitted emissions exist, but none fall within ${windowLabel} and the selected facility filters.`,
    error: 'Your saved data has not been changed. Retry to load the latest dashboard results.',
  }[state];

  return (
    <div className={`flex flex-col gap-3 border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${content.panelClass}`} data-testid={`dashboard-data-state-${state}`} role={state === 'error' ? 'alert' : 'status'}>
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${content.iconClass}`} aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-stone-900" data-testid="dashboard-data-state-title">{content.title}</p>
          <p className="mt-0.5 text-xs leading-5 text-stone-600" data-testid="dashboard-data-state-description">{message}</p>
        </div>
      </div>
      {state === 'filtered-empty' && onReset && (
        <button type="button" onClick={onReset} className="shrink-0 text-xs font-semibold text-amber-900 underline underline-offset-4 transition-colors hover:text-amber-700" data-testid="dashboard-data-state-reset-button">
          Reset filters
        </button>
      )}
      {state === 'error' && onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 text-xs font-semibold text-rose-900 underline underline-offset-4 transition-colors hover:text-rose-700" data-testid="dashboard-data-state-retry-button">
          Retry loading
        </button>
      )}
    </div>
  );
}