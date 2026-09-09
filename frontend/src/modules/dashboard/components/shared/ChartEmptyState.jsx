import React from 'react';
import { ChartNoAxesColumnIncreasing } from 'lucide-react';

export default function ChartEmptyState({ title, description, testId }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center" data-testid={testId}>
      <ChartNoAxesColumnIncreasing className="mb-3 h-6 w-6 text-stone-400" aria-hidden="true" />
      <p className="text-sm font-semibold text-stone-700" data-testid={`${testId}-title`}>{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-stone-500" data-testid={`${testId}-description`}>{description}</p>
    </div>
  );
}