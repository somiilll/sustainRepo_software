import React from 'react';
import { Info } from 'lucide-react';

export const QuestionImportanceGuide = ({ testId }) => (
  <div className="mt-2 flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900" data-testid={testId}>
    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden="true" />
    <span><strong>Score share: </strong>Question score share is based on importance within each ESG section: <strong>Low = 1, Medium = 2, High = 3 </strong>. The share adjusts based on the total number and importance of questions in that section.</span>
  </div>
);