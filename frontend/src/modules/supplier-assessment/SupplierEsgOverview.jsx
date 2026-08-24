import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ClipboardList, ArrowRight, CheckCircle, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Progress } from '../../components/ui/progress';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatAnswer = (answer) => {
  if (typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (Array.isArray(answer)) return answer.join(', ');
  if (typeof answer === 'object' && answer !== null) return JSON.stringify(answer);
  return String(answer);
};

export default function SupplierEsgOverview() {
  const { getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [questionnaires, setQuestionnaires] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const summaries = (await axios.get(`${API}/supplier-assessment/my-assessment/questionnaires`, { headers: getAuthHeader() })).data || [];
      const detailed = await Promise.all(summaries.map(async (summary) => {
        try {
          const response = await axios.get(`${API}/supplier-assessment/my-assessment/questionnaires/${summary.questionnaire_id}`, { headers: getAuthHeader() });
          return { ...summary, questions: response.data.questions || [] };
        } catch (error) {
          return { ...summary, questions: [] };
        }
      }));
      setQuestionnaires(detailed);
    } catch (error) {
      toast.error('Could not load ESG questionnaires');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeader]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="py-12 text-center text-sm text-stone-500" data-testid="supplier-esg-overview-loading">Loading ESG questionnaires…</p>;

  return (
    <div className="space-y-6" data-testid="supplier-esg-overview">
      <div><h1 className="text-3xl font-semibold text-stone-900">ESG questionnaires</h1><p className="mt-2 text-sm text-stone-600">Review each assigned questionnaire and complete any pending answers.</p></div>
      {questionnaires.length === 0 ? <Card data-testid="supplier-esg-overview-empty"><CardContent className="py-12 text-center text-sm text-stone-500">No ESG questionnaires are assigned.</CardContent></Card> : questionnaires.map((questionnaire) => (
        <Card key={questionnaire.questionnaire_id} data-testid={`supplier-esg-questionnaire-${questionnaire.questionnaire_id}`}>
          <CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-emerald-600" />{questionnaire.questionnaire_name}</CardTitle><CardDescription className="mt-2" data-testid={`supplier-esg-progress-${questionnaire.questionnaire_id}`}>{Math.round(questionnaire.completion_percent || 0)}% complete</CardDescription></div>{questionnaire.status === 'submitted' ? <Badge className="bg-emerald-100 text-emerald-800" data-testid={`supplier-esg-status-${questionnaire.questionnaire_id}`}><CheckCircle className="mr-1 h-3 w-3" />Submitted</Badge> : <Badge className={questionnaire.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'} data-testid={`supplier-esg-status-${questionnaire.questionnaire_id}`}>{questionnaire.status === 'in_progress' ? 'In progress' : 'Not started'}</Badge>}</div><Progress value={questionnaire.completion_percent || 0} className="mt-4 h-2" data-testid={`supplier-esg-progress-bar-${questionnaire.questionnaire_id}`} /></CardHeader>
          <CardContent className="space-y-3"><div className="border-t border-stone-100 pt-4" data-testid={`supplier-esg-questions-${questionnaire.questionnaire_id}`}>{(questionnaire.questions || []).map((question, index) => { const answered = question.answer !== undefined && question.answer !== null && question.answer !== ''; return <div className="flex gap-3 border-b border-stone-100 py-3 last:border-0" key={question.id} data-testid={`supplier-esg-question-${questionnaire.questionnaire_id}-${question.id}`}>{answered ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-stone-300" />}<div className="min-w-0"><p className="text-sm text-stone-800" data-testid={`supplier-esg-question-text-${questionnaire.questionnaire_id}-${index + 1}`}>{question.question_text}</p>{answered ? <p className="mt-1 break-words text-sm text-stone-600" data-testid={`supplier-esg-answer-${questionnaire.questionnaire_id}-${index + 1}`}>{formatAnswer(question.answer)}</p> : <span className="mt-1 block text-sm text-stone-500" data-testid={`supplier-esg-answer-pending-${questionnaire.questionnaire_id}-${index + 1}`}>Pending response</span>}</div></div>; })}</div>{questionnaire.status !== 'submitted' && <Button variant="outline" onClick={() => navigate(`/supplier-assessment/questionnaire/${questionnaire.questionnaire_id}`)} data-testid={`supplier-esg-open-${questionnaire.questionnaire_id}`}>Continue questionnaire<ArrowRight className="ml-2 h-4 w-4" /></Button>}</CardContent>
        </Card>
      ))}
    </div>
  );
}