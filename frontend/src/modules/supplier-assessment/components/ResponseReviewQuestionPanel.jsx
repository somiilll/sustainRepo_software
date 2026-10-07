import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { ResponseQuestionDetails } from './ResponseQuestionDetails';
import { ResponseReviewerAssessment } from './ResponseReviewerAssessment';

const displayScore = (value) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
};

export const ResponseReviewQuestionPanel = ({ question, categoryLabel, index, total, score, onDecision, onPrevious, onNext, onOpenEvidence, openingEvidenceKey, saving }) => {
  const review = question.review || {};
  const isAccepted = review.status === 'accepted';
  const isClarification = review.status === 'rejected' && review.needs_resubmission;
  const isRejected = review.status === 'rejected' && !review.needs_resubmission;
  const [decision, setDecision] = useState(isAccepted ? 'accepted' : isClarification ? 'clarification' : isRejected ? 'rejected' : '');
  const [reviewerNote, setReviewerNote] = useState(review.reviewer_note || '');
  const [reviewerScore, setReviewerScore] = useState(String(review.reviewer_score ?? 0));
  const maxPoints = question.max_points ?? question.weight ?? 100;
  const points = isRejected ? review.reviewer_score ?? 0 : score?.points_earned ?? question.manual_score ?? (question.answer === true ? question.point_scores?.yes_score : question.answer === false ? question.point_scores?.no_score : 0);
  const saveDisabled = saving || !decision || ((decision === 'clarification' || decision === 'rejected') && !reviewerNote.trim());

  const saveReview = async (moveNext = false) => {
    const saved = await onDecision(decision, reviewerNote, reviewerScore);
    if (saved && moveNext && index < total - 1) onNext();
  };

  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]" data-testid={`response-review-question-panel-${question.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3 lg:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="font-bold capitalize text-emerald-800" data-testid="response-review-question-pillar">{question.category}</span><ChevronRight className="h-4 w-4 text-slate-400" /><span className="truncate font-medium text-slate-600" data-testid="response-review-question-category">{categoryLabel}</span></div>
      <div className="flex items-center gap-2" data-testid="response-review-question-top-navigation"><Button variant="outline" size="icon" className="h-8 w-8 bg-white" onClick={onPrevious} disabled={index === 0} aria-label="Previous question" data-testid="response-review-top-previous-button"><ChevronLeft className="h-4 w-4" /></Button><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white" data-testid="response-review-question-position">Question {index + 1} of {total}</span><Button variant="outline" size="icon" className="h-8 w-8 bg-white" onClick={onNext} disabled={index === total - 1} aria-label="Next question" data-testid="response-review-top-next-button"><ChevronRight className="h-4 w-4" /></Button></div>
    </div>

    <div className="space-y-6 px-5 py-6 lg:px-6">
      <ResponseQuestionDetails question={question} index={index} maxPoints={maxPoints} onOpenEvidence={onOpenEvidence} openingEvidenceKey={openingEvidenceKey} />
      {review.reviewer_note && <div className={`rounded-md border p-4 text-sm ${isClarification ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-rose-200 bg-rose-50 text-rose-950'}`} data-testid={`response-review-reviewer-feedback-${question.id}`}><span className="font-bold">{isClarification ? 'Clarification requested: ' : 'Reviewer rationale: '}</span>{review.reviewer_note}</div>}
      {question.clarification_reply?.message && <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" data-testid={`response-review-supplier-clarification-reply-${question.id}`}><span className="font-bold">Supplier clarification reply: </span>{question.clarification_reply.message}</div>}
      <ResponseReviewerAssessment questionId={question.id} decision={decision} onDecisionChange={setDecision} reviewerNote={reviewerNote} onReviewerNoteChange={setReviewerNote} reviewerScore={reviewerScore} onReviewerScoreChange={setReviewerScore} maxPoints={maxPoints} currentPoints={points} review={review} saving={saving} saveDisabled={saveDisabled} canMoveNext={index < total - 1} onSave={() => saveReview(false)} onSaveAndNext={() => saveReview(true)} />
    </div>

    <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 lg:px-6"><Button variant="outline" onClick={onPrevious} disabled={index === 0} data-testid="response-review-previous-button"><ChevronLeft className="mr-1.5 h-4 w-4" />Previous</Button><span className="text-xs font-semibold text-slate-600" data-testid="response-review-footer-position">Question {index + 1} of {total}</span><Button className="bg-slate-900 hover:bg-slate-800" onClick={onNext} disabled={index === total - 1} data-testid="response-review-next-button">Next<ChevronRight className="ml-1.5 h-4 w-4" /></Button></footer>
  </section>;
};

export { displayScore };