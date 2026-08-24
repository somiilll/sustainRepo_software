import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const SupplierResponseReviewDialog = ({ open, onOpenChange, response, supplierId, getAuthHeader, onScoreSaved }) => {
  const [scores, setScores] = useState({});
  const [savingQuestionId, setSavingQuestionId] = useState('');
  const calculatedScores = useMemo(() => Object.fromEntries((response?.score_breakdown?.question_scores || []).map((item) => [item.question_id, item.raw_score])), [response]);

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
      <div className="space-y-3" data-testid="supplier-response-review-questions">
        {(response?.questions || []).map((question, index) => {
          const isManual = question.scoring?.rule === 'manual';
          return <section key={question.id} className="border-b border-stone-200 pb-4 last:border-0" data-testid={`supplier-response-answer-${question.id}`}>
            <p className="text-sm font-medium text-stone-900">{index + 1}. {question.question_text}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600" data-testid={`supplier-response-value-${question.id}`}>{String(question.answer ?? 'No response')}</p>
            {isManual ? <div className="mt-3 flex flex-wrap items-end gap-2" data-testid={`manual-question-score-controls-${question.id}`}>
              <div className="w-36 space-y-1"><Label htmlFor={`manual-question-score-${question.id}`} className="text-xs">Parent score (0–100)</Label><Input id={`manual-question-score-${question.id}`} type="number" min="0" max="100" value={scores[question.id] ?? ''} onChange={(event) => setScores((current) => ({ ...current, [question.id]: event.target.value }))} data-testid={`manual-question-score-input-${question.id}`} /></div>
              <Button size="sm" onClick={() => saveQuestionScore(question)} disabled={savingQuestionId === question.id} data-testid={`save-manual-question-score-${question.id}`}><PencilLine className="mr-1 h-4 w-4" />{savingQuestionId === question.id ? 'Saving…' : 'Save score'}</Button>
            </div> : <div className="mt-3 flex items-center gap-2 text-xs text-stone-500" data-testid={`calculated-question-score-${question.id}`}><CheckCircle2 className="h-4 w-4 text-emerald-600" />Calculated score: {calculatedScores[question.id] ?? 'Pending'} / 100</div>}
          </section>;
        })}
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-supplier-response-review-button">Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
};