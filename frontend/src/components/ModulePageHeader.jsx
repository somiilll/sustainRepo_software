import React from 'react';

export const ModulePageHeader = ({ title, icon: Icon, iconClassName, aside, testId }) => (
  <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5" data-testid={`${testId}-header`}>
    <div className="flex min-w-0 items-start gap-3">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border shadow-sm ${iconClassName}`} data-testid={`${testId}-heading-icon`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="min-w-0 pt-0.5 text-3xl font-bold text-emerald-950" data-testid={`${testId}-heading`}>{title}</h1>
    </div>
    {aside && <div className="flex flex-wrap items-center justify-end gap-2" data-testid={`${testId}-header-actions`}>{aside}</div>}
  </header>
);