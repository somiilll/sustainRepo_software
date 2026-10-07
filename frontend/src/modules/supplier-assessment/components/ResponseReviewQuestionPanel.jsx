import React, { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Download, Eye, FileText, Paperclip, RotateCcw, Star, XCircle } from 'lucide-react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';

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

const buildScoringGuidance = (question, maxPoints) => {
  if (question.response_type === 'dropdown') {
    return (question.options || []).map((option) => ({ label: option.label || option.text || option.value, score: option.score ?? question.scoring?.choices?.[option.value] })).filter((item) => item.score !== undefined && item.score !== null);
  }
  if (question.response_type === 'yes_no') {
    const scores = question.point_scores || {};
    const yesScore = question.evidence_requirement === 'evidence_scored' ? scores.yes_with_evidence_score ?? scores.yes_score : scores.yes_score ?? scores.yes_with_evidence_score;
    const guidance = [{ label: question.evidence_requirement === 'evidence_scored' ? 'Yes, with evidence' : 'Yes', score: yesScore }, { label: 'No', score: scores.no_score }];
    if (question.evidence_requirement === 'evidence_scored' && scores.yes_without_evidence_score !== undefined) guidance.splice(1, 0, { label: 'Yes, without evidence', score: scores.yes_without_evidence_score });
    return guidance.filter((item) => item.score !== undefined && item.score !== null);
  }
  if (question.scoring?.rule === 'higher_is_better') return [{ label: `From ${question.scoring.min} to ${question.scoring.target}`, score: `0–${displayScore(maxPoints)}` }];
  if (question.scoring?.rule === 'lower_is_better') return [{ label: `${question.scoring.min} is best; ${question.scoring.max_acceptable} is the zero-score threshold`, score: `0–${displayScore(maxPoints)}` }];
  return [];
};

const StatusChoice = ({ id, label, Icon, selectedClass, decision, onSelect, questionId }) => <button type="button" role="radio" aria-checked={decision === id} onClick={() => onSelect(id)} className={`flex items-center gap-2 border px-3 py-3 text-left text-sm font-semibold transition-[background-color,border-color,color] ${decision === id ? selectedClass : 'border-stone-200 text-stone-700 hover:bg-stone-50'}`} data-testid={`response-review-status-${id}-${questionId}`}><Icon className="h-4 w-4" />{label}</button>;

