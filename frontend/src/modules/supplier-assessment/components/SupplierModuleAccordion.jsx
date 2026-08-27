import React from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';

const panelClassName = 'overflow-hidden rounded-2xl border border-slate-200 bg-white transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-slate-300';

const PanelHeader = ({ title, description, progress, status, Icon, iconClassName, testId, action, collapsible = false, showProgress = true }) => (
  <div className="flex min-w-0 items-start gap-4 px-5 py-5 text-left sm:px-6">
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
    {action && <span className="shrink-0" data-testid={`${testId}-action`}>{action}</span>}
    {showProgress && <span className="shrink-0 text-right" data-testid={`${testId}-progress`}>
      <span className="block text-lg font-semibold text-slate-900">{Math.round(progress || 0)}%</span>
      <span className="block text-[11px] font-medium uppercase text-slate-400">Filled</span>
    </span>}
    {collapsible && <ChevronDown className="mt-2 h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 [[data-state=open]_&]:rotate-180" aria-hidden="true" />}
  </div>
);

export const SupplierModulePanel = ({
  title,
  description,
  progress,
  status,
  icon: Icon,
  iconClassName,
  children,
  testId,
  action,
  collapsible = false,
  showProgress = true,
  shadowClassName = 'shadow-[0_8px_28px_rgba(15,23,42,0.07)] hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]',
}) => {
  const headerProps = { title, description, progress, status, Icon, iconClassName, testId, action, collapsible, showProgress };
  const className = `${panelClassName} ${shadowClassName}`;

  if (collapsible) {
    return <Collapsible className={className} data-testid={testId}>
      <CollapsibleTrigger asChild data-testid={`${testId}-trigger`}>
        <button type="button" className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-inset">
          <PanelHeader {...headerProps} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-slate-100 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up" data-testid={`${testId}-content`}>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </CollapsibleContent>
    </Collapsible>;
  }

  return <section className={className} data-testid={testId}>
    <PanelHeader {...headerProps} />
    {children && <div className="border-t border-slate-100 px-5 py-5 sm:px-6" data-testid={`${testId}-content`}>{children}</div>}
  </section>;
};