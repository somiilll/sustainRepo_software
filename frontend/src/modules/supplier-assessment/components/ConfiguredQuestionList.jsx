import React from 'react';
import { FileText, LockKeyhole } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { questionDraftMaxPoints } from '../questionDraftModel';

const evidenceLabel = (draft) => {
  if (!draft.evidence_mandatory) return 'Evidence not mandatory';
  if (draft.evidence_affects_score) return `${draft.missing_evidence_percent}% without evidence`;
  return 'Evidence mandatory';
};

export const ConfiguredQuestionList = ({ items, scoringLocked }) => (
  <section className="mt-7" data-testid="question-ledger-configured-questions">
    <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-stone-800">Configured questions</h3><span className="text-xs text-stone-500" data-testid="configured-question-count">{items.length} question{items.length === 1 ? '' : 's'}</span></div>
    {items.length === 0 ? <div className="border border-dashed border-stone-300 py-12 text-center text-stone-400" data-testid="question-ledger-existing-empty"><FileText className="mx-auto mb-2 h-8 w-8 text-stone-300" /><p className="text-sm">No questions in this group yet.</p></div> : <div className="divide-y divide-stone-100 border-y border-stone-200 bg-white">{items.map((item) => {
      return <div key={item.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between" data-testid={`configured-question-${item.key}`}>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="min-w-0 break-words text-sm font-medium leading-6 text-stone-950" data-testid={`configured-question-text-${item.key}`}>{item.draft.question_text}</p>{item.kind !== 'saved' && <Badge className="border-0 bg-amber-100 text-amber-800 hover:bg-amber-100" data-testid={`configured-question-change-status-${item.key}`}>{item.kind === 'new' ? 'Draft, not saved' : 'Changed, not saved'}</Badge>}</div>{item.draft.description && <p className="mt-1 break-words text-xs leading-5 text-stone-500" data-testid={`configured-question-description-${item.key}`}>{item.draft.description}</p>}<div className="mt-2 flex flex-wrap gap-2 text-xs"><Badge variant="outline" data-testid={`configured-question-type-${item.key}`}>{item.draft.response_type === 'yes_no' ? 'Yes / No' : item.draft.response_type === 'dropdown' ? 'Multiple choice' : item.draft.response_type}</Badge>{item.draft.required && <Badge variant="outline" data-testid={`configured-question-required-${item.key}`}>Required</Badge>}<Badge variant="outline" data-testid={`configured-question-points-${item.key}`}>{questionDraftMaxPoints(item.draft)} points</Badge><Badge variant="outline" data-testid={`configured-question-evidence-${item.key}`}>{evidenceLabel(item.draft)}</Badge>{scoringLocked && item.kind !== 'new' && <Badge variant="outline" className="gap-1 text-amber-800" data-testid={`configured-question-scoring-lock-${item.key}`}><LockKeyhole className="h-3 w-3" />Scoring locked</Badge>}</div></div>
      </div>;
    })}</div>}
  </section>
);