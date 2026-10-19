import React from 'react';

export const ModulePageHeader = ({ title, icon: Icon, iconClassName, aside, testId }) => (
  <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5" data-testid={`${testId}-header`}>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-3">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border shadow-sm ${iconClassName}`} data-testid={`${testId}-heading-icon`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-emerald-950" data-testid={`${testId}-heading`}>{title}</h1>
        </div>
      </div>
    </div>
    {aside && <div className="flex flex-wrap items-center justify-end gap-2" data-testid={`${testId}-header-actions`}>{aside}</div>}
  </header>
);