export const ResponseReviewQuestionPanel = ({ question, categoryLabel, index, total, score, onDecision, onPrevious, onNext, onOpenEvidence, openingEvidenceKey, saving }) => {
  const review = question.review || {};
  const isAccepted = review.status === 'accepted';
  const isClarification = review.status === 'rejected' && review.needs_resubmission;
  const isRejected = review.status === 'rejected' && !review.needs_resubmission;
  const [decision, setDecision] = useState(isAccepted ? 'accepted' : isClarification ? 'clarification' : isRejected ? 'rejected' : '');
  const [reviewerNote, setReviewerNote] = useState(review.reviewer_note || '');
  const [reviewerScore, setReviewerScore] = useState(String(review.reviewer_score ?? 0));
  const maxPoints = question.max_points ?? question.weight ?? 100;
  const answer = displayAnswer(question);
  const points = isRejected ? review.reviewer_score ?? 0 : score?.points_earned ?? question.manual_score ?? (question.answer === true ? question.point_scores?.yes_score : question.answer === false ? question.point_scores?.no_score : 0);
  const responseType = question.response_type === 'yes_no' ? 'Yes / No' : question.response_type === 'dropdown' ? 'Multiple choice' : question.response_type === 'numeric' ? 'Numeric' : question.response_type === 'text' ? 'Text response' : 'Response';
  const guidance = buildScoringGuidance(question, maxPoints);
  const supplierReply = question.clarification_reply?.message;
  const timestamps = question.timestamps || {};
  const saveDisabled = saving || !decision || (decision === 'clarification' && !reviewerNote.trim());

  return <section className="min-w-0 bg-white" data-testid={`response-review-question-panel-${question.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-4 lg:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm"><span className="font-semibold capitalize text-emerald-800" data-testid="response-review-question-pillar">{question.category}</span><ChevronRight className="h-4 w-4 text-stone-400" /><span className="truncate text-stone-600" data-testid="response-review-question-category">{categoryLabel}</span></div>
      <div className="flex items-center gap-2" data-testid="response-review-question-top-navigation"><Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrevious} disabled={index === 0} aria-label="Previous question" data-testid="response-review-top-previous-button"><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs font-medium text-stone-600" data-testid="response-review-question-position">Question {index + 1} of {total}</span><Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext} disabled={index === total - 1} aria-label="Next question" data-testid="response-review-top-next-button"><ChevronRight className="h-4 w-4" /></Button></div>
    </div>

    <div className="space-y-6 px-5 py-6 lg:px-6">
      <div><h2 className="text-lg font-bold text-stone-950" data-testid={`response-review-question-text-${question.id}`}>{index + 1}. {question.question_text}</h2><div className="mt-4 grid gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]"><span className="font-medium text-stone-600">Question Type</span><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-stone-800" data-testid={`response-review-question-type-${question.id}`}>{responseType}</span><span className="text-xs text-stone-500" data-testid={`response-review-evidence-rule-${question.id}`}>{question.evidence_requirement === 'required' ? 'Evidence required' : question.evidence_requirement === 'evidence_scored' ? 'Evidence affects score' : 'Evidence optional'}</span></span>{question.description && <><span className="font-medium text-stone-600">Description</span><p className="max-w-3xl leading-6 text-stone-800" data-testid={`response-review-question-description-${question.id}`}>{question.description}</p></>}</div></div>

      <div className="border border-emerald-100 bg-emerald-50/70 p-5" data-testid={`response-review-supplier-response-${question.id}`}><div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-800"><Paperclip className="h-4 w-4" />Supplier Response<Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100" data-testid={`response-review-answer-status-${question.id}`}>Submitted</Badge></div><p className="mt-3 whitespace-pre-wrap text-lg font-bold text-stone-950" data-testid={`response-review-answer-${question.id}`}>{answer}</p></div>

      <div data-testid={`response-review-evidence-${question.id}`}><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900"><Paperclip className="h-4 w-4 text-stone-600" />Evidence</div>{question.evidence_files?.length ? <div className="space-y-2">{question.evidence_files.map((file) => { const viewKey = `${question.id}-${file.id}-view`; const downloadKey = `${question.id}-${file.id}-download`; return <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 border border-stone-200 bg-stone-50 px-4 py-3" data-testid={`response-review-evidence-file-${file.id}`}><div className="flex min-w-0 items-center gap-3"><FileText className="h-6 w-6 shrink-0 text-sky-700" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-900" data-testid={`response-review-evidence-name-${file.id}`}>{file.original_filename}</p><p className="text-xs text-stone-500">Evidence submitted by supplier</p></div></div><div className="flex shrink-0 items-center gap-2"><Button variant="outline" size="sm" className="h-8" onClick={() => onOpenEvidence(file)} disabled={openingEvidenceKey === viewKey} data-testid={`response-review-evidence-view-${file.id}`}><Eye className="mr-1.5 h-3.5 w-3.5" />Preview</Button><Button variant="outline" size="sm" className="h-8" onClick={() => onOpenEvidence(file, true)} disabled={openingEvidenceKey === downloadKey} data-testid={`response-review-evidence-download-${file.id}`}><Download className="mr-1.5 h-3.5 w-3.5" />Download</Button></div></div>; })}</div> : <p className="border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500" data-testid={`response-review-no-evidence-${question.id}`}>No evidence submitted.</p>}</div>

      {guidance.length > 0 && <div className="border border-sky-200 bg-sky-50 p-4" data-testid={`response-review-scoring-guidance-${question.id}`}><p className="text-sm font-semibold text-sky-950">Scoring Guidance</p><ul className="mt-2 space-y-1 text-sm text-sky-900">{guidance.map((item, guidanceIndex) => <li key={`${item.label}-${guidanceIndex}`} className="flex flex-wrap items-center justify-between gap-2"><span>• {item.label}</span><span className="font-semibold" data-testid={`response-review-guidance-score-${question.id}-${guidanceIndex}`}>{typeof item.score === 'string' ? item.score : `${displayScore(item.score)} points`}</span></li>)}</ul></div>}

      <div data-testid={`response-review-score-${question.id}`}><div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-900"><Star className="h-4 w-4 text-stone-600" />Score</div><div className="flex flex-wrap items-end justify-between gap-3 border border-sky-100 bg-sky-50/70 px-5 py-4"><p className="text-xl font-bold text-sky-900" data-testid={`response-review-points-${question.id}`}>{displayScore(points)} <span className="text-sm font-medium">/ {displayScore(maxPoints)}</span></p><p className="text-xs text-stone-500">Maximum score: {displayScore(maxPoints)}</p></div></div>

      {review.reviewer_note && <div className={`border p-4 text-sm ${isClarification ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-rose-200 bg-rose-50 text-rose-950'}`} data-testid={`response-review-reviewer-feedback-${question.id}`}><span className="font-semibold">{isClarification ? 'Clarification requested: ' : 'Reviewer rationale: '}</span>{review.reviewer_note}</div>}
      {supplierReply && <div className="border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950" data-testid={`response-review-supplier-clarification-reply-${question.id}`}><span className="font-semibold">Supplier clarification reply: </span>{supplierReply}</div>}

      <section className="border border-stone-200 bg-stone-50/50 p-5" data-testid={`response-review-inline-decision-${question.id}`}><h3 className="text-sm font-semibold text-stone-950">Reviewer Assessment</h3><div className={`mt-4 grid gap-5 ${decision === 'rejected' ? 'lg:grid-cols-[minmax(0,1fr)_13rem]' : ''}`}><div><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Decision</p><div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Review status" data-testid={`response-review-status-options-${question.id}`}><StatusChoice id="accepted" label="Accept" Icon={CheckCircle2} selectedClass="border-emerald-500 bg-emerald-50 text-emerald-900" decision={decision} onSelect={setDecision} questionId={question.id} /><StatusChoice id="rejected" label="Reject" Icon={XCircle} selectedClass="border-rose-500 bg-rose-50 text-rose-900" decision={decision} onSelect={(value) => { setDecision(value); if (reviewerScore === '') setReviewerScore('0'); }} questionId={question.id} /><StatusChoice id="clarification" label="Needs Clarification" Icon={RotateCcw} selectedClass="border-amber-500 bg-amber-50 text-amber-950" decision={decision} onSelect={setDecision} questionId={question.id} /></div></div>{decision === 'rejected' && <div><Label htmlFor={`response-review-score-input-${question.id}`} className="text-xs font-semibold uppercase tracking-wide text-stone-500">Reviewer Score</Label><div className="mt-2 flex items-center gap-2"><Input id={`response-review-score-input-${question.id}`} type="number" min="0" max={maxPoints} step="0.1" value={reviewerScore} onChange={(event) => setReviewerScore(event.target.value)} className="bg-white" data-testid={`response-review-score-input-${question.id}`} /><span className="whitespace-nowrap text-sm text-stone-600">/ {displayScore(maxPoints)}</span></div><p className="mt-1 text-xs text-stone-500">Defaults to 0</p></div>}</div>{decision === 'clarification' && <div className="mt-5"><Label htmlFor={`response-review-clarification-note-${question.id}`} className="text-sm font-semibold">Reviewer Comment *</Label><Textarea id={`response-review-clarification-note-${question.id}`} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} className="mt-2 bg-white" rows={4} placeholder="Describe what the supplier should clarify, correct, or evidence." data-testid={`response-review-clarification-note-${question.id}`} /><p className="mt-2 text-xs text-stone-500">The supplier can reply, change this response, and add or remove evidence before resubmitting.</p></div>}{decision === 'rejected' && <div className="mt-5"><Label htmlFor={`response-review-reject-note-${question.id}`} className="text-sm font-semibold">Reviewer Note <span className="font-normal text-stone-500">(optional)</span></Label><Textarea id={`response-review-reject-note-${question.id}`} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} className="mt-2 bg-white" rows={3} data-testid={`response-review-reject-note-${question.id}`} /></div>}<div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2" data-testid={`response-review-decision-status-${question.id}`}>{isAccepted && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Accepted</Badge>}{isClarification && <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Clarification requested</Badge>}{isRejected && <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Rejected</Badge>}{!review.status && <Badge variant="outline" className="border-stone-300 text-stone-600">Pending review</Badge>}</div><Button onClick={() => onDecision(decision, reviewerNote, reviewerScore)} disabled={saveDisabled} data-testid={`response-review-save-decision-${question.id}`}>{saving ? 'Saving…' : 'Save decision'}</Button></div></section>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500" data-testid={`response-review-audit-timestamps-${question.id}`}><span>Submitted: {dateTime(timestamps.submitted_at)}</span><span>Reviewed: {dateTime(review.reviewed_at)}</span></div>
    </div>
    <footer className="flex items-center justify-between gap-3 border-t border-stone-200 px-5 py-4 lg:px-6"><Button variant="outline" onClick={onPrevious} disabled={index === 0} data-testid="response-review-previous-button"><ChevronLeft className="mr-1.5 h-4 w-4" />Previous</Button><span className="text-xs font-medium text-stone-600" data-testid="response-review-footer-position">Question {index + 1} of {total}</span><Button onClick={onNext} disabled={index === total - 1} data-testid="response-review-next-button">Next<ChevronRight className="ml-1.5 h-4 w-4" /></Button></footer>
  </section>;
};
