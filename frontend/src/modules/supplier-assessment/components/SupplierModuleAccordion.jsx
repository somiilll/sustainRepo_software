import React from 'react';

export const SupplierModulePanel = ({
  title,
  description,
  progress,
  status,
  icon: Icon,
  iconClassName,
  children,
  testId,
}) => (
  <section
    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.07)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_14px_34px_rgba(16,185,129,0.11)]"
    data-testid={testId}
  >
    <header className="flex min-w-0 items-start gap-4 px-5 py-5 sm:px-6">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900" data-testid={`${testId}-title`}>{title}</span>
          {status}
        </span>
        {description && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500" data-testid={`${testId}-description`}>{description}</span>}
      </span>
      <span className="shrink-0 text-right" data-testid={`${testId}-progress`}>
        <span className="block text-lg font-semibold text-slate-900">{Math.round(progress || 0)}%</span>
        <span className="block text-[11px] font-medium uppercase text-slate-400">Complete</span>
      </span>
    </header>
    <div className="border-t border-slate-100 px-5 py-5 sm:px-6" data-testid={`${testId}-content`}>
      {children}
    </div>
  </section>
);