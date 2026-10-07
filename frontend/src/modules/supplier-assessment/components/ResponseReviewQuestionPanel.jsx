import React from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText, Paperclip, RotateCcw, Star, XCircle } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';

const displayScore = (value) => {
  const score = Number(value);
  if (!Number.isFinite(score)) return '-';
  return Number.isInteger(score) ? String(score) : score.toFixed(2);
};

const displayAnswer = (question) => {
  if (typeof question.answer === 'boolean') return question.answer ? 'Yes' : 'No';
  if (question.response_type === 'dropdown') return question.options?.find((option) => option.value === question.answer)?.label || question.answer || 'Not answered';
  return question.answer === undefined || question.answer === null || question.answer === '' ? 'Not answered' : String(question.answer);
};

const dateTime = (value) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const ResponseReviewQuestionPanel = ({ question, index, total, score, onAccept, onReject, onPrevious, onNext, onOpenEvidence, openingEvidenceKey, saving }) => {
  const review = question.review || {};
  const isAccepted = review.status === 'accepted';
  const isClarification = review.status === 'rejected' && review.needs_resubmission;
  const isRejected = review.status === 'rejected' && !review.needs_resubmission;
  const answer = displayAnswer(question);
  const maxPoints = question.max_points ?? question.weight ?? 100;
  const points = isRejected
    ? review.reviewer_score ?? 0
    : score?.points_earned ?? question.manual_score ?? (question.answer === true ? question.point_scores?.yes_score : question.answer === false ? question.point_scores?.no_score : 0);
  const timestamps = question.timestamps || {};
  const type = question.assessment_type ? question.assessment_type.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : question.response_type?.replace('_', ' ') || 'Question';
  return (
    <section className="min-w-0 bg-white" data-testid={`response-review-question-panel-${question.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4 lg:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold capitalize text-emerald-800" data-testid="response-review-question-pillar">{question.category}</span>
          <ChevronRight className="h-4 w-4 text-stone-400" />
          <span className="truncate text-stone-600" data-testid="response-review-question-category">{question.question_category || 'General'}</span>
        </div>
        <div className="flex items-center gap-2" data-testid="response-review-question-top-navigation">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrevious} disabled={index === 0} aria-label="Previous question" data-testid="response-review-top-previous-button"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs font-medium text-stone-600" data-testid="response-review-question-position">Question {index + 1} of {total}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext} disabled={index === total - 1} aria-label="Next question" data-testid="response-review-top-next-button"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="space-y-6 px-5 py-6 lg:px-6">
        <div>
          <h2 className="text-lg font-bold text-stone-950" data-testid={`response-review-question-text-${question.id}`}>{index + 1}. {question.question_text}</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <span className="font-medium text-stone-600">Question Type</span>
            <span className="flex flex-wrap items-center gap-2"><Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100" data-testid={`response-review-question-type-${question.id}`}>{type}</Badge><span className="text-xs text-stone-500">{question.evidence_requirement === 'required' ? 'Evidence required' : question.evidence_requirement === 'evidence_scored' ? 'Evidence affects score' : 'Evidence optional'}</span></span>
            {question.description && <><span className="font-medium text-stone-600">Description</span><p className="max-w-3xl leading-6 text-stone-800" data-testid={`response-review-question-description-${question.id}`}>{question.description}</p></>}
          </div>
        </div>

        <div className="border border-emerald-100 bg-emerald-50/70 p-5" data-testid={`response-review-supplier-response-${question.id}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Paperclip className="h-4 w-4" />Supplier Response</div>
          <p className="mt-3 whitespace-pre-wrap text-lg font-bold text-stone-950" data-testid={`response-review-answer-${question.id}`}>{answer}</p>
          <p className="mt-2 text-xs text-stone-500" data-testid={`response-review-answer-submitted-at-${question.id}`}>Submitted on: {dateTime(timestamps.submitted_at)}</p>
        </div>

        <div data-testid={`response-review-evidence-${question.id}`}>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900"><Paperclip className="h-4 w-4 text-stone-600" />Evidence</div>
          {question.evidence_files?.length ? <div className="space-y-2">{question.evidence_files.map((file) => {
            const viewKey = `${question.id}-${file.id}-view`;
            const downloadKey = `${question.id}-${file.id}-download`;
            return <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-200 bg-stone-50 px-4 py-3" data-testid={`response-review-evidence-file-${file.id}`}>
              <div className="flex min-w-0 items-center gap-3"><FileText className="h-6 w-6 shrink-0 text-sky-700" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-900" data-testid={`response-review-evidence-name-${file.id}`}>{file.original_filename}</p><p className="text-xs text-stone-500">Evidence submitted by supplier</p></div></div>
              <div className="flex shrink-0 items-center gap-2"><Button variant="outline" size="sm" className="h-8" onClick={() => onOpenEvidence(file)} disabled={openingEvidenceKey === viewKey} data-testid={`response-review-evidence-view-${file.id}`}><Eye className="mr-1.5 h-3.5 w-3.5" />Preview</Button><Button variant="outline" size="sm" className="h-8" onClick={() => onOpenEvidence(file, true)} disabled={openingEvidenceKey === downloadKey} data-testid={`response-review-evidence-download-${file.id}`}><Download className="mr-1.5 h-3.5 w-3.5" />Download</Button></div>
            </div>;
          })}</div> : <p className="border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500" data-testid={`response-review-no-evidence-${question.id}`}>No evidence submitted.</p>}
        </div>

        <div data-testid={`response-review-score-${question.id}`}>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900"><Star className="h-4 w-4 text-stone-600" />Score</div>
          <div className="flex flex-wrap items-end justify-between gap-3 border border-sky-100 bg-sky-50/70 px-5 py-4"><p className="text-xl font-bold text-sky-900" data-testid={`response-review-points-${question.id}`}>{displayScore(points)} <span className="text-sm font-medium">/ {displayScore(maxPoints)}</span></p><p className="text-xs text-stone-500">Maximum score: {displayScore(maxPoints)}</p></div>
        </div>

        {review.reviewer_note && <div className={`border p-4 text-sm ${isClarification ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-rose-200 bg-rose-50 text-rose-950'}`} data-testid={`response-review-reviewer-feedback-${question.id}`}><span className="font-semibold">{isClarification ? 'Clarification requested: ' : 'Reviewer rationale: '}</span>{review.reviewer_note}</div>}

        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-stone-100 py-4">
          <div className="flex flex-wrap items-center gap-2" data-testid={`response-review-decision-status-${question.id}`}>
            {isAccepted && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Accepted</Badge>}
            {isClarification && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100"><RotateCcw className="mr-1 h-3.5 w-3.5" />Clarification requested</Badge>}
            {isRejected && <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100"><XCircle className="mr-1 h-3.5 w-3.5" />Rejected</Badge>}
            {!review.status && <Badge variant="outline" className="border-stone-300 text-stone-600">Pending review</Badge>}
          </div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" className="border-rose-300 text-rose-800 hover:bg-rose-50" onClick={onReject} disabled={saving} data-testid={`response-review-reject-${question.id}`}><XCircle className="mr-1.5 h-4 w-4" />Reject</Button><Button className="bg-emerald-700 hover:bg-emerald-800" onClick={onAccept} disabled={saving} data-testid={`response-review-accept-${question.id}`}><CheckCircle2 className="mr-1.5 h-4 w-4" />Accept response</Button></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500" data-testid={`response-review-audit-timestamps-${question.id}`}><span>Submitted: {dateTime(timestamps.submitted_at)}</span><span>Reviewed: {dateTime(review.reviewed_at)}</span></div>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-stone-200 px-5 py-4 lg:px-6"><Button variant="outline" onClick={onPrevious} disabled={index === 0} data-testid="response-review-previous-button"><ChevronLeft className="mr-1.5 h-4 w-4" />Previous</Button><span className="text-xs font-medium text-stone-600" data-testid="response-review-footer-position">Question {index + 1} of {total}</span><Button onClick={onNext} disabled={index === total - 1} data-testid="response-review-next-button">Next<ChevronRight className="ml-1.5 h-4 w-4" /></Button></footer>
    </section>
  );
};
