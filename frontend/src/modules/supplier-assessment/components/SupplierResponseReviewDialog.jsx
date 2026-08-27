import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Download, Eye, Paperclip, PencilLine } from 'lucide-react';
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
  const diameter = prominent ? 'h-28 w-28' : 'h-16 w-16';
  const inner = prominent ? 'h-[5.5rem] w-[5.5rem]' : 'h-12 w-12';
  const progress = hasScore ? Math.min(100, Math.max(0, score)) : 0;
  return <div className="flex flex-col items-center text-center" data-testid={testId}>
    <div className={`${diameter} flex items-center justify-center rounded-full p-1`} role="img" aria-label={`${label}: ${formatScore(value)} out of 100`} style={{ background: hasScore ? `conic-gradient(${scoreColor(score)} ${progress}%, #e7e5e4 ${progress}% 100%)` : '#e7e5e4' }}>
      <div className={`${inner} flex flex-col items-center justify-center rounded-full bg-white`}>
        <span className={prominent ? 'text-2xl font-semibold leading-none text-stone-900' : 'text-base font-semibold leading-none text-stone-900'}>{formatScore(value)}</span>
        <span className="mt-0.5 text-[9px] font-medium uppercase text-stone-500">/ 100</span>
        {prominent && <span className={`mt-0.5 text-[9px] font-semibold ${status.className}`} data-testid="supplier-response-score-status">{status.label}</span>}
      </div>
    </div>
    <span className={`${prominent ? 'mt-2 text-sm' : 'mt-1.5 text-xs'} font-medium text-stone-700`}>{label}</span>
  </div>;
};

const QuestionScore = ({ value, testId }) => {
  const score = Number(value);
  const colorClass = !Number.isFinite(score) ? 'border-stone-200 bg-stone-100 text-stone-500' : score >= 60 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : score >= 40 ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-rose-200 bg-rose-50 text-rose-700';
  return <div className={`min-w-[4.5rem] border px-2 py-1 text-center ${colorClass}`} data-testid={testId}>
    <p className="text-sm font-semibold">{formatScore(value)}<span className="ml-0.5 text-[10px] font-normal opacity-70">/100</span></p>
  </div>;
};

export const SupplierResponseReviewDialog = ({ open, onOpenChange, response, supplierId, getAuthHeader, onScoreSaved }) => {
  const [scores, setScores] = useState({});
  const [savingQuestionId, setSavingQuestionId] = useState('');
  const [openingEvidenceKey, setOpeningEvidenceKey] = useState('');
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

  const openEvidence = async (question, file, download = false) => {
    const key = `${question.id}-${file.id}-${download ? 'download' : 'view'}`;
    setOpeningEvidenceKey(key);
    try {
      const { data } = await axios.get(`${API}/supplier-assessment/suppliers/${supplierId}/questionnaires/${response.id}/questions/${question.id}/evidence/${file.id}`, { params: { download }, headers: getAuthHeader() });
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not open evidence');
    } finally {
      setOpeningEvidenceKey('');
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto" data-testid="supplier-response-review-dialog">
      <DialogHeader><DialogTitle data-testid="supplier-response-review-title">Submitted ESG response</DialogTitle></DialogHeader>
      <section className="grid gap-4 border-y border-stone-200 bg-stone-50/70 px-1 py-4 sm:grid-cols-[minmax(9rem,0.72fr)_1.28fr] sm:px-3" data-testid="supplier-response-score-summary">
        <div className="flex items-center justify-center border-b border-stone-200 pb-4 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
          <ScoreRing value={overallScore} label="Overall ESG" prominent testId="supplier-response-overall-score" status={status} />
        </div>
        <dl className="grid grid-cols-3 gap-2 self-center" data-testid="supplier-response-section-scores">
          {sections.map((section) => <div key={section.id} data-testid={`supplier-response-${section.id}-score`}><dt className="sr-only">{section.label}</dt><dd><ScoreRing value={section.value} label={section.label} testId={`supplier-response-${section.id}-score-ring`} status={status} /></dd></div>)}
        </dl>
      </section>
      <div className="space-y-1" data-testid="supplier-response-review-questions">
        {(response?.questions || []).map((question, index) => {
          const isManual = question.scoring?.rule === 'manual';
          const calculatedScore = calculatedScores[question.id];
          return <section key={question.id} className="grid gap-2 border-b border-stone-200 py-3 first:pt-1 last:border-0 last:pb-0 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto] sm:items-center" data-testid={`supplier-response-answer-${question.id}`}>
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700" data-testid={`supplier-response-number-${question.id}`}>{index + 1}</div>
            <div className="min-w-0"><p className="text-sm font-semibold leading-5 text-stone-900">{question.question_text}</p><div className="mt-1 border-l-2 border-stone-200 px-2" data-testid={`supplier-response-value-${question.id}`}><p className="whitespace-pre-wrap text-sm text-stone-700">{String(question.answer ?? 'No response')}</p></div>{(question.evidence_files || []).length > 0 && <div className="mt-2 flex flex-wrap gap-2" data-testid={`supplier-response-evidence-${question.id}`}>{question.evidence_files.map((file) => <div key={file.id} className="flex items-center gap-1 border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-700" data-testid={`supplier-response-evidence-file-${question.id}-${file.id}`}><Paperclip className="h-3.5 w-3.5" /><span className="max-w-40 truncate">{file.original_filename}</span><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`View ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-view`} onClick={() => openEvidence(question, file)} data-testid={`view-parent-question-evidence-${question.id}-${file.id}`}><Eye className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-6 w-6" aria-label={`Download ${file.original_filename}`} disabled={openingEvidenceKey === `${question.id}-${file.id}-download`} onClick={() => openEvidence(question, file, true)} data-testid={`download-parent-question-evidence-${question.id}-${file.id}`}><Download className="h-3.5 w-3.5" /></Button></div>)}</div>}</div>
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