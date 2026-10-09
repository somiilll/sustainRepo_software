import React from 'react';
import { CheckCircle2, Download, Eye, History, Paperclip } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';

const evidenceReviewLabel = (question) => {
  if (question.evidence_requirement === 'evidence_scored') return { label: 'Scoring based on evidence', className: 'bg-amber-50 text-amber-800' };
  if (question.evidence_requirement === 'required' || question.assessment_type === 'type_a') return { label: 'Evidence required', className: 'bg-emerald-50 text-emerald-800' };
  if (question.evidence_requirement === 'optional') return { label: 'Evidence optional', className: 'bg-sky-50 text-sky-800' };
  return { label: 'Evidence not required', className: 'bg-stone-100 text-stone-700' };
};

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

const AnswerChoices = ({ question, answer }) => {
  const pointScores = question.point_scores || {};
  const choices = question.response_type === 'yes_no' ? [
    { label: 'Yes', value: true, score: question.evidence_requirement === 'evidence_scored' ? pointScores.yes_with_evidence_score ?? pointScores.yes_score : pointScores.yes_score ?? pointScores.yes_with_evidence_score },
    { label: 'No', value: false, score: pointScores.no_score },
  ] : question.response_type === 'dropdown' ? (question.options || []).map((option) => ({ label: option.label || option.text || option.value, value: option.value, score: option.score ?? question.scoring?.choices?.[option.value] })) : [];
  if (!choices.length) return <p className="whitespace-pre-wrap text-base font-bold leading-7 text-slate-950" data-testid={`response-review-answer-${question.id}`}>{answer}</p>;
  return <div className="space-y-2" data-testid={`response-review-answer-${question.id}`}>{choices.map((choice, choiceIndex) => { const selected = String(choice.value) === String(question.answer); const hasScore = Number.isFinite(Number(choice.score)); return <div key={`${choice.value}-${choiceIndex}`} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-sm ${selected ? 'border-emerald-300 bg-emerald-100/70 font-bold text-emerald-950' : 'border-transparent bg-white/60 text-slate-500'}`} data-testid={`response-review-answer-choice-${question.id}-${choiceIndex}`}><span className="flex min-w-0 items-center gap-3"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>{selected && <CheckCircle2 className="h-3.5 w-3.5" />}</span><span>{choice.label}</span></span>{hasScore && <span className="shrink-0 font-semibold" data-testid={`response-review-answer-points-${question.id}-${choiceIndex}`}>{displayScore(choice.score)} points</span>}</div>; })}</div>;
};

export const ResponseQuestionDetails = ({ question, index, onOpenHistory, onOpenEvidence, openingEvidenceKey }) => {
  const answer = displayAnswer(question);
  return <>
    <div data-testid={`response-review-question-details-${question.id}`}><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm">{index + 1}</span><div className="relative min-w-0 flex-1"><Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-7 w-7 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Open answer details and history" title="Answer details and history" onClick={onOpenHistory} data-testid="response-review-history-open-button"><History className="h-4 w-4" /></Button><h2 className="pr-9 text-lg font-bold leading-7 text-slate-950" data-testid={`response-review-question-text-${question.id}`}>{question.question_text}</h2><div className="mt-2 flex flex-wrap gap-2" data-testid={`response-review-question-requirements-${question.id}`}><Badge className={`${question.required ? 'bg-rose-50 text-rose-800' : 'bg-stone-100 text-stone-700'} border-0 font-medium`} data-testid={`response-review-question-requiredness-${question.id}`}>{question.required ? 'Mandatory' : 'Optional'}</Badge><Badge className={`${evidenceReviewLabel(question).className} border-0 font-medium`} data-testid={`response-review-question-evidence-policy-${question.id}`}>{evidenceReviewLabel(question).label}</Badge></div>{question.description && <p className="mt-2 text-sm leading-6 text-slate-600" data-testid={`response-review-question-description-${question.id}`}>{question.description}</p>}</div></div></div>

    <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" data-testid={`response-review-submission-block-${question.id}`}>
      <section className="border-b border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/70 p-5 lg:border-b-0 lg:border-r" data-testid={`response-review-supplier-response-${question.id}`}><div className="flex items-center gap-2 text-sm font-bold text-emerald-900"><span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-white"><Paperclip className="h-3.5 w-3.5" /></span>Supplier Response</div><div className="mt-4"><AnswerChoices question={question} answer={answer} /></div></section>
      <section className="p-5" data-testid={`response-review-evidence-${question.id}`}><div className="mb-3 text-sm font-bold text-slate-900">Evidence</div>{question.evidence_files?.length ? <div className="space-y-2">{question.evidence_files.map((file) => { const viewKey = `${question.id}-${file.id}-view`; const downloadKey = `${question.id}-${file.id}-download`; const extension = file.original_filename?.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'; return <div key={file.id} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-stone-50" data-testid={`response-review-evidence-file-${file.id}`}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-rose-50 text-[9px] font-bold text-rose-700">{extension}</span><p className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900" data-testid={`response-review-evidence-name-${file.id}`}>{file.original_filename}</p><div className="flex shrink-0 items-center gap-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:bg-emerald-50 hover:text-emerald-800" aria-label={`Preview ${file.original_filename}`} title="Preview evidence" onClick={() => onOpenEvidence(file)} disabled={openingEvidenceKey === viewKey} data-testid={`response-review-evidence-view-${file.id}`}><Eye className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-stone-500 hover:bg-emerald-50 hover:text-emerald-800" aria-label={`Download ${file.original_filename}`} title="Download evidence" onClick={() => onOpenEvidence(file, true)} disabled={openingEvidenceKey === downloadKey} data-testid={`response-review-evidence-download-${file.id}`}><Download className="h-4 w-4" /></Button></div></div>; })}</div> : <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-4"><p className="text-sm text-slate-500" data-testid={`response-review-no-evidence-${question.id}`}>No evidence submitted.</p>{question.evidence_requirement === 'evidence_scored' && <p className="mt-2 text-xs font-semibold text-amber-800" data-testid={`response-review-evidence-score-notice-${question.id}`}>Points earned will be 50% as evidence was not uploaded.</p>}</div>}</section>
    </div>
  </>;
};