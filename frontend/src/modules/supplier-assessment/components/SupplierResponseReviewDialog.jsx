import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatScore = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(1).replace(/\.0$/, '') : 'Pending');

const scoreStatus = (score) => {
  if (!Number.isFinite(Number(score))) return { label: 'Pending', className: 'text-stone-500' };
  if (Number(score) >= 80) return { label: 'Excellent', className: 'text-emerald-700' };
  if (Number(score) >= 60) return { label: 'Good', className: 'text-teal-700' };
  if (Number(score) >= 40) return { label: 'Developing', className: 'text-amber-700' };
  return { label: 'Needs attention', className: 'text-rose-700' };
};

const scoreColor = (score) => {
  if (!Number.isFinite(Number(score))) return '#a8a29e';
  if (Number(score) >= 80) return '#059669';
  if (Number(score) >= 60) return '#0f766e';
  if (Number(score) >= 40) return '#d97706';
  return '#e11d48';
};

const ScoreRing = ({ value, label, prominent = false, testId, status }) => {
  const score = Number(value);
  const hasScore = Number.isFinite(score);
  const diameter = prominent ? 'h-32 w-32' : 'h-[4.75rem] w-[4.75rem]';
  const inner = prominent ? 'h-[6.35rem] w-[6.35rem]' : 'h-[3.75rem] w-[3.75rem]';
  const progress = hasScore ? Math.min(100, Math.max(0, score)) : 0;
  return <div className="flex flex-col items-center text-center" data-testid={testId}>
    <div className={`${diameter} flex items-center justify-center rounded-full p-1`} role="img" aria-label={`${label}: ${formatScore(value)} out of 100`} style={{ background: hasScore ? `conic-gradient(${scoreColor(score)} ${progress}%, #e7e5e4 ${progress}% 100%)` : '#e7e5e4' }}>
      <div className={`${inner} flex flex-col items-center justify-center rounded-full bg-white`}>
        <span className={prominent ? 'text-3xl font-semibold leading-none text-stone-900' : 'text-lg font-semibold leading-none text-stone-900'}>{formatScore(value)}</span>
        <span className="mt-1 text-[10px] font-medium uppercase text-stone-500">/ 100</span>
        {prominent && <span className={`mt-1 text-[10px] font-semibold ${status.className}`} data-testid="supplier-response-score-status">{status.label}</span>}
      </div>
    </div>
    <span className={`${prominent ? 'mt-3 text-sm' : 'mt-2 text-xs'} font-medium text-stone-700`}>{label}</span>
  </div>;
};

const QuestionScore = ({ value, testId }) => {
  const status = scoreStatus(value);
  return <div className="min-w-24 border-l border-stone-200 pl-4 text-right" data-testid={testId}>
    <p className={`text-lg font-semibold ${status.className}`}>{formatScore(value)}<span className="ml-0.5 text-xs font-normal text-stone-500">/100</span></p>
    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-stone-500">{status.label}</p>
  </div>;
};

