import React from 'react';

export const SupplierPageHeader = ({ title, description, leading, aside, testId }) => (
  <header className="flex flex-wrap items-end justify-between gap-4 pb-2" data-testid={`${testId}-header`}>
    <div className="min-w-0">
      {leading && <div className="mb-3">{leading}</div>}
      <h1 className="text-3xl font-semibold text-stone-900" data-testid={`${testId}-heading`}>{title}</h1>
      {description && <p className="mt-2 text-sm text-stone-600" data-testid={`${testId}-description`}>{description}</p>}
    </div>
    {aside && <div className="flex flex-wrap items-center justify-end gap-2" data-testid={`${testId}-status`}>{aside}</div>}
  </header>
);