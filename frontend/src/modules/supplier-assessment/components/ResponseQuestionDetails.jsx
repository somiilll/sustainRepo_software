import React from 'react';
import { CheckCircle2, Download, Eye, FileText, Info, Paperclip } from 'lucide-react';
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

const scoringGuidance = (question, maxPoints) => {
  if (question.response_type === 'dropdown') return (question.options || []).map((option) => ({ label: option.label || option.text || option.value, score: option.score ?? question.scoring?.choices?.[option.value] })).filter((item) => item.score !== undefined && item.score !== null);
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

const AnswerChoices = ({ question, answer }) => {
  const choices = question.response_type === 'yes_no' ? [{ label: 'Yes', value: true }, { label: 'No', value: false }] : question.response_type === 'dropdown' ? (question.options || []).map((option) => ({ label: option.label || option.text || option.value, value: option.value })) : [];
  if (!choices.length) return <p className="whitespace-pre-wrap text-base font-bold leading-7 text-slate-950" data-testid={`response-review-answer-${question.id}`}>{answer}</p>;
  return <div className="space-y-2" data-testid={`response-review-answer-${question.id}`}>{choices.map((choice, choiceIndex) => { const selected = String(choice.value) === String(question.answer); return <div key={`${choice.value}-${choiceIndex}`} className={`flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm ${selected ? 'border-emerald-300 bg-emerald-100/70 font-bold text-emerald-950' : 'border-transparent bg-white/60 text-slate-500'}`} data-testid={`response-review-answer-choice-${question.id}-${choiceIndex}`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>{selected && <CheckCircle2 className="h-3.5 w-3.5" />}</span><span>{choice.label}</span></div>; })}</div>;
};

export const ResponseQuestionDetails = ({ question, index, maxPoints, onOpenEvidence, openingEvidenceKey }) => {
  const answer = displayAnswer(question);
  const guidance = scoringGuidance(question, maxPoints);
  const responseType = question.response_type === 'yes_no' ? 'Yes / No' : question.response_type === 'dropdown' ? 'Multiple choice' : question.response_type === 'numeric' ? 'Numeric' : question.response_type === 'text' ? 'Text response' : 'Response';
  return <>
    <div data-testid={`response-review-question-details-${question.id}`}><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-sm">{index + 1}</span><div className="min-w-0"><h2 className="text-lg font-bold leading-7 text-slate-950" data-testid={`response-review-question-text-${question.id}`}>{question.question_text}</h2>{question.description && <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600" data-testid={`response-review-question-description-${question.id}`}>{question.description}</p>}<div className="mt-3 flex flex-wrap gap-2"><Badge className="border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-50" data-testid={`response-review-question-type-${question.id}`}>{responseType}</Badge><Badge variant="outline" className="border-slate-200 bg-white text-slate-600" data-testid={`response-review-evidence-rule-${question.id}`}>{question.evidence_requirement === 'required' ? 'Evidence required' : question.evidence_requirement === 'evidence_scored' ? 'Evidence affects score' : 'Evidence optional'}</Badge></div></div></div></div>

    <div className="grid overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.04)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]" data-testid={`response-review-submission-block-${question.id}`}>
      <section className="border-b border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/70 p-5 lg:border-b-0 lg:border-r" data-testid={`response-review-supplier-response-${question.id}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-sm font-bold text-emerald-900"><span className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-white"><Paperclip className="h-3.5 w-3.5" /></span>Supplier Response</div><Badge className="border border-emerald-200 bg-white text-emerald-800 hover:bg-white" data-testid={`response-review-answer-status-${question.id}`}>Submitted</Badge></div><div className="mt-4"><AnswerChoices question={question} answer={answer} /></div></section>
      <section className="p-5" data-testid={`response-review-evidence-${question.id}`}><div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900"><span className="grid h-7 w-7 place-items-center rounded-md bg-rose-100 text-rose-700"><FileText className="h-3.5 w-3.5" /></span>Evidence</div>{question.evidence_files?.length ? <div className="space-y-3">{question.evidence_files.map((file) => { const viewKey = `${question.id}-${file.id}-view`; const downloadKey = `${question.id}-${file.id}-download`; const extension = file.original_filename?.split('.').pop()?.slice(0, 4).toUpperCase() || 'FILE'; return <div key={file.id} className="flex min-w-0 items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3" data-testid={`response-review-evidence-file-${file.id}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-rose-600 text-[10px] font-bold text-white">{extension}</span><p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900" data-testid={`response-review-evidence-name-${file.id}`}>{file.original_filename}</p><div className="flex shrink-0 items-center gap-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-sky-700 hover:bg-sky-100 hover:text-sky-800" aria-label={`Preview ${file.original_filename}`} title="Preview evidence" onClick={() => onOpenEvidence(file)} disabled={openingEvidenceKey === viewKey} data-testid={`response-review-evidence-view-${file.id}`}><Eye className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-700 hover:bg-slate-200 hover:text-slate-950" aria-label={`Download ${file.original_filename}`} title="Download evidence" onClick={() => onOpenEvidence(file, true)} disabled={openingEvidenceKey === downloadKey} data-testid={`response-review-evidence-download-${file.id}`}><Download className="h-4 w-4" /></Button></div></div>; })}</div> : <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500" data-testid={`response-review-no-evidence-${question.id}`}>No evidence submitted.</p>}
        {guidance.length > 0 && <div className="mt-4 rounded-md border border-sky-200 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 p-4" data-testid={`response-review-scoring-guidance-${question.id}`}><p className="flex items-center gap-2 text-sm font-bold text-sky-950"><Info className="h-4 w-4 text-sky-600" />Scoring Guidance</p><ul className="mt-2 space-y-1.5 text-xs text-sky-900">{guidance.map((item, guidanceIndex) => <li key={`${item.label}-${guidanceIndex}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><span>• {item.label}</span><span className="font-bold" data-testid={`response-review-guidance-score-${question.id}-${guidanceIndex}`}>{typeof item.score === 'string' ? item.score : `${displayScore(item.score)} points`}</span></li>)}</ul></div>}
      </section>
    </div>
  </>;
};