export const SupplierResponseReviewDialog = ({ open, onOpenChange, response, supplierId, getAuthHeader, onScoreSaved }) => {
  const [scores, setScores] = useState({});
  const [savingQuestionId, setSavingQuestionId] = useState('');
  const calculatedScores = useMemo(() => Object.fromEntries((response?.score_breakdown?.question_scores || []).map((item) => [item.question_id, item.raw_score])), [response]);
  const esgScore = response?.score_breakdown?.esg_score || {};
  const overallScore = response?.calculated_score ?? esgScore.overall_score;
  const status = scoreStatus(overallScore);
  const sections = [
    { id: 'environment', label: 'Environment', value: esgScore.environment?.score },
    { id: 'social', label: 'Social', value: esgScore.social?.score },
    { id: 'governance', label: 'Governance', value: esgScore.governance?.score },
  ];

  useEffect(() => {
    const nextScores = {};
    (response?.questions || []).forEach((question) => {
      if (question.scoring?.rule === 'manual') nextScores[question.id] = question.manual_score ?? '';
    });
    setScores(nextScores);
  }, [response]);

  const saveQuestionScore = async (question) => {
    const value = scores[question.id];
    if (value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) {
      toast.error('Enter a score from 0 to 100.');
      return;
    }
    setSavingQuestionId(question.id);
    try {
      const { data } = await axios.put(
        `${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${response.id}/questions/${question.id}/manual-score`,
        { score: Number(value) },
        { headers: getAuthHeader() },
      );
      toast.success('Question score saved');
      onScoreSaved?.(data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not save question score');
    } finally {
      setSavingQuestionId('');
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto" data-testid="supplier-response-review-dialog">
      <DialogHeader><DialogTitle data-testid="supplier-response-review-title">Submitted ESG response</DialogTitle></DialogHeader>
      <section className="grid gap-6 border-y border-stone-200 bg-stone-50/70 px-1 py-5 sm:grid-cols-[minmax(10rem,0.72fr)_1.28fr] sm:px-4" data-testid="supplier-response-score-summary">
        <div className="flex items-center justify-center border-b border-stone-200 pb-5 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-6">
          <ScoreRing value={overallScore} label="Overall ESG" prominent testId="supplier-response-overall-score" status={status} />
        </div>
        <dl className="grid grid-cols-3 gap-3 self-center" data-testid="supplier-response-section-scores">
          {sections.map((section) => <div key={section.id} data-testid={`supplier-response-${section.id}-score`}><dt className="sr-only">{section.label}</dt><dd><ScoreRing value={section.value} label={section.label} testId={`supplier-response-${section.id}-score-ring`} status={status} /></dd></div>)}
        </dl>
      </section>
      <div className="space-y-3" data-testid="supplier-response-review-questions">
        {(response?.questions || []).map((question, index) => {
          const isManual = question.scoring?.rule === 'manual';
          const calculatedScore = calculatedScores[question.id];
          return <section key={question.id} className="grid gap-3 border-b border-stone-200 py-4 first:pt-1 last:border-0 last:pb-0 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:items-center" data-testid={`supplier-response-answer-${question.id}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-sm font-semibold text-stone-700" data-testid={`supplier-response-number-${question.id}`}>{index + 1}</div>
            <div className="min-w-0"><p className="text-sm font-semibold leading-5 text-stone-900">{question.question_text}</p><div className="mt-2 border-l-2 border-stone-200 bg-stone-50 px-3 py-2" data-testid={`supplier-response-value-${question.id}`}><p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">Supplier response</p><p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{String(question.answer ?? 'No response')}</p></div></div>
            {isManual ? <div className="flex flex-wrap items-end justify-end gap-2 sm:min-w-64" data-testid={`manual-question-score-controls-${question.id}`}>
              <div className="w-28 space-y-1"><Label htmlFor={`manual-question-score-${question.id}`} className="text-xs">Parent score</Label><Input id={`manual-question-score-${question.id}`} type="number" min="0" max="100" value={scores[question.id] ?? ''} onChange={(event) => setScores((current) => ({ ...current, [question.id]: event.target.value }))} data-testid={`manual-question-score-input-${question.id}`} /></div>
              <Button size="sm" onClick={() => saveQuestionScore(question)} disabled={savingQuestionId === question.id} data-testid={`save-manual-question-score-${question.id}`}><PencilLine className="mr-1 h-4 w-4" />{savingQuestionId === question.id ? 'Saving…' : 'Save'}</Button>
            </div> : <div className="flex items-center gap-2" data-testid={`calculated-question-score-${question.id}`}><CheckCircle2 className="h-4 w-4 text-emerald-600" /><QuestionScore value={calculatedScore} testId={`supplier-response-question-score-${question.id}`} /></div>}
          </section>;
        })}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-supplier-response-review-button">Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};