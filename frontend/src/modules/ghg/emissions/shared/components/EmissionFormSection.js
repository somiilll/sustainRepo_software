import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../../../components/ui/collapsible';

export const EmissionFormSection = ({
  title,
  description,
  children,
  collapsible = false,
  defaultOpen = true,
  testId,
  className = '',
}) => {
  if (collapsible) {
    return (
      <Collapsible
        defaultOpen={defaultOpen}
        className="border border-stone-200 bg-white"
        data-testid={testId}
      >
        <CollapsibleTrigger
          className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-stone-50"
          data-testid={`${testId}-trigger`}
        >
          <div>
            <h3 className="text-base font-semibold text-stone-900">{title}</h3>
            {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
          </div>
          <ChevronDown className="h-5 w-5 shrink-0 text-stone-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-stone-100 px-5 py-5 data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          {children}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <section className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`} data-testid={testId}>
      {(title || description) && <div className="mb-5">
        {title && <h3 className="text-lg font-semibold text-stone-900">{title}</h3>}
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>}
      {children}
    </section>
  );
};

export default EmissionFormSection;