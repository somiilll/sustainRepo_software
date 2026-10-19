import React from 'react';

export const SupplierPageHeader = ({ title, description, leading, aside, icon: Icon, iconClassName = 'border-emerald-200 bg-emerald-50 text-emerald-800', testId }) => (
  <header className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 pb-5" data-testid={`${testId}-header`}>
    <div className="min-w-0 flex-1">
      {leading && <div className="mb-3">{leading}</div>}
      <div className="flex items-start gap-3">
        {Icon && <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border shadow-sm ${iconClassName}`} data-testid={`${testId}-heading-icon`}><Icon className="h-6 w-6" aria-hidden="true" /></div>}
        <div className="min-w-0 pt-0.5">
          <h1 className="text-3xl font-bold text-emerald-950" data-testid={`${testId}-heading`}>{title}</h1>
          {description && <p className="mt-2 text-sm text-stone-600" data-testid={`${testId}-description`}>{description}</p>}
        </div>
      </div>
    </div>
    {aside && <div className="flex flex-wrap items-center justify-end gap-2" data-testid={`${testId}-status`}>{aside}</div>}
  </header>
);