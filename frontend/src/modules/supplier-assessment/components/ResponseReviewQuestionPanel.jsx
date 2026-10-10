import React, { useState } from 'react';
import { BookmarkCheck, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { ResponseQuestionDetails } from './ResponseQuestionDetails';
import { ResponseReviewerAssessment } from './ResponseReviewerAssessment';

const displayScore = (value) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
};

export const ResponseReviewQuestionPanel = ({ question, categoryLabel, index, total, score, onDecision, onMarkForReview, onOpenHistory, onPrevious, onNext, onOpenEvidence, openingEvidenceKey, saving, marking }) => {
  const review = question.review || {};
  const reviewDraft = question.review_draft || {};
  const editableReview = reviewDraft.drafted_at ? reviewDraft : review;
  const isAccepted = editableReview.status === 'accepted';
  const isClarification = editableReview.status === 'rejected' && editableReview.needs_resubmission;
  const isRejected = editableReview.status === 'rejected' && !editableReview.needs_resubmission;
  const isSavedClarification = isClarification && !reviewDraft.drafted_at;
  const [decision, setDecision] = useState(isSavedClarification ? '' : isAccepted ? 'accepted' : isClarification ? 'clarification' : isRejected ? 'rejected' : '');
  const [reviewerNote, setReviewerNote] = useState(isSavedClarification ? '' : editableReview.reviewer_note || '');
  const [reviewerScore, setReviewerScore] = useState(String(editableReview.reviewer_score ?? 0));
  const maxPoints = question.max_points ?? question.weight ?? 100;
  const points = isRejected ? review.reviewer_score ?? 0 : score?.points_earned ?? question.manual_score ?? (question.answer === true ? question.point_scores?.yes_score : question.answer === false ? question.point_scores?.no_score : 0);
  const saveDisabled = saving || !decision || ((decision === 'clarification' || decision === 'rejected') && !reviewerNote.trim());
  const clarificationHistory = question.history || [];
  const latestReviewerComment = [...clarificationHistory].reverse().find((entry) => entry.needs_resubmission && entry.reviewer_note)?.reviewer_note || (review.needs_resubmission ? review.reviewer_note : '');
  const latestSupplierComment = [...clarificationHistory].reverse().find((entry) => entry.event === 'supplier_clarification_resubmitted' && entry.supplier_reply)?.supplier_reply || question.clarification_reply?.message || '';
  const hasClarificationExchange = Boolean(latestReviewerComment && latestSupplierComment);

  const saveReview = () => onDecision(decision, reviewerNote, reviewerScore);
  const saveAndNext = async () => { const saved = await saveReview(); if (saved && index < total - 1) onNext(); };
  const selectDecision = (nextDecision) => {
    if (nextDecision === 'clarification' && decision !== 'clarification') setReviewerNote('');
    setDecision(nextDecision);
  };

  return <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.05)]" data-testid={`response-review-question-panel-${question.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3 lg:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="font-bold capitalize text-emerald-800" data-testid="response-review-question-pillar">{question.category}</span><ChevronRight className="h-4 w-4 text-slate-400" /><span className="truncate font-medium text-slate-600" data-testid="response-review-question-category">{categoryLabel}</span></div>
      <div className="flex items-center gap-2" data-testid="response-review-question-top-navigation"><Button variant="outline" size="icon" className="h-8 w-8 bg-white" onClick={onPrevious} disabled={index === 0} aria-label="Previous question" data-testid="response-review-top-previous-button"><ChevronLeft className="h-4 w-4" /></Button><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white" data-testid="response-review-question-position">Question {index + 1} of {total}</span><Button variant="outline" size="icon" className="h-8 w-8 bg-white" onClick={onNext} disabled={index === total - 1} aria-label="Next question" data-testid="response-review-top-next-button"><ChevronRight className="h-4 w-4" /></Button></div>
    </div>

    <div className="space-y-6 px-5 py-6 lg:px-6">
      <ResponseQuestionDetails question={question} index={index} onOpenHistory={onOpenHistory} onOpenEvidence={onOpenEvidence} openingEvidenceKey={openingEvidenceKey} />
      {hasClarificationExchange && <section className="border border-amber-200 bg-amber-50/60 px-4 py-3" data-testid={`response-review-clarification-exchange-${question.id}`}><p className="text-xs font-bold uppercase text-amber-900">Clarification exchange</p><div className="mt-3 grid gap-3 lg:grid-cols-2"><div><p className="text-xs font-semibold text-slate-700">Latest comment by reviewer</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-900" data-testid={`response-review-latest-reviewer-comment-${question.id}`}>{latestReviewerComment}</p></div><div className="border-t border-amber-200 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"><p className="text-xs font-semibold text-slate-700">Latest comment by supplier</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-900" data-testid={`response-review-latest-supplier-comment-${question.id}`}>{latestSupplierComment}</p></div></div></section>}
      <ResponseReviewerAssessment questionId={question.id} decision={decision} onDecisionChange={selectDecision} reviewerNote={reviewerNote} onReviewerNoteChange={setReviewerNote} reviewerScore={reviewerScore} onReviewerScoreChange={setReviewerScore} maxPoints={maxPoints} currentPoints={points} review={review} reviewDraft={reviewDraft} clarificationReply={question.clarification_reply} saving={saving} saveDisabled={saveDisabled} />
    </div>

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 lg:px-6"><Button variant="outline" onClick={onPrevious} disabled={index === 0} data-testid="response-review-previous-button"><ChevronLeft className="mr-1.5 h-4 w-4" />Previous</Button><span className="text-xs font-semibold text-slate-600" data-testid="response-review-footer-position">Question {index + 1} of {total}</span><div className="ml-auto flex flex-wrap items-center justify-end gap-2"><Button variant="outline" className={question.marked_for_review ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100 hover:text-amber-950' : 'border-slate-300 text-slate-700'} onClick={() => onMarkForReview(decision, reviewerNote, reviewerScore)} disabled={saveDisabled || marking} data-testid={`response-review-mark-for-review-${question.id}`}><BookmarkCheck className="h-4 w-4" />{marking ? 'Saving draft…' : question.marked_for_review ? 'Review Draft Saved' : 'Mark for Review'}</Button><Button variant="outline" className="border-sky-500 text-sky-700 hover:bg-sky-50 hover:text-sky-800" onClick={saveReview} disabled={saveDisabled} data-testid={`response-review-save-decision-${question.id}`}><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save Review'}</Button><Button className="bg-blue-600 hover:bg-blue-700" onClick={saveAndNext} disabled={saveDisabled || index === total - 1} data-testid={`response-review-save-next-${question.id}`}>{saving ? 'Saving…' : 'Save & Next'}<ChevronRight className="h-4 w-4" /></Button><Button className="bg-slate-900 hover:bg-slate-800" onClick={onNext} disabled={index === total - 1} data-testid="response-review-next-button">Next<ChevronRight className="ml-1.5 h-4 w-4" /></Button></div></footer>
  </section>;
};

export { displayScore };