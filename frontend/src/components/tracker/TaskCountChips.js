import React from 'react';
import { CheckCircle2, Clock, Circle } from 'lucide-react';

/** Small status count chips shown under a tracker row's progress bar. */
export default function TaskCountChips({ completed = 0, awaiting = 0, pending = 0, testId }) {
  const chip = 'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium';
  return (
    <div className="mt-1 flex flex-wrap gap-1" data-testid={testId}>
      <span className={`${chip} border-emerald-200 bg-emerald-50 text-emerald-700`} title="Completed"><CheckCircle2 className="h-3 w-3" />{completed}</span>
      <span className={`${chip} border-blue-200 bg-blue-50 text-blue-700`} title="Awaiting approval"><Clock className="h-3 w-3" />{awaiting}</span>
      <span className={`${chip} border-stone-200 bg-stone-100 text-stone-600`} title="Pending"><Circle className="h-3 w-3" />{Math.max(pending - awaiting, 0)}</span>
    </div>
  );
}
