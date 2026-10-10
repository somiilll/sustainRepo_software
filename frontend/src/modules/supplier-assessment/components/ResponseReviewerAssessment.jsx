import React from 'react';
import { CheckCircle2, RotateCcw, Star, XCircle } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';

const displayScore = (value) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
};

const inputScore = (value) => Number.isFinite(Number(value)) ? displayScore(value) : '';

const CHOICES = [
  { id: 'accepted', label: 'Accept', Icon: CheckCircle2, active: 'border-emerald-500 bg-emerald-50 text-emerald-900 shadow-[0_0_0_2px_rgba(16,185,129,0.12)]', dot: 'bg-emerald-500' },
  { id: 'clarification', label: 'Needs Clarification', Icon: RotateCcw, active: 'border-amber-500 bg-amber-50 text-amber-950 shadow-[0_0_0_2px_rgba(245,158,11,0.12)]', dot: 'bg-amber-500' },
  { id: 'rejected', label: 'Reject', Icon: XCircle, active: 'border-rose-500 bg-rose-50 text-rose-900 shadow-[0_0_0_2px_rgba(244,63,94,0.12)]', dot: 'bg-rose-500' },
];

const StatusChoice = ({ choice, selected, onSelect, questionId }) => {
  const { id, label, Icon, active, dot } = choice;
  return <button type="button" role="radio" aria-checked={selected} onClick={() => onSelect(id)} className={`flex min-h-12 items-center gap-3 rounded-md border px-4 py-3 text-left text-sm font-bold transition-[background-color,border-color,color,box-shadow,transform] hover:-translate-y-0.5 ${selected ? active : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`} data-testid={`response-review-status-${id}-${questionId}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${selected ? `${dot} text-white` : 'bg-slate-100 text-slate-500'}`}><Icon className="h-3.5 w-3.5" /></span>{label}</button>;
};

export const ResponseReviewerAssessment = ({ questionId, decision, onDecisionChange, reviewerNote, onReviewerNoteChange, reviewerScore, onReviewerScoreChange, maxPoints, currentPoints, review, reviewDraft, hasCurrentClarificationReply }) => {
  const isAccepted = review.status === 'accepted';
  const isClarification = review.status === 'rejected' && review.needs_resubmission;
  const isRejected = review.status === 'rejected' && !review.needs_resubmission;
  return <section className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70" data-testid={`response-review-inline-decision-${questionId}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4"><h3 className="text-sm font-bold text-slate-950">Reviewer Assessment</h3><div className="flex flex-wrap gap-2" data-testid={`response-review-decision-status-${questionId}`}>{reviewDraft?.drafted_at && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Review Draft</Badge>}{isAccepted && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Accepted</Badge>}{isClarification && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">{hasCurrentClarificationReply ? 'Review response by supplier' : 'Clarification requested'}</Badge>}{isRejected && <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Rejected</Badge>}{!review.status && !reviewDraft?.drafted_at && <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">Pending review</Badge>}</div></div>
    <div className="space-y-5 p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_11rem]"><div><p className="text-xs font-bold text-slate-600">Decision</p><div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Review status" data-testid={`response-review-status-options-${questionId}`}>{CHOICES.map((choice) => <StatusChoice key={choice.id} choice={choice} selected={decision === choice.id} onSelect={onDecisionChange} questionId={questionId} />)}</div></div><div><Label htmlFor={`response-review-score-input-${questionId}`} className="flex items-center gap-1.5 text-xs font-bold text-slate-600"><Star className="h-3.5 w-3.5 text-amber-500" />Reviewer Score</Label><div className="mt-2 flex items-center gap-2"><Input id={`response-review-score-input-${questionId}`} type="number" min="0" max={maxPoints} step="0.1" value={decision === 'rejected' ? reviewerScore : inputScore(currentPoints)} onChange={(event) => onReviewerScoreChange(event.target.value)} disabled={decision !== 'rejected'} className="h-12 bg-white text-base font-bold" data-testid={`response-review-score-input-${questionId}`} /><span className="whitespace-nowrap text-sm font-semibold text-slate-600">/ {displayScore(maxPoints)}</span></div>{decision === 'rejected' && <p className="mt-1 text-xs text-slate-500">Defaults to 0</p>}</div></div>

      {(decision === 'clarification' || decision === 'rejected') && <div><div className="flex items-center justify-between gap-3"><Label htmlFor={`response-review-note-${questionId}`} className="text-sm font-bold text-slate-800">{decision === 'clarification' ? 'Reviewer Comment' : 'Rejection Rationale'} <span className="text-rose-600">*</span></Label><span className="text-xs tabular-nums text-slate-500" data-testid={`response-review-comment-count-${questionId}`}>{reviewerNote.length}/500</span></div><Textarea id={`response-review-note-${questionId}`} value={reviewerNote} maxLength={500} onChange={(event) => onReviewerNoteChange(event.target.value)} className="mt-2 min-h-24 resize-y bg-white" rows={4} placeholder={decision === 'clarification' ? 'Describe what the supplier should clarify, correct, or evidence.' : 'Explain why this response receives the approved score.'} data-testid={decision === 'clarification' ? `response-review-clarification-note-${questionId}` : `response-review-reject-note-${questionId}`} /></div>}
      {decision === 'accepted' && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid={`response-review-accept-summary-${questionId}`}><span className="font-bold">Accept submitted response.</span> The current earned score of {displayScore(currentPoints)} / {displayScore(maxPoints)} will be retained.</div>}
    </div>
  </section>;
};